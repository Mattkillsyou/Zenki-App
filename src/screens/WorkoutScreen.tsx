import React, { useState } from 'react';
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
import { typography, spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import { WOD_FORMAT_LABEL, WodResult } from '../types/workout';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  if (dateStr === todayISO()) return 'Today';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
}

export function WorkoutScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { todaysWOD, logWorkout, myLogs, hasMemberLoggedToday } = useWorkouts();

  const [showForm, setShowForm] = useState(false);
  const [result, setResult] = useState('');
  const [rxOrScaled, setRxOrScaled] = useState<WodResult>('Rx');
  const [notes, setNotes] = useState('');

  const userLogs = user ? myLogs(user.id) : [];
  const loggedToday = user ? hasMemberLoggedToday(user.id) : false;

  const handleLog = () => {
    if (!user) return;
    if (!result.trim()) {
      Alert.alert('Missing result', 'Please enter your result (time, rounds, or reps).');
      return;
    }
    logWorkout({
      memberId: user.id,
      wodId: todaysWOD?.id,
      date: todayISO(),
      title: todaysWOD?.title ?? 'Freestyle Workout',
      format: todaysWOD?.format ?? 'OTHER',
      result: result.trim(),
      rxOrScaled,
      notes: notes.trim(),
    });
    setResult('');
    setRxOrScaled('Rx');
    setNotes('');
    setShowForm(false);
    Alert.alert('Nice work', '+25 Diamonds earned. Your streak counts.');
  };

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
            <Text style={[styles.title, { color: colors.textPrimary }]}>Workout</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Today's WOD */}
          <FadeInView delay={0} slideUp={10}>
            <View style={[styles.wodCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
              <View style={styles.wodCardTopRow}>
                <View>
                  <Text style={[styles.wodKicker, { color: colors.gold }]}>WORKOUT OF THE DAY</Text>
                  <Text style={[styles.wodTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                    {todaysWOD?.title ?? 'No WOD yet today'}
                  </Text>
                </View>
                {todaysWOD && (
                  <View style={[styles.formatChip, { backgroundColor: colors.goldMuted }]}>
                    <Text style={[styles.formatChipText, { color: colors.gold }]}>
                      {WOD_FORMAT_LABEL[todaysWOD.format]}
                    </Text>
                  </View>
                )}
              </View>

              {todaysWOD ? (
                <>
                  <Text style={[styles.wodDescription, { color: colors.textSecondary }]}>
                    {todaysWOD.description}
                  </Text>
                  {todaysWOD.timeCapMinutes ? (
                    <View style={styles.inlineRow}>
                      <Ionicons name="stopwatch-outline" size={14} color={colors.gold} />
                      <Text style={[styles.inlineMeta, { color: colors.textMuted }]}>
                        Time cap: {todaysWOD.timeCapMinutes} min
                      </Text>
                    </View>
                  ) : null}
                  {todaysWOD.coachingNotes ? (
                    <View style={[styles.coachNote, { backgroundColor: colors.backgroundSubtle }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.gold} />
                      <Text style={[styles.coachNoteText, { color: colors.textSecondary }]}>
                        {todaysWOD.coachingNotes}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={[styles.wodEmptyHint, { color: colors.textMuted }]}>
                  Your coach hasn't posted a workout for today. You can still log your own.
                </Text>
              )}
            </View>
          </FadeInView>

          {/* Log a workout button */}
          {!loggedToday && (
            <FadeInView delay={60} slideUp={8}>
              <TouchableOpacity
                style={[styles.logBtn, { backgroundColor: colors.red }]}
                onPress={() => setShowForm((s) => !s)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={showForm ? 'close' : 'add-circle'}
                  size={20}
                  color="#FFF"
                />
                <Text style={styles.logBtnText}>
                  {showForm ? 'Cancel' : todaysWOD ? 'Log This Workout' : 'Log My Workout'}
                </Text>
              </TouchableOpacity>
            </FadeInView>
          )}
          {loggedToday && (
            <View style={[styles.loggedBanner, { backgroundColor: colors.successMuted, borderColor: colors.success }]}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text style={[styles.loggedBannerText, { color: colors.success }]}>
                Logged for today — nice work.
              </Text>
            </View>
          )}

          {/* Log form */}
          {showForm && (
            <FadeInView delay={0} slideUp={8}>
              <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>RESULT</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="4:32 · or · 5 rounds + 12 reps"
                  placeholderTextColor={colors.textMuted}
                  value={result}
                  onChangeText={setResult}
                  autoFocus
                />

                <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: 12 }]}>SCALING</Text>
                <View style={styles.scalingRow}>
                  {(['Rx', 'Scaled'] as WodResult[]).map((opt) => {
                    const active = rxOrScaled === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.scalingChip,
                          {
                            backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                            borderColor: active ? colors.gold : colors.border,
                          },
                        ]}
                        onPress={() => setRxOrScaled(opt)}
                      >
                        <Text
                          style={[
                            styles.scalingChipText,
                            { color: active ? '#000' : colors.textSecondary },
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.formLabel, { color: colors.textSecondary, marginTop: 12 }]}>NOTES</Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.notesInput,
                    { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
                  ]}
                  placeholder="How did it feel? Weights used?"
                  placeholderTextColor={colors.textMuted}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={200}
                />

                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: colors.gold }]}
                  onPress={handleLog}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveBtnText}>Save Result</Text>
                </TouchableOpacity>
              </View>
            </FadeInView>
          )}

          {/* History */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>MY HISTORY</Text>
            {userLogs.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="barbell-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No workouts logged yet</Text>
              </View>
            ) : (
              userLogs.map((log) => (
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
                          backgroundColor: log.rxOrScaled === 'Rx' ? colors.gold : colors.surfaceSecondary,
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
                      {formatDateLabel(log.date)}
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
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },

  wodCard: {
    marginHorizontal: spacing.lg,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 12,
  },
  wodCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  wodKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  wodTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 4, maxWidth: 220 },
  formatChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  formatChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  wodDescription: { fontSize: 15, lineHeight: 22 },
  wodEmptyHint: { fontSize: 14, fontStyle: 'italic' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineMeta: { fontSize: 12, fontWeight: '600' },
  coachNote: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
  },
  coachNoteText: { flex: 1, fontSize: 13, lineHeight: 18 },

  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 14,
  },
  logBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  loggedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 16,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  loggedBannerText: { fontSize: 14, fontWeight: '700' },

  formCard: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  formLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  scalingRow: { flexDirection: 'row', gap: 8 },
  scalingChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  scalingChipText: { fontSize: 13, fontWeight: '800' },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  section: { paddingHorizontal: spacing.lg, marginTop: 24 },
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
  logDate: { fontSize: 12, fontWeight: '600' },
  logNotes: { fontSize: 12, fontStyle: 'italic', textAlign: 'left' },
});
