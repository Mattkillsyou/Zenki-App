import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import { WeightUnit } from '../types/nutrition';
import { computeTrendWeight, trendChange, kgToLbs } from '../utils/nutrition';

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

  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [note, setNote] = useState('');

  const mine = user ? myWeights(user.id) : [];
  const latest = user ? latestWeight(user.id) : null;
  const displayUnit: WeightUnit = latest?.unit ?? 'lb';

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

  // Chart data — trend line (one point per day, smoothed)
  const chartData = useMemo(() => {
    if (trend.length < 2) return [];
    return trend.map((t, i) => ({
      x: i,
      y: toDisplay(t.trendKg),
      label: i === trend.length - 1 ? formatDateShort(t.date) : undefined,
    }));
  }, [trend, displayUnit]);

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
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
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

          {/* Chart */}
          {chartData.length >= 2 && (
            <FadeInView delay={60}>
              <View style={[styles.chartWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TREND (smoothed)</Text>
                <LineChart
                  data={chartData}
                  width={SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2}
                  height={160}
                  color={colors.gold}
                  lowerIsBetter
                  formatY={(v) => v.toFixed(0)}
                />
              </View>
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
                    <TouchableOpacity
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
                    </TouchableOpacity>
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

              <TouchableOpacity
                onPress={handleSave}
                activeOpacity={0.85}
                style={[styles.saveBtn, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="add-circle" size={18} color="#000" />
                <Text style={styles.saveBtnText}>Save weigh-in</Text>
              </TouchableOpacity>
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
                  <TouchableOpacity onPress={() => handleDelete(w.id)} hitSlop={10} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
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
});
