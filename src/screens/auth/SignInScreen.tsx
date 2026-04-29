import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, KeyboardAvoidingView, Platform, Image, Alert, Modal, Animated, Easing, ScrollView } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { SoundPressable } from '../../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components';
import { MEMBERS, CREDENTIALS } from '../../data/members';
import { spacing, borderRadius } from '../../theme';
import { FIREBASE_CONFIGURED } from '../../config/firebase';
import { GOOGLE_CLIENT_ID } from '../../config/env';
import {
  firebaseSignInWithPassword,
  firebaseSignInOrSeedAccount,
  firebaseSignInWithApple,
  firebaseSignInWithGoogle,
  firebaseSignOut,
  emailForMember,
} from '../../services/firebaseAuth';
import { fetchMemberByCurrentUid } from '../../services/memberSync';
import { getMergedMembers } from '../../services/memberOverrides';

WebBrowser.maybeCompleteAuthSession();

const INVITE_CODE = 'dragon';
const INVITE_VERIFIED_KEY = '@zenki_invite_verified';
const LAST_USERNAME_KEY = '@zenki_last_username';

export function SignInScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showInviteGate, setShowInviteGate] = useState(false);
  const [inviteVerified, setInviteVerified] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [checkingInvite, setCheckingInvite] = useState(true);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(INVITE_VERIFIED_KEY).then((val) => {
      if (val !== 'true') setShowInviteGate(true);
      setCheckingInvite(false);
    });
  }, []);

  // Prefill username from the last signed-out account so returning users
  // don't have to retype it. Saved by AuthContext.signOut.
  useEffect(() => {
    AsyncStorage.getItem(LAST_USERNAME_KEY).then((val) => {
      if (val) setUsername(val);
    });
  }, []);

  // ── Apple Sign In availability (iOS 13+ only) ──
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

  // ── Logo + tagline mount animations ──
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // Native driver works for opacity/transform on iOS/Android but the RN-Web
    // fallback for useNativeDriver:true doesn't reliably drive the JS values,
    // so disable on web. Animations are short and only run once on mount.
    const useNative = Platform.OS !== 'web';
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: useNative,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: useNative,
      }),
    ]).start();
    Animated.timing(taglineOpacity, {
      toValue: 1,
      duration: 600,
      delay: 400,
      easing: Easing.out(Easing.ease),
      useNativeDriver: useNative,
    }).start();
  }, []);

  // ── Google Sign In auth request ──
  // Uses an ID-token flow which we exchange for a Firebase session.
  const [, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
  });

  // When Google returns a token, exchange it with Firebase + sign in locally
  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = (googleResponse.params as any)?.id_token;
    if (!idToken) return;
    (async () => {
      try {
        setLoading(true);
        const { member } = await firebaseSignInWithGoogle({ idToken });
        await auth.signIn(member);
        navigation.replace('Main');
      } catch (err: any) {
        setErrorMsg(err?.message ? `Google sign-in didn't go through — ${err.message}` : "Google sign-in didn't go through — try email + password instead.");
      } finally {
        setLoading(false);
      }
    })();
  }, [googleResponse]);

  const handleAppleSignIn = async () => {
    if (Platform.OS !== 'ios') {
      setErrorMsg('Apple Sign-In only works on iPhone or iPad.');
      return;
    }
    if (!FIREBASE_CONFIGURED) {
      setErrorMsg("Apple Sign-In needs Firebase set up first — try email + password.");
      return;
    }
    setLoading(true);
    try {
      // Apple requires a SHA256-hashed nonce; we send the raw nonce to Firebase
      // and the hashed version to Apple.
      const rawNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Math.random().toString(36).slice(2) + Date.now().toString(),
      );
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );
      const appleCred = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (!appleCred.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const { member } = await firebaseSignInWithApple({
        identityToken: appleCred.identityToken,
        fullName: appleCred.fullName,
        email: appleCred.email,
        nonce: rawNonce,
      });
      await auth.signIn(member);
      navigation.replace('Main');
    } catch (err: any) {
      // User canceling the prompt is not a real error — silence it.
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      setErrorMsg(err?.message ? `Apple sign-in didn't go through — ${err.message}` : "Apple sign-in didn't go through — try email + password instead.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!GOOGLE_CLIENT_ID) {
      setErrorMsg("Google Sign-In isn't configured — use email + password.");
      return;
    }
    if (!FIREBASE_CONFIGURED) {
      setErrorMsg("Google Sign-In needs Firebase set up first — use email + password.");
      return;
    }
    try {
      await promptGoogle();
    } catch (err: any) {
      setErrorMsg(err?.message ? `Couldn't reach Google — ${err.message}` : "Couldn't reach Google — try again or use email + password.");
    }
  };

  // Navigate to onboarding after the gate modal fully dismisses
  useEffect(() => {
    if (inviteVerified) {
      navigation.replace('Onboarding');
    }
  }, [inviteVerified]);

  const handleVerifyInvite = async () => {
    if (inviteCode.toLowerCase().trim() === INVITE_CODE) {
      await AsyncStorage.setItem(INVITE_VERIFIED_KEY, 'true');
      setShowInviteGate(false);
      setInviteVerified(true);
    } else {
      Alert.alert('Invalid Code', 'Please enter a valid invite code.');
    }
  };

  const handleSignIn = async () => {
    setErrorMsg(null);
    if (!username || !password) {
      setErrorMsg('Please enter your username or email and your password.');
      return;
    }
    setLoading(true);

    // "temp" password is the short-circuit to the admin-onboarding set-password flow.
    if (password === 'temp') {
      navigation.navigate('SetPassword', { username });
      setLoading(false);
      return;
    }

    const input = username.toLowerCase().trim();
    const isEmailInput = input.includes('@');

    // 1. Try the seed CREDENTIALS map first (handles matt.b /
    //    mattbrowntheemail@gmail.com / apple / admin / reviewer / tim@zenkidojo.com).
    const seedCred = CREDENTIALS[input];
    let member = seedCred ? MEMBERS.find((m) => m.id === seedCred.memberId) ?? null : null;

    // 2. If no seed match, look up admin-created / self-signup members from the
    //    local merged registry. Match by username (when input has no '@') or
    //    email (when input has '@'). This is what makes "mbrown" work for an
    //    admin-created member with username 'mbrown'. Trim both sides because
    //    admin-form input has historically been saved with trailing whitespace.
    if (!member) {
      try {
        const merged = await getMergedMembers();
        member =
          merged.find((m) =>
            isEmailInput
              ? (m.email ?? '').trim().toLowerCase() === input
              : (m.username ?? '').trim().toLowerCase() === input,
          ) ?? null;
      } catch {
        /* offline / async storage error — fall through */
      }
    }

    // Resolve the email Firebase Auth uses. Priority:
    //   real member.email > input-when-it's-an-email > synthesized username@zenkidojo.app
    const email = member
      ? emailForMember(member)
      : isEmailInput
        ? input
        : `${input}@zenkidojo.app`;

    // When Firebase is unreachable we fall back to the pre-existing local password
    // path so dev / offline can still sign in. Production always goes through Firebase.
    if (!FIREBASE_CONFIGURED) {
      await legacyLocalSignIn();
      return;
    }

    try {
      if (member) {
        // Member exists locally — auto-create or sign in to the matching
        // Firebase Auth account on first correct password.
        const { isNewAccount } = await firebaseSignInOrSeedAccount(email, password, member);
        if (isNewAccount) {
          console.log('[SignIn] Seeded Firebase account for', input);
        }
        await auth.signIn(member);
        navigation.replace('Main');
        return;
      }

      // No local member match — sign in via Firebase, then hydrate the Member
      // from /users/{uid} → /members/{memberId} in Firestore. This is the path
      // for admin-created users whose member record exists in Firestore but
      // hasn't been mirrored to local AsyncStorage on this device yet.
      await firebaseSignInWithPassword(email, password);
      const hydrated = await fetchMemberByCurrentUid();
      if (!hydrated) {
        // Auth succeeded but no member doc found — sign back out so we don't
        // leave a half-signed-in state, and surface a useful message.
        await firebaseSignOut().catch(() => {});
        throw new Error('member-record-missing');
      }
      await auth.signIn(hydrated);
      navigation.replace('Main');
    } catch (error: any) {
      const code = error?.code ?? error?.message ?? 'unknown';
      const userMessage =
        code === 'auth/too-many-requests'
          ? 'Too many attempts — take a breather and try again in a minute.'
          : code === 'auth/network-request-failed'
            ? "Couldn't connect — check your internet and try again."
            : code === 'auth/wrong-password' || code === 'auth/invalid-credential'
              ? 'That password doesn\'t match this account. Tap "Forgot password?" to reset it.'
              : code === 'auth/user-not-found'
                ? "No account with that username or email. Check the spelling or ask your admin."
                : code === 'auth/email-already-in-use'
                  ? 'An account already exists for this email — but the password you typed isn\'t the one Firebase has. Tap "Forgot password?" to reset.'
                  : code === 'member-record-missing'
                    ? "Sign-in worked, but we couldn't find your member profile. Ask the dojo admin to confirm your account."
                    : "Hmm, that username or password doesn't look right.";
      setErrorMsg(userMessage);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Offline / Firebase-unavailable path — uses the local CREDENTIALS map.
   * The old AsyncStorage-based admin password override was removed in v7.2
   * (password changes now go through Firebase updatePassword).
   */
  const legacyLocalSignIn = async () => {
    try {
      const cred = CREDENTIALS[username.toLowerCase()];
      if (cred && cred.password === password) {
        const member = MEMBERS.find((m) => m.id === cred.memberId);
        if (member) { await auth.signIn(member); navigation.replace('Main'); return; }
      }
      setErrorMsg("Hmm, that username or password doesn't look right.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingInvite) return null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Invite Gate */}
      <Modal visible={showInviteGate} animationType="fade">
        <SafeAreaView style={[styles.gateContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.gateIconWrap, { backgroundColor: colors.goldMuted }]}>
            <Ionicons name="shield-checkmark-outline" size={48} color={colors.gold} />
          </View>
          <Text style={[styles.gateTitle, { color: colors.textPrimary }]}>Members Only</Text>
          <Text style={[styles.gateSubtitle, { color: colors.textSecondary }]}>Enter your invite code to continue</Text>
          <TextInput
            style={[styles.gateInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Invite code"
            placeholderTextColor={colors.textTertiary}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
          />
          <Button title="Continue" onPress={handleVerifyInvite} fullWidth size="lg" />
        </SafeAreaView>
      </Modal>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        >
        <View style={styles.contentContainer}>

          {/* Logo */}
          <View style={styles.logoSection}>
            <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
              <Image source={isDark ? require('../../../assets/icon-dark.png') : require('../../../assets/icon-light.png')} style={styles.logo} resizeMode="contain" />
            </Animated.View>
            <Animated.View style={{ opacity: taglineOpacity }}>
              <Text style={[styles.tagline, { color: colors.textTertiary }]}>PRIVATE TRAINING · EST. 1997</Text>
            </Animated.View>
          </View>

          {/* Welcome */}
          <View style={styles.welcomeBlock}>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>Welcome to</Text>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Zenki Dojo</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>Please sign In</Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            {/* Social Login */}
            <SoundPressable
              style={[styles.socialBtn, { backgroundColor: '#FAFAFA', borderWidth: 1, borderColor: colors.border }]}
              activeOpacity={0.8}
              onPress={handleGoogleSignIn}
              disabled={loading || !GOOGLE_CLIENT_ID}
            >
              <Ionicons name="logo-google" size={22} color="#4285F4" />
              <Text style={styles.socialBtnText}>Continue with Google</Text>
            </SoundPressable>

            <SoundPressable
              style={[styles.socialBtn, { backgroundColor: '#000000' }]}
              activeOpacity={0.8}
              onPress={handleAppleSignIn}
              disabled={loading}
            >
              <Ionicons name="logo-apple" size={24} color="#FFFFFF" />
              <Text style={[styles.socialBtnText, { color: '#FFFFFF' }]}>Continue with Apple</Text>
            </SoundPressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              <Text style={[styles.dividerText, { color: colors.textTertiary }]}>or</Text>
              <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            </View>

            {/* Username or Email */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Username or Email</Text>
              <View style={[
                styles.inputWrap,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedField === 'username' ? colors.gold : 'transparent',
                }
              ]}>
                <Ionicons name="person-outline" size={20} color={colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  placeholder="Username or email"
                  placeholderTextColor={colors.textTertiary}
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocusedField('username')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Password</Text>
              <View style={[
                styles.inputWrap,
                {
                  backgroundColor: colors.surface,
                  borderColor: focusedField === 'password' ? colors.gold : 'transparent',
                }
              ]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textTertiary} />
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, flex: 1 }]}
                  placeholder="Enter password"
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showPassword}
                />
                <SoundPressable onPress={() => setShowPassword(!showPassword)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textTertiary} />
                </SoundPressable>
              </View>
            </View>

            <SoundPressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotRow}>
              <Text style={[styles.forgotText, { color: colors.gold }]}>Forgot password?</Text>
            </SoundPressable>

            {errorMsg ? (
              <View style={[styles.errorBanner, { backgroundColor: colors.red + '20', borderColor: colors.red }]}>
                <Ionicons name="alert-circle" size={20} color={colors.red} />
                <Text style={[styles.errorBannerText, { color: colors.red }]}>{errorMsg}</Text>
              </View>
            ) : null}

            <Button title="Sign In" onPress={handleSignIn} loading={loading} fullWidth size="lg" style={{ marginTop: 6 }} />
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textTertiary }]}>Not a member? </Text>
            <SoundPressable onPress={() => navigation.navigate('Contact')}>
              <Text style={[styles.footerLink, { color: colors.gold }]}>Inquire</Text>
            </SoundPressable>
          </View>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { flexGrow: 1, justifyContent: 'space-evenly', paddingHorizontal: 32 },

  // Logo
  logoSection: { alignItems: 'center' },
  logo: { width: 160, height: 160, marginBottom: 8 },
  tagline: { fontSize: 11, fontWeight: '600', letterSpacing: 4, marginTop: 4 },

  // Form
  formSection: { gap: 10 },
  welcomeBlock: { alignItems: 'center' },
  heading: { fontSize: 32, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36, textAlign: 'center' },
  subheading: { fontSize: 16, fontWeight: '400', lineHeight: 20, textAlign: 'center' },

  // Social buttons
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 12, borderRadius: 14,
  },
  socialBtnText: { fontSize: 15, fontWeight: '600', color: '#333' },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 0 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '500' },

  // Fields
  fieldGroup: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2, textAlign: 'center' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1.5,
  },
  input: { flex: 1, fontSize: 16 },

  // Forgot
  forgotRow: { alignSelf: 'center', paddingVertical: 4 },
  forgotText: { fontSize: 14, fontWeight: '600' },

  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  errorBannerText: { fontSize: 14, fontWeight: '500', flex: 1, marginLeft: 8 },

  // Footer
  footer: { flexDirection: 'row', justifyContent: 'center', paddingBottom: 12 },
  footerText: { fontSize: 15 },
  footerLink: { fontSize: 15, fontWeight: '700' },

  // Gate
  gateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md + 4 },
  gateIconWrap: { width: 100, height: 100, borderRadius: borderRadius['2xl'], alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  gateTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.3 },
  gateSubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 8 },
  gateInput: {
    width: '100%', borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.lg,
    fontSize: 24, borderWidth: 1, textAlign: 'center', letterSpacing: 3,
  },
});
