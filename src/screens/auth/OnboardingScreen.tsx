import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Image, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../context/ThemeContext';
import { useMotion } from '../../context/MotionContext';
import { useAuth } from '../../context/AuthContext';
import { typography, spacing, borderRadius } from '../../theme';
import { BELT_ORDER, BELT_DISPLAY_COLORS, BeltLevel, Member } from '../../data/members';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 7;

interface OnboardingData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  photo: string | null;
  bio: string;
  instagram: string;
  twitter: string;
  website: string;
  belt: BeltLevel;
}

export function OnboardingScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const { createAccount } = useAuth();
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', photo: null, bio: '',
    instagram: '', twitter: '', website: '', belt: 'white',
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
      belt: data.belt,
      stripes: 0,
      memberSince: new Date().toISOString().split('T')[0],
      isAdmin: false,
      profilePhoto: data.photo || undefined,
      totalSessions: 0,
      weekStreak: 0,
    };
    await createAccount(member);
    navigation.replace('Main');
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
    'lock-closed-outline', 'person-outline', 'camera-outline', 'create-outline',
    'share-social-outline', 'ribbon-outline', 'checkmark-circle',
  ];

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
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
              </TouchableOpacity>
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

      // Step 2: Photo
      case 2: return (
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
            <TouchableOpacity style={[styles.photoOption, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={takePhoto}>
              <Ionicons name="camera-outline" size={24} color={colors.gold} />
              <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoOption, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={pickPhoto}>
              <Ionicons name="images-outline" size={24} color={colors.gold} />
              <Text style={[styles.photoOptionText, { color: colors.textPrimary }]}>Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      );

      // Step 3: Bio
      case 3: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="chatbubble-ellipses-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Tell us about yourself</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>A short bio for your profile</Text>
          <TextInput
            style={[styles.input, styles.bioInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: 'transparent', borderWidth: 0 }]}
            placeholder="I train because..."
            placeholderTextColor={colors.textMuted}
            value={data.bio}
            onChangeText={(v) => setData({ ...data, bio: v })}
            multiline
            maxLength={150}
          />
          <Text style={[styles.charCount, { color: colors.textMuted }]}>{data.bio.length}/150</Text>
        </View>
      );

      // Step 4: Socials
      case 4: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="globe-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>Connect your socials</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>Optional — let members find you elsewhere</Text>
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

      // Step 5: Belt
      case 5: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="ribbon-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>What's your belt level?</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>Select your current Jiu-Jitsu belt</Text>
          <View style={styles.beltGrid}>
            {BELT_ORDER.map((belt) => {
              const isSelected = data.belt === belt;
              return (
                <TouchableOpacity
                  key={belt}
                  style={[
                    styles.beltOption,
                    { backgroundColor: isSelected ? BELT_DISPLAY_COLORS[belt] : colors.surface },
                    isSelected && { borderColor: colors.gold, borderWidth: 2 },
                    !isSelected && { borderColor: 'transparent', borderWidth: 1 },
                  ]}
                  onPress={() => setData({ ...data, belt })}
                >
                  <View style={[styles.beltDot, { backgroundColor: BELT_DISPLAY_COLORS[belt] }]} />
                  <Text style={[
                    styles.beltLabel,
                    { color: isSelected ? (belt === 'white' ? '#333' : '#FFF') : colors.textSecondary },
                  ]}>
                    {belt.charAt(0).toUpperCase() + belt.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );

      // Step 6: Welcome
      case 6: return (
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
    return true; // All other steps are optional
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBg, { backgroundColor: colors.surfaceSecondary }]}>
            <Animated.View style={[styles.progressFill, {
              backgroundColor: colors.gold,
              width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }]} />
          </View>
          <View style={styles.progressDots}>
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <View key={i} style={[
                styles.progressDot,
                { backgroundColor: i <= step ? colors.gold : colors.surfaceSecondary },
              ]} />
            ))}
          </View>
        </View>

        {/* Step Content */}
        <ScrollView
          contentContainerStyle={styles.stepScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
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
            <TouchableOpacity style={[styles.navButton, { backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent' }]} onPress={goBack}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.navButton} />
          )}

          {step < TOTAL_STEPS - 1 ? (
            <TouchableOpacity
              style={[styles.navButtonPrimary, { backgroundColor: canContinue() ? colors.red : colors.surfaceSecondary }]}
              onPress={goNext}
              disabled={!canContinue()}
            >
              <Text style={[styles.navButtonText, { color: canContinue() ? '#FFF' : colors.textMuted }]}>
                {step === 0 ? 'Get Started' : 'Continue'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color={canContinue() ? '#FFF' : colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.navButtonPrimary, { backgroundColor: colors.gold }]}
              onPress={handleFinish}
            >
              <Text style={[styles.navButtonText, { color: '#000' }]}>Enter the Dojo</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </TouchableOpacity>
          )}
        </View>

        {/* Skip */}
        {step > 1 && step < TOTAL_STEPS - 1 && (
          <TouchableOpacity style={styles.skipButton} onPress={goNext}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
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
  stepContainer: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
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
  photoPreview: { width: 128, height: 128, borderRadius: 64 },
  photoPlaceholder: { width: 128, height: 128, borderRadius: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  photoButtons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  photoOption: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: borderRadius.lg,
  },
  photoOptionText: { ...typography.body, fontWeight: '600' },
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
});
