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

export function SignUpScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async () => {
    if (!firstName || !lastName || !email || !password) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Error', 'You must agree to the terms and conditions');
      return;
    }
    setLoading(true);
    // Simulate submission — replace with real auth
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        'Request Submitted',
        'Thank you for your interest in Zenki Dojo. Our team will review your application and contact you within 48 hours.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    }, 2000);
  };

  const renderInput = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    placeholder: string,
    options?: {
      keyboardType?: 'email-address' | 'phone-pad' | 'default';
      secureTextEntry?: boolean;
      required?: boolean;
    },
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: colors.textMuted }]}>
        {label}
        {options?.required !== false && <Text style={{ color: colors.red }}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={options?.keyboardType || 'default'}
        secureTextEntry={options?.secureTextEntry}
        autoCapitalize={options?.keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollView offset={64}>
        {/* Header */}
        <View style={styles.header}>
          <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>

        <View style={styles.content}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>Request Access</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Zenki Dojo is a private, members-only facility. Submit your details and our team will review your application.
          </Text>

          {/* Private notice */}
          <View style={[styles.noticeBanner, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.gold} />
            <Text style={[styles.noticeText, { color: colors.gold }]}>
              Membership is by invitation or application only
            </Text>
          </View>

          {/* Form */}
          <View style={styles.row}>
            <View style={styles.halfField}>
              {renderInput('FIRST NAME', firstName, setFirstName, 'First')}
            </View>
            <View style={styles.halfField}>
              {renderInput('LAST NAME', lastName, setLastName, 'Last')}
            </View>
          </View>

          {renderInput('EMAIL', email, setEmail, 'you@email.com', { keyboardType: 'email-address' })}
          {renderInput('PHONE', phone, setPhone, '(310) 555-0000', { keyboardType: 'phone-pad', required: false })}
          {renderInput('PASSWORD', password, setPassword, 'Create a password', { secureTextEntry: true })}
          {renderInput('REFERRAL CODE', referralCode, setReferralCode, 'Optional', { required: false })}

          {/* Terms */}
          <SoundPressable
            style={styles.termsRow}
            onPress={() => setAgreedToTerms(!agreedToTerms)}
          >
            <View style={[
              styles.checkbox,
              { borderColor: agreedToTerms ? colors.gold : colors.border },
              agreedToTerms && { backgroundColor: colors.gold },
            ]}>
              {agreedToTerms && (
                <Ionicons name="checkmark" size={14} color={colors.textInverse} />
              )}
            </View>
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              I agree to the{' '}
              <Text style={{ color: colors.gold }}>Terms of Service</Text>
              {' '}and{' '}
              <Text style={{ color: colors.gold }}>Privacy Policy</Text>
            </Text>
          </SoundPressable>

          <Button
            title="Submit Application"
            onPress={handleSignUp}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.md }}
          />

          <Text style={[styles.note, { color: colors.textMuted }]}>
            Already a member?{' '}
            <Text
              style={{ color: colors.gold, fontWeight: '700' }}
              onPress={() => navigation.goBack()}
            >
              Sign In
            </Text>
          </Text>
        </View>

        <View style={{ height: spacing.xxl * 2 }} />
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
    marginBottom: spacing.md,
    lineHeight: 22,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  noticeText: {
    ...typography.bodySmall,
    fontWeight: '600',
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  halfField: {
    flex: 1,
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  termsText: {
    ...typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
  note: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
