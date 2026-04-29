import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { useSenpai } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import { WeightUnit } from '../types/nutrition';
import { computeTrendWeight, trendChange, kgToLbs } from '../utils/nutrition';
import { WeightGoal } from '../types/activity';

type ChartRange = '7D' | '14D' | '30D' | 'TOTAL';
const WEIGHT_GOAL_KEY = '@zenki_weight_goal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Reasonable adult weight bounds — protects the chart from typo/outlier entries
// (e.g. a stray "22" lb log that breaks the y-axis scale).
const WEIGHT_BOUNDS = {
  lb: { min: 50, max: 700 },
  kg: { min: 23, max: 318 },
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateShort(dateStr: string): string {
  if (dateStr === todayISO()) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WeightTrackerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { myWeights, addWeight, removeWeight, latestWeight } = useNutrition();
  const { state: senpaiState, triggerReaction: senpaiTrigger, shouldReact: senpaiShouldReact } = useSenpai();

  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('lb');

  const [chartRange, setChartRange] = useState<ChartRange>('30D');
  const [goalOpen, setGoalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [goalTarget, setGoalTarget] = useState('');
  const [goalDate, setGoalDate] = useState('');
  const [savedGoal, setSavedGoal] = useState<WeightGoal | null>(null);

  const mine = user ? myWeights(user.id) : [];
  const latest = user ? latestWeight(user.id) : null;
  const displayUnit: WeightUnit = latest?.unit ?? 'lb';

  // Load saved goal
  React.useEffect(() => {
    AsyncStorage.getItem(WEIGHT_GOAL_KEY).then((raw) => {
      if (raw) try { setSavedGoal(JSON.parse(raw)); } catch {}
    });
  }, []);

  // DEXA integration
  const { myDexaScans } = useNutrition();
  const dexaScans = user ? myDexaScans(user.id) : [];
  const latestDexa = dexaScans.length > 0 ? dexaScans[0] : null;

  // Filter out obviously invalid weights so legacy bad data doesn't break the
  // chart. We don't delete the user's data, but we exclude impossible values
  // (e.g. < 23 kg / 50 lb or > 318 kg / 700 lb) from the trend / chart math.
  const validMine = useMemo(
    () => mine.filter((w) => {
      const lbs = w.unit === 'kg' ? kgToLbs(w.weight) : w.weight;
      return lbs >= WEIGHT_BOUNDS.lb.min && lbs <= WEIGHT_BOUNDS.lb.max;
    }),
    [mine],
  );

  // Compute trend series once from canonical-kg weigh-ins
  const trend = useMemo(() => {
    const raws = validMine.map((w) => ({
      date: w.date,
      weightKg: w.unit === 'kg' ? w.weight : w.weight / 2.20462,
    }));
    return computeTrendWeight(raws);
  }, [validMine]);

  const latestTrendKg = trend.length ? trend[trend.length - 1].trendKg : null;
  const startTrendKg = trend.length ? trend[0].trendKg : null;

  // 7 / 14 / 30-day trend-to-trend deltas (kg)
  const delta7 = useMemo(() => trendChange(trend, 7), [trend]);
  const delta14 = useMemo(() => trendChange(trend, 14), [trend]);
  const delta30 = useMemo(() => trendChange(trend, 30), [trend]);

  function toDisplay(kg: number): number {
    return displayUnit === 'kg' ? kg : kgToLbs(kg);
  }

  const change = useMemo(() => {
    if (latestTrendKg == null || startTrendKg == null || trend.length < 2) return null;
    return toDisplay(latestTrendKg - startTrendKg);
  }, [latestTrendKg, startTrendKg, trend, displayUnit]);

  const rangeDays: Record<ChartRange, number> = { '7D': 7, '14D': 14, '30D': 30, 'TOTAL': 99999 };

  // Chart raw weigh-ins — uses validMine so outliers can't dominate the y-axis
  const chartData = useMemo(() => {
    if (validMine.length < 1) return [];
    const now = Date.now();
    const dayMs = 86400000;
    const maxAge = rangeDays[chartRange] * dayMs;
    const chronological = [...validMine].reverse();
    const filtered = chronological.filter((w) => now - new Date(w.date).getTime() <= maxAge);
    const series = filtered.length >= 2 ? filtered : chronological.slice(-Math.min(2, chronological.length));
    return series.map((w, i) => ({
      x: i,
      y: toDisplay(w.unit === 'kg' ? w.weight : w.weight / 2.20462),
      label: i === 0 ? formatDateShort(w.date)
        : i === series.length - 1 ? formatDateShort(w.date)
        : undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validMine, displayUnit, chartRange]);

  // Trend overlay — same range as chart raw
  const chartTrendOverlay = useMemo(() => {
    if (trend.length < 2) return [];
    const now = Date.now();
    const dayMs = 86400000;
    const maxAge = rangeDays[chartRange] * dayMs;
    const filtered = trend.filter((t) => now - new Date(t.date).getTime() <= maxAge);
    const series = filtered.length >= 2 ? filtered : trend.slice(-2);
    return series.map((t, i) => ({ x: i, y: toDisplay(t.trendKg) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trend, displayUnit, chartRange]);

  // Inline stats summary (4 mini stats shown on main view)
  const inlineStats = useMemo(() => {
    if (validMine.length === 0) return null;
    const all = validMine.map((w) => w.unit === 'kg' ? kgToLbs(w.weight) : w.weight);
    const highest = Math.max(...all);
    const lowest = Math.min(...all);
    const first = validMine[validMine.length - 1];
    const last = validMine[0];
    const firstVal = first.unit === 'kg' ? kgToLbs(first.weight) : first.weight;
    const lastVal = last.unit === 'kg' ? kgToLbs(last.weight) : last.weight;
    const totalChange = lastVal - firstVal;
    const weeks = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (7 * 86400000));
    const weeklyRate = totalChange / weeks;
    return {
      highest: displayUnit === 'kg' ? highest / 2.20462 : highest,
      lowest: displayUnit === 'kg' ? lowest / 2.20462 : lowest,
      weeklyRate: displayUnit === 'kg' ? weeklyRate / 2.20462 : weeklyRate,
      totalEntries: validMine.length,
    };
  }, [validMine, displayUnit]);

  // Goal progress
  const goalProgress = useMemo(() => {
    if (!savedGoal || !latest) return null;
    const current = latest.unit === savedGoal.unit ? latest.weight
      : savedGoal.unit === 'kg' ? latest.weight / 2.20462 : kgToLbs(latest.weight);
    const start = savedGoal.startWeight;
    const target = savedGoal.targetWeight;
    const totalDelta = target - start;
    const currentDelta = current - start;
    const pct = totalDelta !== 0 ? Math.min(100, Math.max(0, (currentDelta / totalDelta) * 100)) : 0;
    const daysLeft = Math.max(0, Math.ceil((new Date(savedGoal.targetDate).getTime() - Date.now()) / 86400000));
    const remaining = target - current;
    return { current, target, start, pct, daysLeft, remaining, unit: savedGoal.unit };
  }, [savedGoal, latest]);

  function handleSave() {
    if (!user) return;
    const num = parseFloat(weight);
    if (!Number.isFinite(num) || num <= 0) {
      Alert.alert('Enter a weight', 'Please enter a valid positive number.');
      return;
    }
    const bounds = WEIGHT_BOUNDS[unit];
    if (num < bounds.min || num > bounds.max) {
      Alert.alert(
        'Check your entry',
        `That weight looks unusual. Expected ${bounds.min}–${bounds.max} ${unit}.`,
      );
      return;
    }
    addWeight({
      memberId: user.id,
      date: todayISO(),
      weight: num,
      unit,
      note: undefined,
    });
    setWeight('');
    if (senpaiState.enabled && senpaiShouldReact()) {
      try { senpaiTrigger('cheering', randomDialogue('bodyLab'), 3000); } catch { /* ignore */ }
    }
  }

  function handleSaveGoal() {
    if (!user || !latest) return;
    const target = parseFloat(goalTarget);
    if (!Number.isFinite(target) || target <= 0) {
      Alert.alert('Enter a target weight');
      return;
    }
    const goal: WeightGoal = {
      targetWeight: target,
      targetDate: goalDate || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      startWeight: latest.weight,
      startDate: todayISO(),
      unit: displayUnit,
    };
    setSavedGoal(goal);
    AsyncStorage.setItem(WEIGHT_GOAL_KEY, JSON.stringify(goal));
    setGoalOpen(false);
  }

  function handleDelete(id: string) {
    Alert.alert('Delete entry?', 'This will remove this weigh-in permanently.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeWeight(id) },
    ]);
  }

  // Detect any invalid legacy entries so we can hint the user
  const invalidCount = mine.length - validMine.length;
  const heroValue = latestTrendKg != null
    ? toDisplay(latestTrendKg).toFixed(1)
    : latest
      ? (latest.unit === displayUnit ? latest.weight : displayUnit === 'kg' ? latest.weight / 2.20462 : kgToLbs(latest.weight)).toFixed(1)
      : '—';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* Header sits outside ScrollView so it stays visible */}
        <View style={styles.headerWrap}>
          <View style={styles.header}>
            <SoundPressable
              onPress={() => navigation.goBack()}
              style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Weight</Text>
            <SoundPressable
              onPress={() => setHistoryOpen(true)}
              style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="time-outline" size={18} color={colors.textPrimary} />
            </SoundPressable>
          </View>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Chart card — visualization first, per master prompt §9 */}
          <FadeInView>
            <View style={[styles.chartWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.chartHead}>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDash, { backgroundColor: colors.gold }]} />
                    <Text style={[styles.legendText, { color: colors.textMuted }]}>WEIGH-INS</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDash, { backgroundColor: colors.textMuted, opacity: 0.85 }]} />
                    <Text style={[styles.legendText, { color: colors.textMuted }]}>TREND</Text>
                  </View>
                </View>
                <View style={styles.rangeRow}>
                  {(['7D', '14D', '30D', 'TOTAL'] as ChartRange[]).map((r) => (
                    <SoundPressable
                      key={r}
                      onPress={() => setChartRange(r)}
                      style={[
                        styles.rangeBtn,
                        chartRange === r && { backgroundColor: colors.gold },
                      ]}
                    >
                      <Text style={[styles.rangeBtnText, { color: chartRange === r ? '#000' : colors.textMuted }]}>
                        {r}
                      </Text>
                    </SoundPressable>
                  ))}
                </View>
              </View>

              {chartData.length >= 2 ? (
                <LineChart
                  data={chartData}
                  trendOverlay={chartTrendOverlay}
                  trendOverlayColor={colors.textMuted}
                  width={SCREEN_WIDTH - spacing.md * 4}
                  height={120}
                  color={colors.gold}
                  lowerIsBetter
                  formatY={(v) => v.toFixed(0)}
                />
              ) : (
                <View style={[styles.chartEmpty, { borderColor: colors.borderSubtle }]}>
                  <Ionicons name="trending-up" size={20} color={colors.textMuted} />
                  <Text style={[styles.chartEmptyText, { color: colors.textMuted }]}>
                    {validMine.length === 0
                      ? 'Log a weigh-in to see your trend'
                      : 'Log one more weigh-in to see your trend'}
                  </Text>
                </View>
              )}
            </View>
          </FadeInView>

          {/* Monthly calendar — gold dot on logged days, per master prompt §10 */}
          <FadeInView delay={20}>
            <WeightLogCalendar loggedDates={new Set(mine.map((w) => w.date))} />
          </FadeInView>

          {/* Log form — moved below visualization */}
          <FadeInView delay={40}>
            <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.gold + '40' }]}>
              <Text style={[styles.formLabel, { color: colors.textMuted }]}>LOG WEIGH-IN</Text>
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.formInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder={`0.0`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={weight}
                  onChangeText={setWeight}
                  returnKeyType="done"
                  onSubmitEditing={handleSave}
                />
                <View style={[styles.unitToggle, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  {(['lb', 'kg'] as WeightUnit[]).map((u) => (
                    <SoundPressable
                      key={u}
                      onPress={() => setUnit(u)}
                      style={[
                        styles.unitBtn,
                        unit === u && { backgroundColor: colors.gold },
                      ]}
                    >
                      <Text style={{
                        color: unit === u ? '#000' : colors.textPrimary,
                        fontWeight: '800',
                        fontSize: 13,
                      }}>{u}</Text>
                    </SoundPressable>
                  ))}
                </View>
                <SoundPressable
                  onPress={handleSave}
                  activeOpacity={0.85}
                  style={[styles.formSaveBtn, { backgroundColor: colors.gold }]}
                >
                  <Ionicons name="add" size={18} color="#000" />
                  <Text style={styles.formSaveText}>SAVE</Text>
                </SoundPressable>
              </View>
            </View>
          </FadeInView>

          {/* Hero — trend weight + 4 deltas */}
          <FadeInView delay={60}>
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>TREND WEIGHT</Text>
              <View style={styles.heroNumRow}>
                <Text style={[styles.heroNum, { color: colors.gold }]}>{heroValue}</Text>
                <Text style={[styles.heroUnit, { color: colors.textSecondary }]}>{displayUnit}</Text>
              </View>
              {latest && (
                <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                  Today's scale {latest.weight.toFixed(1)} {latest.unit}
                </Text>
              )}
              <View style={styles.heroRow}>
                <TrendStat label="7D" delta={delta7 == null ? null : toDisplay(delta7)} colors={colors} />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <TrendStat label="14D" delta={delta14 == null ? null : toDisplay(delta14)} colors={colors} />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <TrendStat label="30D" delta={delta30 == null ? null : toDisplay(delta30)} colors={colors} />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <TrendStat label="TOTAL" delta={change} colors={colors} highlight />
              </View>
            </View>
          </FadeInView>

          {/* Inline stats — 4 chips */}
          {inlineStats && (
            <FadeInView delay={80}>
              <View style={styles.statsRow}>
                <StatChip
                  label="HIGH"
                  value={inlineStats.highest.toFixed(1)}
                  colors={colors}
                />
                <StatChip
                  label="LOW"
                  value={inlineStats.lowest.toFixed(1)}
                  colors={colors}
                />
                <StatChip
                  label={`${displayUnit.toUpperCase()}/WK`}
                  value={`${inlineStats.weeklyRate > 0 ? '+' : ''}${inlineStats.weeklyRate.toFixed(1)}`}
                  highlight={inlineStats.weeklyRate < 0}
                  colors={colors}
                />
                <StatChip
                  label="LOGS"
                  value={String(inlineStats.totalEntries)}
                  colors={colors}
                />
              </View>
            </FadeInView>
          )}

          {/* Action chips */}
          <FadeInView delay={100}>
            <View style={styles.actionRow}>
              <ActionChip
                icon="calendar-outline"
                label="Calendar"
                onPress={() => setCalendarOpen(true)}
                colors={colors}
              />
              <ActionChip
                icon={savedGoal ? 'flag' : 'flag-outline'}
                label={savedGoal ? 'Goal' : 'Set Goal'}
                onPress={() => {
                  setGoalTarget('');
                  setGoalDate('');
                  setGoalOpen(true);
                }}
                colors={colors}
                accent={!!savedGoal}
              />
              <ActionChip
                icon="scan-outline"
                label="DEXA"
                onPress={() => navigation.navigate('DexaScans')}
                colors={colors}
                badge={latestDexa ? `${latestDexa.totalBodyFatPct?.toFixed(0) ?? '--'}%` : undefined}
              />
              <ActionChip
                icon="time-outline"
                label="History"
                onPress={() => setHistoryOpen(true)}
                colors={colors}
                badge={mine.length > 0 ? String(mine.length) : undefined}
              />
            </View>
          </FadeInView>

          {/* Recent Logs — last 10 entries */}
          {mine.length > 0 && (
            <FadeInView delay={120}>
              <View style={[styles.recentCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.recentHeader}>
                  <Text style={[styles.formLabel, { color: colors.textMuted, marginBottom: 0 }]}>RECENT LOGS</Text>
                  {mine.length > 10 && (
                    <SoundPressable onPress={() => setHistoryOpen(true)}>
                      <Text style={[styles.recentSeeAll, { color: colors.gold }]}>See all</Text>
                    </SoundPressable>
                  )}
                </View>
                {mine.slice(0, 10).map((w, i, arr) => {
                  const prev = arr[i + 1]; // newer first → next index is older entry
                  const prevSameUnit = prev
                    ? (prev.unit === w.unit ? prev.weight
                      : w.unit === 'kg' ? prev.weight / 2.20462 : kgToLbs(prev.weight))
                    : null;
                  const delta = prevSameUnit != null ? w.weight - prevSameUnit : null;
                  const lbsForFlag = w.unit === 'kg' ? kgToLbs(w.weight) : w.weight;
                  const isInvalid = lbsForFlag < WEIGHT_BOUNDS.lb.min || lbsForFlag > WEIGHT_BOUNDS.lb.max;
                  return (
                    <View
                      key={w.id}
                      style={[
                        styles.recentRow,
                        i < Math.min(9, mine.length - 1) && { borderBottomWidth: 1, borderBottomColor: colors.border },
                      ]}
                    >
                      <Text style={[styles.recentDate, { color: colors.textMuted }]} numberOfLines={1}>
                        {formatDateShort(w.date)}
                      </Text>
                      <View style={styles.recentWeightCol}>
                        <Text style={[styles.recentWeight, { color: isInvalid ? colors.error : colors.textPrimary }]}>
                          {w.weight.toFixed(1)}
                          <Text style={[styles.recentUnit, { color: colors.textSecondary }]}> {w.unit}</Text>
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.recentDelta,
                          {
                            color: delta == null ? colors.textMuted
                              : delta < 0 ? colors.gold
                              : delta > 0 ? colors.textPrimary
                              : colors.textMuted,
                          },
                        ]}
                      >
                        {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </FadeInView>
          )}

          {/* Goal Progress — current vs target with ETA from weekly rate */}
          {goalProgress && inlineStats && (() => {
            const rate = inlineStats.weeklyRate; // signed lb (or kg) / week in displayUnit
            const remaining = goalProgress.remaining; // signed: target - current
            const onTrack = rate !== 0 && remaining !== 0 && Math.sign(rate) === Math.sign(remaining);
            const etaWeeks = onTrack ? remaining / rate : null;
            const etaDate = etaWeeks != null
              ? new Date(Date.now() + etaWeeks * 7 * 86400000)
              : null;
            const etaLabel = etaDate
              ? etaDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : remaining === 0 ? 'Goal hit' : rate === 0 ? 'No trend yet' : 'Off track';
            return (
              <FadeInView delay={140}>
                <View style={[styles.goalProgressCard, { backgroundColor: colors.surface, borderColor: colors.gold + '40' }]}>
                  <View style={styles.goalProgressHead}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="flag" size={13} color={colors.gold} />
                      <Text style={[styles.formLabel, { color: colors.textMuted, marginBottom: 0 }]}>GOAL PROGRESS</Text>
                    </View>
                    <Text style={[styles.goalProgressPct, { color: colors.gold }]}>
                      {Math.round(goalProgress.pct)}%
                    </Text>
                  </View>
                  <View style={styles.goalProgressRow}>
                    <View style={styles.goalProgressCol}>
                      <Text style={[styles.goalProgressLabel, { color: colors.textMuted }]}>CURRENT</Text>
                      <Text style={[styles.goalProgressVal, { color: colors.textPrimary }]}>
                        {goalProgress.current.toFixed(1)}
                        <Text style={[styles.goalProgressUnit, { color: colors.textSecondary }]}> {goalProgress.unit}</Text>
                      </Text>
                    </View>
                    <View style={styles.goalProgressCol}>
                      <Text style={[styles.goalProgressLabel, { color: colors.textMuted }]}>TARGET</Text>
                      <Text style={[styles.goalProgressVal, { color: colors.gold }]}>
                        {goalProgress.target.toFixed(1)}
                        <Text style={[styles.goalProgressUnit, { color: colors.textSecondary }]}> {goalProgress.unit}</Text>
                      </Text>
                    </View>
                    <View style={styles.goalProgressCol}>
                      <Text style={[styles.goalProgressLabel, { color: colors.textMuted }]}>REMAINING</Text>
                      <Text style={[styles.goalProgressVal, { color: colors.textPrimary }]}>
                        {Math.abs(goalProgress.remaining).toFixed(1)}
                        <Text style={[styles.goalProgressUnit, { color: colors.textSecondary }]}> {goalProgress.unit}</Text>
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.goalBarBg, { backgroundColor: colors.backgroundElevated }]}>
                    <View style={[styles.goalBarFill, { backgroundColor: colors.gold, width: `${goalProgress.pct}%` }]} />
                  </View>
                  <View style={styles.goalEtaRow}>
                    <Text style={[styles.goalEtaLabel, { color: colors.textMuted }]}>
                      EST. COMPLETION
                    </Text>
                    <Text
                      style={[
                        styles.goalEtaValue,
                        {
                          color: etaDate ? colors.textPrimary
                            : remaining === 0 ? colors.gold
                            : colors.warning,
                        },
                      ]}
                    >
                      {etaLabel}
                    </Text>
                  </View>
                  <Text style={[styles.goalEtaSub, { color: colors.textMuted }]}>
                    Target {new Date(savedGoal!.targetDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {goalProgress.daysLeft}d left · {rate > 0 ? '+' : ''}{rate.toFixed(2)} {goalProgress.unit}/wk
                  </Text>
                </View>
              </FadeInView>
            );
          })()}

          {invalidCount > 0 && (
            <Text style={[styles.invalidHint, { color: colors.textMuted }]}>
              {invalidCount} entry{invalidCount === 1 ? '' : 'ies'} excluded — open History to review.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* History modal — full list with delete */}
      <Modal visible={historyOpen} transparent animationType="slide" onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={{ flex: 1 }} onPress={() => setHistoryOpen(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.sheetHandle}>
              <View style={[styles.sheetGrip, { backgroundColor: colors.border }]} />
            </View>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>History</Text>
              <Text style={[styles.sheetSub, { color: colors.textMuted }]}>{mine.length} entries</Text>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
              {mine.length === 0 ? (
                <View style={[styles.empty, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Ionicons name="scale-outline" size={28} color={colors.textMuted} />
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No weigh-ins yet.</Text>
                </View>
              ) : (
                mine.map((w) => {
                  const lbs = w.unit === 'kg' ? kgToLbs(w.weight) : w.weight;
                  const isInvalid = lbs < WEIGHT_BOUNDS.lb.min || lbs > WEIGHT_BOUNDS.lb.max;
                  return (
                    <View
                      key={w.id}
                      style={[
                        styles.historyRow,
                        {
                          backgroundColor: colors.background,
                          borderColor: isInvalid ? colors.error + '60' : colors.border,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.historyDate, { color: colors.textMuted }]}>
                          {formatDateShort(w.date)}{isInvalid ? ' · likely invalid' : ''}
                        </Text>
                        <Text style={[styles.historyWeight, { color: isInvalid ? colors.error : colors.textPrimary }]}>
                          {w.weight.toFixed(1)} <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{w.unit}</Text>
                        </Text>
                        {!!w.note && <Text style={[styles.historyNote, { color: colors.textSecondary }]}>{w.note}</Text>}
                      </View>
                      <SoundPressable onPress={() => handleDelete(w.id)} hitSlop={10} style={styles.deleteBtn}>
                        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                      </SoundPressable>
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Calendar modal */}
      <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={() => setCalendarOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCalendarOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Weigh-in Calendar</Text>
            <WeightLogCalendar loggedDates={new Set(mine.map((w) => w.date))} />
            <SoundPressable
              onPress={() => setCalendarOpen(false)}
              style={[styles.modalBtn, { backgroundColor: colors.gold, borderColor: colors.gold, marginTop: spacing.md }]}
            >
              <Text style={[styles.modalBtnText, { color: '#000' }]}>Done</Text>
            </SoundPressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Goal setting modal */}
      <Modal visible={goalOpen} transparent animationType="fade" onRequestClose={() => setGoalOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Set Weight Goal</Text>

            <Text style={[styles.modalLabel, { color: colors.textMuted }]}>TARGET WEIGHT ({displayUnit})</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder={`e.g. ${displayUnit === 'lb' ? '175' : '80'}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              value={goalTarget}
              onChangeText={setGoalTarget}
            />

            <Text style={[styles.modalLabel, { color: colors.textMuted, marginTop: 12 }]}>TARGET DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="2026-07-01"
              placeholderTextColor={colors.textMuted}
              value={goalDate}
              onChangeText={setGoalDate}
            />

            <Text style={[styles.modalHint, { color: colors.textMuted }]}>
              Recommended: 0.5–1 lb/week loss, 0.25–0.5 lb/week gain
            </Text>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <SoundPressable
                onPress={() => setGoalOpen(false)}
                style={[styles.modalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </SoundPressable>
              <SoundPressable
                onPress={handleSaveGoal}
                style={[styles.modalBtn, { backgroundColor: colors.gold, borderColor: colors.gold }]}
              >
                <Text style={[styles.modalBtnText, { color: '#000' }]}>Save</Text>
              </SoundPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function TrendStat({
  label, delta, colors, highlight,
}: { label: string; delta: number | null; colors: any; highlight?: boolean }) {
  const color =
    delta == null ? colors.textMuted
      : delta < 0 ? colors.gold
      : delta > 0 ? (highlight ? colors.textPrimary : colors.textPrimary)
      : colors.textSecondary;
  const sign = delta == null ? '' : delta > 0 ? '+' : '';
  const val = delta == null ? '—' : `${sign}${delta.toFixed(1)}`;
  return (
    <View style={styles.heroStat}>
      <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.heroStatVal, { color }]}>{val}</Text>
    </View>
  );
}

function StatChip({
  label, value, colors, highlight,
}: { label: string; value: string; colors: any; highlight?: boolean }) {
  return (
    <View style={[styles.statChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.statChipValue, { color: highlight ? colors.gold : colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statChipLabel, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

function ActionChip({
  icon, label, onPress, colors, badge, accent,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  colors: any;
  badge?: string;
  accent?: boolean;
}) {
  return (
    <SoundPressable
      onPress={onPress}
      style={[
        styles.actionChip,
        {
          backgroundColor: accent ? colors.goldMuted : colors.surface,
          borderColor: accent ? colors.gold + '40' : colors.border,
        },
      ]}
    >
      <Ionicons name={icon} size={16} color={accent ? colors.gold : colors.textPrimary} />
      <Text style={[styles.actionChipLabel, { color: accent ? colors.gold : colors.textPrimary }]}>{label}</Text>
      {badge && (
        <View style={[styles.actionChipBadge, { backgroundColor: colors.gold + '22' }]}>
          <Text style={[styles.actionChipBadgeText, { color: colors.gold }]}>{badge}</Text>
        </View>
      )}
    </SoundPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerWrap: {
    paddingHorizontal: spacing.md,
  },
  scrollView: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },

  // ── Hero ──
  hero: {
    marginTop: spacing.sm,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  heroNumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 0 },
  heroNum: { fontSize: 38, fontWeight: '900', lineHeight: 42 },
  heroUnit: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  heroSub: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, marginTop: 1 },
  heroRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.sm },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 2 },
  heroStatVal: { fontSize: 14, fontWeight: '800' },
  heroDivider: { width: 1, marginHorizontal: spacing.xs },
  heroSep: { height: 1, alignSelf: 'stretch', marginVertical: spacing.xs, opacity: 0.6 },
  goalInline: { alignSelf: 'stretch' },
  goalInlineHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  goalInlineLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  goalInlineMeta: { fontSize: 10, fontWeight: '600' },
  goalBarBg: { height: 5, borderRadius: 3, overflow: 'hidden' },
  goalBarFill: { height: '100%', borderRadius: 3 },

  // ── Chart ──
  chartWrap: {
    marginTop: spacing.sm,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  chartHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDash: { width: 10, height: 2, borderRadius: 1 },
  legendText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  rangeRow: { flexDirection: 'row', gap: 2 },
  rangeBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  rangeBtnText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  chartEmpty: {
    height: 120,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  chartEmptyText: { fontSize: 12, fontWeight: '600' },

  // ── Inline stat chips ──
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statChip: {
    flex: 1,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  statChipValue: { fontSize: 15, fontWeight: '800' },
  statChipLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, marginTop: 2 },

  // ── Log form (top-of-page, primary action) ──
  formCard: {
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  formLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 8 },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formInput: {
    flex: 1,
    minWidth: 0, // RN-Web fix: allow shrink so SAVE button doesn't get clipped
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  unitToggle: {
    flexDirection: 'row',
    flexShrink: 0,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: 2,
    gap: 1,
  },
  unitBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 30,
  },
  formSaveBtn: {
    flexDirection: 'row',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    height: 42,
    borderRadius: borderRadius.md,
  },
  formSaveText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  // ── Recent Logs (last 10 entries) ──
  recentCard: {
    marginTop: spacing.sm,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  recentSeeAll: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  recentDate: {
    flex: 0,
    width: 56,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  recentWeightCol: { flex: 1, alignItems: 'flex-start' },
  recentWeight: { fontSize: 15, fontWeight: '800' },
  recentUnit: { fontSize: 11, fontWeight: '600' },
  recentDelta: {
    fontSize: 13,
    fontWeight: '800',
    minWidth: 56,
    textAlign: 'right',
  },

  // ── Goal Progress card ──
  goalProgressCard: {
    marginTop: spacing.sm,
    paddingVertical: spacing.smd,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  goalProgressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  goalProgressPct: { fontSize: 18, fontWeight: '900' },
  goalProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.smd,
  },
  goalProgressCol: { flex: 1, alignItems: 'center' },
  goalProgressLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginBottom: 2 },
  goalProgressVal: { fontSize: 18, fontWeight: '900' },
  goalProgressUnit: { fontSize: 10, fontWeight: '600' },
  goalEtaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  goalEtaLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  goalEtaValue: { fontSize: 14, fontWeight: '800' },
  goalEtaSub: { fontSize: 10, fontWeight: '600', marginTop: 4 },

  // ── Action row ──
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    flexDirection: 'column',
  },
  actionChipLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  actionChipBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
  },
  actionChipBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.2 },
  invalidHint: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // ── History sheet ──
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: SCREEN_HEIGHT * 0.75,
    minHeight: SCREEN_HEIGHT * 0.5,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderTopWidth: 1,
  },
  sheetHandle: { alignItems: 'center', paddingVertical: 6 },
  sheetGrip: { width: 40, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
  sheetSub: { fontSize: 12, fontWeight: '600' },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  historyDate: { fontSize: 11, letterSpacing: 0.8, fontWeight: '700', marginBottom: 2 },
  historyWeight: { fontSize: 18, fontWeight: '800' },
  historyNote: { fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 6 },

  empty: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // ── Modal (goal + calendar) ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  modalInput: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalHint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 14, fontWeight: '800' },

  // ── Calendar (used inside calendar modal) ──
  calCard: {
    padding: spacing.sm,
  },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNavBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  calMonthLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calCellInner: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  calDayText: { fontSize: 11, fontWeight: '600' },
  calDot: { position: 'absolute', bottom: 2, width: 4, height: 4, borderRadius: 2 },
});

// ─────────────────────────────────────────────────
// Monthly weight-log calendar — gold dot on days with a log
// ─────────────────────────────────────────────────
function WeightLogCalendar({ loggedDates }: { loggedDates: Set<string> }) {
  const { colors } = useTheme();
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthStart = new Date(cursor.year, cursor.month, 1);
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = monthStart.getDay();

  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const todayIso = new Date().toISOString().split('T')[0];

  const goPrev = () => {
    setCursor((c) => c.month === 0
      ? { year: c.year - 1, month: 11 }
      : { year: c.year, month: c.month - 1 });
  };
  const goNext = () => {
    setCursor((c) => c.month === 11
      ? { year: c.year + 1, month: 0 }
      : { year: c.year, month: c.month + 1 });
  };

  return (
    <View style={styles.calCard}>
      <View style={styles.calNav}>
        <SoundPressable onPress={goPrev} style={[styles.calNavBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="chevron-back" size={16} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.calMonthLabel, { color: colors.textPrimary }]}>{monthLabel}</Text>
        <SoundPressable onPress={goNext} style={[styles.calNavBtn, { backgroundColor: colors.surfaceSecondary }]}>
          <Ionicons name="chevron-forward" size={16} color={colors.textPrimary} />
        </SoundPressable>
      </View>
      <View style={styles.calWeekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w, i) => (
          <Text key={i} style={[styles.calWeekDay, { color: colors.textMuted }]}>{w}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {cells.map((day, i) => {
          if (day == null) {
            return <View key={i} style={styles.calCell} />;
          }
          const mm = String(cursor.month + 1).padStart(2, '0');
          const dd = String(day).padStart(2, '0');
          const iso = `${cursor.year}-${mm}-${dd}`;
          const isLogged = loggedDates.has(iso);
          const isToday = iso === todayIso;
          return (
            <View key={i} style={styles.calCell}>
              <View style={[
                styles.calCellInner,
                isToday && { borderWidth: 1, borderColor: colors.gold },
                isLogged && { backgroundColor: colors.gold + '22' },
              ]}>
                <Text style={[
                  styles.calDayText,
                  { color: isLogged ? colors.gold : colors.textPrimary },
                ]}>
                  {day}
                </Text>
              </View>
              {isLogged && (
                <View style={[styles.calDot, { backgroundColor: colors.gold }]} />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
