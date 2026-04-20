import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import { useHeartRate } from '../context/HeartRateContext';
import { useGamification } from '../context/GamificationContext';
import { useNutrition } from '../context/NutritionContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useSpinWheel } from '../context/SpinWheelContext';
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
  return { start, end, label: `${fmt(start)} · ${fmt(end)}` };
}

function getLastWeekRange(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - ((dayOfWeek + 6) % 7) - 7); // Last Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function WeeklyReportScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { memberActivities } = useGpsActivity();
  const { memberSessions } = useHeartRate();
  const { state: gamState } = useGamification();
  const { myMacros, totalsForDate, goalsFor, myWeights, myDexaScans, myBloodworkReports, latestWeight } = useNutrition();
  const { myLogs } = useWorkouts();
  const { history: spinHistory } = useSpinWheel();

  const week = getWeekRange();
  const lastWeek = getLastWeekRange();

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

  // ── Compute real data for insights (fix hardcoded zeros) ──

  // Last week's activities for comparison
  const lastWeekGps = useMemo(() => {
    if (!user) return [];
    return memberActivities(user.id).filter((a) => {
      const d = new Date(a.startedAt);
      return d >= lastWeek.start && d <= lastWeek.end;
    });
  }, [user, memberActivities, lastWeek]);

  const lastWeekHr = useMemo(() => {
    if (!user) return [];
    return memberSessions(user.id).filter((s) => {
      const d = new Date(s.startedAt);
      return d >= lastWeek.start && d <= lastWeek.end;
    });
  }, [user, memberSessions, lastWeek]);

  const lastWeekTotalDist = lastWeekGps.reduce((s, a) => s + a.distanceMeters, 0);
  const lastWeekAvgStrain = lastWeekHr.length > 0
    ? lastWeekHr.reduce((s, h) => s + h.strain, 0) / lastWeekHr.length : 0;
  const lastWeekHrCals = lastWeekHr.reduce((s, h) => s + h.calories, 0);

  // Nutrition data for this week
  const nutritionData = useMemo(() => {
    if (!user) return { mealsThisWeek: 0, mealsLastWeek: 0, avgCalories: 0, avgProtein: 0, calorieGoal: 0, proteinGoal: 0 };
    const allMacros = myMacros(user.id);
    const goals = goalsFor(user.id);

    // Count this week's meals
    const thisWeekMeals = allMacros.filter((m) => {
      const d = new Date(m.date);
      return d >= week.start && d <= week.end;
    });
    const lastWeekMeals = allMacros.filter((m) => {
      const d = new Date(m.date);
      return d >= lastWeek.start && d <= lastWeek.end;
    });

    // Average daily calories this week
    const dayCount = Math.min(7, Math.ceil((Date.now() - week.start.getTime()) / 86400000));
    const totalCals = thisWeekMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const totalProtein = thisWeekMeals.reduce((sum, m) => sum + (m.protein || 0), 0);

    return {
      mealsThisWeek: thisWeekMeals.length,
      mealsLastWeek: lastWeekMeals.length,
      avgCalories: dayCount > 0 ? Math.round(totalCals / dayCount) : 0,
      avgProtein: dayCount > 0 ? Math.round(totalProtein / dayCount) : 0,
      calorieGoal: goals.calories,
      proteinGoal: goals.protein,
    };
  }, [user, myMacros, goalsFor, week, lastWeek]);

  // Weight data
  const weightData = useMemo(() => {
    if (!user) return { weighInsThisWeek: 0, weighInsLastWeek: 0, latestKg: null, trendDir: 'unknown' as const };
    const weights = myWeights(user.id);
    const thisWeekWeighIns = weights.filter((w) => {
      const d = new Date(w.date);
      return d >= week.start && d <= week.end;
    });
    const lastWeekWeighIns = weights.filter((w) => {
      const d = new Date(w.date);
      return d >= lastWeek.start && d <= lastWeek.end;
    });
    const latest = latestWeight(user.id);
    const latestKg = latest ? (latest.unit === 'kg' ? latest.weight : latest.weight / 2.20462) : null;

    // Simple trend direction
    let trendDir: 'up' | 'down' | 'stable' | 'unknown' = 'unknown';
    if (weights.length >= 2) {
      const recent = weights[0];
      const prev = weights[1];
      const recentKg = recent.unit === 'kg' ? recent.weight : recent.weight / 2.20462;
      const prevKg = prev.unit === 'kg' ? prev.weight : prev.weight / 2.20462;
      const diff = recentKg - prevKg;
      trendDir = Math.abs(diff) < 0.1 ? 'stable' : diff > 0 ? 'up' : 'down';
    }

    return {
      weighInsThisWeek: thisWeekWeighIns.length,
      weighInsLastWeek: lastWeekWeighIns.length,
      latestKg: latestKg,
      trendDir,
    };
  }, [user, myWeights, latestWeight, week, lastWeek]);

  // Spin wheel data
  const spinWinsThisWeek = useMemo(() => {
    return (spinHistory || []).filter((h: any) => {
      const d = new Date(h.date || h.timestamp);
      return d >= week.start && d <= week.end;
    }).length;
  }, [spinHistory, week]);

  // DEXA/Bloodwork counts
  const bodyLabData = useMemo(() => {
    if (!user) return { totalDexa: 0, totalBloodwork: 0, daysSinceDexa: null as number | null, daysSinceBloodwork: null as number | null };
    const dexa = myDexaScans(user.id);
    const blood = myBloodworkReports(user.id);
    const daysSinceDexa = dexa.length > 0 ? Math.floor((Date.now() - new Date(dexa[0].scanDate).getTime()) / 86400000) : null;
    const daysSinceBloodwork = blood.length > 0 ? Math.floor((Date.now() - new Date(blood[0].testDate).getTime()) / 86400000) : null;
    return { totalDexa: dexa.length, totalBloodwork: blood.length, daysSinceDexa, daysSinceBloodwork };
  }, [user, myDexaScans, myBloodworkReports]);

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
            <Ionicons name="flame" size={18} color={colors.flames} />
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

        {/* ─── NUTRITION THIS WEEK ─── */}
        {nutritionData.mealsThisWeek > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>NUTRITION</Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.gold }]}>{nutritionData.mealsThisWeek}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>meals logged</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{nutritionData.avgCalories}</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>avg cal/day</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryVal, { color: colors.textPrimary }]}>{nutritionData.avgProtein}g</Text>
                  <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>avg protein</Text>
                </View>
              </View>
              {nutritionData.calorieGoal > 0 && (
                <View style={[styles.adherenceRow, { marginTop: 10 }]}>
                  <Text style={[styles.adherenceLabel, { color: colors.textMuted }]}>
                    Calorie adherence: {Math.round((nutritionData.avgCalories / nutritionData.calorieGoal) * 100)}%
                  </Text>
                  <View style={[styles.adherenceBarBg, { backgroundColor: colors.backgroundElevated }]}>
                    <View style={[styles.adherenceBarFill, {
                      backgroundColor: Math.abs(nutritionData.avgCalories - nutritionData.calorieGoal) < nutritionData.calorieGoal * 0.1
                        ? '#22C55E' : colors.gold,
                      width: `${Math.min(100, (nutritionData.avgCalories / nutritionData.calorieGoal) * 100)}%`,
                    }]} />
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* ─── DAILY BREAKDOWN (Mon-Sun) ─── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>DAILY BREAKDOWN</Text>
        <View style={[styles.dailyGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {(() => {
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            return days.map((dayLabel, i) => {
              const dayDate = new Date(week.start);
              dayDate.setDate(week.start.getDate() + i);
              const dayISO = dayDate.toISOString().slice(0, 10);

              // Count activities on this day
              const dayGps = gpsActivities.filter((a) => a.startedAt.startsWith(dayISO));
              const dayHr = hrSessions.filter((s) => s.startedAt.startsWith(dayISO));
              const dayActivities = dayGps.length + dayHr.length;
              const dayMins = dayGps.reduce((s, a) => s + a.durationSeconds / 60, 0)
                + dayHr.reduce((s, h) => s + h.durationMinutes, 0);
              const dayCals = dayGps.reduce((s, a) => s + a.calories, 0)
                + dayHr.reduce((s, h) => s + h.calories, 0);

              const isActive = dayActivities > 0;
              const isPast = dayDate <= new Date();
              const isCurrentDay = dayISO === new Date().toISOString().slice(0, 10);

              return (
                <View key={dayLabel} style={styles.dailyRow}>
                  <View style={[
                    styles.dailyDot,
                    {
                      backgroundColor: isActive ? colors.gold : isPast ? colors.surfaceSecondary : 'transparent',
                      borderColor: isCurrentDay ? colors.gold : 'transparent',
                      borderWidth: isCurrentDay ? 2 : 0,
                    },
                  ]}>
                    {isActive && <Ionicons name="checkmark" size={10} color="#000" />}
                  </View>
                  <Text style={[styles.dailyLabel, { color: isCurrentDay ? colors.gold : colors.textSecondary }]}>
                    {dayLabel}
                  </Text>
                  <Text style={[styles.dailyVal, { color: isActive ? colors.textPrimary : colors.textMuted }]}>
                    {dayActivities > 0 ? `${dayActivities} · ${Math.round(dayMins)}m` : isPast ? 'Rest' : '—'}
                  </Text>
                  <Text style={[styles.dailyCal, { color: isActive ? colors.gold : colors.textMuted }]}>
                    {dayCals > 0 ? `${dayCals} kcal` : ''}
                  </Text>
                </View>
              );
            });
          })()}
        </View>

        {/* ─── RECOMMENDATIONS ─── */}
        {totalActivities > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RECOMMENDATIONS</Text>
            {(() => {
              const recs: string[] = [];
              // Training frequency
              if (totalActivities < 5) {
                recs.push(`You trained ${totalActivities} day${totalActivities !== 1 ? 's' : ''} this week. Try ${totalActivities + 1} next week for a new streak.`);
              }
              // Nutrition
              if (nutritionData.avgProtein > 0 && nutritionData.proteinGoal > 0 && nutritionData.avgProtein < nutritionData.proteinGoal * 0.9) {
                recs.push(`You're averaging ${nutritionData.avgProtein}g protein vs ${nutritionData.proteinGoal}g goal. Consider adding a shake post-workout.`);
              }
              // Strain recovery
              if (avgStrain > 15 && hrSessions.length >= 3) {
                recs.push('Your strain has been consistently high. Rest day recommended to avoid overtraining.');
              }
              // GPS improvement
              if (gpsActivities.length > 0 && lastWeekGps.length > 0) {
                const thisAvgPace = gpsActivities.reduce((s, a) => s + a.avgPaceSecsPerKm, 0) / gpsActivities.length;
                const lastAvgPace = lastWeekGps.reduce((s, a) => s + a.avgPaceSecsPerKm, 0) / lastWeekGps.length;
                if (thisAvgPace < lastAvgPace) {
                  const improvement = Math.round(lastAvgPace - thisAvgPace);
                  recs.push(`Your average pace improved by ${improvement} seconds. Keep it up!`);
                }
              }
              // Weight logging
              if (weightData.weighInsThisWeek === 0) {
                recs.push('No weigh-ins this week. Log daily for the most accurate trend data.');
              }

              if (recs.length === 0) recs.push('Great week! Keep up the consistency and progressive overload.');

              return recs.map((rec, i) => (
                <View key={i} style={[styles.recCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Ionicons name="bulb-outline" size={16} color={colors.gold} />
                  <Text style={[styles.recText, { color: colors.textSecondary }]}>{rec}</Text>
                </View>
              ));
            })()}
          </>
        )}

        {/* ─── INSIGHTS — motivational nudges from the engine ─── */}
        {(() => {
          const insights = generateInsights({
            sessionsThisWeek: gpsActivities.length + hrSessions.length,
            sessionsLastWeek: lastWeekGps.length + lastWeekHr.length,
            currentStreak: gamState.streak,
            longestStreak: gamState.longestStreak,
            hrSessionsThisWeek: hrSessions.length,
            hrSessionsLastWeek: lastWeekHr.length,
            avgStrainThisWeek: avgStrain,
            avgStrainLastWeek: lastWeekAvgStrain,
            totalCaloriesHrThisWeek: totalHrCalories,
            gpsDistanceThisWeek: totalDistM,
            gpsDistanceLastWeek: lastWeekTotalDist,
            gpsActivitiesThisWeek: gpsActivities.length,
            gpsActivitiesLastWeek: lastWeekGps.length,
            mealsLoggedThisWeek: nutritionData.mealsThisWeek,
            mealsLoggedLastWeek: nutritionData.mealsLastWeek,
            avgCaloriesThisWeek: nutritionData.avgCalories,
            avgCaloriesLastWeek: 0, // last week avg would need more computation
            avgProteinThisWeek: nutritionData.avgProtein,
            calorieGoal: nutritionData.calorieGoal,
            proteinGoal: nutritionData.proteinGoal,
            weighInsThisWeek: weightData.weighInsThisWeek,
            weighInsLastWeek: weightData.weighInsLastWeek,
            latestWeightKg: weightData.latestKg,
            weightTrendDirection: weightData.trendDir,
            loginStreakDays: gamState.loginStreak || 0,
            daysActiveThisWeek: gpsActivities.length + hrSessions.length,
            spinWinsThisWeek: spinWinsThisWeek,
            totalDexaScans: bodyLabData.totalDexa,
            totalBloodworkReports: bodyLabData.totalBloodwork,
            daysSinceLastDexa: bodyLabData.daysSinceDexa,
            daysSinceLastBloodwork: bodyLabData.daysSinceBloodwork,
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

  // ── Nutrition adherence ──
  adherenceRow: { gap: 4 },
  adherenceLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  adherenceBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  adherenceBarFill: { height: '100%', borderRadius: 3 },

  // ── Daily breakdown ──
  dailyGrid: { borderRadius: 14, borderWidth: 1, padding: 10, marginBottom: 10, gap: 4 },
  dailyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  dailyDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  dailyLabel: { width: 32, fontSize: 11, fontWeight: '700' },
  dailyVal: { flex: 1, fontSize: 12, fontWeight: '600' },
  dailyCal: { fontSize: 11, fontWeight: '700' },

  // ── Recommendations ──
  recCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  recText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
