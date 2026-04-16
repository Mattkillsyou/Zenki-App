import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { spacing, typography } from '../theme';
import { submitSupportMessage, flushSupportQueue, SupportCategory } from '../services/supportMessages';

const CATEGORIES: { value: SupportCategory; label: string; icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; color: string }[] = [
  { value: 'bug',     label: 'Bug / Error', icon: 'bug-outline',         color: '#EF4444' },
  { value: 'feature', label: 'Feature Idea',icon: 'bulb-outline',        color: '#F59E0B' },
  { value: 'general', label: 'General',     icon: 'chatbubbles-outline', color: '#3B82F6' },
  { value: 'urgent',  label: 'Urgent',      icon: 'alert-circle-outline',color: '#DC2626' },
];

export function ContactSupportScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [category, setCategory] = useState<SupportCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Opportunistically retry any queued messages on mount
  useEffect(() => {
    flushSupportQueue().catch(() => {});
  }, []);

  const memberName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member';

  const handleSubmit = async () => {
    if (!subject.trim()) {
      Alert.alert('Missing subject', 'Give us a one-line summary.');
      return;
    }
    if (message.trim().length < 5) {
      Alert.alert('Message too short', 'Please add a bit more detail so IT can help.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitSupportMessage({
        memberId: user?.id || 'anonymous',
        memberName,
        memberEmail: user?.email,
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      setSubmitted(true);
      if (res.queued) {
        // Stored locally — will send when connected
      }
    } catch (e: any) {
      Alert.alert('Submit failed', e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Support</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: colors.goldMuted }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.gold} />
          </View>
          <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Message sent</Text>
          <Text style={[styles.successBody, { color: colors.textSecondary }]}>
            Our team at Zenki IT will review your message and follow up by email if needed.
            Typical response time is within 24 hours.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setSubmitted(false);
              setSubject('');
              setMessage('');
              setCategory('general');
            }}
            style={[styles.secondaryBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>Send another</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
          >
            <Text style={styles.primaryBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Contact IT</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            Report a bug, share an idea, or ask us anything. Your message is sent
            directly to the Zenki IT team — we get an instant alert.
          </Text>

          {/* Category */}
          <Text style={[styles.label, { color: colors.textMuted }]}>CATEGORY</Text>
          <View style={styles.catGrid}>
            {CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  style={[
                    styles.catCard,
                    {
                      backgroundColor: active ? c.color + '18' : colors.surface,
                      borderColor: active ? c.color : colors.border,
                    },
                  ]}
                >
                  <Ionicons name={c.icon} size={22} color={active ? c.color : colors.textMuted} />
                  <Text style={[styles.catLabel, { color: active ? c.color : colors.textSecondary }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Subject */}
          <Text style={[styles.label, { color: colors.textMuted }]}>SUBJECT</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="One line summary"
            placeholderTextColor={colors.textMuted}
            value={subject}
            onChangeText={setSubject}
            maxLength={120}
          />

          {/* Message */}
          <Text style={[styles.label, { color: colors.textMuted }]}>MESSAGE</Text>
          <TextInput
            style={[styles.input, styles.textarea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder={
              category === 'bug'
                ? "What happened? Steps to reproduce. What did you expect?"
                : "Tell us more…"
            }
            placeholderTextColor={colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            maxLength={2000}
          />
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {message.length} / 2000
          </Text>

          {/* Info chip — device info auto-attached */}
          <View style={[styles.infoChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
            <Text style={[styles.infoText, { color: colors.textMuted }]}>
              Your name ({memberName}), device type, and app version are attached automatically.
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || !subject.trim() || message.trim().length < 5}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.gold,
                opacity: submitting || !subject.trim() || message.trim().length < 5 ? 0.55 : 1,
              },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#000" />
            ) : (
              <>
                <Ionicons name="paper-plane-outline" size={18} color="#000" />
                <Text style={styles.primaryBtnText}>Send to IT</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 32,
  },
  intro: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },

  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.md,
  },
  catCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  catLabel: { fontSize: 13, fontWeight: '700' },

  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: spacing.md,
  },
  textarea: {
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 14,
  },
  hint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'right',
    marginTop: -10,
    marginBottom: spacing.md,
  },

  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  infoText: { fontSize: 12, flex: 1, lineHeight: 16 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Success
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 14,
  },
  successIcon: {
    width: 104, height: 104, borderRadius: 52,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.3 },
  successBody: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 1.5,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
});
