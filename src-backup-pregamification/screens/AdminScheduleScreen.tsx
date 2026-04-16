import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';

type ClassType = 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat';

interface ScheduleClass {
  id: string;
  name: string;
  instructor: string;
  time: string;
  duration: string;
  spotsLeft: number;
  type: ClassType;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CLASS_TYPES: { value: ClassType; label: string }[] = [
  { value: 'jiu-jitsu', label: 'Jiu-Jitsu' },
  { value: 'muay-thai', label: 'Muay Thai' },
  { value: 'pilates', label: 'Pilates' },
  { value: 'open-mat', label: 'Open Mat' },
];

const INITIAL_SCHEDULE: Record<string, ScheduleClass[]> = {
  Mon: [
    { id: '1', name: 'Group Workout', instructor: 'Carnage', time: '11:00 AM', duration: '60 min', spotsLeft: 8, type: 'open-mat' },
    { id: '2', name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' },
    { id: '3', name: 'Kids Jiu-Jitsu', instructor: 'Sensei Tim', time: '6:30 PM', duration: '45 min', spotsLeft: 8, type: 'jiu-jitsu' },
  ],
  Tue: [
    { id: '4', name: 'Muay Thai', instructor: 'Carnage', time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' },
    { id: '5', name: 'Open Mat', instructor: 'Self-guided', time: '5:00 PM', duration: '90 min', spotsLeft: 10, type: 'open-mat' },
  ],
  Wed: [
    { id: '6', name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 5, type: 'jiu-jitsu' },
    { id: '7', name: 'Muay Thai', instructor: 'Carnage', time: '5:00 PM', duration: '60 min', spotsLeft: 6, type: 'muay-thai' },
  ],
  Thu: [
    { id: '8', name: 'Muay Thai', instructor: 'Carnage', time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' },
    { id: '9', name: 'Open Mat', instructor: 'Self-guided', time: '5:00 PM', duration: '90 min', spotsLeft: 10, type: 'open-mat' },
  ],
  Fri: [
    { id: '10', name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' },
  ],
  Sat: [
    { id: '11', name: 'Open Mat', instructor: 'Self-guided', time: '10:00 AM', duration: '120 min', spotsLeft: 10, type: 'open-mat' },
  ],
  Sun: [],
};

const TYPE_COLORS: Record<ClassType, string> = {
  'jiu-jitsu': '#1565C0',
  'muay-thai': '#C41E2A',
  'pilates': '#4CAF50',
  'open-mat': '#D4A017',
};

export function AdminScheduleScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [schedule, setSchedule] = useState(INITIAL_SCHEDULE);
  const [selectedDay, setSelectedDay] = useState('Mon');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<ScheduleClass | null>(null);

  // Form
  const [className, setClassName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [time, setTime] = useState('');
  const [dur, setDur] = useState('60 min');
  const [spots, setSpots] = useState('10');
  const [classType, setClassType] = useState<ClassType>('jiu-jitsu');

  const resetForm = () => {
    setClassName(''); setInstructor(''); setTime('');
    setDur('60 min'); setSpots('10'); setClassType('jiu-jitsu');
  };

  const openAddModal = () => {
    setEditingClass(null);
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (cls: ScheduleClass) => {
    setEditingClass(cls);
    setClassName(cls.name);
    setInstructor(cls.instructor);
    setTime(cls.time);
    setDur(cls.duration);
    setSpots(cls.spotsLeft.toString());
    setClassType(cls.type);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!className || !instructor || !time) {
      Alert.alert('Missing Info', 'Fill in class name, instructor, and time.');
      return;
    }
    const entry: ScheduleClass = {
      id: editingClass?.id || Date.now().toString(),
      name: className,
      instructor,
      time,
      duration: dur,
      spotsLeft: parseInt(spots) || 10,
      type: classType,
    };

    setSchedule((prev) => {
      const dayClasses = [...(prev[selectedDay] || [])];
      if (editingClass) {
        const idx = dayClasses.findIndex((c) => c.id === editingClass.id);
        if (idx >= 0) dayClasses[idx] = entry;
      } else {
        dayClasses.push(entry);
      }
      return { ...prev, [selectedDay]: dayClasses };
    });
    setModalVisible(false);
  };

  const handleDelete = (cls: ScheduleClass) => {
    setSchedule((prev) => ({
      ...prev,
      [selectedDay]: prev[selectedDay].filter((c) => c.id !== cls.id),
    }));
  };

  const dayClasses = schedule[selectedDay] || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Schedule</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.backButton}>
          <Ionicons name="add-circle-outline" size={26} color={colors.gold} />
        </TouchableOpacity>
      </View>

      {/* Day Selector */}
      <View style={styles.dayRow}>
        {DAYS.map((day) => {
          const isActive = day === selectedDay;
          const count = (schedule[day] || []).length;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, isActive && { backgroundColor: colors.gold }]}
              onPress={() => setSelectedDay(day)}
            >
              <Text style={[styles.dayText, { color: isActive ? colors.textInverse : colors.textSecondary }]}>
                {day}
              </Text>
              <Text style={[styles.dayCount, { color: isActive ? colors.textInverse : colors.textMuted }]}>
                {count}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Classes List */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {dayClasses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes on {selectedDay}
            </Text>
            <Button title="Add Class" onPress={openAddModal} variant="outline" size="sm" style={{ marginTop: spacing.md }} />
          </View>
        ) : (
          dayClasses.map((cls) => (
            <TouchableOpacity
              key={cls.id}
              style={[styles.classCard, { backgroundColor: colors.surface }]}
              onPress={() => openEditModal(cls)}
              activeOpacity={0.7}
            >
              <View style={[styles.typeStripe, { backgroundColor: TYPE_COLORS[cls.type] }]} />
              <View style={styles.classInfo}>
                <Text style={[styles.className, { color: colors.textPrimary }]}>{cls.name}</Text>
                <Text style={[styles.classMeta, { color: colors.textSecondary }]}>
                  {cls.instructor} · {cls.time} · {cls.duration}
                </Text>
                <Text style={[styles.classSpots, { color: colors.textMuted }]}>
                  {cls.spotsLeft} spots
                </Text>
              </View>
              <View style={styles.classActions}>
                <TouchableOpacity onPress={() => openEditModal(cls)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={18} color={colors.gold} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(cls)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingClass ? 'Edit Class' : `Add Class — ${selectedDay}`}
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CLASS NAME</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                value={className}
                onChangeText={setClassName}
                placeholder="e.g. Jiu-Jitsu (Adults)"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>INSTRUCTOR</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                value={instructor}
                onChangeText={setInstructor}
                placeholder="e.g. Sensei Tim"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TIME</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={time}
                  onChangeText={setTime}
                  placeholder="12:00 PM"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DURATION</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                  value={dur}
                  onChangeText={setDur}
                  placeholder="60 min"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>MAX SPOTS</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                value={spots}
                onChangeText={setSpots}
                keyboardType="number-pad"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            {/* Type Selector */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CLASS TYPE</Text>
              <View style={styles.typeRow}>
                {CLASS_TYPES.map((ct) => {
                  const isActive = ct.value === classType;
                  return (
                    <TouchableOpacity
                      key={ct.value}
                      style={[
                        styles.typeChip,
                        { backgroundColor: isActive ? TYPE_COLORS[ct.value] : colors.surfaceSecondary },
                      ]}
                      onPress={() => setClassType(ct.value)}
                    >
                      <Text style={[styles.typeChipText, { color: isActive ? '#FFF' : colors.textMuted }]}>
                        {ct.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Button title={editingClass ? 'Save Changes' : 'Add Class'} onPress={handleSave} fullWidth size="lg" style={{ marginTop: spacing.lg }} />
            <View style={{ height: spacing.xxl * 2 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, fontSize: 20 },
  dayRow: { flexDirection: 'row', paddingHorizontal: spacing.md, marginBottom: spacing.md, gap: 4 },
  dayChip: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
  dayText: { ...typography.label, fontSize: 11 },
  dayCount: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  list: { paddingHorizontal: spacing.lg },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyText: { ...typography.body, marginTop: spacing.md },
  classCard: { flexDirection: 'row', borderRadius: borderRadius.md, marginBottom: spacing.sm, overflow: 'hidden' },
  typeStripe: { width: 4 },
  classInfo: { flex: 1, padding: spacing.md },
  className: { ...typography.body, fontWeight: '600' },
  classMeta: { ...typography.bodySmall, marginTop: 2 },
  classSpots: { ...typography.label, fontSize: 10, marginTop: spacing.xs },
  classActions: { justifyContent: 'center', paddingRight: spacing.md, gap: spacing.sm },
  iconBtn: { padding: spacing.xs },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalCancel: { ...typography.body, fontWeight: '500' },
  modalTitle: { ...typography.cardTitle, fontSize: 18 },
  modalContent: { paddingHorizontal: spacing.lg },
  fieldGroup: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, fontSize: 11, marginBottom: spacing.xs },
  input: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, fontSize: 16, borderWidth: 1 },
  rowFields: { flexDirection: 'row', gap: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  typeChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
  typeChipText: { ...typography.label, fontSize: 11 },
});
