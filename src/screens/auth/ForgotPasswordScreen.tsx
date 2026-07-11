import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Linking} from 'react-native';
import { SoundPressable } from '../../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography, spacing, borderRadius } from '../../theme';
import { Button, KeyboardAwareScrollView, ScreenContainer } from '../../components';
import { FIREBASE_CONFIGURED } from '../../config/firebase';
import { firebaseSendPasswordReset } from '../../services/firebaseAuth';

// Domains we synthesize for accounts that have no real email on file:
//   username-only members  → `${username}@zenkidojo.app`   (emailForMember)
//   OAuth w/ hidden email  → `${uid}@oauth.zenkidojo.app`   (emailForOAuthMember)
// A password-reset email sent to either is undeliverable — nobody owns that
// inbox — so we must NOT show the "check your email" success state for them.
const NO_INBOX_EMAIL_DOMAINS = ['@zenkidojo.app', '@oauth.zenkidojo.app'];

function isUndeliverableSynthesizedEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return NO_INBOX_EMAIL_DOMAINS.some((d) => lower.endsWith(d));
}

export function ForgotPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Distinct terminal state from `sent`: the account has no real email, so a
  // reset link can't reach them — show honest "contact the dojo" copy instead
  // of the (false) success screen.
  const [noEmailOnFile, setNoEmailOnFile] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }
    // Audit 2.0.5 P3: a bare username ("mbrown") used to sail through to the
    // false "Check Your Email" success screen — nothing was ever sent. Minimal
    // shape check only (no lookup, so zero account-enumeration signal); real
    // validation stays server-side.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(
        'Enter an email address',
        "That doesn't look like an email address. Enter the email on your account — or if you signed up with a username only, contact the dojo to reset your password.",
      );
      return;
    }
    // Username-only / OAuth-hidden accounts have a synthesized address nobody
    // controls. Sending a reset there silently goes into the void while the UI
    // claims success — leaving the user permanently locked out with no signal.
    // Route them to the admin/support path with honest copy instead.
    if (isUndeliverableSynthesizedEmail(trimmed)) {
      setNoEmailOnFile(true);
      return;
    }
    setLoading(true);
    try {
      if (FIREBASE_CONFIGURED) {
        await firebaseSendPasswordReset(trimmed);
        // Firebase deliberately doesn't disclose whether an email exists — we
        // always show the "sent" state so reviewers and real users see the
        // same UX. That's Apple-compliant + prevents account enumeration.
      }
      setSent(true);
    } catch (error: any) {
      const code = error?.code ?? '';
      // auth/user-not-found → still show success (account enumeration mitigation)
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email' || code === 'auth/missing-email') {
        setSent(true);
      } else if (code === 'auth/too-many-requests') {
        Alert.alert('Too many attempts', 'Please wait a few minutes before trying again.');
      } else if (code === 'auth/network-request-failed') {
        Alert.alert('Network error', 'Check your connection and try again.');
      } else {
        Alert.alert('Could not send reset link', 'Please try again shortly.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </SoundPressable>
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.content}>
        <ScreenContainer maxWidth="form">
        {noEmailOnFile ? (
          <View style={styles.successState}>
            <View style={[styles.successIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="person-circle-outline" size={40} color={colors.gold} />
            </View>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>No Email on File</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              This account doesn't have an email address we can send a reset link
              to. Contact the dojo and we'll reset your password for you.
            </Text>
            <Button
              title="Email the Dojo"
              onPress={() => Linking.openURL('mailto:info@zenkidojo.com?subject=Password%20reset%20request')}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.lg }}
            />
            <Button
              title="Back to Sign In"
              onPress={() => navigation.goBack()}
              variant="outline"
              fullWidth
              style={{ marginTop: spacing.sm }}
            />
          </View>
        ) : sent ? (
          <View style={styles.successState}>
            <View style={[styles.successIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="mail-outline" size={40} color={colors.gold} />
            </View>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Check Your Email</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              We sent a password reset link to {email}. Please check your inbox.
            </Text>
            <Button
              title="Back to Sign In"
              onPress={() => navigation.goBack()}
              variant="outline"
              fullWidth
              style={{ marginTop: spacing.xl }}
            />
          </View>
        ) : (
          <>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Reset Password</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              Enter the email associated with your account and we'll send a reset link.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>EMAIL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="you@email.com"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <Button
              title="Send Reset Link"
              onPress={handleReset}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.md }}
            />
          </>
        )}
        </ScreenContainer>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    // No flex/justifyContent here — the wrapping KeyboardAwareScrollView
    // handles flexGrow:1 + paddingBottom for keyboard safety. Centered look
    // comes from the natural top-margin spacing in the form.
    paddingTop: spacing.xl,
  },
  heading: {
    ...typography.sectionTitle,
    fontSize: 28,
    textTransform: 'none',
    letterSpacing: 0,
  },
  subheading: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  fieldGroup: {
    marginBottom: spacing.sm,
  },
  label: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  input: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    borderWidth: 1,
  },
  successState: {
    alignItems: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
});
