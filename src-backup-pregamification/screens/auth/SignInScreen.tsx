import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, spacing, borderRadius } from '../../theme';
import { Button } from '../../components';
import { MEMBERS, CREDENTIALS } from '../../data/members';

export function SignInScreen({ navigation }: any) {
  const { colors } = useTheme();
  const auth = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter your username and password');
      return;
    }
    setLoading(true);
    setTimeout(async () => {
      const cred = CREDENTIALS[username.toLowerCase()];
      if (cred && cred.password === password) {
        const member = MEMBERS.find((m) => m.id === cred.memberId);
        if (member) {
          await auth.signIn(member);
          navigation.replace('Main');
          return;
        }
      }
      // First-time login (temporary password) → set new password
      if (password === 'temp') {
        navigation.navigate('SetPassword', { username });
        setLoading(false);
        return;
      }
      setLoading(false);
      Alert.alert('Invalid Credentials', 'Check your username and password.\n\nDemo: admin / password');
    }, 1500);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../../../assets/brand/zenki-3d-logo-3.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            PRIVATE TRAINING · EST. 1997
          </Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>Welcome Back</Text>
          <Text style={[styles.subheading, { color: colors.textSecondary }]}>
            Sign in to your member account
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>USERNAME</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Enter your username"
              placeholderTextColor={colors.textMuted}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textMuted }]}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Enter password"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={[styles.eyeButton, { backgroundColor: colors.surface }]}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {showPassword ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
            <Text style={[styles.forgotText, { color: colors.gold }]}>Forgot password?</Text>
          </TouchableOpacity>

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={loading}
            fullWidth
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textMuted }]}>
            Not a member?{' '}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Contact')}>
            <Text style={[styles.footerLink, { color: colors.gold }]}>Inquire</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.md,
  },
  tagline: {
    ...typography.label,
    fontSize: 10,
    letterSpacing: 3,
    marginTop: spacing.md,
  },
  form: {
    gap: spacing.sm,
  },
  heading: {
    ...typography.sectionTitle,
    fontSize: 28,
    textTransform: 'none',
    letterSpacing: 0,
  },
  subheading: {
    ...typography.body,
    marginBottom: spacing.md,
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
  forgotText: {
    ...typography.bodySmall,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    ...typography.body,
  },
  footerLink: {
    ...typography.body,
    fontWeight: '700',
  },
});
