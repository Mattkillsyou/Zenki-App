import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform} from 'react-native';
import { SoundPressable } from '../../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { typography, spacing, borderRadius } from '../../theme';
import { Button } from '../../components';

export function ContactScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = () => {
    if (!name || !email) {
      Alert.alert('Error', 'Please enter your name and email');
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1500);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </SoundPressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={64}
      >
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {sent ? (
          <View style={styles.successState}>
            <View style={[styles.successIcon, { backgroundColor: colors.goldMuted }]}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.gold} />
            </View>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Message Sent</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              Thank you for your interest in Zenki. Our team will reach out to you shortly.
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
          <View style={styles.content}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>Contact Us</Text>
            <Text style={[styles.subheading, { color: colors.textSecondary }]}>
              Zenki is a private, members-only facility. Interested in training with us? Get in touch.
            </Text>

            {/* Private notice */}
            <View style={[styles.noticeBanner, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.gold} />
              <Text style={[styles.noticeText, { color: colors.gold }]}>
                Membership is by invitation only
              </Text>
            </View>

            {/* Info cards */}
            <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
              <SoundPressable
                style={styles.infoRow}
                onPress={() => Linking.openURL('tel:3235551997')}
              >
                <Ionicons name="call-outline" size={20} color={colors.gold} />
                <View style={styles.infoText}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>PHONE</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>(323) 555-1997</Text>
                </View>
              </SoundPressable>
              <View style={[styles.infoDivider, { backgroundColor: colors.divider }]} />
              <SoundPressable
                style={styles.infoRow}
                onPress={() => Linking.openURL('mailto:info@zenkidojo.com')}
              >
                <Ionicons name="mail-outline" size={20} color={colors.gold} />
                <View style={styles.infoText}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>EMAIL</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>info@zenkidojo.com</Text>
                </View>
              </SoundPressable>
              <View style={[styles.infoDivider, { backgroundColor: colors.divider }]} />
              <View style={styles.infoRow}>
                <Ionicons name="location-outline" size={20} color={colors.gold} />
                <View style={styles.infoText}>
                  <Text style={[styles.infoLabel, { color: colors.textMuted }]}>LOCATION</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>1714 Hillhurst Ave, Los Angeles 90027</Text>
                </View>
              </View>
            </View>

            {/* Form */}
            <Text style={[styles.formTitle, { color: colors.textPrimary }]}>Send a Message</Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>NAME <Text style={{ color: colors.red }}>*</Text></Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Your name"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>EMAIL <Text style={{ color: colors.red }}>*</Text></Text>
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

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>PHONE</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="(310) 555-0000"
                placeholderTextColor={colors.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.textMuted }]}>MESSAGE</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Tell us about your training background and what you're looking for..."
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            <Button
              title="Send Message"
              onPress={handleSubmit}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.sm }}
            />
          </View>
        )}

        <View style={{ height: spacing.xxl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  scrollContent: {
    flexGrow: 1,
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
  infoCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    ...typography.label,
    fontSize: 10,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '500',
    marginTop: 2,
  },
  infoDivider: {
    height: 1,
    marginLeft: 36,
  },
  formTitle: {
    ...typography.cardTitle,
    fontSize: 18,
    marginBottom: spacing.md,
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
  textArea: {
    minHeight: 100,
    paddingTop: spacing.sm + 4,
  },
  successState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
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
