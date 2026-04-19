import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography, spacing, borderRadius } from '../../theme';
import { Button } from '../../components';
import { FIREBASE_CONFIGURED } from '../../config/firebase';
import { firebaseSendPasswordReset } from '../../services/firebaseAuth';

export function ForgotPasswordScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter your email address');
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {sent ? (
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
      </View>
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
    flex: 1,
    justifyContent: 'center',
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
