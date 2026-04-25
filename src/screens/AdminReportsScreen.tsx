/**
 * AdminReportsScreen — triage queue for user-submitted content reports.
 *
 * Required by Apple 1.2 (safety): developers must act on reports of
 * objectionable UGC. v7.0 added the write path (ReportModal); this screen
 * is the read/action side.
 *
 * Shows all reports with status === 'open', newest first.
 * Each row has two actions:
 *   - Dismiss
 *   - Remove & Block (deletes the content, auto-blocks the reporter from
 *     the offender)
 *
 * Both paths call the `adminActionReport` Cloud Function so the destructive
 * operation runs with the Admin SDK (bypassing client rules).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import {
  listOpenReports,
  adminActionReport,
  Report,
  REPORT_REASON_LABELS,
} from '../services/firebaseModeration';

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    const diffSec = (Date.now() - d.getTime()) / 1000;
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function targetTypeIcon(t: Report['targetType']): keyof typeof Ionicons.glyphMap {
  switch (t) {
    case 'post':    return 'document-text-outline';
    case 'message': return 'chatbubble-outline';
    case 'comment': return 'chatbubbles-outline';
    case 'user':    return 'person-outline';
  }
}

export function AdminReportsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [permError, setPermError] = useState(false);

  const load = useCallback(async () => {
    setPermError(false);
    const list = await listOpenReports();
    // listOpenReports silently returns [] on permission errors — we can't
    // distinguish "no reports" from "not an admin" from the return value, so
    // give the "no reports" copy the benefit of the doubt. If rules are denying,
    // the console.warn inside the service surfaces it.
    setReports(list);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleDismiss = (r: Report) => {
    Alert.alert(
      'Dismiss report?',
      'The content stays live. Use this when the report is not actionable.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Dismiss',
          onPress: async () => {
            setActingOn(r.id);
            const res = await adminActionReport(r.id, 'dismiss');
            setActingOn(null);
            if (!res.ok) {
              Alert.alert('Could not dismiss', res.error ?? 'Please try again.');
              return;
            }
            setReports((prev) => prev.filter((x) => x.id !== r.id));
          },
        },
      ],
    );
  };

  const handleRemoveAndBlock = (r: Report) => {
    Alert.alert(
      'Remove content and block?',
      'The content will be deleted immediately and the offending user will be blocked for the reporter. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove & Block',
          style: 'destructive',
          onPress: async () => {
            setActingOn(r.id);
            const res = await adminActionReport(r.id, 'removeAndBlock');
            setActingOn(null);
            if (!res.ok) {
              Alert.alert('Could not complete action', res.error ?? 'Please try again.');
              return;
            }
            setReports((prev) => prev.filter((x) => x.id !== r.id));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Reports</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {loading ? 'Loading…' : `${reports.length} open`}
          </Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
          }
        >
          {reports.length === 0 ? (
            <FadeInView>
              <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="checkmark-done-outline" size={40} color={colors.success} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>All clear</Text>
                <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                  No open reports right now. Pull to refresh.
                </Text>
                {permError && (
                  <Text style={[styles.permWarn, { color: colors.warning }]}>
                    If you expected reports here, verify /admins/{'{uid}'} is seeded
                    for your account in Firestore. See ADMIN_SETUP.md.
                  </Text>
                )}
              </View>
            </FadeInView>
          ) : (
            reports.map((r, idx) => (
              <FadeInView key={r.id} delay={idx * 40}>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.typeBadge, { backgroundColor: colors.gold + '20' }]}>
                      <Ionicons name={targetTypeIcon(r.targetType)} size={14} color={colors.gold} />
                      <Text style={[styles.typeBadgeText, { color: colors.gold }]}>
                        {r.targetType.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.when, { color: colors.textMuted }]}>
                      {formatWhen(r.createdAt)}
                    </Text>
                  </View>

                  <Text style={[styles.reason, { color: colors.textPrimary }]}>
                    {REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS] ?? r.reason}
                  </Text>

                  {!!r.context && (
                    <Text style={[styles.context, { color: colors.textSecondary }]} numberOfLines={4}>
                      “{r.context}”
                    </Text>
                  )}

                  <View style={[styles.meta, { borderTopColor: colors.border }]}>
                    <MetaRow label="Reporter"   value={r.reporterId}   colors={colors} />
                    <MetaRow label="Offender"   value={r.targetUserId} colors={colors} />
                    <MetaRow label="Content ID" value={r.targetId}     colors={colors} />
                  </View>

                  <View style={styles.actionRow}>
                    <SoundPressable
                      disabled={actingOn === r.id}
                      onPress={() => handleDismiss(r)}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
                        actingOn === r.id && { opacity: 0.6 },
                      ]}
                    >
                      <Ionicons name="close-circle-outline" size={18} color={colors.textSecondary} />
                      <Text style={[styles.actionText, { color: colors.textSecondary }]}>
                        Dismiss
                      </Text>
                    </SoundPressable>
                    <SoundPressable
                      disabled={actingOn === r.id}
                      onPress={() => handleRemoveAndBlock(r)}
                      style={[
                        styles.actionBtn,
                        { backgroundColor: colors.red },
                        actingOn === r.id && { opacity: 0.6 },
                      ]}
                    >
                      {actingOn === r.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={18} color="#fff" />
                          <Text style={[styles.actionText, { color: '#fff' }]}>
                            Remove & Block
                          </Text>
                        </>
                      )}
                    </SoundPressable>
                  </View>
                </View>
              </FadeInView>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function MetaRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  sub: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginTop: 2 },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  empty: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  permWarn: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    lineHeight: 16,
  },

  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  when: { fontSize: 11, fontWeight: '600' },

  reason: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  context: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: spacing.sm,
  },

  meta: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    gap: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  metaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  metaValue: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    fontFamily: 'Courier',
    letterSpacing: -0.2,
  },

  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  actionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
});
