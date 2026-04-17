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
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
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


function sessionTypeToClassType(s: string): 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat' {
  const lc = s.toLowerCase();
  if (lc.includes('jiu') || lc.includes('bjj')) return 'jiu-jitsu';
  if (lc.includes('muay') || lc.includes('thai') || lc.includes('kickbox')) return 'muay-thai';
  if (lc.includes('pilates') || lc.includes('mobility')) return 'pilates';
  return 'open-mat';
}

function formatAppointmentTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dateForWeekdayIndex(index: number): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  const d = new Date(monday);
  d.setDate(monday.getDate() + index);
  return d;
}

export function ScheduleScreen({ navigation }: any) {
  const { colors } = useTheme();
  useScreenSoundTheme('schedule');
  const { user } = useAuth();
  const { myAppointments } = useAppointments();
  const [selectedDay, setSelectedDay] = useState(getTodayIndex());
  const weekDates = getWeekDates();

  // Member's private bookings that fall on the selected weekday of this week
  const selectedDate = dateForWeekdayIndex(selectedDay);
  const mySelectedDayBookings = myAppointments
    .filter((a) => a.memberId === user?.id && a.status !== 'cancelled' && a.status !== 'completed')
    .filter((a) => {
      const d = new Date(a.startsAt);
      return (
        d.getFullYear() === selectedDate.getFullYear() &&
        d.getMonth() === selectedDate.getMonth() &&
        d.getDate() === selectedDate.getDate()
      );
    })
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const dayKey = DAYS[selectedDay];
  const filtered = [...(SCHEDULES[dayKey] || []), PILATES_ENTRY];

  const todayIdx = getTodayIndex();
  const selectedFullLabel = (() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    const selectedDate = new Date(monday);
    selectedDate.setDate(monday.getDate() + selectedDay);
    return selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  })();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — month + class count chip */}
      <View style={styles.scheduleHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="calendar" size={22} color={colors.gold} />
          <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
            {getMonthYear()}
          </Text>
        </View>
        <View style={[styles.countChip, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}>
          <Text style={[styles.countChipText, { color: colors.gold }]}>
            {filtered.length} {filtered.length === 1 ? 'class' : 'classes'}
          </Text>
        </View>
      </View>

      {/* Divider under header */}
      <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

      {/* Day Selector */}
      <View style={styles.daySelector}>
        {DAYS.map((day, index) => {
          const isSelected = index === selectedDay;
          const isToday = index === todayIdx;
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayItem,
                {
                  backgroundColor: isSelected ? colors.gold : colors.surface,
                  borderColor: isSelected ? colors.gold : colors.border,
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
              {/* Today dot indicator */}
              {isToday && !isSelected && (
                <View style={[styles.todayDot, { backgroundColor: colors.gold }]} />
              )}
              {isToday && isSelected && (
                <View style={[styles.todayDot, { backgroundColor: colors.textInverse }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected-day detail strip */}
      <View style={styles.selectedStrip}>
        <View style={[styles.selectedAccent, { backgroundColor: colors.gold }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.selectedDayLabel, { color: colors.textPrimary }]}>
            {selectedFullLabel}
          </Text>
          <Text style={[styles.selectedDaySub, { color: colors.textMuted }]}>
            {selectedDay === todayIdx ? 'TODAY' : DAYS[selectedDay].toUpperCase() + ' · WEEK VIEW'}
          </Text>
        </View>
        <Ionicons name="time-outline" size={20} color={colors.textTertiary} />
      </View>

      {/* Divider before class list */}
      <View style={[styles.sectionDivider, styles.subtleDivider, { backgroundColor: colors.borderSubtle }]} />

      {/* Class List */}
      <ScrollView
        style={styles.classList}
        contentContainerStyle={styles.classListContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Member's private bookings for this day — shown inline above studio classes */}
        {mySelectedDayBookings.length > 0 && (
          <View style={styles.mySessionsBlock}>
            <Text style={[styles.mySessionsLabel, { color: colors.gold }]}>MY PRIVATE SESSIONS</Text>
            {mySelectedDayBookings.map((a) => (
              <ClassCard
                key={`mybooking-${a.id}`}
                name={a.sessionType}
                instructor={a.instructor}
                time={formatAppointmentTime(a.startsAt)}
                duration={`${a.durationMinutes} min`}
                spotsLeft={0}
                type={sessionTypeToClassType(a.sessionType)}
                booked={true}
                status={a.status}
                onBook={() => {}}
              />
            ))}
            <View style={[styles.blockSeparator, { backgroundColor: colors.border }]} />
          </View>
        )}

        {filtered.map((cls, i) => (
          <React.Fragment key={`${cls.name}-${cls.time}`}>
            <ClassCard {...cls} onBook={() => navigation.navigate('Book')} />
            {/* Subtle time separator between cards (every 2) */}
            {i < filtered.length - 1 && (i + 1) % 2 === 0 && (
              <View style={styles.dottedDividerRow}>
                <View style={[styles.dottedDot, { backgroundColor: colors.borderSubtle }]} />
                <View style={[styles.dottedDot, { backgroundColor: colors.borderSubtle }]} />
                <View style={[styles.dottedDot, { backgroundColor: colors.borderSubtle }]} />
              </View>
            )}
          </React.Fragment>
        ))}
        {filtered.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} style={styles.emptyIcon} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No classes scheduled
            </Text>
          </View>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scheduleHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  countChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  countChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionDivider: {
    height: 1,
    marginHorizontal: 24,
  },
  subtleDivider: {
    marginTop: 4,
    marginBottom: 8,
  },
  selectedStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginTop: 16,
    marginBottom: 12,
    paddingVertical: 4,
  },
  selectedAccent: {
    width: 3,
    height: 32,
    borderRadius: 2,
  },
  selectedDayLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  selectedDaySub: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 2,
    textAlign: 'left',
  },
  todayDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dottedDividerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  dottedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
    marginTop: 14,
    gap: 6,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingBottom: 14,
    borderRadius: 18,
    minHeight: 62,
    position: 'relative',
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
  classListContent: { paddingHorizontal: 24, gap: 12 },
  mySessionsBlock: { gap: 12 },
  mySessionsLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textAlign: 'center',
  },
  blockSeparator: { height: 1, marginVertical: 4 },
  emptyState: { paddingVertical: 48, alignItems: 'center', gap: 16 },
  emptyIcon: { marginBottom: 8 },
  emptyText: { fontSize: 15 },
});
