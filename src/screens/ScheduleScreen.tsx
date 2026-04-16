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
import { DAYS as SCHED_DAYS, SCHEDULES as SHARED_SCHEDULES, PILATES_ENTRY as SHARED_PILATES } from '../data/schedule';

const DAYS = SCHED_DAYS as unknown as string[];

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

const SCHEDULES = SHARED_SCHEDULES;
const PILATES_ENTRY = SHARED_PILATES;


export function ScheduleScreen({ navigation }: any) {
  const { colors } = useTheme();
  useScreenSoundTheme('schedule');
  const [selectedDay, setSelectedDay] = useState(getTodayIndex());
  const weekDates = getWeekDates();

  const dayKey = DAYS[selectedDay];
  const filtered = [...(SCHEDULES[dayKey] || []), PILATES_ENTRY];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — minimal, brand-forward */}
      <View style={styles.scheduleHeader}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
          {getMonthYear()}
        </Text>
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
  scheduleHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  screenSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
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
