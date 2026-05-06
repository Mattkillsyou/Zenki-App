import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TextInput, ScrollView,
  Image, Animated, Dimensions, Platform, ActivityIndicator, Alert} from 'react-native';
import { KeyboardView } from '../../components';
import { SoundPressable } from '../../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeStorageSet } from '../../utils/safeStorage';
import { todayDateString } from '../../utils/dates';
import { useTheme } from '../../context/ThemeContext';
import { useMotion } from '../../context/MotionContext';
import { useAuth } from '../../context/AuthContext';
import { useNutrition } from '../../context/NutritionContext';
import { typography, spacing, borderRadius } from '../../theme';
import { BELT_ORDER, BELT_DISPLAY_COLORS, BELT_LABELS, BeltLevel, Member } from '../../data/members';
import { suggestNickname } from '../../utils/nickname';
import { BeltDisplay } from '../../components/BeltDisplay';
import { renderWaiverText, WAIVER_VERSION, WaiverSignature } from '../../data/waiver';
import { pushWaiverToSheets, pushWaiverToFirestore } from '../../services/waiverSync';
import {
  calculateBMR, calculateTDEE, calculateMacros,
  lbsToKg, kgToLbs, feetInchesToCm,
  type Sex, type ActivityLevel, type Goal,
} from '../../utils/nutrition';
import type { WeightGoal } from '../../types/activity';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Onboarding flow:
//   0 account · 1 name · 2 phone · 3 sex
//   4 photo · 5 fun-fact · 6 socials · 7 belt · 8 waiver · 9 welcome
// Body stats (height/weight/age/activity/goal/training/diet) and the
// in-onboarding permission grid were removed at owner request — users
// fill body stats later in Body Lab, and PermissionsOnboardingScreen is
// the single source of permission prompts after account creation.
const TOTAL_STEPS = 10;

type DietType = 'balanced' | 'high_protein' | 'low_carb' | 'keto';
type TrainingExp = 'beginner' | 'intermediate' | 'advanced';
const INJURY_TAGS = ['Shoulder', 'Knee', 'Back', 'Wrist', 'Neck', 'Ankle', 'Hip'] as const;

/** Resolve canonical heightCm from whichever unit the user picked. */
function resolveHeightCm(d: Partial<OnboardingData>): number {
  if (d.heightUnit === 'metric') return parseFloat(d.heightCm || '') || 0;
  const ft = parseInt(d.heightFt || '', 10) || 0;
  const inch = parseInt(d.heightIn || '', 10) || 0;
  return feetInchesToCm(ft, inch);
}

/** Resolve canonical weightKg from whichever unit the user picked. */
function resolveWeightKg(d: Partial<OnboardingData>): number {
  const w = parseFloat(d.weight || '');
  if (!Number.isFinite(w)) return 0;
  return d.weightUnit === 'kg' ? w : lbsToKg(w);
}

/** Resolve the sex value used for Mifflin-St Jeor math. */
function resolveMetabolicSex(d: Partial<OnboardingData>): Sex {
  if (d.biologicalSex === 'male' || d.biologicalSex === 'female') return d.biologicalSex;
  if (d.metabolicSex === 'male' || d.metabolicSex === 'female') return d.metabolicSex;
  return 'male'; // safe default
}

/**
 * Applies dietary-preference adjustments to the default macro split.
 * Called AFTER calculateMacros — keeps nutrition.ts pure.
 */
function adjustMacrosForDiet(
  calories: number,
  weightKg: number,
  diet: DietType,
): { calories: number; protein: number; carbs: number; fat: number } {
  if (diet === 'high_protein') {
    const protein = Math.round(weightKg * 2.6);
    const fatCal = Math.round(calories * 0.20);
    const fat = Math.round(fatCal / 9);
    const remaining = Math.max(0, calories - protein * 4 - fatCal);
    return { calories, protein, carbs: Math.round(remaining / 4), fat };
  }
  if (diet === 'low_carb') {
    const protein = Math.round(weightKg * 2.2);
    const fatCal = Math.round(calories * 0.35);
    const fat = Math.round(fatCal / 9);
    const remaining = Math.max(0, calories - protein * 4 - fatCal);
    return { calories, protein, carbs: Math.round(remaining / 4), fat };
  }
  if (diet === 'keto') {
    const carbs = 50;
    const protein = Math.round(weightKg * 2.0);
    const fatCal = Math.max(0, calories - carbs * 4 - protein * 4);
    return { calories, protein, carbs, fat: Math.round(fatCal / 9) };
  }
  // balanced — default calculateMacros output
  const protein = Math.round(weightKg * 2.2);
  const fatCal = Math.round(calories * 0.25);
  const fat = Math.round(fatCal / 9);
  const remaining = Math.max(0, calories - protein * 4 - fatCal);
  return { calories, protein, carbs: Math.round(remaining / 4), fat };
}

interface OnboardingData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone: string;
  photo: string | null;
  bio: string;
  funFact: string;
  nickname: string;
  instagram: string;
  twitter: string;
  website: string;
  biologicalSex: 'male' | 'female' | 'other' | '';
  belt: BeltLevel;
  stripes: number;
  signedName: string;
  emailWaiverCopy: boolean;

  // Body stats
  heightFt: string;
  heightIn: string;
  heightCm: string;
  heightUnit: 'imperial' | 'metric';
  weight: string;
  weightUnit: 'lb' | 'kg';
  age: string;
  dateOfBirth: string;
  activityLevel: ActivityLevel | '';
  fitnessGoal: Goal | '';
  targetWeight: string;
  trainingExperience: TrainingExp | '';
  trainingDaysPerWeek: number;
  dietType: DietType | '';
  injuries: string[];
  metabolicSex: 'male' | 'female' | '';
}

export function OnboardingScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const { createAccount } = useAuth();
  const { saveProfile, addWeight, updateGoals } = useNutrition();
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  // Permission prompts moved to PermissionsOnboardingScreen post-account
  // creation; this wizard no longer asks for them inline.
  const [data, setData] = useState<OnboardingData>({
    email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', phone: '', photo: null, bio: '', funFact: '', nickname: '',
    instagram: '', twitter: '', website: '', biologicalSex: '', belt: 'none', stripes: 0,
    signedName: '', emailWaiverCopy: false,
    heightFt: '', heightIn: '', heightCm: '', heightUnit: 'imperial',
    weight: '', weightUnit: 'lb', age: '', dateOfBirth: '',
    activityLevel: '', fitnessGoal: '', targetWeight: '',
    trainingExperience: '', trainingDaysPerWeek: 3,
    dietType: '', injuries: [], metabolicSex: '',
  });

  // Password validation
  const pwHasLength = data.password.length >= 8;
  const pwHasUpper = /[A-Z]/.test(data.password);
  const pwHasNumber = /\d/.test(data.password);
  const pwMatch = data.password === data.confirmPassword && data.confirmPassword.length > 0;

  // Animations
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const iconScaleAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    // Entrance animation for each step
    slideAnim.setValue(SCREEN_WIDTH * 0.3);
    fadeAnim.setValue(0);
    iconScaleAnim.setValue(0.5);
    if (!reduceMotion) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, friction: 6, tension: 80, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(iconScaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(progressAnim, { toValue: step / (TOTAL_STEPS - 1), duration: 400, useNativeDriver: false }),
      ]).start();
    } else {
      slideAnim.setValue(0);
      fadeAnim.setValue(1);
      iconScaleAnim.setValue(1);
      progressAnim.setValue(step / (TOTAL_STEPS - 1));
    }
  }, [step]);

  const goNext = () => {
    if (step < TOTAL_STEPS - 1) {
      if (!reduceMotion) {
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: -SCREEN_WIDTH * 0.3, duration: 200, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setStep(step + 1));
      } else {
        setStep(step + 1);
      }
    }
  };

  const goBack = () => {
    if (step > 0) {
      if (!reduceMotion) {
        Animated.parallel([
          Animated.timing(slideAnim, { toValue: SCREEN_WIDTH * 0.3, duration: 200, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]).start(() => setStep(step - 1));
      } else {
        setStep(step - 1);
      }
    }
  };

  const handleFinish = async () => {
    const id = 'user_' + Date.now().toString(36);
    const username = data.email.split('@')[0].toLowerCase();
    const member: Member = {
      id,
      username,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone.trim() || undefined,
      belt: data.belt,
      stripes: data.stripes,
      memberSince: todayDateString(),
      isAdmin: false,
      profilePhoto: data.photo || undefined,
      funFact: data.funFact.trim() || undefined,
      nickname: data.nickname.trim() || undefined,
      biologicalSex: data.biologicalSex || undefined,
      trainingExperience: data.trainingExperience || undefined,
      trainingDaysPerWeek: data.trainingDaysPerWeek,
      injuries: data.injuries.length > 0 ? data.injuries : undefined,
      totalSessions: 0,
      weekStreak: 0,
    };
    // Pass password so AuthContext provisions a real Firebase Auth user
    // alongside the local Member record. Without this, signup is local-only
    // and the user can't sign back in through Firebase after signing out.
    // createAccount now THROWS on Firebase Auth failure (instead of silently
    // continuing with local-only state). Catch it here so the user sees the
    // actual reason — previously this path silently created a "ghost"
    // account that didn't exist on Firebase, and the next sign-in attempt
    // would error with "no account with that email" leaving the user stuck.
    try {
      await createAccount(member, data.password);
    } catch (err: any) {
      Alert.alert(
        'Signup failed',
        err?.message ?? 'Could not create your account. Try again.',
      );
      return;
    }

    // Record the signed waiver (fire-and-forget)
    const signature: WaiverSignature = {
      memberId: id,
      memberName: `${data.firstName} ${data.lastName}`.trim(),
      email: data.email,
      phone: data.phone.trim() || undefined,
      signedName: data.signedName.trim(),
      signedAt: new Date().toISOString(),
      waiverVersion: WAIVER_VERSION,
      emailCopy: data.emailWaiverCopy,
    };
    pushWaiverToSheets(signature);
    pushWaiverToFirestore(signature);

    // Nutrition profile + initial weigh-in + weight goal (only if body stats filled)
    const weightKg = resolveWeightKg(data);
    const heightCm = resolveHeightCm(data);
    const ageYears = parseInt(data.age, 10);
    if (weightKg && heightCm && Number.isFinite(ageYears) && data.activityLevel && data.fitnessGoal) {
      const sex = resolveMetabolicSex(data);
      const diet: DietType = (data.dietType || 'balanced') as DietType;
      saveProfile({
        memberId: id,
        sex,
        ageYears,
        heightCm,
        activity: data.activityLevel as ActivityLevel,
        goal: data.fitnessGoal as Goal,
        dietType: diet,
      }, weightKg);

      // If user picked a non-balanced diet, overwrite the macro goals so the
      // diet-specific split takes effect. saveProfile wrote the default split;
      // calculate ours from the same TDEE and replace it.
      if (diet !== 'balanced') {
        const bmr = calculateBMR({ sex, weightKg, heightCm, ageYears });
        const tdee = calculateTDEE(bmr, data.activityLevel as ActivityLevel);
        const base = calculateMacros({ tdee, goal: data.fitnessGoal as Goal, weightKg });
        const adjusted = adjustMacrosForDiet(base.calories, weightKg, diet);
        updateGoals(id, adjusted);
      }

      // Initial weigh-in
      const today = todayDateString();
      try {
        addWeight({
          memberId: id,
          date: today,
          weight: parseFloat(data.weight),
          unit: data.weightUnit as 'lb' | 'kg',
        });
      } catch { /* ignore */ }

      // Optional weight goal
      const tw = parseFloat(data.targetWeight);
      if (Number.isFinite(tw) && tw > 0 && (data.fitnessGoal === 'cut' || data.fitnessGoal === 'bulk')) {
        const ratePerWeek = data.fitnessGoal === 'cut' ? 0.75 : 0.375; // lb/week
        const currentLb = data.weightUnit === 'kg' ? kgToLbs(parseFloat(data.weight)) : parseFloat(data.weight);
        const targetLb = data.weightUnit === 'kg' ? kgToLbs(tw) : tw;
        const weeks = Math.ceil(Math.abs(currentLb - targetLb) / ratePerWeek);
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + weeks * 7);
        const goal: WeightGoal = {
          targetWeight: tw,
          targetDate: targetDate.toISOString().split('T')[0],
          startWeight: parseFloat(data.weight),
          startDate: today,
          unit: data.weightUnit as 'lb' | 'kg',
        };
        safeStorageSet('@zenki_weight_goal', goal, '[Onboarding weight goal]');
      }
    }

    // Account is fully provisioned — hand off to the per-permission
    // onboarding flow, which will land on Main when it's done.
    navigation.replace('PermissionsOnboarding');
  };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setData({ ...data, photo: result.assets[0].uri });
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setData({ ...data, photo: result.assets[0].uri });
    }
  };

  const stepIcons: (keyof typeof Ionicons.glyphMap)[] = [
    // 0-3 account/name/phone/sex
    'lock-closed-outline', 'person-outline', 'call-outline', 'body-outline',
    // 4-9 photo/fun-fact/socials/belt/waiver/welcome
    'camera-outline', 'create-outline', 'share-social-outline', 'ribbon-outline',
    'document-text-outline', 'checkmark-circle',
  ];

  /** Live macro preview for the summary step — recomputes whenever inputs change. */
  const summaryPreview = useMemo(() => {
    const weightKg = resolveWeightKg(data);
    const heightCm = resolveHeightCm(data);
    const ageYears = parseInt(data.age, 10);
    if (!weightKg || !heightCm || !Number.isFinite(ageYears) || !data.activityLevel || !data.fitnessGoal) {
      return null;
    }
    const sex = resolveMetabolicSex(data);
    const bmr = calculateBMR({ sex, weightKg, heightCm, ageYears });
    const tdee = calculateTDEE(bmr, data.activityLevel as ActivityLevel);
    const base = calculateMacros({ tdee, goal: data.fitnessGoal as Goal, weightKg });
    const diet: DietType = (data.dietType || 'balanced') as DietType;
    const macros = diet === 'balanced' ? base : adjustMacrosForDiet(base.calories, weightKg, diet);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), ...macros };
  }, [data]);

  /** Projected weeks to reach targetWeight for cut/bulk goals. */
  const weeksToGoal = useMemo(() => {
    const tw = parseFloat(data.targetWeight);
    const cw = parseFloat(data.weight);
    if (!Number.isFinite(tw) || !Number.isFinite(cw) || tw <= 0 || cw <= 0) return null;
    if (data.fitnessGoal !== 'cut' && data.fitnessGoal !== 'bulk') return null;
    // Rates in lb/week — convert weight to lb first for a uniform calc
    const currentLb = data.weightUnit === 'kg' ? kgToLbs(cw) : cw;
    const targetLb = data.weightUnit === 'kg' ? kgToLbs(tw) : tw;
    const ratePerWeek = data.fitnessGoal === 'cut' ? 0.75 : 0.375;
    return Math.max(1, Math.ceil(Math.abs(currentLb - targetLb) / ratePerWeek));
  }, [data.targetWeight, data.weight, data.weightUnit, data.fitnessGoal]);

  const renderStep = () => {
    switch (step) {
      // Step 0: Create account (email + password)
      case 0: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="shield-checkmark-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Create your account</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>Your credentials for signing in</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="Email address"
            placeholderTextColor={colors.textMuted}
            value={data.email}
            onChangeText={(v) => setData({ ...data, email: v })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          <View style={{ width: '100%' }}>
            <View style={[styles.passwordWrap, { backgroundColor: colors.surface }]}>
              <TextInput
                style={[styles.passwordInput, { color: colors.textPrimary }]}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                value={data.password}
                onChangeText={(v) => setData({ ...data, password: v })}
                secureTextEntry={!showPassword}
              />
              <SoundPressable onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
              </SoundPressable>
            </View>
          </View>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="Confirm password"
            placeholderTextColor={colors.textMuted}
            value={data.confirmPassword}
            onChangeText={(v) => setData({ ...data, confirmPassword: v })}
            secureTextEntry={!showPassword}
          />
          <View style={styles.reqList}>
            <ReqRow met={pwHasLength} label="At least 8 characters" colors={colors} />
            <ReqRow met={pwHasUpper} label="One uppercase letter" colors={colors} />
            <ReqRow met={pwHasNumber} label="One number" colors={colors} />
            <ReqRow met={pwMatch} label="Passwords match" colors={colors} />
          </View>
        </View>
      );

      // Step 1: Name
      case 1: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="hand-right-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>What's your name?</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>This is how you'll appear to other members</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="First name"
            placeholderTextColor={colors.textMuted}
            value={data.firstName}
            onChangeText={(v) => setData({ ...data, firstName: v })}
            autoCapitalize="words"
            autoFocus
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="Last name"
            placeholderTextColor={colors.textMuted}
            value={data.lastName}
            onChangeText={(v) => setData({ ...data, lastName: v })}
            autoCapitalize="words"
          />
        </View>
      );

      // Step 2: Phone (its own step)
      case 2: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="call-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Phone number</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>For class reminders and important updates</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="(310) 555-0123"
            placeholderTextColor={colors.textMuted}
            value={data.phone}
            onChangeText={(v) => setData({ ...data, phone: v })}
            keyboardType="phone-pad"
            autoComplete="tel"
            autoFocus
          />
        </View>
      );

      // Step 3: Biological Sex
      case 3: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="body-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Biological Sex</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            Used to personalize health tracking features
          </Text>

          <View style={styles.sexOptions}>
            {([
              { value: 'male' as const, label: 'Male', icon: 'male-outline' as const },
              { value: 'female' as const, label: 'Female', icon: 'female-outline' as const },
              { value: 'other' as const, label: 'Prefer not to say', icon: 'remove-circle-outline' as const },
            ]).map((opt) => {
              const isSelected = data.biologicalSex === opt.value;
              return (
                <SoundPressable
                  key={opt.value}
                  style={[
                    styles.sexOption,
                    {
                      backgroundColor: isSelected ? colors.gold : colors.surface,
                      borderColor: isSelected ? colors.gold : 'transparent',
                    },
                  ]}
                  onPress={() => setData({ ...data, biologicalSex: opt.value })}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={opt.icon}
                    size={28}
                    color={isSelected ? '#000' : colors.textSecondary}
                  />
                  <Text style={[
                    styles.sexOptionLabel,
                    { color: isSelected ? '#000' : colors.textPrimary },
                  ]}>
                    {opt.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.sexCheck}>
                      <Ionicons name="checkmark" size={16} color="#000" />
                    </View>
                  )}
                </SoundPressable>
              );
            })}
          </View>

          <Text style={[styles.sexPrivacyNote, { color: colors.textMuted }]}>
            This information is kept private and is only used to customize health features like cycle tracking and calorie calculations.
          </Text>
        </View>
      );

      // Step 4: Profile photo
      case 4: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            {data.photo ? (
              <Image source={{ uri: data.photo }} style={styles.photoPreview} />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: colors.surface, borderColor: 'transparent' }]}>
                <Ionicons name="camera" size={48} color={colors.gold} />
              </View>
            )}
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Add a profile photo</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>Let other members recognize you</Text>
          <View style={styles.photoButtons}>
            <SoundPressable style={[styles.photoOption, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={24} color={colors.gold} />
              <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>Camera</Text>
            </SoundPressable>
            <SoundPressable style={[styles.photoOption, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={pickPhoto}>
              <Ionicons name="images-outline" size={24} color={colors.gold} />
              <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>Library</Text>
            </SoundPressable>
          </View>
        </View>
      );

      // Step 5: Fun fact + nickname
      case 5: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="sparkles-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Fun fact</Text>
          <TextInput
            style={[styles.input, styles.bioInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="I can juggle 5 balls…"
            placeholderTextColor={colors.textMuted}
            value={data.funFact}
            onChangeText={(v) => {
              const suggested = suggestNickname(v);
              // Only auto-fill nickname if user hasn't customized it yet
              setData({ ...data, funFact: v, nickname: data.nickname && data.nickname !== suggestNickname(data.funFact) ? data.nickname : suggested });
            }}
            multiline
            maxLength={120}
          />
          <Text style={[styles.charCount, { color: colors.textMuted }]}>{data.funFact.length}/120</Text>

          {/* Suggested nickname */}
          {data.funFact.trim().length > 0 && (
            <View style={{ width: '100%', marginTop: spacing.md }}>
              <Text style={[styles.nicknameLabel, { color: colors.textTertiary }]}>YOUR NICKNAME</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.gold, borderColor: 'transparent', borderWidth: 0, fontStyle: 'italic', fontSize: 22, fontWeight: '700' }]}
                placeholder="Your nickname"
                placeholderTextColor={colors.textMuted}
                value={data.nickname}
                onChangeText={(v) => setData({ ...data, nickname: v })}
                autoCapitalize="words"
                maxLength={30}
              />
              <Text style={[styles.nicknameHint, { color: colors.textMuted }]}>
                Auto-suggested from your fun fact. Tap to customize.
              </Text>
            </View>
          )}
        </View>
      );

      // Step 6: Socials
      case 6: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="globe-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Connect your socials</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>Optional. Let members find you elsewhere.</Text>
          <View style={styles.socialRow}>
            <Ionicons name="logo-instagram" size={22} color="#E1306C" />
            <TextInput
              style={[styles.socialInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }]}
              placeholder="Instagram username"
              placeholderTextColor={colors.textMuted}
              value={data.instagram}
              onChangeText={(v) => setData({ ...data, instagram: v })}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.socialRow}>
            <Ionicons name="logo-twitter" size={22} color="#1DA1F2" />
            <TextInput
              style={[styles.socialInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }]}
              placeholder="X / Twitter username"
              placeholderTextColor={colors.textMuted}
              value={data.twitter}
              onChangeText={(v) => setData({ ...data, twitter: v })}
              autoCapitalize="none"
            />
          </View>
          <View style={styles.socialRow}>
            <Ionicons name="globe-outline" size={22} color={colors.gold} />
            <TextInput
              style={[styles.socialInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border }]}
              placeholder="Website URL"
              placeholderTextColor={colors.textMuted}
              value={data.website}
              onChangeText={(v) => setData({ ...data, website: v })}
              autoCapitalize="none"
            />
          </View>
        </View>
      );

      // Step 7: Belt + stripes
      case 7: return (
        <View style={[styles.stepContent, { gap: spacing.md }]}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="ribbon-outline" size={48} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Your belt & stripes</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            Set your current rank. Only instructors can update this later.
          </Text>

          {/* Live belt preview */}
          <View style={{ marginVertical: spacing.xs }}>
            <BeltDisplay belt={data.belt} stripes={data.stripes} width={180} />
          </View>

          {/* Belt picker */}
          <View style={styles.beltGrid}>
            {BELT_ORDER.map((belt) => {
              const isSelected = data.belt === belt;
              return (
                <SoundPressable
                  key={belt}
                  style={[
                    styles.beltOption,
                    { backgroundColor: isSelected ? BELT_DISPLAY_COLORS[belt] : colors.surface },
                    isSelected && { borderColor: colors.gold, borderWidth: 2 },
                    !isSelected && { borderColor: 'transparent', borderWidth: 1 },
                  ]}
                  onPress={() => setData({ ...data, belt, stripes: belt === 'none' ? 0 : data.stripes })}
                >
                  <View style={[styles.beltDot, { backgroundColor: BELT_DISPLAY_COLORS[belt] }]} />
                  <Text style={[
                    styles.beltLabel,
                    { color: isSelected ? (belt === 'white' ? '#333' : '#FFF') : colors.textSecondary },
                  ]}>
                    {BELT_LABELS[belt]}
                  </Text>
                </SoundPressable>
              );
            })}
          </View>

          {/* Stripe picker — only meaningful if a belt is selected */}
          {data.belt !== 'none' && (
            <View style={styles.stripesPickerSection}>
              <Text style={[styles.stripesPickerLabel, { color: colors.textSecondary }]}>
                Stripes
              </Text>
              <View style={styles.stripesPicker}>
                {[0, 1, 2, 3, 4].map((n) => {
                  const active = data.stripes === n;
                  return (
                    <SoundPressable
                      key={n}
                      style={[
                        styles.stripeChip,
                        {
                          backgroundColor: active ? colors.gold : colors.surface,
                          borderColor: active ? colors.gold : colors.border,
                        },
                      ]}
                      onPress={() => setData({ ...data, stripes: n })}
                    >
                      <Text
                        style={[
                          styles.stripeChipLabel,
                          { color: active ? '#000' : colors.textSecondary },
                        ]}
                      >
                        {n}
                      </Text>
                    </SoundPressable>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      );

      // Step 8: Liability waiver
      case 8: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="document-text-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Liability Waiver</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            Please read the full waiver below and sign by typing your full legal name.
          </Text>
          <ScrollView
            style={[styles.waiverBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            contentContainerStyle={styles.waiverScrollContent}
            nestedScrollEnabled
          >
            <Text style={[styles.waiverText, { color: colors.textSecondary }]}>
              {renderWaiverText(`${data.firstName} ${data.lastName}`.trim())}
            </Text>
          </ScrollView>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="Type your full legal name"
            placeholderTextColor={colors.textMuted}
            value={data.signedName}
            onChangeText={(v) => setData({ ...data, signedName: v })}
            autoCapitalize="words"
          />
          <SoundPressable
            style={styles.emailCopyRow}
            onPress={() => setData({ ...data, emailWaiverCopy: !data.emailWaiverCopy })}
            activeOpacity={0.7}
          >
            <Ionicons
              name={data.emailWaiverCopy ? 'checkbox' : 'square-outline'}
              size={22}
              color={data.emailWaiverCopy ? colors.gold : colors.textMuted}
            />
            <Text style={[styles.emailCopyLabel, { color: colors.textSecondary }]}>
              Email me a copy of this waiver
            </Text>
          </SoundPressable>
        </View>
      );
      // Step 9: Welcome
      case 9: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="checkmark-circle" size={80} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
            Welcome, {data.firstName}!
          </Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            Your profile is ready. You're now part of the Zenki Dojo community.
          </Text>
        </View>
      );

      default: return null;
    }
  };

  const canContinue = () => {
    if (step === 0) {
      return data.email.includes('@') && pwHasLength && pwHasUpper && pwHasNumber && pwMatch;
    }
    if (step === 1) return data.firstName.trim().length > 0;
    if (step === 3) return data.biologicalSex !== '';
    // Step 8: Liability waiver — require a signed name that matches the
    // user's first/last name. Photo (4), fun-fact (5), socials (6), and
    // belt (7) are all skippable / always continuable.
    if (step === 8) {
      const expected = `${data.firstName} ${data.lastName}`.trim().toLowerCase();
      const signed = data.signedName.trim().toLowerCase();
      return signed.length > 0 && (signed === expected || signed.includes(data.firstName.trim().toLowerCase()));
    }
    return true;
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardView>
        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBg, { backgroundColor: colors.surfaceSecondary }]}>
            <Animated.View style={[styles.progressFill, {
              backgroundColor: colors.gold,
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          {/* Dots — show only if 11 or fewer steps. 18 dots would be too crowded. */}
          {TOTAL_STEPS <= 12 && (
            <View style={styles.progressDots}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View key={i} style={[
                  styles.progressDot,
                  { backgroundColor: i <= step ? colors.gold : colors.surfaceSecondary },
                ]} />
              ))}
            </View>
          )}
        </View>

        {/* Step Content */}
        <ScrollView
          contentContainerStyle={styles.stepScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
        >
          <Animated.View style={[styles.stepContainer, {
            opacity: fadeAnim,
            transform: [{ translateX: slideAnim }],
          }]}>
            {renderStep()}
          </Animated.View>
        </ScrollView>

        {/* Navigation Buttons */}
        <View style={styles.navRow}>
          {step > 0 ? (
            <SoundPressable style={[styles.navButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={goBack}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </SoundPressable>
          ) : (
            <View style={styles.navButton} />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <SoundPressable
              style={[styles.navButtonPrimary, { backgroundColor: canContinue() ? colors.red : colors.surfaceSecondary }]}
              onPress={goNext}
              disabled={!canContinue()}
            >
              <Text style={[styles.navButtonText, { color: canContinue() ? '#FFF' : colors.textMuted }]}>
                {step === 0 ? 'Get Started' : 'Continue'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={canContinue() ? '#FFF' : colors.textMuted} />
            </SoundPressable>
          ) : (
            <SoundPressable
              style={[styles.navButtonPrimary, { backgroundColor: colors.gold }]}
              onPress={handleFinish}
            >
              <Text style={[styles.navButtonText, { color: '#000' }]}>Enter the Dojo</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </SoundPressable>
          )}
        </View>

        {/* Skip link — optional steps (fun fact, socials) get a normal
            single-step skip. Phone (2), waiver (8), and welcome (9) are
            not skippable. */}
        {(step === 5 || step === 6) && (
          <SoundPressable style={styles.skipButton} onPress={goNext}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
          </SoundPressable>
        )}

        {/* Subtle login link — for members who reinstalled the app */}
        {step === 0 && (
          <SoundPressable
            style={styles.subtleLoginRow}
            onPress={() => navigation.replace('SignIn')}
            activeOpacity={0.6}
          >
            <Text style={[styles.subtleLoginText, { color: colors.textMuted }]}>
              Have an account? <Text style={{ color: colors.textSecondary, textDecorationLine: 'underline' }}>Sign in</Text>
            </Text>
          </SoundPressable>
        )}
      </KeyboardView>
    </SafeAreaView>
  );
}

// Inline helper for password requirement rows
function ReqRow({ met, label, colors }: { met: boolean; label: string; colors: any }) {
  return (
    <View style={reqStyles.row}>
      <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={met ? colors.success : colors.textMuted} />
      <Text style={[reqStyles.label, { color: met ? colors.success : colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// Reusable card for activity / goal / experience / diet selection steps
function OptionCard({
  emoji, label, desc, active, colors, onPress,
}: {
  emoji: string; label: string; desc: string; active: boolean; colors: any; onPress: () => void;
}) {
  return (
    <SoundPressable
      onPress={onPress}
      activeOpacity={0.7}
      style={[optionCardStyles.card, {
        backgroundColor: active ? colors.goldMuted : colors.surface,
        borderColor: active ? colors.gold : colors.border,
      }]}
    >
      <Text style={optionCardStyles.emoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[optionCardStyles.label, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[optionCardStyles.desc, { color: colors.textMuted }]}>{desc}</Text>
      </View>
      {active && (
        <View style={[optionCardStyles.check, { backgroundColor: colors.gold }]}>
          <Ionicons name="checkmark" size={14} color="#000" />
        </View>
      )}
    </SoundPressable>
  );
}

const optionCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  emoji: { fontSize: 28 },
  label: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  check: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
});

const reqStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 13, fontWeight: '500' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressContainer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  progressBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressDots: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, paddingHorizontal: spacing.sm },
  progressDot: { width: 10, height: 10, borderRadius: 5 },
  stepScrollContent: { flexGrow: 1, justifyContent: 'center' },
  stepContainer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  stepContent: { alignItems: 'center', gap: spacing.lg },
  stepTitle: { ...typography.sectionTitle, fontSize: 24, textTransform: 'none', letterSpacing: 0, textAlign: 'center' },
  stepSubtitle: { ...typography.body, textAlign: 'center', lineHeight: 22, paddingHorizontal: spacing.md },
  input: {
    width: '100%', borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd + 2, fontSize: 18, borderWidth: 1, textAlign: 'center',
  },
  passwordWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
  },
  passwordInput: {
    flex: 1, paddingVertical: spacing.smd + 2, fontSize: 18, textAlign: 'center',
  },
  reqList: { gap: 6, alignSelf: 'flex-start', paddingLeft: spacing.sm },
  bioInput: { minHeight: 100, textAlignVertical: 'top', textAlign: 'left', fontSize: 16 },
  charCount: { ...typography.bodySmall, alignSelf: 'flex-end' },
  nicknameLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6, marginLeft: 4 },
  nicknameHint: { fontSize: 11, fontWeight: '400', marginTop: 6, textAlign: 'center', fontStyle: 'italic' },
  photoPreview: { width: 128, height: 128, borderRadius: 64 },
  photoPlaceholder: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  photoButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  photoOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.lg,
  },
  photoOptionText: { ...typography.body, fontWeight: '600' },

  // Permissions rows
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    width: '100%',
  },
  permIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { fontSize: 14, fontWeight: '800' },
  permDesc: { fontSize: 11, lineHeight: 15, marginTop: 2 },

  // Apple Health expanded card
  healthCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    width: '100%',
    gap: 8,
  },
  healthCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  healthCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  healthCatLabel: { fontSize: 13, fontWeight: '700' },
  healthCatSub: { fontSize: 11, lineHeight: 14, marginTop: 1 },
  healthCatToggle: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthCardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  healthAllBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthAllText: { fontSize: 12, fontWeight: '700' },
  healthConnectBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthConnectText: { fontSize: 13, fontWeight: '800', color: '#000' },
  permGrantAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
    marginBottom: 14,
  },
  permGrantAllText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  waiverBox: {
    width: '100%',
    maxHeight: 260,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  waiverScrollContent: { paddingVertical: spacing.md },
  waiverText: { fontSize: 13, lineHeight: 20, textAlign: 'left' },
  emailCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    alignSelf: 'flex-start',
  },
  emailCopyLabel: { fontSize: 14, fontWeight: '500' },
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%' },
  socialInput: {
    flex: 1, borderRadius: borderRadius.md, paddingHorizontal: spacing.md,
    paddingVertical: spacing.smd + 2, fontSize: 16,
  },
  beltGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm },
  beltOption: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: borderRadius.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
  },
  beltDot: { width: 16, height: 16, borderRadius: 8 },
  beltLabel: { ...typography.body, fontWeight: '600' },
  stripesPickerSection: { width: '100%', alignItems: 'center', marginTop: spacing.md, gap: spacing.sm },
  stripesPickerLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  stripesPicker: { flexDirection: 'row', gap: spacing.sm },
  stripeChip: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripeChipLabel: { fontSize: 18, fontWeight: '800' },
  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  navButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  navButtonPrimary: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md + 2, borderRadius: borderRadius.md,
  },
  navButtonText: { ...typography.button, fontSize: 15 },
  skipButton: { alignItems: 'center', paddingBottom: spacing.lg },
  skipText: { ...typography.bodySmall, fontWeight: '500' },
  subtleLoginRow: { alignItems: 'center', paddingBottom: spacing.md, paddingTop: spacing.xs },
  subtleLoginText: { fontSize: 12, fontWeight: '400' },

  // ── Biological sex step ──
  sexOptions: {
    width: '100%',
    gap: 10,
    marginTop: spacing.md,
  },
  sexOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 2,
  },
  sexOptionLabel: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  sexCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sexPrivacyNote: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    fontStyle: 'italic',
  },

  // ── Body stats steps ──
  bodyStatBlock: {
    width: '100%',
    gap: spacing.sm,
  },
  bodyStatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bodyStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  heightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  heightInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    height: 56,
    gap: 6,
    flex: 1,
  },
  bigNumInput: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    minWidth: 50,
    paddingVertical: 0,
  },
  unitSuffix: { fontSize: 14, fontWeight: '600' },
  dobInput: {
    width: '100%',
    height: 48,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    textAlign: 'center',
  },
  microCopy: {
    fontSize: 12,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  segmentedPill: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  segmentedPillItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  segmentedPillLabel: { fontSize: 14, fontWeight: '700' },
  segmentedPillSmall: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 10,
    padding: 2,
  },
  segmentedPillItemSmall: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  segmentedPillLabelSmall: { fontSize: 12, fontWeight: '700' },
  metabolicSexBlock: {
    width: '100%',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: 12,
  },
  metabolicSexLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },

  // Training frequency pills
  freqRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  freqPill: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqPillLabel: { fontSize: 16, fontWeight: '800' },

  // Injury chips
  injuryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  injuryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  injuryChipLabel: { fontSize: 13, fontWeight: '600' },

  // Summary card (step 10)
  summaryCard: {
    width: '100%',
    padding: spacing.lg,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    gap: 8,
  },
  summaryCalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  summaryCalValue: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  summaryMacroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.sm,
  },
  summaryMacroItem: { alignItems: 'center', flex: 1 },
  summaryMacroValue: { fontSize: 18, fontWeight: '800' },
  summaryMacroLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },
  summaryMacroDivider: { width: 1, height: 28 },
  summaryStatsRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
  },
  summaryStatItem: { alignItems: 'center', flex: 1 },
  summaryStatLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  summaryStatValue: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  summaryTimeline: {
    width: '100%',
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  summaryTimelineText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  summaryTimelineSub: { fontSize: 11, fontStyle: 'italic' },
});
