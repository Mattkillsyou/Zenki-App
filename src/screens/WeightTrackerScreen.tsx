import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Modal,
  Pressable,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
  const [note, setNote] = useState('');

  const [chartRange, setChartRange] = useState<ChartRange>('TOTAL');
  const [goalOpen, setGoalOpen] = useState(false);
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

  // Compute trend series once from canonical-kg weigh-ins
  const trend = useMemo(() => {
    const raws = mine.map((w) => ({
      date: w.date,
      weightKg: w.unit === 'kg' ? w.weight : w.weight / 2.20462,
    }));
    return computeTrendWeight(raws);
  }, [mine]);

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

  // Helper — number of days in the active range (TOTAL = all)
  const rangeDays: Record<ChartRange, number> = { '7D': 7, '14D': 14, '30D': 30, 'TOTAL': 99999 };

  // Chart RAW data — actual weigh-ins as plotted points (one per log)
  const chartData = useMemo(() => {
    if (mine.length < 1) return [];
    const now = Date.now();
    const dayMs = 86400000;
    const maxAge = rangeDays[chartRange] * dayMs;
    // mine is sorted newest-first; reverse to chronological for charting
    const chronological = [...mine].reverse();
    const filtered = chronological.filter((w) => now - new Date(w.date).getTime() <= maxAge);
    const series = filtered.length >= 1 ? filtered : chronological.slice(-2);
    return series.map((w, i) => ({
      x: i,
      y: toDisplay(w.unit === 'kg' ? w.weight : w.weight / 2.20462),
      label: i === 0 ? formatDateShort(w.date)
        : i === series.length - 1 ? formatDateShort(w.date)
        : undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, displayUnit, chartRange]);

  // Chart TREND OVERLAY — smoothed rolling average for the same range
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

  // Weight stats
  const weightStats = useMemo(() => {
    if (mine.length === 0) return null;
    const all = mine.map((w) => w.unit === 'kg' ? kgToLbs(w.weight) : w.weight);
    const highest = Math.max(...all);
    const lowest = Math.min(...all);
    const highestEntry = mine.find((w) => (w.unit === 'kg' ? kgToLbs(w.weight) : w.weight) === highest);
    const lowestEntry = mine.find((w) => (w.unit === 'kg' ? kgToLbs(w.weight) : w.weight) === lowest);
    const first = mine[mine.length - 1];
    const last = mine[0];
    const firstVal = first.unit === 'kg' ? kgToLbs(first.weight) : first.weight;
    const lastVal = last.unit === 'kg' ? kgToLbs(last.weight) : last.weight;
    const totalChange = lastVal - firstVal;
    const daysSinceLog = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);

    // Weekly rate from linear regression (simplified: delta / weeks)
    const weeks = Math.max(1, (new Date(last.date).getTime() - new Date(first.date).getTime()) / (7 * 86400000));
    const weeklyRate = totalChange / weeks;

    return {
      highest: displayUnit === 'kg' ? highest / 2.20462 : highest,
      highestDate: highestEntry?.date || '',
      lowest: displayUnit === 'kg' ? lowest / 2.20462 : lowest,
      lowestDate: lowestEntry?.date || '',
      totalChange: displayUnit === 'kg' ? totalChange / 2.20462 : totalChange,
      weeklyRate: displayUnit === 'kg' ? weeklyRate / 2.20462 : weeklyRate,
      daysSinceLog,
      totalEntries: mine.length,
    };
  }, [mine, displayUnit]);

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
    if (num > 1500) {
      Alert.alert('Check your entry', 'That weight seems off. Please double-check.');
      return;
    }
    addWeight({
      memberId: user.id,
      date: todayISO(),
      weight: num,
      unit,
      note: note.trim() || undefined,
    });
    setWeight('');
    setNote('');
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Weight</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Hero — trend-weighted primary display */}
          <FadeInView>
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.heroCenter}>
                <Text style={[styles.heroLabel, { color: colors.textMuted }]}>TREND WEIGHT</Text>
                <Text style={[styles.heroNum, { color: colors.gold }]}>
                  {latestTrendKg != null ? toDisplay(latestTrendKg).toFixed(1) : '—'}
                </Text>
                <Text style={[styles.heroUnit, { color: colors.textSecondary }]}>{displayUnit}</Text>
                {latest && (
                  <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                    Today's scale: {latest.weight.toFixed(1)} {latest.unit}
                  </Text>
                )}
              </View>
              <View style={styles.heroRow}>
                <TrendStat
                  label="7D"
                  delta={delta7 == null ? null : toDisplay(delta7)}
                  unit={displayUnit}
                  colors={colors}
                />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <TrendStat
                  label="14D"
                  delta={delta14 == null ? null : toDisplay(delta14)}
                  unit={displayUnit}
                  colors={colors}
                />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <TrendStat
                  label="30D"
                  delta={delta30 == null ? null : toDisplay(delta30)}
                  unit={displayUnit}
                  colors={colors}
                />
                <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                <View style={styles.heroStat}>
                  <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>TOTAL</Text>
                  <Text style={[styles.heroStatVal, {
                    color: change == null ? colors.textMuted : change < 0 ? colors.gold : colors.textPrimary,
                  }]}>
                    {change == null ? '—' : `${change > 0 ? '+' : ''}${change.toFixed(1)}`}
                  </Text>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* Goal progress card */}
          {goalProgress && (
            <FadeInView delay={40}>
              <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.gold + '30' }]}>
                <View style={styles.goalHeader}>
                  <Text style={[styles.goalLabel, { color: colors.textMuted }]}>GOAL</Text>
                  <Text style={[styles.goalTarget, { color: colors.gold }]}>
                    {goalProgress.target.toFixed(1)} {goalProgress.unit}
                  </Text>
                </View>
                <View style={[styles.goalBarBg, { backgroundColor: colors.backgroundElevated }]}>
                  <View style={[styles.goalBarFill, { backgroundColor: colors.gold, width: `${goalProgress.pct}%` }]} />
                </View>
                <View style={styles.goalMeta}>
                  <Text style={[styles.goalMetaText, { color: colors.textSecondary }]}>
                    {Math.abs(goalProgress.remaining).toFixed(1)} {goalProgress.unit} to go
                  </Text>
                  <Text style={[styles.goalMetaText, { color: colors.textMuted }]}>
                    {goalProgress.daysLeft} days left
                  </Text>
                </View>
              </View>
            </FadeInView>
          )}

          {/* Chart + range selector */}
          {chartData.length >= 2 && (
            <FadeInView delay={60}>
              <View style={[styles.chartWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 2, backgroundColor: colors.gold, borderRadius: 1 }} />
                      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 0, fontSize: 9 }]}>WEIGH-INS</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 10, height: 2, backgroundColor: colors.textMuted, borderRadius: 1, opacity: 0.85 }} />
                      <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: 0, fontSize: 9 }]}>TREND</Text>
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
                <LineChart
                  data={chartData}
                  trendOverlay={chartTrendOverlay}
                  trendOverlayColor={colors.textMuted}
                  width={SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2}
                  height={160}
                  color={colors.gold}
                  lowerIsBetter
                  formatY={(v) => v.toFixed(0)}
                />
              </View>
            </FadeInView>
          )}

          {/* Monthly logged-day calendar */}
          {mine.length > 0 && (
            <FadeInView delay={75}>
              <WeightLogCalendar
                loggedDates={new Set(mine.map((w) => w.date))}
              />
            </FadeInView>
          )}

          {/* Weight Stats Panel */}
          {weightStats && (
            <FadeInView delay={80}>
              <View style={[styles.statsPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>STATS</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: colors.textPrimary }]}>{weightStats.highest.toFixed(1)}</Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>Highest {displayUnit}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: colors.textPrimary }]}>{weightStats.lowest.toFixed(1)}</Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>Lowest {displayUnit}</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: weightStats.weeklyRate < 0 ? colors.gold : colors.textPrimary }]}>
                      {weightStats.weeklyRate > 0 ? '+' : ''}{weightStats.weeklyRate.toFixed(1)}
                    </Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>{displayUnit}/week</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: colors.textPrimary }]}>{weightStats.totalEntries}</Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>Total logs</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: weightStats.totalChange < 0 ? colors.gold : colors.textPrimary }]}>
                      {weightStats.totalChange > 0 ? '+' : ''}{weightStats.totalChange.toFixed(1)}
                    </Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>Total change</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={[styles.statItemValue, { color: weightStats.daysSinceLog > 3 ? colors.warning : colors.textPrimary }]}>
                      {weightStats.daysSinceLog}d
                    </Text>
                    <Text style={[styles.statItemLabel, { color: colors.textMuted }]}>Since last log</Text>
                  </View>
                </View>
              </View>
            </FadeInView>
          )}

          {/* DEXA integration card */}
          {latestDexa && (
            <FadeInView delay={90}>
              <View style={[styles.dexaCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>BODY COMPOSITION (DEXA)</Text>
                <View style={styles.dexaRow}>
                  <View style={styles.dexaStat}>
                    <Text style={[styles.dexaValue, { color: colors.gold }]}>
                      {latestDexa.totalBodyFatPct?.toFixed(1) || '--'}%
                    </Text>
                    <Text style={[styles.dexaLabel, { color: colors.textMuted }]}>Body Fat</Text>
                  </View>
                  <View style={styles.dexaStat}>
                    <Text style={[styles.dexaValue, { color: colors.textPrimary }]}>
                      {latestDexa.leanMassKg ? (kgToLbs(latestDexa.leanMassKg)).toFixed(1) : '--'} lb
                    </Text>
                    <Text style={[styles.dexaLabel, { color: colors.textMuted }]}>Lean Mass</Text>
                  </View>
                  <View style={styles.dexaStat}>
                    <Text style={[styles.dexaValue, { color: colors.textPrimary }]}>
                      {latestDexa.fatMassKg ? (kgToLbs(latestDexa.fatMassKg)).toFixed(1) : '--'} lb
                    </Text>
                    <Text style={[styles.dexaLabel, { color: colors.textMuted }]}>Fat Mass</Text>
                  </View>
                </View>
                <Text style={[styles.dexaDate, { color: colors.textMuted }]}>
                  Scanned {formatDateShort(latestDexa.scanDate)}
                </Text>
              </View>
            </FadeInView>
          )}

          {/* Set Goal button */}
          {!savedGoal && (
            <FadeInView delay={95}>
              <SoundPressable
                style={[styles.setGoalBtn, { backgroundColor: colors.goldMuted, borderColor: colors.gold + '30' }]}
                onPress={() => setGoalOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="flag-outline" size={18} color={colors.gold} />
                <Text style={[styles.setGoalText, { color: colors.gold }]}>Set Weight Goal</Text>
              </SoundPressable>
            </FadeInView>
          )}

          {/* Log form */}
          <FadeInView delay={120}>
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOG WEIGH-IN</Text>

              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.inputLarge, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="0.0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={weight}
                  onChangeText={setWeight}
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
                        fontSize: 14,
                      }}>{u}</Text>
                    </SoundPressable>
                  ))}
                </View>
              </View>

              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border, marginTop: spacing.sm }]}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textMuted}
                value={note}
                onChangeText={setNote}
              />

              <SoundPressable
                onPress={handleSave}
                activeOpacity={0.85}
                style={[styles.saveBtn, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="add-circle" size={18} color="#000" />
                <Text style={styles.saveBtnText}>Save weigh-in</Text>
              </SoundPressable>
            </View>
          </FadeInView>

          {/* History */}
          <FadeInView delay={180}>
            <Text style={[styles.sectionLabel, styles.historyLabel, { color: colors.textMuted }]}>HISTORY</Text>

            {mine.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="scale-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No weigh-ins yet. Log your first above.</Text>
              </View>
            ) : (
              mine.map((w) => (
                <View key={w.id} style={[styles.row, styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyDate, { color: colors.textMuted }]}>{formatDateShort(w.date)}</Text>
                    <Text style={[styles.historyWeight, { color: colors.textPrimary }]}>
                      {w.weight.toFixed(1)} <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{w.unit}</Text>
                    </Text>
                    {!!w.note && <Text style={[styles.historyNote, { color: colors.textSecondary }]}>{w.note}</Text>}
                  </View>
                  <SoundPressable onPress={() => handleDelete(w.id)} hitSlop={10} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </SoundPressable>
                </View>
              ))
            )}
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>

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
              Recommended: 0.5-1 lb/week for loss, 0.25-0.5 lb/week for gain
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

function TrendStat({ label, delta, unit, colors }: { label: string; delta: number | null; unit: string; colors: any }) {
  const color =
    delta == null ? colors.textMuted : delta < 0 ? colors.gold : delta > 0 ? colors.textPrimary : colors.textSecondary;
  const sign = delta == null ? '' : delta > 0 ? '+' : '';
  const val = delta == null ? '—' : `${sign}${delta.toFixed(1)}`;
  return (
    <View style={styles.heroStat}>
      <Text style={[styles.heroStatLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.heroStatVal, { color }]}>{val}</Text>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroCenter: { alignItems: 'center', marginBottom: spacing.md },
  heroLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  heroNum: { fontSize: 56, fontWeight: '900', marginTop: 2, marginBottom: -4 },
  heroUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  heroSub: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2, marginTop: 6 },
  heroRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: spacing.md },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 2 },
  heroStatVal: { fontSize: 15, fontWeight: '800' },
  heroDivider: { width: 1, marginHorizontal: spacing.sm },

  chartWrap: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },

  form: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 15,
  },
  inputLarge: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  unitToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  historyLabel: { marginLeft: spacing.lg, marginTop: spacing.lg },
  historyRow: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  historyDate: { fontSize: 11, letterSpacing: 0.8, fontWeight: '700', marginBottom: 2 },
  historyWeight: { fontSize: 18, fontWeight: '800' },
  historyNote: { fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 6 },

  empty: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },

  // ── Goal card ──
  goalCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  goalLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  goalTarget: { fontSize: 16, fontWeight: '900' },
  goalBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  goalMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  goalMetaText: { fontSize: 11, fontWeight: '600' },

  // ── Chart range selector ──
  rangeRow: {
    flexDirection: 'row',
    gap: 2,
  },
  rangeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  rangeBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // ── Stats panel ──
  statsPanel: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statItem: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statItemValue: { fontSize: 16, fontWeight: '900' },
  statItemLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, marginTop: 2 },

  // ── DEXA card ──
  dexaCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  dexaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 4,
  },
  dexaStat: { alignItems: 'center' },
  dexaValue: { fontSize: 18, fontWeight: '900' },
  dexaLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, marginTop: 2 },
  dexaDate: { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 8 },

  // ── Set goal button ──
  setGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  setGoalText: { fontSize: 13, fontWeight: '700' },

  // ── Modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
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
  // ── Calendar ──
  calCard: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
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
  const startWeekday = monthStart.getDay(); // 0 = Sun

  // Build cells: leading blanks + day numbers
  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to multiple of 7
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
    <View style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
