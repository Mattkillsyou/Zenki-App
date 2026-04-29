import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert} from 'react-native';
import { SoundPressable } from '../../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography, spacing, borderRadius } from '../../theme';
import { Button, KeyboardAwareScrollView } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { MEMBERS, CREDENTIALS } from '../../data/members';
import { FIREBASE_CONFIGURED } from '../../config/firebase';
import { firebaseSignInOrSeedAccount, emailForMember } from '../../services/firebaseAuth';

export function SetPasswordScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const auth = useAuth();
  const username = route?.params?.username || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const meetsLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password === confirmPassword && password.length > 0;

  const handleSetPassword = async () => {
    if (!meetsLength || !hasUpper || !hasNumber) {
      Alert.alert('Error', 'Please meet all password requirements');
      return;
    }
    if (!passwordsMatch) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const cred = CREDENTIALS[username.toLowerCase()];
      if (!cred) {
        Alert.alert('Unknown user', `No member named ${username}.`);
        setLoading(false);
        return;
      }
      const member = MEMBERS.find((m) => m.id === cred.memberId);
      if (!member) {
        Alert.alert('Setup error', 'Member record missing. Contact support.');
        setLoading(false);
        return;
      }

      // Provision the Firebase Auth record with the real password the user just
      // typed. On subsequent sign-ins, Firebase is the source of truth.
      if (FIREBASE_CONFIGURED) {
        await firebaseSignInOrSeedAccount(emailForMember(member), password, member);
      }
      await auth.signIn(member);

      setLoading(false);
      Alert.alert(
        'Password Set',
        'Your password has been saved. Welcome in.',
        [{ text: 'Continue', onPress: () => navigation.replace('Main') }],
      );
    } catch (e: any) {
      setLoading(false);
      const code = e?.code ?? '';
      const msg =
        code === 'auth/weak-password'
          ? 'Password too weak. Firebase requires at least 6 characters.'
          : code === 'auth/network-request-failed'
            ? 'Network error. Check your connection and try again.'
            : 'Could not set password. Please try again.';
      Alert.alert('Error', msg);
    }
  };

  const renderRequirement = (label: string, met: boolean) => (
    <View style={styles.requirementRow}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={met ? colors.success : colors.textMuted}
      />
      <Text style={[styles.requirementText, { color: met ? colors.success : colors.textMuted }]}>
        {label}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView outerStyle={styles.inner}>
        <View style={styles.header}>
          <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>

        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: colors.goldMuted }]}>
            <Ionicons name="key-outline" size={36} color={colors.gold} />
          </View>

          <Text style={[styles.heading, { color: colors.textPrimary }]}>Create Your Password</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Welcome to Zenki Dojo, {username}. Set a secure password to complete your account setup.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>NEW PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Create a password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <SoundPressable
                style={[styles.eyeButton, { backgroundColor: colors.surface }]}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {showPassword ? 'HIDE' : 'SHOW'}
                </Text>
              </SoundPressable>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>CONFIRM PASSWORD</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Confirm your password"
              placeholderTextColor={colors.textMuted}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
            />
          </View>

          <View style={[styles.requirements, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {renderRequirement('At least 8 characters', meetsLength)}
            {renderRequirement('One uppercase letter', hasUpper)}
            {renderRequirement('One number', hasNumber)}
            {renderRequirement('Passwords match', passwordsMatch)}
          </View>

          <Button
            title="Set Password & Continue"
            onPress={handleSetPassword}
            loading={loading}
            fullWidth
            size="lg"
            disabled={!meetsLength || !hasUpper || !hasNumber || !passwordsMatch}
            style={{ marginTop: spacing.md }}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
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
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  heading: {
    ...typography.sectionTitle,
    fontSize: 26,
    textTransform: 'none',
    letterSpacing: 0,
    textAlign: 'center',
  },
  subheading: {
    ...typography.body,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 22,
    textAlign: 'center',
  },
  fieldGroup: {
    marginBottom: spacing.md,
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
  passwordRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  passwordInput: {
    flex: 1,
  },
  eyeButton: {
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requirements: {
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    ...typography.bodySmall,
  },
});
