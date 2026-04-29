import React, { useState, useMemo } from 'react';
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
import { useAuth } from '../context/AuthContext';
import { useEmployeeTasks } from '../context/EmployeeTaskContext';
import { spacing } from '../theme';
import { FadeInView, KeyboardAwareScrollView } from '../components';

export function EmployeeChecklistScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    todayTasksFor,
    toggleComplete,
    addPersonalTask,
    removePersonalTask,
  } = useEmployeeTasks();

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const tasks = user ? todayTasksFor(user.id) : [];

  const grouped = useMemo(() => {
    const defaults = tasks.filter((t) => t.source === 'default');
    const assigned = tasks.filter((t) => t.source === 'assigned');
    const personal = tasks.filter((t) => t.source === 'personal');
    return { defaults, assigned, personal };
  }, [tasks]);

  const completedCount = tasks.filter((t) => t.completedToday).length;

  const handleAdd = () => {
    if (!user) return;
    if (!newTitle.trim()) {
      Alert.alert('Missing title', 'Please enter a task title.');
      return;
    }
    addPersonalTask(user.id, newTitle.trim(), newDescription.trim() || undefined);
    setNewTitle('');
    setNewDescription('');
    setShowAddForm(false);
  };

  const confirmRemovePersonal = (id: string, title: string) => {
    Alert.alert('Remove task', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removePersonalTask(id) },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Checklist</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Progress banner */}
          <FadeInView delay={0} slideUp={8}>
            <View style={[styles.progressBanner, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
              <View style={[styles.progressRing, { borderColor: colors.gold }]}>
                <Text style={[styles.progressRingText, { color: colors.gold }]}>
                  {completedCount}/{tasks.length}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>
                  {tasks.length === 0
                    ? 'No tasks today'
                    : completedCount === tasks.length
                    ? 'All caught up!'
                    : `${tasks.length - completedCount} task${tasks.length - completedCount === 1 ? '' : 's'} to go`}
                </Text>
                <Text style={[styles.progressSub, { color: colors.textMuted }]}>
                  Today's checklist
                </Text>
              </View>
            </View>
          </FadeInView>

          {/* Assigned (time-sensitive) */}
          {grouped.assigned.length > 0 && (
            <FadeInView delay={40} slideUp={8}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="alarm-outline" size={14} color={colors.error} />
                  <Text style={[styles.sectionLabel, { color: colors.error }]}>TIME-SENSITIVE</Text>
                </View>
                {grouped.assigned.map((t) => (
                  <TaskRow
                    key={t.id}
                    title={t.title}
                    description={t.description}
                    completed={t.completedToday}
                    accentColor={colors.error}
                    onToggle={() => user && toggleComplete(t.id, user.id)}
                  />
                ))}
              </View>
            </FadeInView>
          )}

          {/* Default daily */}
          {grouped.defaults.length > 0 && (
            <FadeInView delay={80} slideUp={8}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="repeat-outline" size={14} color={colors.gold} />
                  <Text style={[styles.sectionLabel, { color: colors.gold }]}>DAILY</Text>
                </View>
                {grouped.defaults.map((t) => (
                  <TaskRow
                    key={t.id}
                    title={t.title}
                    description={t.description}
                    completed={t.completedToday}
                    accentColor={colors.gold}
                    onToggle={() => user && toggleComplete(t.id, user.id)}
                  />
                ))}
              </View>
            </FadeInView>
          )}

          {/* Personal */}
          <FadeInView delay={120} slideUp={8}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="person-outline" size={14} color={colors.info} />
                <Text style={[styles.sectionLabel, { color: colors.info }]}>MY TASKS</Text>
              </View>
              {grouped.personal.length === 0 && !showAddForm && (
                <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
                  Add your own tasks for the day.
                </Text>
              )}
              {grouped.personal.map((t) => (
                <TaskRow
                  key={t.id}
                  title={t.title}
                  description={t.description}
                  completed={t.completedToday}
                  accentColor={colors.info}
                  onToggle={() => user && toggleComplete(t.id, user.id)}
                  onRemove={() => confirmRemovePersonal(t.id, t.title)}
                />
              ))}

              {!showAddForm ? (
                <SoundPressable
                  style={[styles.addBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setShowAddForm(true)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.info} />
                  <Text style={[styles.addBtnText, { color: colors.info }]}>Add a task</Text>
                </SoundPressable>
              ) : (
                <View style={[styles.addForm, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="Task title"
                    placeholderTextColor={colors.textMuted}
                    value={newTitle}
                    onChangeText={setNewTitle}
                    maxLength={80}
                    autoFocus
                  />
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMulti,
                      { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border, marginTop: 8 },
                    ]}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.textMuted}
                    value={newDescription}
                    onChangeText={setNewDescription}
                    multiline
                    maxLength={200}
                  />
                  <View style={styles.formActions}>
                    <SoundPressable
                      style={[styles.cancelBtn, { borderColor: colors.border }]}
                      onPress={() => {
                        setShowAddForm(false);
                        setNewTitle('');
                        setNewDescription('');
                      }}
                    >
                      <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                    </SoundPressable>
                    <SoundPressable
                      style={[styles.saveBtn, { backgroundColor: colors.gold }]}
                      onPress={handleAdd}
                    >
                      <Text style={styles.saveBtnText}>Add</Text>
                    </SoundPressable>
                  </View>
                </View>
              )}
            </View>
          </FadeInView>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function TaskRow({
  title,
  description,
  completed,
  accentColor,
  onToggle,
  onRemove,
}: {
  title: string;
  description?: string;
  completed: boolean;
  accentColor: string;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <SoundPressable
      onPress={onToggle}
      activeOpacity={0.85}
      style={[styles.taskRow, { backgroundColor: colors.surface, borderColor: completed ? accentColor : colors.border }]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.checkbox,
          {
            backgroundColor: completed ? accentColor : 'transparent',
            borderColor: completed ? accentColor : colors.textMuted,
          },
        ]}
      >
        {completed && <Ionicons name="checkmark" size={16} color="#000" />}
      </View>
      <View style={{ flex: 1 }} pointerEvents="none">
        <Text
          style={[
            styles.taskTitle,
            {
              color: completed ? colors.textMuted : colors.textPrimary,
              textDecorationLine: completed ? 'line-through' : 'none',
            },
          ]}
          numberOfLines={2}
        >
          {title}
        </Text>
        {description ? (
          <Text style={[styles.taskDesc, { color: colors.textMuted }]} numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {onRemove && (
        <SoundPressable onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
        </SoundPressable>
      )}
    </SoundPressable>
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
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },

  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginHorizontal: spacing.lg,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  progressRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRingText: { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  progressTitle: { fontSize: 16, fontWeight: '800', textAlign: 'left' },
  progressSub: { fontSize: 12, fontWeight: '600', marginTop: 2, textAlign: 'left' },

  section: { paddingHorizontal: spacing.lg, marginTop: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 8,
  },

  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 6,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskTitle: { fontSize: 14, fontWeight: '700', textAlign: 'left' },
  taskDesc: { fontSize: 12, fontWeight: '500', marginTop: 2, textAlign: 'left' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 6,
  },
  addBtnText: { fontSize: 13, fontWeight: '700' },

  addForm: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 6,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputMulti: { minHeight: 60, textAlignVertical: 'top' },
  formActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
});
