import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useEmployeeTasks } from '../context/EmployeeTaskContext';
import { MEMBERS } from '../data/members';
import { spacing } from '../theme';
import { KeyboardAwareScrollView } from '../components';

type TaskMode = 'default' | 'assigned';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function AdminEmployeeTasksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const {
    tasks,
    addDefaultTask,
    addAssignedTask,
    updateTask,
    removeTask,
  } = useEmployeeTasks();

  const [mode, setMode] = useState<TaskMode>('default');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(todayISO());
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  const employees = MEMBERS.filter((m) => m.isEmployee);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setDueDate(todayISO());
    setAssignedTo(null);
  };

  const beginEdit = (id: string) => {
    const t = tasks.find((t) => t.id === id);
    if (!t) return;
    setEditingId(id);
    setMode(t.source === 'assigned' ? 'assigned' : 'default');
    setTitle(t.title);
    setDescription(t.description ?? '');
    setDueDate(t.dueDate ?? todayISO());
    setAssignedTo(t.assignedToMemberId ?? null);
  };

  const save = () => {
    if (!title.trim()) {
      Alert.alert('Missing title', 'Please enter a task title.');
      return;
    }
    // Assigned (one-time) tasks need a real due date — without it the task
    // never appears on any employee's checklist (todayTasksFor filters by it).
    if (mode === 'assigned' && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      Alert.alert(
        'Due date required',
        'One-time tasks need a due date in YYYY-MM-DD format so they appear on the right day\'s checklist.',
      );
      return;
    }
    if (editingId) {
      updateTask(editingId, {
        title: title.trim(),
        description: description.trim() || undefined,
        ...(mode === 'assigned'
          ? { source: 'assigned' as const, dueDate, assignedToMemberId: assignedTo ?? undefined }
          : { source: 'default' as const, dueDate: undefined, assignedToMemberId: undefined }),
      });
    } else if (mode === 'default') {
      addDefaultTask(title.trim(), description.trim() || undefined);
    } else {
      addAssignedTask(title.trim(), dueDate, assignedTo ?? undefined, description.trim() || undefined);
    }
    resetForm();
  };

  const confirmDelete = (id: string, label: string) => {
    Alert.alert('Delete task', `Delete "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeTask(id) },
    ]);
  };

  const defaults = tasks.filter((t) => t.source === 'default');
  const assigned = tasks.filter((t) => t.source === 'assigned');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 80 }}>
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Employee Tasks</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Form */}
          <View style={[styles.formCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.formHeading, { color: colors.textPrimary }]}>
              {editingId ? 'Edit Task' : 'Create Task'}
            </Text>

            {/* Mode toggle */}
            <View style={[styles.tabRow, { backgroundColor: colors.surfaceSecondary }]}>
              {(
                [
                  { key: 'default' as TaskMode, label: 'Daily (recurring)', icon: 'repeat-outline' as const },
                  { key: 'assigned' as TaskMode, label: 'One-time', icon: 'alarm-outline' as const },
                ]
              ).map((m) => {
                const active = mode === m.key;
                return (
                  <SoundPressable
                    key={m.key}
                    style={[styles.tab, active && { backgroundColor: colors.gold }]}
                    onPress={() => setMode(m.key)}
                  >
                    <Ionicons name={m.icon} size={14} color={active ? '#000' : colors.textSecondary} />
                    <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textSecondary }]}>
                      {m.label}
                    </Text>
                  </SoundPressable>
                );
              })}
            </View>

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 14 }]}>TITLE</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="e.g. Restock towels"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />

            <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>NOTES (optional)</Text>
            <TextInput
              style={[styles.input, styles.multiline, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Instructions, details, reminders"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={200}
            />

            {mode === 'assigned' && (
              <>
                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>DUE DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={dueDate}
                  onChangeText={setDueDate}
                  autoCapitalize="none"
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={[styles.label, { color: colors.textSecondary, marginTop: 12 }]}>ASSIGN TO</Text>
                <View style={styles.chipRow}>
                  <SoundPressable
                    style={[
                      styles.chip,
                      {
                        backgroundColor: assignedTo === null ? colors.gold : colors.surfaceSecondary,
                        borderColor: assignedTo === null ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setAssignedTo(null)}
                  >
                    <Text style={[styles.chipText, { color: assignedTo === null ? '#000' : colors.textSecondary }]}>
                      All employees
                    </Text>
                  </SoundPressable>
                  {employees.map((e) => {
                    const active = assignedTo === e.id;
                    return (
                      <SoundPressable
                        key={e.id}
                        style={[
                          styles.chip,
                          {
                            backgroundColor: active ? colors.gold : colors.surfaceSecondary,
                            borderColor: active ? colors.gold : colors.border,
                          },
                        ]}
                        onPress={() => setAssignedTo(e.id)}
                      >
                        <Text style={[styles.chipText, { color: active ? '#000' : colors.textSecondary }]}>
                          {e.firstName}
                        </Text>
                      </SoundPressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.formActions}>
              <SoundPressable style={[styles.saveBtn, { backgroundColor: colors.gold }]} onPress={save}>
                <Text style={styles.saveBtnText}>{editingId ? 'Update' : 'Create'}</Text>
              </SoundPressable>
              {editingId && (
                <SoundPressable style={[styles.cancelBtn, { borderColor: colors.border }]} onPress={resetForm}>
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </SoundPressable>
              )}
            </View>
          </View>

          {/* Default list */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>DAILY TEMPLATE TASKS</Text>
            {defaults.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No daily tasks set up.</Text>
              </View>
            ) : (
              defaults.map((t) => (
                <TaskCard
                  key={t.id}
                  title={t.title}
                  subtitle={t.description ?? 'Repeats every day'}
                  onEdit={() => beginEdit(t.id)}
                  onDelete={() => confirmDelete(t.id, t.title)}
                />
              ))
            )}
          </View>

          {/* Assigned list */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.error }]}>TIME-SENSITIVE TASKS</Text>
            {assigned.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>No one-time tasks scheduled.</Text>
              </View>
            ) : (
              assigned
                .slice()
                .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
                .map((t) => {
                  const assignee = t.assignedToMemberId
                    ? employees.find((e) => e.id === t.assignedToMemberId)?.firstName ?? 'Unknown'
                    : 'Everyone';
                  return (
                    <TaskCard
                      key={t.id}
                      title={t.title}
                      subtitle={`Due ${t.dueDate} · ${assignee}`}
                      onEdit={() => beginEdit(t.id)}
                      onDelete={() => confirmDelete(t.id, t.title)}
                    />
                  );
                })
            )}
          </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function TaskCard({
  title,
  subtitle,
  onEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.taskCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.taskSubtitle, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <SoundPressable onPress={onEdit} style={[styles.rowBtn, { borderColor: colors.border }]}>
        <Ionicons name="pencil" size={14} color={colors.textSecondary} />
      </SoundPressable>
      <SoundPressable onPress={onDelete} style={[styles.rowBtn, { borderColor: colors.error }]}>
        <Ionicons name="trash-outline" size={14} color={colors.error} />
      </SoundPressable>
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
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.3 },

  formCard: {
    marginHorizontal: spacing.lg,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  formHeading: { fontSize: 16, fontWeight: '800', marginBottom: 12 },

  tabRow: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    gap: 4,
  },
  tabLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  label: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 6 },
  input: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '800' },

  formActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  saveBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: '900' },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5 },
  cancelBtnText: { fontSize: 13, fontWeight: '700' },

  section: { paddingHorizontal: spacing.lg, marginTop: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 10 },

  emptyCard: {
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  emptyText: { fontSize: 12, fontStyle: 'italic' },

  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  taskTitle: { fontSize: 14, fontWeight: '700', textAlign: 'left' },
  taskSubtitle: { fontSize: 11, fontWeight: '500', marginTop: 2, textAlign: 'left' },
  rowBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
