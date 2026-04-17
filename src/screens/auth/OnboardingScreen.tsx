import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Image, Animated, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useTheme } from '../../context/ThemeContext';
import { useMotion } from '../../context/MotionContext';
import { useAuth } from '../../context/AuthContext';
import { typography, spacing, borderRadius } from '../../theme';
import { BELT_ORDER, BELT_DISPLAY_COLORS, BELT_LABELS, BeltLevel, Member } from '../../data/members';
import { suggestNickname } from '../../utils/nickname';
import { BeltDisplay } from '../../components/BeltDisplay';
import { renderWaiverText, WAIVER_VERSION, WaiverSignature } from '../../data/waiver';
import { pushWaiverToSheets, pushWaiverToFirestore } from '../../services/waiverSync';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 10;

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
  belt: BeltLevel;
  stripes: number;
  signedName: string;
  emailWaiverCopy: boolean;
}

export function OnboardingScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const { createAccount } = useAuth();
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [locationGranted, setLocationGranted] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    email: '', password: '', confirmPassword: '',
    firstName: '', lastName: '', phone: '', photo: null, bio: '', funFact: '', nickname: '',
    instagram: '', twitter: '', website: '', belt: 'none', stripes: 0,
    signedName: '', emailWaiverCopy: false,
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
      memberSince: new Date().toISOString().split('T')[0],
      isAdmin: false,
      profilePhoto: data.photo || undefined,
      funFact: data.funFact.trim() || undefined,
      nickname: data.nickname.trim() || undefined,
      totalSessions: 0,
      weekStreak: 0,
    };
    await createAccount(member);

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

  const requestLocationPermission = async () => {
    if (Platform.OS === 'web') {
      setLocationGranted(true);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    setLocationGranted(status === 'granted');
  };

  const stepIcons: (keyof typeof Ionicons.glyphMap)[] = [
    'lock-closed-outline', 'person-outline', 'camera-outline', 'create-outline',
    'share-social-outline', 'ribbon-outline', 'document-text-outline',
    'location-outline', 'checkmark-circle',
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

      // Step 3: Photo
      case 3: return (
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

      // Step 4: Fun fact + auto-suggested nickname
      case 4: return (
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

      // Step 5: Socials
      case 5: return (
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

      // Step 6: Belt + Stripes
      case 6: return (
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
                <TouchableOpacity
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
                </TouchableOpacity>
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
                    <TouchableOpacity
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
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      );

      // Step 7: Liability Waiver
      case 7: return (
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
          <TouchableOpacity
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
          </TouchableOpacity>
        </View>
      );

      // Step 8: Location permission
      case 8: return (
        <View style={styles.stepContent}>
          <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
            <Ionicons name="shield-checkmark-outline" size={64} color={colors.gold} />
          </Animated.View>
          <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>App Permissions</Text>
          <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
            These help the app work at its best. All are optional — you can change them later in Settings.
          </Text>

          {/* Location */}
          <TouchableOpacity
            style={[styles.permRow, { backgroundColor: colors.surface, borderColor: locationGranted ? colors.success + '40' : colors.border }]}
            onPress={requestLocationPermission}
          >
            <View style={[styles.permIcon, { backgroundColor: '#3B82F620' }]}>
              <Ionicons name="location-outline" size={20} color="#3B82F6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Location</Text>
              <Text style={[styles.permDesc, { color: colors.textMuted }]}>Auto check-in when you arrive at the dojo + GPS workout tracking</Text>
            </View>
            <Ionicons name={locationGranted ? 'checkmark-circle' : 'chevron-forward'} size={20} color={locationGranted ? colors.success : colors.textMuted} />
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            style={[styles.permRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={async () => {
              try { await ImagePicker.requestCameraPermissionsAsync(); } catch {}
            }}
          >
            <View style={[styles.permIcon, { backgroundColor: '#F9731620' }]}>
              <Ionicons name="camera-outline" size={20} color="#F97316" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Camera</Text>
              <Text style={[styles.permDesc, { color: colors.textMuted }]}>Scan barcodes for food logging + take progress photos + profile pic</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Notifications */}
          <TouchableOpacity
            style={[styles.permRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={async () => {
              try {
                const Notifications = require('expo-notifications');
                await Notifications.requestPermissionsAsync();
              } catch {}
            }}
          >
            <View style={[styles.permIcon, { backgroundColor: '#EF444420' }]}>
              <Ionicons name="notifications-outline" size={20} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Notifications</Text>
              <Text style={[styles.permDesc, { color: colors.textMuted }]}>Class reminders 1hr before, achievement unlocks, and dojo announcements</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Photo Library */}
          <TouchableOpacity
            style={[styles.permRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={async () => {
              try { await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch {}
            }}
          >
            <View style={[styles.permIcon, { backgroundColor: '#22C55E20' }]}>
              <Ionicons name="images-outline" size={20} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Photo Library</Text>
              <Text style={[styles.permDesc, { color: colors.textMuted }]}>Upload food photos for AI macro tracking + share to the community feed</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
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
    if (step === 7) {
      // Waiver step — signed name must reasonably match first + last name
      const expected = `${data.firstName} ${data.lastName}`.trim().toLowerCase();
      const signed = data.signedName.trim().toLowerCase();
      return signed.length > 0 && (signed === expected || signed.includes(data.firstName.trim().toLowerCase()));
    }
    return true; // Other steps are optional
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

        {/* Skip — not allowed on waiver (step 7) or phone (step 2) */}
        {step > 2 && step < TOTAL_STEPS - 1 && step !== 7 && (
          <TouchableOpacity style={styles.skipButton} onPress={goNext}>
            <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip for now</Text>
          </TouchableOpacity>
        )}

        {/* Subtle login link — for members who reinstalled the app */}
        {step === 0 && (
          <TouchableOpacity
            style={styles.subtleLoginRow}
            onPress={() => navigation.replace('SignIn')}
            activeOpacity={0.6}
          >
            <Text style={[styles.subtleLoginText, { color: colors.textMuted }]}>
              Have an account? <Text style={{ color: colors.textSecondary, textDecorationLine: 'underline' }}>Sign in</Text>
            </Text>
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
});
