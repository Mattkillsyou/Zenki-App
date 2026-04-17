import React, { useMemo, useState } from 'react';
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
import { useWorkouts } from '../context/WorkoutContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import {
  EXERCISES_BY_KEY,
  formatPRValue,
  parsePRValue,
  estimate1RM,
} from '../data/exercises';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PRDetailScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { prsForExercise, currentBest, addPR, removePR } = useWorkouts();

  const exerciseKey: string = route?.params?.exerciseKey;
  const exercise = EXERCISES_BY_KEY[exerciseKey];

  const [showForm, setShowForm] = useState(false);
  const [valueInput, setValueInput] = useState('');
  const [repsInput, setRepsInput] = useState('');
  const [dateInput, setDateInput] = useState(todayISO());
  const [notesInput, setNotesInput] = useState('');

  const history = useMemo(
    () => (user ? prsForExercise(user.id, exerciseKey) : []),
    [user, prsForExercise, exerciseKey],
  );

  const best = useMemo(
    () => (user ? currentBest(user.id, exerciseKey) : null),
    [user, currentBest, exerciseKey],
  );

  if (!exercise) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <Text style={{ color: colors.textMuted }}>Exercise not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={{ color: colors.gold, marginTop: 12 }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const chartData = history.map((p) => ({
    x: new Date(p.date).getTime(),
    y: p.value,
    label: formatShortDate(p.date),
  }));

  // Only label first + last in chart; pass array as-is
  const chartPoints = chartData.map((pt, i) => ({
    ...pt,
    label: i === 0 || i === chartData.length - 1 ? pt.label : undefined,
  }));

  const handleSave = () => {
    if (!user) return;
    const value = parsePRValue(valueInput, exercise.unit);
    if (value === null || value <= 0) {
      const hint = exercise.unit === 'time' ? 'Use mm:ss or h:mm:ss' : 'Enter a positive number';
      Alert.alert('Invalid value', hint);
      return;
    }
    const reps = repsInput.trim() ? parseInt(repsInput.trim(), 10) : undefined;
    if (reps !== undefined && (Number.isNaN(reps) || reps <= 0)) {
      Alert.alert('Invalid reps', 'Reps must be a positive number (or leave blank for a single).');
      return;
    }
    addPR({
      memberId: user.id,
      exerciseKey,
      value,
      reps,
      date: dateInput,
      notes: notesInput.trim() || undefined,
    });
    setValueInput('');
    setRepsInput('');
    setNotesInput('');
    setDateInput(todayISO());
    setShowForm(false);
    Alert.alert('New PR logged', '+50 Diamonds earned.');
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete PR', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removePR(id) },
    ]);
  };

  const trendText = (() => {
    if (chartData.length < 2) return null;
    const diff = chartData[chartData.length - 1].y - chartData[0].y;
    const improved = exercise.lowerIsBetter ? diff < 0 : diff > 0;
    const absDiff = Math.abs(diff);
    if (absDiff === 0) return 'No change';
    const sign = improved ? '↑' : '↓';
    return `${sign} ${exercise.unit === 'lbs' ? `${absDiff.toFixed(0)} lb` : formatPRValue(absDiff, exercise.unit)} ${improved ? 'improved' : 'regressed'}`;
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
              {exercise.name}
            </Text>
            <View style={styles.backBtn} />
          </View>

          {/* Hero: current best + trend */}
          <FadeInView delay={0} slideUp={8}>
            <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
              <Text style={[styles.heroLabel, { color: colors.gold }]}>CURRENT BEST</Text>
              <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
                {best ? formatPRValue(best.value, exercise.unit) : '—'}
              </Text>
              {best?.reps && best.reps > 1 && exercise.unit === 'lbs' ? (
                <Text style={[styles.heroMeta, { color: colors.textMuted }]}>
                  {best.reps}-rep max · est. 1RM {estimate1RM(best.value, best.reps)} lb
                </Text>
              ) : null}
              {trendText && (
                <Text style={[styles.heroTrend, { color: colors.textSecondary }]}>
                  {trendText} over {chartData.length} entries
                </Text>
              )}
            </View>
          </FadeInView>

          {/* Chart */}
          {chartData.length > 0 && (
            <FadeInView delay={80} slideUp={8}>
              <View style={[styles.chartCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.chartHeader, { color: colors.textSecondary }]}>PROGRESSION</Text>
                <LineChart
                  data={chartPoints}
                  width={SCREEN_WIDTH - spacing.lg * 2 - 24}
                  height={180}
                  color={colors.gold}
                  lowerIsBetter={exercise.lowerIsBetter}
                  formatY={(v) => formatPRValue(v, exercise.unit)}
                />
              </View>
            </FadeInView>
          )}

          {/* Add PR button */}
          <FadeInView delay={140} slideUp={8}>
            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: showForm ? colors.surfaceSecondary : colors.red },
              ]}
              onPress={() => setShowForm((s) => !s)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={showForm ? 'close' : 'add-circle'}
                size={20}
                color={showForm ? colors.textPrimary : '#FFF'}
              />
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: showForm ? colors.textPrimary : '#FFF' },
                ]}
              >
                {showForm ? 'Cancel' : 'Add a PR'}
              </Text>
            </TouchableOpacity>
          </FadeInView>

          {showForm && (
            <FadeInView delay={0} slideUp={8}>
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  {exercise.unit === 'lbs' ? 'WEIGHT (lb)' : exercise.unit === 'time' ? 'TIME (mm:ss)' : 'REPS'}
                </Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder={exercise.unit === 'time' ? '3:42' : '225'}
                  placeholderTextColor={colors.textMuted}
                  value={valueInput}
                  onChangeText={setValueInput}
                  keyboardType={exercise.unit === 'time' ? 'default' : 'numeric'}
                  autoFocus
                />

                {exercise.unit === 'lbs' && (
                  <>
                    <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>
                      REPS (optional, for non-1RM)
                    </Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                      placeholder="3 · for 3-rep max"
                      placeholderTextColor={colors.textMuted}
                      value={repsInput}
                      onChangeText={setRepsInput}
                      keyboardType="numeric"
                    />
                  </>
                )}

                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>DATE</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  value={dateInput}
                  onChangeText={setDateInput}
                  autoCapitalize="none"
                />

                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>NOTES (optional)</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.multiline,
                    { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
                  ]}
                  placeholder="Felt strong, bar speed was fast, etc."
                  placeholderTextColor={colors.textMuted}
                  value={notesInput}
                  onChangeText={setNotesInput}
                  multiline
                  maxLength={200}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.gold }]}
                  onPress={handleSave}
                >
                  <Text style={styles.saveBtnText}>Save PR</Text>
                </TouchableOpacity>
              </View>
            </FadeInView>
          )}

          {/* History */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>HISTORY</Text>
            {history.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="trophy-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No PRs yet. Log your first one above.
                </Text>
              </View>
            ) : (
              [...history].reverse().map((pr, i) => (
                <View
                  key={pr.id}
                  style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyValue, { color: colors.textPrimary }]}>
                      {formatPRValue(pr.value, exercise.unit)}
                      {pr.reps && pr.reps > 1 ? ` × ${pr.reps}` : ''}
                    </Text>
                    <Text style={[styles.historyDate, { color: colors.textMuted }]}>
                      {formatShortDate(pr.date)}
                      {pr.reps && pr.reps > 1 && exercise.unit === 'lbs'
                        ? ` · est. ${estimate1RM(pr.value, pr.reps)} lb 1RM`
                        : ''}
                    </Text>
                    {pr.notes ? (
                      <Text style={[styles.historyNotes, { color: colors.textSecondary }]} numberOfLines={1}>
                        {pr.notes}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDelete(pr.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  title: { flex: 1, fontSize: 22, fontWeight: '900', letterSpacing: -0.3, textAlign: 'center' },

  heroCard: {
    marginHorizontal: spacing.lg,
    padding: 24,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  heroValue: { fontSize: 44, fontWeight: '900', letterSpacing: -1, marginVertical: 6 },
  heroMeta: { fontSize: 12, fontWeight: '600' },
  heroTrend: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  chartCard: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  chartHeader: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, marginLeft: 4 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 12,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },

  formCard: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  saveBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },

  section: { paddingHorizontal: spacing.lg, marginTop: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  historyValue: { fontSize: 15, fontWeight: '800', textAlign: 'left' },
  historyDate: { fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'left' },
  historyNotes: { fontSize: 12, fontStyle: 'italic', marginTop: 2, textAlign: 'left' },
});
