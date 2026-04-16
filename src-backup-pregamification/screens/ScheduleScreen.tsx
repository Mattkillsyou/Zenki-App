import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { ClassCard } from '../components';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Generate current week's dates dynamically
const getWeekDates = (): number[] => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7)); // Back to Monday
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate();
  });
};

const getMonthYear = (): string => {
  const now = new Date();
  return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const getTodayIndex = (): number => {
  const dayOfWeek = new Date().getDay(); // 0=Sun
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Convert to Mon=0 index
};

const FILTERS = ['All', 'Jiu-Jitsu', 'Muay Thai', 'Pilates'];

interface ScheduleEntry {
  name: string;
  instructor: string;
  time: string;
  duration: string;
  spotsLeft: number;
  type: 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat';
}

// Real schedule — varies by selected day
const SCHEDULES: Record<string, ScheduleEntry[]> = {
  Mon: [
    { name: 'Group Workout', instructor: 'Carnage', time: '11:00 AM', duration: '60 min', spotsLeft: 8, type: 'open-mat' as const },
    { name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' as const },
    { name: 'Kids Jiu-Jitsu', instructor: 'Sensei Tim', time: '6:30 PM', duration: '45 min', spotsLeft: 8, type: 'jiu-jitsu' as const },
  ],
  Tue: [
    { name: 'Muay Thai', instructor: 'Carnage', time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' as const },
    { name: 'Open Mat', instructor: 'Self-guided', time: '5:00 PM', duration: '90 min', spotsLeft: 10, type: 'open-mat' as const },
  ],
  Wed: [
    { name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 5, type: 'jiu-jitsu' as const },
    { name: 'Muay Thai', instructor: 'Carnage', time: '5:00 PM', duration: '60 min', spotsLeft: 6, type: 'muay-thai' as const },
  ],
  Thu: [
    { name: 'Muay Thai', instructor: 'Carnage', time: '12:00 PM', duration: '60 min', spotsLeft: 7, type: 'muay-thai' as const },
    { name: 'Open Mat', instructor: 'Self-guided', time: '5:00 PM', duration: '90 min', spotsLeft: 10, type: 'open-mat' as const },
  ],
  Fri: [
    { name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 6, type: 'jiu-jitsu' as const },
  ],
  Sat: [
    { name: 'Open Mat', instructor: 'Self-guided', time: '10:00 AM', duration: '120 min', spotsLeft: 10, type: 'open-mat' as const },
  ],
  Sun: [],
};

// Pilates is always available by appointment
const PILATES_ENTRY = {
  name: 'Mobility / Pilates',
  instructor: 'Rachel',
  time: 'By Appointment',
  duration: '50 min',
  spotsLeft: 1,
  type: 'pilates' as const,
};


export function ScheduleScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [selectedDay, setSelectedDay] = useState(getTodayIndex());
  const [selectedFilter, setSelectedFilter] = useState('All');
  const weekDates = getWeekDates();

  const dayKey = DAYS[selectedDay];
  const daySchedule = [...(SCHEDULES[dayKey] || []), PILATES_ENTRY];

  const filtered = selectedFilter === 'All'
    ? daySchedule
    : daySchedule.filter((cls) => {
        if (selectedFilter === 'Jiu-Jitsu') return cls.type === 'jiu-jitsu';
        if (selectedFilter === 'Muay Thai') return cls.type === 'muay-thai';
        if (selectedFilter === 'Pilates') return cls.type === 'pilates';
        return true;
      });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Schedule</Text>
        <Text style={[styles.month, { color: colors.gold }]}>{getMonthYear()}</Text>
      </View>

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {DAYS.map((day, index) => {
          const isSelected = index === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayItem,
                isSelected && { backgroundColor: colors.gold },
              ]}
              onPress={() => setSelectedDay(index)}
            >
              <Text style={[
                styles.dayLabel,
                { color: isSelected ? colors.textInverse : colors.textMuted },
              ]}>
                {day}
              </Text>
              <Text style={[
                styles.dayDate,
                { color: isSelected ? colors.textInverse : colors.textSecondary },
              ]}>
                {weekDates[index]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterContent}
      >
        {FILTERS.map((filter) => {
          const isActive = filter === selectedFilter;
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterChip,
                { borderColor: isActive ? colors.gold : colors.border },
                isActive && { backgroundColor: colors.goldMuted },
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[
                styles.filterText,
                { color: isActive ? colors.gold : colors.textMuted },
              ]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Class List */}
      <ScrollView
        style={styles.classList}
        contentContainerStyle={styles.classListContent}
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((cls) => (
          <ClassCard key={`${cls.name}-${cls.time}`} {...cls} onBook={() => navigation.navigate('Book')} />
        ))}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes scheduled
            </Text>
          </View>
        )}
        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    ...typography.sectionTitle,
  },
  month: {
    ...typography.body,
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: 2,
  },
  dayLabel: {
    ...typography.label,
    fontSize: 11,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  filterRow: {
    maxHeight: 44,
    marginBottom: spacing.md,
  },
  filterContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  filterText: {
    ...typography.label,
    fontSize: 11,
  },
  classList: {
    flex: 1,
  },
  classListContent: {
    paddingHorizontal: spacing.lg,
  },
  emptyState: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
  },
});
