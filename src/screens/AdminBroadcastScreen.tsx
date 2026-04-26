import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform, ActivityIndicator} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { FadeInView } from '../components';
import { broadcastPushNotification, fetchAllPushTokens } from '../services/pushNotifications';
import { spacing, borderRadius } from '../theme';

const HISTORY_KEY = '@zenki_broadcast_history';
const MAX_HISTORY = 20;

interface Broadcast {
  id: string;
  title: string;
  body: string;
  sentAt: string;
  recipientCount: number;
}

export function AdminBroadcastScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<Broadcast[]>([]);
  // Number of devices with a push token registered. null = still loading.
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [recipientLoading, setRecipientLoading] = useState(true);

  const refreshRecipientCount = async () => {
    setRecipientLoading(true);
    try {
      const tokens = await fetchAllPushTokens();
      setRecipientCount(tokens.length);
    } catch {
      setRecipientCount(null);
    } finally {
      setRecipientLoading(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) {
        try { setHistory(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
    refreshRecipientCount();
  }, []);

  const saveHistory = async (next: Broadcast[]) => {
    setHistory(next);
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing fields', 'Please enter both a title and a message.');
      return;
    }
    Alert.alert(
      'Send to all members?',
      `Title: "${title}"\n\nThis will push a notification to every member with the app installed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setSending(true);
            try {
              const { sent, errors } = await broadcastPushNotification(title.trim(), body.trim());
              const record: Broadcast = {
                id: 'bc_' + Date.now().toString(36),
                title: title.trim(),
                body: body.trim(),
                sentAt: new Date().toISOString(),
                recipientCount: sent,
              };
              await saveHistory([record, ...history].slice(0, MAX_HISTORY));
              setTitle('');
              setBody('');
              refreshRecipientCount();
              Alert.alert(
                'Broadcast sent',
                sent === 0
                  ? 'No recipients had push tokens registered. Members need to sign in on a phone (iOS/Android) and grant notification permission for tokens to be saved — push tokens are not generated on web or simulators.'
                  : `Delivered to ${sent} member${sent === 1 ? '' : 's'}.${errors > 0 ? ` (${errors} failed)` : ''}`,
              );
            } catch (err) {
              Alert.alert('Error', 'Failed to send broadcast. Check your Firebase config and try again.');
            } finally {
              setSending(false);
            }
          },
        },
      ],
    );
  };

  const formatRelative = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={() => navigation.goBack()}
              style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Broadcast</Text>
            <View style={styles.backButton} />
          </View>

          {/* Compose */}
          <FadeInView delay={0} slideUp={10}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.gold }]}>NEW BROADCAST</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Title</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
                  placeholder="e.g. Class canceled tonight"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={60}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{title.length}/60</Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Message</Text>
                <TextInput
                  style={[styles.input, styles.bodyInput, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary }]}
                  placeholder="What would you like to say?"
                  placeholderTextColor={colors.textMuted}
                  value={body}
                  onChangeText={setBody}
                  multiline
                  maxLength={200}
                />
                <Text style={[styles.charCount, { color: colors.textMuted }]}>{body.length}/200</Text>

                {/* Recipient pre-flight — shows how many devices will actually
                    receive this push, plus a hint when there are zero so the
                    admin understands why nothing will land. */}
                <View style={[styles.recipientPill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                  <Ionicons
                    name={recipientLoading ? 'sync' : recipientCount && recipientCount > 0 ? 'phone-portrait-outline' : 'phone-portrait-outline'}
                    size={14}
                    color={recipientCount && recipientCount > 0 ? colors.success : colors.textMuted}
                  />
                  <Text style={[styles.recipientText, { color: colors.textSecondary }]}>
                    {recipientLoading
                      ? 'Counting recipients…'
                      : recipientCount === null
                      ? 'Recipient count unavailable'
                      : recipientCount === 0
                      ? '0 devices have push enabled — members need to sign in on a phone first'
                      : `${recipientCount} device${recipientCount === 1 ? '' : 's'} will receive this`}
                  </Text>
                  {!recipientLoading && (
                    <SoundPressable onPress={refreshRecipientCount} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Ionicons name="refresh" size={14} color={colors.textMuted} />
                    </SoundPressable>
                  )}
                </View>

                <SoundPressable
                  style={[
                    styles.sendButton,
                    { backgroundColor: title && body && !sending ? colors.red : colors.surfaceSecondary },
                  ]}
                  onPress={handleSend}
                  disabled={!title || !body || sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="megaphone" size={20} color={title && body ? '#FFF' : colors.textMuted} />
                      <Text style={[styles.sendButtonText, { color: title && body ? '#FFF' : colors.textMuted }]}>
                        {!title || !body ? 'Enter title and message' : 'Send to all members'}
                      </Text>
                    </>
                  )}
                </SoundPressable>
              </View>
            </View>
          </FadeInView>

          {/* History */}
          <FadeInView delay={60} slideUp={10}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.gold }]}>RECENT BROADCASTS</Text>
              {history.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="notifications-outline" size={32} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No broadcasts sent yet</Text>
                </View>
              ) : (
                history.map((b) => (
                  <View key={b.id} style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.historyHeader}>
                      <Text style={[styles.historyTitle, { color: colors.textPrimary }]} numberOfLines={1}>{b.title}</Text>
                      <Text style={[styles.historyCount, { color: colors.success }]}>{b.recipientCount}</Text>
                    </View>
                    <Text style={[styles.historyBody, { color: colors.textSecondary }]} numberOfLines={2}>{b.body}</Text>
                    <Text style={[styles.historyTime, { color: colors.textMuted }]}>{formatRelative(b.sentAt)}</Text>
                  </View>
                ))
              )}
            </View>
          </FadeInView>

          <View style={{ height: 120 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.3 },
  section: { paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.md },
  card: {
    padding: spacing.md + 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 15,
  },
  bodyInput: { minHeight: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 11, fontWeight: '500', alignSelf: 'flex-end', marginTop: 4 },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  sendButtonText: { fontSize: 15, fontWeight: '700' },
  recipientPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: borderRadius.md, borderWidth: 1,
    marginTop: spacing.md,
  },
  recipientText: { flex: 1, fontSize: 12, fontWeight: '600' },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  emptyText: { fontSize: 14, fontWeight: '500' },
  historyRow: {
    padding: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  historyCount: { fontSize: 13, fontWeight: '700', marginLeft: 8 },
  historyBody: { fontSize: 13, marginBottom: 6 },
  historyTime: { fontSize: 12, fontWeight: '500' },
});
