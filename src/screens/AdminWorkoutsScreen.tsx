import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useWorkouts } from '../context/WorkoutContext';
import { spacing, borderRadius } from '../theme';
import { WOD_FORMAT_LABEL, WODFormat } from '../types/workout';

const FORMATS: WODFormat[] = ['AMRAP', 'EMOM', 'FOR_TIME', 'TABATA', 'CHIPPER', 'STRENGTH', 'OTHER'];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function AdminWorkoutsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { wods, publishWOD, updateWOD, removeWOD } = useWorkouts();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<WODFormat>('FOR_TIME');
  const [description, setDescription] = useState('');
  const [timeCap, setTimeCap] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [date, setDate] = useState(todayISO());

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setFormat('FOR_TIME');
    setDescription('');
    setTimeCap('');
    setCoachNotes('');
    setDate(todayISO());
  };

  const beginEdit = (id: string) => {
    const wod = wods.find((w) => w.id === id);
    if (!wod) return;
    setEditingId(id);
    setTitle(wod.title);
    setFormat(wod.format);
    setDescription(wod.description);
    setTimeCap(wod.timeCapMinutes ? String(wod.timeCapMinutes) : '');
    setCoachNotes(wod.coachingNotes ?? '');
    setDate(wod.date);
  };

  const save = () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Missing fields', 'Title and description are required.');
      return;
    }
    const parsedCap = timeCap.trim() ? parseInt(timeCap, 10) : undefined;
    const timeCapMinutes = parsedCap && !Number.isNaN(parsedCap) ? parsedCap : undefined;

    if (editingId) {
      updateWOD(editingId, {
        title: title.trim(),
        format,
        description: description.trim(),
        timeCapMinutes,
        coachingNotes: coachNotes.trim() || undefined,
        date,
      });
    } else {
      publishWOD({
        date,
        title: title.trim(),
        format,
        description: description.trim(),
        timeCapMinutes,
        coachingNotes: coachNotes.trim() || undefined,
      });
    }
    resetForm();
  };

  const confirmDelete = (id: string, label: string) => {
    Alert.alert('Delete WOD', `Delete "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeWOD(id) },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Workouts</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Form */}
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formHeading, { color: colors.textPrimary }]}>
              {editingId ? 'Edit WOD' : 'Publish a Workout'}
            </Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>DATE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Fran, or Tuesday WOD"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>FORMAT</Text>
            <View style={styles.formatRow}>
              {FORMATS.map((f) => {
                const active = format === f;
                return (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.formatChip,
                      {
                        backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setFormat(f)}
                  >
                    <Text
                      style={[
                        styles.formatChipText,
                        { color: active ? '#000' : colors.textSecondary },
                      ]}
                    >
                      {WOD_FORMAT_LABEL[f]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>DESCRIPTION</Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder={'21-15-9 of:\nThrusters 95/65\nPull-ups'}
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>TIME CAP (min, optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              value={timeCap}
              onChangeText={setTimeCap}
              placeholder="e.g. 20"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>COACHING NOTES (optional)</Text>
            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
                { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
              ]}
              value={coachNotes}
              onChangeText={setCoachNotes}
              placeholder="Scaling options, focus cues, anything else."
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={300}
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.gold }]}
                onPress={save}
              >
                <Text style={styles.saveBtnText}>
                  {editingId ? 'Update' : 'Publish'}
                </Text>
              </TouchableOpacity>
              {editingId && (
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.border }]}
                  onPress={resetForm}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Published list */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>PUBLISHED</Text>
            {wods.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>Nothing published yet.</Text>
              </View>
            ) : (
              wods.slice().sort((a, b) => b.date.localeCompare(a.date)).map((w) => (
                <View
                  key={w.id}
                  style={[styles.wodRow, { backgroundColor: colors.surface, borderColor: w.date === todayISO() ? colors.gold : colors.border }]}
                >
                  <View style={styles.wodRowHeader}>
                    <Text style={[styles.wodRowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {w.title}
                    </Text>
                    <View style={[styles.dateChip, { backgroundColor: w.date === todayISO() ? colors.gold : colors.surfaceSecondary }]}>
                      <Text style={[styles.dateChipText, { color: w.date === todayISO() ? '#000' : colors.textSecondary }]}>
                        {w.date === todayISO() ? 'TODAY' : w.date.slice(5)}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.wodRowFormat, { color: colors.textMuted }]}>
                    {WOD_FORMAT_LABEL[w.format]}
                    {w.timeCapMinutes ? ` · ${w.timeCapMinutes}m cap` : ''}
                  </Text>
                  <Text style={[styles.wodRowDesc, { color: colors.textSecondary }]} numberOfLines={3}>
                    {w.description}
                  </Text>
                  <View style={styles.wodRowActions}>
                    <TouchableOpacity
                      style={[styles.rowBtn, { borderColor: colors.border }]}
                      onPress={() => beginEdit(w.id)}
                    >
                      <Ionicons name="pencil" size={14} color={colors.textSecondary} />
                      <Text style={[styles.rowBtnText, { color: colors.textSecondary }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rowBtn, { borderColor: colors.error }]}
                      onPress={() => confirmDelete(w.id, w.title)}
                    >
                      <Ionicons name="trash-outline" size={14} color={colors.error} />
                      <Text style={[styles.rowBtnText, { color: colors.error }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
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
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },

  formCard: {
    marginHorizontal: spacing.lg,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  formHeading: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  multilineInput: { minHeight: 90, textAlignVertical: 'top' },
  formatRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  formatChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5,
  },
  formatChipText: { fontSize: 12, fontWeight: '800' },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  cancelBtn: { paddingHorizontal: 18, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 14, fontWeight: '700' },

  section: { paddingHorizontal: spacing.lg, marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },

  emptyCard: {
    alignItems: 'center', paddingVertical: 24,
    borderRadius: 14, borderWidth: 1.5,
  },
  emptyText: { fontSize: 13 },

  wodRow: { padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 10, gap: 6 },
  wodRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wodRowTitle: { flex: 1, fontSize: 15, fontWeight: '800', textAlign: 'left' },
  dateChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  dateChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  wodRowFormat: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textAlign: 'left' },
  wodRowDesc: { fontSize: 13, lineHeight: 18, textAlign: 'left' },
  wodRowActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  rowBtnText: { fontSize: 11, fontWeight: '700' },
});
