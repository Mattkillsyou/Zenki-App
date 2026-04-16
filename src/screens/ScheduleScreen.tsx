import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useScreenSoundTheme } from '../context/SoundContext';
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
  useScreenSoundTheme('schedule');
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
      {/* Day Selector */}
      <View style={styles.daySelector}>
        {DAYS.map((day, index) => {
          const isSelected = index === selectedDay;
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayItem,
                {
                  backgroundColor: isSelected ? colors.gold : colors.surface,
                  borderColor: colors.border,
                  borderWidth: 1.5,
                },
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
                {
                  paddingVertical: 10,
                  paddingHorizontal: 18,
                  borderRadius: 24,
                  borderWidth: isActive ? 0 : 1.5,
                  backgroundColor: isActive ? colors.gold : colors.surface,
                  borderColor: isActive ? colors.gold : colors.border,
                },
              ]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[
                {
                  fontSize: 14,
                  fontWeight: '600',
                  color: isActive ? colors.textInverse : colors.textMuted,
                },
              ]}>
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Class List — single-page, no scroll */}
      <View style={[styles.classList, styles.classListContent]}>
        {filtered.map((cls) => (
          <ClassCard key={`${cls.name}-${cls.time}`} {...cls} onBook={() => navigation.navigate('Book')} />
        ))}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} style={styles.emptyIcon} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes scheduled
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  month: {
    fontSize: 13,
    fontWeight: '600',
  },
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 8,
    gap: 8,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 26,
    minHeight: 52,
  },
  dayLabel: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  filterRow: {
    flexGrow: 0,
    flexShrink: 0,
    maxHeight: 56,
    marginTop: 4,
    marginBottom: 8,
  },
  filterContent: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: 'center',
  },
  classList: { flex: 1 },
  classListContent: { paddingHorizontal: 24, gap: 14 },
  emptyState: { paddingVertical: 48, alignItems: 'center', gap: 16 },
  emptyIcon: { marginBottom: 8 },
  emptyText: { fontSize: 15 },
});
