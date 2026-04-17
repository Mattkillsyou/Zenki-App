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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useGamification } from '../context/GamificationContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import { WORKOUT_FORMAT_LABEL, WodResult, WorkoutFormat } from '../types/workout';
import {
  EXERCISES,
  EXERCISES_BY_KEY,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  formatPRValue,
  estimate1RM,
} from '../data/exercises';

type Tab = 'log' | 'prs' | 'stats';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateShort(dateStr: string): string {
  if (dateStr === todayISO()) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function WorkoutScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { logWorkout, myLogs, hasMemberLoggedToday, myPRs, currentBest, prsForExercise } = useWorkouts();
  const { state: gamState } = useGamification();

  const [tab, setTab] = useState<Tab>('log');
  const userLogs = user ? myLogs(user.id) : [];
  const userPRs = user ? myPRs(user.id) : [];
  const loggedToday = user ? hasMemberLoggedToday(user.id) : false;

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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Training</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Tabs */}
          <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(
              [
                { key: 'log' as Tab,   label: 'Log',  icon: 'create-outline'   as const },
                { key: 'prs' as Tab,   label: 'PRs',  icon: 'trophy-outline'   as const },
                { key: 'stats' as Tab, label: 'Stats', icon: 'stats-chart-outline' as const },
              ]
            ).map((t) => {
              const active = tab === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.tab, active && { backgroundColor: colors.gold }]}
                  onPress={() => setTab(t.key)}
                >
                  <Ionicons name={t.icon} size={16} color={active ? '#000' : colors.textSecondary} />
                  <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textSecondary }]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>


          {tab === 'log' && (
            <LogTab
              user={user}
              logs={userLogs}
              loggedToday={loggedToday}
              onLog={logWorkout}
            />
          )}

          {tab === 'prs' && (
            <PRsTab
              user={user}
              navigation={navigation}
              currentBest={currentBest}
              prsForExercise={prsForExercise}
            />
          )}

          {tab === 'stats' && (
            <StatsTab
              logs={userLogs}
              prs={userPRs}
              streak={gamState.streak || 0}
              weekStreak={gamState.weekStreak || 0}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════
// LOG TAB — freeform workout journal
// ═════════════════════════════════════════════════════

function LogTab({
  user,
  logs,
  loggedToday,
  onLog,
}: {
  user: any;
  logs: ReturnType<ReturnType<typeof useWorkouts>['myLogs']>;
  loggedToday: boolean;
  onLog: ReturnType<typeof useWorkouts>['logWorkout'];
}) {
  const { colors } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<WorkoutFormat>('FOR_TIME');
  const [result, setResult] = useState('');
  const [rxOrScaled, setRxOrScaled] = useState<WodResult>('Rx');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (!user) return;
    if (!title.trim() || !result.trim()) {
      Alert.alert('Missing fields', 'Please enter a title and result.');
      return;
    }
    onLog({
      memberId: user.id,
      date: todayISO(),
      title: title.trim(),
      format,
      result: result.trim(),
      rxOrScaled,
      notes: notes.trim(),
    });
    setTitle('');
    setResult('');
    setRxOrScaled('Rx');
    setNotes('');
    setFormat('FOR_TIME');
    setShowForm(false);
    Alert.alert('Nice work', '+25 Diamonds earned. Your streak counts.');
  };

  return (
    <View>
      {/* Log button */}
      <FadeInView delay={0} slideUp={8}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: loggedToday ? colors.success : colors.red },
          ]}
          onPress={() => setShowForm((s) => !s)}
          activeOpacity={0.85}
        >
          <Ionicons
            name={showForm ? 'close' : loggedToday ? 'checkmark-circle' : 'add-circle'}
            size={20}
            color="#FFF"
          />
          <Text style={styles.primaryBtnText}>
            {showForm ? 'Cancel' : loggedToday ? 'Logged Today · Add Another' : 'Log a Workout'}
          </Text>
        </TouchableOpacity>
      </FadeInView>

      {showForm && (
        <FadeInView delay={0} slideUp={8}>
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. Fran, or Push Day"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={60}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>FORMAT</Text>
            <View style={styles.chipRow}>
              {(['AMRAP', 'EMOM', 'FOR_TIME', 'TABATA', 'CHIPPER', 'STRENGTH', 'OTHER'] as WorkoutFormat[]).map((f) => {
                const active = format === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setFormat(f)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: active ? '#000' : colors.textSecondary },
                      ]}
                    >
                      {WORKOUT_FORMAT_LABEL[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>RESULT</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="4:32 · or · 5 rounds + 12 reps"
              placeholderTextColor={colors.textMuted}
              value={result}
              onChangeText={setResult}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>SCALING</Text>
            <View style={styles.chipRow}>
              {(['Rx', 'Scaled'] as WodResult[]).map((opt) => {
                const active = rxOrScaled === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      styles.chip,
                      { flex: 1, alignItems: 'center',
                        backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setRxOrScaled(opt)}
                  >
                    <Text style={[styles.chipText, { color: active ? '#000' : colors.textSecondary }]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>NOTES</Text>
            <TextInput
              style={[
                styles.input,
                styles.multiline,
                { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
              ]}
              placeholder="How did it feel?"
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.gold }]}
              onPress={handleSave}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>
      )}

      {/* History */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.gold }]}>MY WORKOUTS</Text>
        {logs.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No workouts logged yet</Text>
          </View>
        ) : (
          logs.map((log) => (
            <View
              key={log.id}
              style={[styles.logRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={styles.logRowHeader}>
                <Text style={[styles.logTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {log.title}
                </Text>
                <View
                  style={[
                    styles.rxPill,
                    {
                      backgroundColor:
                        log.rxOrScaled === 'Rx' ? colors.gold : colors.surfaceSecondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.rxPillText,
                      { color: log.rxOrScaled === 'Rx' ? '#000' : colors.textSecondary },
                    ]}
                  >
                    {log.rxOrScaled}
                  </Text>
                </View>
              </View>
              <View style={styles.logRowMeta}>
                <Text style={[styles.logResult, { color: colors.gold }]}>{log.result}</Text>
                <Text style={[styles.logDate, { color: colors.textMuted }]}>
                  {formatDateShort(log.date)} · {WORKOUT_FORMAT_LABEL[log.format]}
                </Text>
              </View>
              {log.notes ? (
                <Text style={[styles.logNotes, { color: colors.textSecondary }]} numberOfLines={2}>
                  {log.notes}
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// PRs TAB — list of exercises with current best, tap for detail
// ═════════════════════════════════════════════════════

function PRsTab({
  user,
  navigation,
  currentBest,
  prsForExercise,
}: {
  user: any;
  navigation: any;
  currentBest: ReturnType<typeof useWorkouts>['currentBest'];
  prsForExercise: ReturnType<typeof useWorkouts>['prsForExercise'];
}) {
  const { colors } = useTheme();

  return (
    <View>
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.gold }]}>PERSONAL RECORDS</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          Tap any lift to view your progression and add a new PR.
        </Text>

        {CATEGORY_ORDER.map((cat) => {
          const exercisesInCat = EXERCISES.filter((e) => e.category === cat);
          return (
            <View key={cat} style={styles.categoryBlock}>
              <Text style={[styles.categoryLabel, { color: colors.textSecondary }]}>
                {CATEGORY_LABEL[cat].toUpperCase()}
              </Text>
              {exercisesInCat.map((ex) => {
                const best = user ? currentBest(user.id, ex.key) : null;
                const history = user ? prsForExercise(user.id, ex.key) : [];
                const entries = history.length;
                return (
                  <TouchableOpacity
                    key={ex.key}
                    style={[styles.prRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => navigation.navigate('PRDetail', { exerciseKey: ex.key })}
                    activeOpacity={0.8}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prRowTitle, { color: colors.textPrimary }]}>{ex.name}</Text>
                      <Text style={[styles.prRowMeta, { color: colors.textMuted }]}>
                        {entries === 0
                          ? 'No PR yet — tap to add'
                          : `${entries} entr${entries === 1 ? 'y' : 'ies'}`}
                      </Text>
                    </View>
                    {best ? (
                      <Text style={[styles.prRowBest, { color: colors.gold }]}>
                        {formatPRValue(best.value, ex.unit)}
                      </Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// STATS TAB — overall training summary
// ═════════════════════════════════════════════════════

function StatsTab({
  logs,
  prs,
  streak,
  weekStreak,
}: {
  logs: ReturnType<ReturnType<typeof useWorkouts>['myLogs']>;
  prs: ReturnType<ReturnType<typeof useWorkouts>['myPRs']>;
  streak: number;
  weekStreak: number;
}) {
  const { colors } = useTheme();

  const stats = useMemo(() => {
    const thisWeekStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d.toISOString().split('T')[0];
    })();
    const thisMonthPrefix = new Date().toISOString().slice(0, 7);

    const thisWeek = logs.filter((l) => l.date >= thisWeekStart).length;
    const thisMonth = logs.filter((l) => l.date.startsWith(thisMonthPrefix)).length;
    const rxCount = logs.filter((l) => l.rxOrScaled === 'Rx').length;
    const rxPct = logs.length > 0 ? Math.round((rxCount / logs.length) * 100) : 0;

    // Top 3 heaviest strength PRs
    const strengthPRs = prs
      .map((p) => ({ pr: p, ex: EXERCISES_BY_KEY[p.exerciseKey] }))
      .filter((e) => e.ex && e.ex.unit === 'lbs')
      .sort((a, b) => b.pr.value - a.pr.value)
      .slice(0, 3);

    return { thisWeek, thisMonth, rxCount, rxPct, strengthPRs };
  }, [logs, prs]);

  return (
    <View>
      <View style={styles.statsGrid}>
        <StatTile
          icon="calendar"
          label="This Week"
          value={stats.thisWeek}
          color={colors.gold}
        />
        <StatTile
          icon="calendar-outline"
          label="This Month"
          value={stats.thisMonth}
          color={colors.info}
        />
        <StatTile
          icon="flame"
          label="Day Streak"
          value={streak}
          color="#FF6B35"
        />
        <StatTile
          icon="calendar-number"
          label="Week Streak"
          value={weekStreak}
          color={colors.success}
        />
        <StatTile
          icon="barbell"
          label="Total Logs"
          value={logs.length}
          color={colors.textPrimary}
        />
        <StatTile
          icon="ribbon"
          label="Rx %"
          value={`${stats.rxPct}%`}
          color={colors.gold}
        />
      </View>

      {stats.strengthPRs.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.gold }]}>TOP STRENGTH PRs</Text>
          {stats.strengthPRs.map(({ pr, ex }, i) => (
            <View
              key={pr.id}
              style={[styles.podiumRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Text style={[styles.podiumRank, { color: colors.gold }]}>#{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.podiumName, { color: colors.textPrimary }]}>{ex.name}</Text>
                <Text style={[styles.podiumMeta, { color: colors.textMuted }]}>
                  {pr.reps ? `${pr.reps}-rep max · est. 1RM ${estimate1RM(pr.value, pr.reps)} lb` : 'single'}
                </Text>
              </View>
              <Text style={[styles.podiumValue, { color: colors.textPrimary }]}>
                {formatPRValue(pr.value, ex.unit)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatTile({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.statNum, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label}</Text>
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
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 4,
    gap: 4,
  },
  toolsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  toolTile: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  toolTitle: { fontSize: 14, fontWeight: '800' },
  toolSub: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: 12,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },

  formCard: {
    marginHorizontal: spacing.lg,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '800' },
  saveBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },

  section: { paddingHorizontal: spacing.lg, marginTop: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  sectionHint: { fontSize: 12, marginBottom: 12, fontStyle: 'italic' },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: 32,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  emptyText: { fontSize: 13, fontWeight: '500' },

  logRow: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
    gap: 6,
  },
  logRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logTitle: { flex: 1, fontSize: 14, fontWeight: '700', textAlign: 'left' },
  rxPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  rxPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  logRowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logResult: { fontSize: 16, fontWeight: '900' },
  logDate: { fontSize: 11, fontWeight: '600' },
  logNotes: { fontSize: 12, fontStyle: 'italic', textAlign: 'left' },

  categoryBlock: { marginBottom: 12 },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 12,
    marginBottom: 6,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  prRowTitle: { fontSize: 14, fontWeight: '700', textAlign: 'left' },
  prRowMeta: { fontSize: 11, fontWeight: '500', marginTop: 2, textAlign: 'left' },
  prRowBest: { fontSize: 16, fontWeight: '900' },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  statTile: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  statNum: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },

  podiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  podiumRank: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  podiumName: { fontSize: 14, fontWeight: '700', textAlign: 'left' },
  podiumMeta: { fontSize: 11, fontWeight: '500', marginTop: 2, textAlign: 'left' },
  podiumValue: { fontSize: 16, fontWeight: '900' },
});
