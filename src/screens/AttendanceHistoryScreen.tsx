import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAttendance } from '../context/AttendanceContext';
import { FadeInView } from '../components';
import { typography, spacing, borderRadius } from '../theme';
import { getTodayString } from '../utils/location';

export function AttendanceHistoryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { visits, todayVisitors, getVisitCountByMember } = useAttendance();

  const today = getTodayString();

  // Stats
  const weekAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }, []);
  const monthStart = useMemo(() => today.slice(0, 7), [today]);

  const weekCount = useMemo(
    () => visits.filter((v) => v.date >= weekAgo).length,
    [visits, weekAgo],
  );
  const monthCount = useMemo(
    () => visits.filter((v) => v.date.startsWith(monthStart)).length,
    [visits, monthStart],
  );

  // Group visits by date (most recent first)
  const groupedVisits = useMemo(() => {
    const groups: Record<string, typeof visits> = {};
    [...visits].reverse().forEach((v) => {
      if (!groups[v.date]) groups[v.date] = [];
      groups[v.date].push(v);
    });
    return Object.entries(groups);
  }, [visits]);

  // Member frequency
  const memberCounts = getVisitCountByMember();

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDateLabel = (dateStr: string) => {
    if (dateStr === today) return 'Today';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Attendance</Text>
          <View style={styles.backButton} />
        </View>

        {/* Stats Row */}
        <FadeInView delay={0} slideUp={10}>
          <View style={styles.statsRow}>
            {[
              { label: 'Today', value: todayVisitors.length, color: colors.success },
              { label: 'This Week', value: weekCount, color: colors.info },
              { label: 'This Month', value: monthCount, color: colors.gold },
            ].map((stat) => (
              <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </FadeInView>

        {/* Member Frequency */}
        {memberCounts.length > 0 && (
          <FadeInView delay={60} slideUp={10}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.gold }]}>MOST FREQUENT</Text>
              {memberCounts.slice(0, 5).map((m, i) => (
                <View key={m.memberId} style={[styles.freqRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[styles.rankBadge, { backgroundColor: i === 0 ? colors.gold + '20' : colors.surfaceSecondary }]}>
                    <Text style={[styles.rankText, { color: i === 0 ? colors.gold : colors.textMuted }]}>#{i + 1}</Text>
                  </View>
                  <Text style={[styles.freqName, { color: colors.textPrimary }]} numberOfLines={1}>{m.memberName}</Text>
                  <Text style={[styles.freqCount, { color: colors.textSecondary }]}>{m.count} visits</Text>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* Visit History */}
        <FadeInView delay={120} slideUp={10}>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>VISIT LOG</Text>
            {groupedVisits.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="location-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No visits recorded yet</Text>
              </View>
            ) : (
              groupedVisits.map(([date, dayVisits]) => (
                <View key={date} style={styles.dateGroup}>
                  <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{formatDateLabel(date)}</Text>
                  {dayVisits.map((v) => (
                    <View key={v.id} style={[styles.visitRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[styles.visitAvatar, { backgroundColor: colors.gold + '20' }]}>
                        <Text style={[styles.visitInitial, { color: colors.gold }]}>{v.memberName[0]}</Text>
                      </View>
                      <View style={styles.visitInfo}>
                        <Text style={[styles.visitName, { color: colors.textPrimary }]}>{v.memberName}</Text>
                        <Text style={[styles.visitTime, { color: colors.textMuted }]}>{formatTime(v.checkInTime)}</Text>
                      </View>
                      <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </FadeInView>

        <View style={{ height: 120 }} />
      </ScrollView>
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: 10,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md + 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  statValue: { fontSize: 28, fontWeight: '800' },
  statLabel: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  freqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: 8,
    gap: 12,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontSize: 14, fontWeight: '800' },
  freqName: { flex: 1, fontSize: 16, fontWeight: '600' },
  freqCount: { fontSize: 14, fontWeight: '500' },
  dateGroup: { marginBottom: spacing.md },
  dateLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginBottom: 6,
    gap: 12,
  },
  visitAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitInitial: { fontSize: 18, fontWeight: '700' },
  visitInfo: { flex: 1 },
  visitName: { fontSize: 15, fontWeight: '600' },
  visitTime: { fontSize: 13, marginTop: 2 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyText: { fontSize: 16, fontWeight: '500' },
});
