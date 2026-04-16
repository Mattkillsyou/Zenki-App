import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { FadeInView } from '../components';
import { broadcastPushNotification } from '../services/pushNotifications';
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

  useEffect(() => {
    AsyncStorage.getItem(HISTORY_KEY).then((raw) => {
      if (raw) {
        try { setHistory(JSON.parse(raw)); } catch { /* ignore */ }
      }
    });
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
              Alert.alert(
                'Broadcast sent',
                sent === 0
                  ? 'No recipients had push tokens registered. Make sure Firebase is configured and members have granted notification permission.'
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
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
            >
              <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
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

                <TouchableOpacity
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
                        Send to all members
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
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
    paddingVertical: spacing.md,
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
