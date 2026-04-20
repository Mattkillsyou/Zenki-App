import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Switch, RefreshControl, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCycleTracker } from '../context/CycleTrackerContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import {
  CycleSymptom, FlowIntensity, SYMPTOM_LABELS, SYMPTOM_ICONS,
  PHASE_LABELS, PHASE_COLORS, PHASE_ICONS, PHASE_RECOMMENDATIONS,
  CyclePhase, PeriodEntry, CycleInfo,
} from '../types/cycle';

type Tab = 'track' | 'calendar' | 'insights';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function CycleTrackerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    memberEntries, memberCycleInfo, logPeriodStart, logPeriodEnd,
    updateEntry, removeEntry, settings, setShowOnDashboard,
  } = useCycleTracker();

  const [tab, setTab] = useState<Tab>('track');
  const [startDate, setStartDate] = useState(todayISO());
  const [flow, setFlow] = useState<FlowIntensity>('medium');
  const [symptoms, setSymptoms] = useState<CycleSymptom[]>([]);
  const [notes, setNotes] = useState('');

  const entries = user ? memberEntries(user.id) : [];
  const cycleInfo = user ? memberCycleInfo(user.id) : null;

  // Current period (ongoing = no endDate)
  const currentPeriod = entries.find((e) => !e.endDate);

  const toggleSymptom = (s: CycleSymptom) => {
    setSymptoms((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handleLogPeriod = () => {
    if (!user) return;
    logPeriodStart({
      memberId: user.id,
      startDate,
      flowIntensity: flow,
      symptoms,
      notes: notes.trim() || undefined,
    });
    setNotes('');
    setSymptoms([]);
    Alert.alert('Period Logged', 'Your period has been recorded.');
  };

  const handleEndPeriod = () => {
    if (!currentPeriod) return;
    logPeriodEnd(currentPeriod.id, todayISO());
    Alert.alert('Period Ended', 'End date recorded.');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Cycle Tracker</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {([
          { key: 'track' as Tab, label: 'Track', icon: 'heart-outline' as const },
          { key: 'calendar' as Tab, label: 'Calendar', icon: 'calendar-outline' as const },
          { key: 'insights' as Tab, label: 'Insights', icon: 'bulb-outline' as const },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={16} color={active ? '#000' : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textMuted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={64}
      >
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* ── TRACK TAB ── */}
        {tab === 'track' && (
          <>
            {/* Current phase hero */}
            {cycleInfo && (
              <FadeInView>
                <View style={[styles.phaseHero, { backgroundColor: colors.surface, borderColor: PHASE_COLORS[cycleInfo.currentPhase] + '40' }]}>
                  <Text style={{ fontSize: 40 }}>{PHASE_ICONS[cycleInfo.currentPhase]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.phaseHeroTitle, { color: colors.textPrimary }]}>
                      {PHASE_LABELS[cycleInfo.currentPhase]} Phase
                    </Text>
                    <Text style={[styles.phaseHeroSub, { color: colors.textSecondary }]}>
                      Day {cycleInfo.cycleDay} of ~{cycleInfo.avgCycleLength} day cycle
                    </Text>
                    <Text style={[styles.phaseHeroPrediction, { color: PHASE_COLORS[cycleInfo.currentPhase] }]}>
                      {cycleInfo.isOnPeriod
                        ? 'Currently menstruating'
                        : `Next period in ~${cycleInfo.daysUntilNextPeriod} days`}
                    </Text>
                  </View>
                </View>
              </FadeInView>
            )}

            {/* End current period button */}
            {currentPeriod && (
              <FadeInView delay={40}>
                <TouchableOpacity
                  style={[styles.endPeriodBtn, { backgroundColor: PHASE_COLORS.menstrual + '20', borderColor: PHASE_COLORS.menstrual }]}
                  onPress={handleEndPeriod}
                >
                  <Ionicons name="checkmark-circle" size={20} color={PHASE_COLORS.menstrual} />
                  <Text style={[styles.endPeriodText, { color: PHASE_COLORS.menstrual }]}>End Current Period</Text>
                </TouchableOpacity>
              </FadeInView>
            )}

            {/* Log new period */}
            <FadeInView delay={80}>
              <View style={[styles.logCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOG PERIOD</Text>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Start Date</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary, borderColor: colors.border }]}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Flow Intensity</Text>
                <View style={styles.flowRow}>
                  {(['light', 'medium', 'heavy'] as FlowIntensity[]).map((f) => {
                    const active = flow === f;
                    const flowColors = { light: '#FFB6C1', medium: '#E63946', heavy: '#9B1520' };
                    return (
                      <TouchableOpacity
                        key={f}
                        style={[styles.flowChip, {
                          backgroundColor: active ? flowColors[f] : colors.surfaceSecondary,
                          borderColor: active ? flowColors[f] : colors.border,
                        }]}
                        onPress={() => setFlow(f)}
                      >
                        <Text style={[styles.flowChipText, { color: active ? '#FFF' : colors.textSecondary }]}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Symptoms</Text>
                <View style={styles.symptomGrid}>
                  {(Object.keys(SYMPTOM_LABELS) as CycleSymptom[]).map((s) => {
                    const active = symptoms.includes(s);
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.symptomChip, {
                          backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                          borderColor: active ? colors.gold : colors.border,
                        }]}
                        onPress={() => toggleSymptom(s)}
                      >
                        <Text style={{ fontSize: 14 }}>{SYMPTOM_ICONS[s]}</Text>
                        <Text style={[styles.symptomText, { color: active ? '#000' : colors.textSecondary }]}>
                          {SYMPTOM_LABELS[s]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 12 }]}>Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary, borderColor: colors.border }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="How are you feeling?"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  maxLength={200}
                />

                <TouchableOpacity
                  style={[styles.logBtn, { backgroundColor: PHASE_COLORS.menstrual }]}
                  onPress={handleLogPeriod}
                >
                  <Ionicons name="add-circle" size={18} color="#FFF" />
                  <Text style={styles.logBtnText}>Log Period</Text>
                </TouchableOpacity>
              </View>
            </FadeInView>

            {/* History */}
            <FadeInView delay={120}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 16 }]}>HISTORY</Text>
              {entries.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 32 }}>🩸</Text>
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No periods logged</Text>
                  <Text style={[styles.emptySub, { color: colors.textMuted }]}>Log your first period above to start tracking your cycle.</Text>
                </View>
              ) : (
                entries.slice(0, 10).map((entry) => (
                  <View key={entry.id} style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.historyDate, { color: colors.textPrimary }]}>
                        {new Date(entry.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {entry.endDate ? ` · ${new Date(entry.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ' (ongoing)'}
                      </Text>
                      <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                        {entry.flowIntensity} flow · {entry.symptoms.length} symptom{entry.symptoms.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Delete?', 'Remove this entry?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => removeEntry(entry.id) },
                      ])}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </FadeInView>
          </>
        )}

        {/* ── CALENDAR TAB ── */}
        {tab === 'calendar' && (
          <FadeInView>
            <CycleCalendar entries={entries} cycleInfo={cycleInfo} />
          </FadeInView>
        )}

        {/* ── INSIGHTS TAB ── */}
        {tab === 'insights' && (
          <>
            {cycleInfo && (
              <FadeInView>
                {/* Phase-specific recommendations */}
                {(['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]).map((phase) => {
                  const rec = PHASE_RECOMMENDATIONS[phase];
                  const isCurrent = cycleInfo.currentPhase === phase;
                  return (
                    <View
                      key={phase}
                      style={[
                        styles.insightCard,
                        {
                          backgroundColor: colors.surface,
                          borderColor: isCurrent ? PHASE_COLORS[phase] + '60' : colors.border,
                          borderWidth: isCurrent ? 2 : 1,
                        },
                      ]}
                    >
                      <View style={styles.insightHeader}>
                        <Text style={{ fontSize: 22 }}>{PHASE_ICONS[phase]}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.insightPhase, { color: PHASE_COLORS[phase] }]}>
                            {PHASE_LABELS[phase]} Phase
                            {isCurrent ? ' (Current)' : ''}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.insightBody}>
                        <Text style={[styles.insightLabel, { color: colors.textMuted }]}>ENERGY</Text>
                        <Text style={[styles.insightText, { color: colors.textSecondary }]}>{rec.energy}</Text>
                        <Text style={[styles.insightLabel, { color: colors.textMuted, marginTop: 8 }]}>NUTRITION</Text>
                        <Text style={[styles.insightText, { color: colors.textSecondary }]}>{rec.nutrition}</Text>
                        <Text style={[styles.insightLabel, { color: colors.textMuted, marginTop: 8 }]}>TRAINING</Text>
                        <Text style={[styles.insightText, { color: colors.textSecondary }]}>{rec.training}</Text>
                        {rec.calorieAdjustment > 0 && (
                          <View style={[styles.calAdjust, { backgroundColor: colors.warningMuted }]}>
                            <Ionicons name="flame" size={14} color={colors.warning} />
                            <Text style={[styles.calAdjustText, { color: colors.warning }]}>
                              +{rec.calorieAdjustment} kcal/day metabolic increase
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </FadeInView>
            )}

            {/* Settings */}
            <FadeInView delay={60}>
              <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PRIVACY</Text>
                <View style={styles.settingsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>Show on Dashboard</Text>
                    <Text style={[styles.settingsSub, { color: colors.textMuted }]}>Display cycle phase pill on home screen</Text>
                  </View>
                  <Switch
                    value={settings.showOnDashboard}
                    onValueChange={setShowOnDashboard}
                    trackColor={{ false: colors.surfaceSecondary, true: colors.gold }}
                    thumbColor={colors.background}
                  />
                </View>
              </View>
            </FadeInView>

            {!cycleInfo && (
              <View style={styles.emptyCard}>
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No cycle data yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Log your first period in the Track tab to see insights.</Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ─── Cycle Calendar View ─────────────────────────────────────────────────── */

function CycleCalendar({ entries, cycleInfo }: { entries: PeriodEntry[]; cycleInfo: CycleInfo | null }) {
  const { colors } = useTheme();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const calendarData = useMemo(() => {
    const { year, month: m } = month;
    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const monthLabel = new Date(year, m).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Build set of period days + predicted days
    const periodDays = new Set<number>();
    const predictedDays = new Set<number>();

    for (const entry of entries) {
      const start = new Date(entry.startDate);
      const end = entry.endDate ? new Date(entry.endDate) : new Date(start.getTime() + 5 * 86400000);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getFullYear() === year && d.getMonth() === m) {
          periodDays.add(d.getDate());
        }
      }
    }

    // Add predicted next period
    if (cycleInfo) {
      const predicted = new Date(cycleInfo.predictedNextPeriod);
      for (let i = 0; i < 5; i++) {
        const d = new Date(predicted);
        d.setDate(d.getDate() + i);
        if (d.getFullYear() === year && d.getMonth() === m) {
          predictedDays.add(d.getDate());
        }
      }
    }

    return { firstDay, daysInMonth, monthLabel, periodDays, predictedDays };
  }, [month, entries, cycleInfo]);

  return (
    <View style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.calNav}>
        <TouchableOpacity onPress={() => setMonth((p) => {
          const d = new Date(p.year, p.month - 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.calTitle, { color: colors.textPrimary }]}>{calendarData.monthLabel}</Text>
        <TouchableOpacity onPress={() => setMonth((p) => {
          const d = new Date(p.year, p.month + 1, 1);
          return { year: d.getFullYear(), month: d.getMonth() };
        })}>
          <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.calWeekRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} style={[styles.calWeekDay, { color: colors.textMuted }]}>{d}</Text>
        ))}
      </View>

      <View style={styles.calGrid}>
        {Array.from({ length: calendarData.firstDay }).map((_, i) => (
          <View key={`e-${i}`} style={styles.calCell} />
        ))}
        {Array.from({ length: calendarData.daysInMonth }).map((_, i) => {
          const day = i + 1;
          const isPeriod = calendarData.periodDays.has(day);
          const isPredicted = calendarData.predictedDays.has(day);
          const isToday = (() => {
            const now = new Date();
            return now.getFullYear() === month.year && now.getMonth() === month.month && now.getDate() === day;
          })();

          return (
            <View key={day} style={[styles.calCell]}>
              <View style={[
                styles.calDayCircle,
                isPeriod && { backgroundColor: PHASE_COLORS.menstrual },
                isPredicted && !isPeriod && { backgroundColor: PHASE_COLORS.menstrual + '30', borderWidth: 1, borderColor: PHASE_COLORS.menstrual + '60', borderStyle: 'dashed' as any },
                isToday && !isPeriod && !isPredicted && { borderWidth: 2, borderColor: colors.gold },
              ]}>
                <Text style={[
                  styles.calDayText,
                  { color: isPeriod ? '#FFF' : isToday ? colors.gold : colors.textPrimary },
                ]}>
                  {day}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.calLegend}>
        <View style={styles.calLegendItem}>
          <View style={[styles.calLegendDot, { backgroundColor: PHASE_COLORS.menstrual }]} />
          <Text style={[styles.calLegendText, { color: colors.textMuted }]}>Period</Text>
        </View>
        <View style={styles.calLegendItem}>
          <View style={[styles.calLegendDot, { backgroundColor: PHASE_COLORS.menstrual + '30', borderWidth: 1, borderColor: PHASE_COLORS.menstrual }]} />
          <Text style={[styles.calLegendText, { color: colors.textMuted }]}>Predicted</Text>
        </View>
      </View>
    </View>
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
  tabBar: {
    flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: 14,
    borderWidth: 1, padding: 3, gap: 3, marginBottom: spacing.md,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 11, gap: 4,
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  scroll: { paddingHorizontal: spacing.lg },

  // Phase hero
  phaseHero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 18, borderRadius: 18, borderWidth: 1.5, marginBottom: 12,
  },
  phaseHeroTitle: { fontSize: 18, fontWeight: '800' },
  phaseHeroSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  phaseHeroPrediction: { fontSize: 12, fontWeight: '700', marginTop: 4 },

  // End period
  endPeriodBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  endPeriodText: { fontSize: 14, fontWeight: '700' },

  // Log card
  logCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  notesInput: { minHeight: 60, textAlignVertical: 'top' },

  // Flow
  flowRow: { flexDirection: 'row', gap: 8 },
  flowChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  flowChipText: { fontSize: 13, fontWeight: '700' },

  // Symptoms
  symptomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  symptomChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1,
  },
  symptomText: { fontSize: 11, fontWeight: '600' },

  // Log button
  logBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12, marginTop: 16,
  },
  logBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },

  // History
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 16 },
  historyCard: {
    flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  historyDate: { fontSize: 14, fontWeight: '700' },
  historyMeta: { fontSize: 11, marginTop: 2 },

  // Calendar
  calCard: { padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  calNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calTitle: { fontSize: 15, fontWeight: '800' },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calDayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  calDayText: { fontSize: 12, fontWeight: '600' },
  calLegend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 8 },
  calLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  calLegendDot: { width: 10, height: 10, borderRadius: 5 },
  calLegendText: { fontSize: 10, fontWeight: '600' },

  // Insights
  insightCard: { padding: 14, borderRadius: 14, marginBottom: 10 },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  insightPhase: { fontSize: 15, fontWeight: '800' },
  insightBody: {},
  insightLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  insightText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  calAdjust: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginTop: 10,
  },
  calAdjustText: { fontSize: 11, fontWeight: '700' },

  // Settings
  settingsCard: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsLabel: { fontSize: 14, fontWeight: '600' },
  settingsSub: { fontSize: 11, marginTop: 2 },
});
