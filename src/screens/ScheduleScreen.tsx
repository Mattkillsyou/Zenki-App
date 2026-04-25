import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
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

type ClassFilter = 'all' | 'bjj' | 'muay-thai' | 'pilates' | 'open-mat';
const FILTER_OPTIONS: { key: ClassFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'bjj', label: 'BJJ' },
  { key: 'muay-thai', label: 'Muay Thai' },
  { key: 'pilates', label: 'Pilates' },
  { key: 'open-mat', label: 'Open Mat' },
];

// Generate week dates with offset from current week
const getWeekDates = (weekOffset: number = 0): number[] => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
  return DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.getDate();
  });
};

const getMonthYear = (weekOffset: number = 0): string => {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
  return monday.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
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

function dateForWeekdayIndex(index: number, weekOff: number = 0): Date {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOff * 7);
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
  const [weekOffset, setWeekOffset] = useState(0);
  const [filter, setFilter] = useState<ClassFilter>('all');
  const weekDates = getWeekDates(weekOffset);

  // Member's private bookings that fall on the selected weekday of this week
  const selectedDate = dateForWeekdayIndex(selectedDay, weekOffset);
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
  const allClasses = [...(SCHEDULES[dayKey] || []), PILATES_ENTRY];
  const filtered = filter === 'all' ? allClasses : allClasses.filter((cls: any) => {
    const type = (cls.type || '').toLowerCase();
    if (filter === 'bjj') return type.includes('jiu') || type.includes('bjj');
    if (filter === 'muay-thai') return type.includes('muay') || type.includes('thai') || type.includes('kickbox');
    if (filter === 'pilates') return type.includes('pilates') || type.includes('mobility');
    if (filter === 'open-mat') return type.includes('open') || type.includes('mat');
    return true;
  });

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
      {/* Header — month + week nav (single compact row) */}
      <View style={styles.scheduleHeader}>
        <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>
          {getMonthYear(weekOffset)}
        </Text>
        <View style={styles.headerRight}>
          <SoundPressable
            onPress={() => setWeekOffset((w) => w - 1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.navArrow, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
          </SoundPressable>
          {weekOffset !== 0 && (
            <SoundPressable
              onPress={() => { setWeekOffset(0); setSelectedDay(getTodayIndex()); }}
              style={[styles.todayBtn, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}
            >
              <Text style={[styles.todayBtnText, { color: colors.gold }]}>TODAY</Text>
            </SoundPressable>
          )}
          <SoundPressable
            onPress={() => setWeekOffset((w) => w + 1)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.navArrow, { backgroundColor: colors.surface }]}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
          </SoundPressable>
        </View>
      </View>

      {/* Week strip — tight under the header */}
      <View style={styles.daySelector}>
        {DAYS.map((day, index) => {
          const isSelected = index === selectedDay;
          const isToday = index === todayIdx;
          return (
            <SoundPressable
              key={day}
              style={[
                styles.dayItem,
                {
                  backgroundColor: isSelected ? colors.gold : 'transparent',
                  borderColor: isSelected ? colors.gold : (isToday ? colors.gold + '60' : 'transparent'),
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => setSelectedDay(index)}
            >
              <Text style={[
                styles.dayLabel,
                { color: isSelected ? '#000' : colors.textMuted },
              ]}>
                {day}
              </Text>
              <Text style={[
                styles.dayDate,
                { color: isSelected ? '#000' : colors.textPrimary },
              ]}>
                {weekDates[index]}
              </Text>
            </SoundPressable>
          );
        })}
      </View>

      {/* Filter chips */}
      <View style={styles.filterRowView}>
        {FILTER_OPTIONS.map((f) => {
          const active = filter === f.key;
          return (
            <SoundPressable
              key={f.key}
              style={[styles.filterChip, {
                backgroundColor: active ? colors.gold : colors.surface,
                borderColor: active ? colors.gold : colors.border,
              }]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, { color: active ? '#000' : colors.textSecondary }]}>
                {f.label}
              </Text>
            </SoundPressable>
          );
        })}
      </View>

      {/* Day header — date + class count on one line */}
      <View style={styles.dayHeaderRow}>
        <Text style={[styles.dayHeaderTitle, { color: colors.textPrimary }]}>
          {selectedFullLabel}
        </Text>
        <Text style={[styles.dayHeaderMeta, { color: colors.textMuted }]}>
          {selectedDay === todayIdx ? 'Today' : ''}
          {selectedDay === todayIdx && filtered.length > 0 ? ' · ' : ''}
          {filtered.length} {filtered.length === 1 ? 'class' : 'classes'}
        </Text>
      </View>

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

  // ── Header (compact: title + nav arrows on one line) ──
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  todayBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Week strip ──
  daySelector: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    marginTop: 0,
    marginBottom: 4,
    gap: 4,
  },
  dayItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingBottom: 10,
    borderRadius: 14,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },

  // ── Filter chips ──
  filterRowView: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // ── Day header (date + count) ──
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
  },
  dayHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  dayHeaderMeta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // ── Class list ──
  classList: { flex: 1 },
  classListContent: { paddingHorizontal: 20, paddingTop: 2, gap: 10 },
  mySessionsBlock: { gap: 10 },
  mySessionsLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 2,
  },
  blockSeparator: { height: 1, marginVertical: 6 },

  // ── Empty state ──
  emptyState: { paddingVertical: 48, alignItems: 'center', gap: 10 },
  emptyIcon: { marginBottom: 4 },
  emptyText: { fontSize: 14 },

  // ── Subtle dotted spacer between pairs of class cards ──
  dottedDividerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  dottedDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
