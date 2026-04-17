import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import { useHeartRate } from '../context/HeartRateContext';
import { useGamification } from '../context/GamificationContext';
import { GPS_ACTIVITY_LABELS, GPS_ACTIVITY_ICONS } from '../types/activity';
import { ACTIVITY_LABELS } from '../types/heartRate';
import { formatDistance, distanceUnit, formatPaceForUnit, paceUnit } from '../utils/gps';
import { formatDuration, strainColor, strainLabel } from '../utils/heartRate';
import { generateInsights, Insight } from '../utils/insights';
import { spacing } from '../theme';

function getWeekRange(): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const start = new Date(now);
  start.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start, end, label: `${fmt(start)} — ${fmt(end)}` };
}

export function WeeklyReportScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { memberActivities } = useGpsActivity();
  const { memberSessions } = useHeartRate();
  const { state: gamState } = useGamification();

  const week = getWeekRange();

  const gpsActivities = useMemo(() => {
    if (!user) return [];
    return memberActivities(user.id).filter((a) => {
      const d = new Date(a.startedAt);
      return d >= week.start && d <= week.end;
    });
  }, [user, memberActivities, week]);

  const hrSessions = useMemo(() => {
    if (!user) return [];
    return memberSessions(user.id).filter((s) => {
      const d = new Date(s.startedAt);
      return d >= week.start && d <= week.end;
    });
  }, [user, memberSessions, week]);

  // Aggregates
  const totalDistM = gpsActivities.reduce((s, a) => s + a.distanceMeters, 0);
  const totalGpsDuration = gpsActivities.reduce((s, a) => s + a.durationSeconds, 0);
  const totalGpsCalories = gpsActivities.reduce((s, a) => s + a.calories, 0);
  const totalElevFt = gpsActivities.reduce((s, a) => s + a.elevationGainMeters, 0) * 3.281;

  const totalHrDuration = hrSessions.reduce((s, h) => s + h.durationMinutes * 60, 0);
  const totalHrCalories = hrSessions.reduce((s, h) => s + h.calories, 0);
  const avgStrain = hrSessions.length > 0
    ? Math.round(hrSessions.reduce((s, h) => s + h.strain, 0) / hrSessions.length * 10) / 10
    : 0;
  const maxStrain = hrSessions.length > 0
    ? Math.max(...hrSessions.map((h) => h.strain))
    : 0;

  const totalActivities = gpsActivities.length + hrSessions.length;
  const totalCalories = totalGpsCalories + totalHrCalories;
  const totalDuration = totalGpsDuration + totalHrDuration;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Weekly Report</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Week label */}
        <Text style={[styles.weekLabel, { color: colors.gold }]}>{week.label}</Text>

        {/* Summary hero */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={styles.heroStat}>
              <Text style={[styles.heroNum, { color: colors.gold }]}>{totalActivities}</Text>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Activities</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroNum, { color: colors.textPrimary }]}>{formatDuration(totalDuration)}</Text>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Total Time</Text>
            </View>
            <View style={styles.heroStat}>
              <Text style={[styles.heroNum, { color: colors.textPrimary }]}>{totalCalories.toLocaleString()}</Text>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>Calories</Text>
            </View>
          </View>
        </View>

        {/* GPS summary */}
        {gpsActivities.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GPS ACTIVITIES · {gpsActivities.length}</Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.gold }]}>{formatDistance(totalDistM)}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>{distanceUnit()}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{Math.round(totalElevFt)}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>ft gained</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{totalGpsCalories}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>kcal</Text>
                </View>
              </View>
            </View>
            {gpsActivities.map((a) => (
              <View key={a.id} style={[styles.activityRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.actIcon, { backgroundColor: colors.goldMuted }]}>
                  <Ionicons name={GPS_ACTIVITY_ICONS[a.type] as any} size={16} color={colors.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actTitle, { color: colors.textPrimary }]}>{GPS_ACTIVITY_LABELS[a.type]}</Text>
                  <Text style={[styles.actMeta, { color: colors.textMuted }]}>
                    {new Date(a.startedAt).toLocaleDateString('en-US', { weekday: 'short' })} · {formatDistance(a.distanceMeters)} {distanceUnit()} · {formatDuration(a.durationSeconds)}
                  </Text>
                </View>
                <Text style={[styles.actCal, { color: colors.gold }]}>{a.calories} kcal</Text>
              </View>
            ))}
          </>
        )}

        {/* HR sessions summary */}
        {hrSessions.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>HR SESSIONS · {hrSessions.length}</Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: strainColor(avgStrain) }]}>{avgStrain}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>avg strain</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: strainColor(maxStrain) }]}>{maxStrain}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>peak strain</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{totalHrCalories}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>kcal</Text>
                </View>
              </View>
            </View>
            {hrSessions.map((s) => (
              <View key={s.id} style={[styles.activityRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.actIcon, { backgroundColor: colors.redMuted }]}>
                  <Ionicons name="heart" size={16} color={colors.red} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.actTitle, { color: colors.textPrimary }]}>{ACTIVITY_LABELS[s.activityType]}</Text>
                  <Text style={[styles.actMeta, { color: colors.textMuted }]}>
                    {new Date(s.startedAt).toLocaleDateString('en-US', { weekday: 'short' })} · {formatDuration(s.durationMinutes * 60)} · avg {s.avgBpm} bpm
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.actCal, { color: strainColor(s.strain) }]}>{s.strain.toFixed(1)}</Text>
                  <Text style={[styles.actMeta, { color: colors.textMuted }]}>{strainLabel(s.strain)}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Gamification stats for the week */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PROGRESS</Text>
        <View style={[styles.progressRow, { gap: 8 }]}>
          <View style={[styles.progressTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="flame" size={18} color="#FF6B35" />
            <Text style={[styles.progressNum, { color: colors.textPrimary }]}>{gamState.streak}</Text>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>Day Streak</Text>
          </View>
          <View style={[styles.progressTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="diamond-outline" size={18} color={colors.gold} />
            <Text style={[styles.progressNum, { color: colors.textPrimary }]}>{gamState.dojoPoints}</Text>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>Diamonds</Text>
          </View>
          <View style={[styles.progressTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="trophy" size={18} color={colors.gold} />
            <Text style={[styles.progressNum, { color: colors.textPrimary }]}>
              {gamState.achievements.filter((a) => a.unlocked).length}
            </Text>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>Badges</Text>
          </View>
        </View>

        {/* ─── INSIGHTS — motivational nudges from the engine ─── */}
        {(() => {
          const insights = generateInsights({
            sessionsThisWeek: gpsActivities.length + hrSessions.length,
            sessionsLastWeek: 0, // TODO: compute from last week's data
            currentStreak: gamState.streak,
            longestStreak: gamState.longestStreak,
            hrSessionsThisWeek: hrSessions.length,
            hrSessionsLastWeek: 0,
            avgStrainThisWeek: avgStrain,
            avgStrainLastWeek: 0,
            totalCaloriesHrThisWeek: totalHrCalories,
            gpsDistanceThisWeek: totalDistM,
            gpsDistanceLastWeek: 0,
            gpsActivitiesThisWeek: gpsActivities.length,
            gpsActivitiesLastWeek: 0,
            mealsLoggedThisWeek: 0, // TODO: pull from NutritionContext
            mealsLoggedLastWeek: 0,
            avgCaloriesThisWeek: 0,
            avgCaloriesLastWeek: 0,
            avgProteinThisWeek: 0,
            calorieGoal: 0,
            proteinGoal: 0,
            weighInsThisWeek: 0,
            weighInsLastWeek: 0,
            latestWeightKg: null,
            weightTrendDirection: 'unknown',
            loginStreakDays: gamState.loginStreak || 0,
            daysActiveThisWeek: gpsActivities.length + hrSessions.length,
            spinWinsThisWeek: 0,
            totalDexaScans: 0,
            totalBloodworkReports: 0,
            daysSinceLastDexa: null,
            daysSinceLastBloodwork: null,
          });

          if (insights.length === 0) return null;

          const typeColors: Record<string, string> = {
            positive: '#22C55E',
            warning: colors.red,
            milestone: colors.gold,
            neutral: colors.textMuted,
          };

          return (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>INSIGHTS</Text>
              {insights.slice(0, 5).map((ins) => (
                <View
                  key={ins.id}
                  style={[styles.insightCard, {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    borderLeftColor: typeColors[ins.type] || colors.border,
                  }]}
                >
                  <Ionicons name={ins.icon as any} size={18} color={typeColors[ins.type]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.insightTitle, { color: colors.textPrimary }]}>{ins.title}</Text>
                    <Text style={[styles.insightMsg, { color: colors.textSecondary }]}>{ins.message}</Text>
                  </View>
                </View>
              ))}
            </>
          );
        })()}

        {/* Empty state */}
        {totalActivities === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="bar-chart-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No activities this week</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Start an HR session or GPS activity to see your weekly report here.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  title: { fontSize: 20, fontWeight: '800' },
  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  weekLabel: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, marginBottom: 12, textAlign: 'center' },

  heroCard: { borderRadius: 18, borderWidth: 1, padding: 20, marginBottom: 20 },
  heroRow: { flexDirection: 'row' },
  heroStat: { flex: 1, alignItems: 'center' },
  heroNum: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 4 },

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8, marginTop: 8 },

  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  summaryRow: { flexDirection: 'row' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: 22, fontWeight: '900' },
  summaryUnit: { fontSize: 10, fontWeight: '600', marginTop: 2 },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  actIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontSize: 14, fontWeight: '700' },
  actMeta: { fontSize: 11, marginTop: 2 },
  actCal: { fontSize: 14, fontWeight: '800' },

  progressRow: { flexDirection: 'row', marginBottom: 16 },
  progressTile: {
    flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, gap: 4,
  },
  progressNum: { fontSize: 20, fontWeight: '900' },
  progressLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1, borderLeftWidth: 4, marginBottom: 8,
  },
  insightTitle: { fontSize: 13, fontWeight: '800' },
  insightMsg: { fontSize: 11, lineHeight: 16, marginTop: 2 },

  emptyWrap: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
});
