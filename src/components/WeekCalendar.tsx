import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SoundPressable } from './SoundPressable';
import { useTheme } from '../context/ThemeContext';

// ─────── Date helpers ───────
export function isoDateOf(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

export function todayIso(): string {
  return isoDateOf(new Date());
}

export function startOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - d.getDay());
  return isoDateOf(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDateOf(d);
}

export function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
}

export function dayNumber(iso: string): number {
  return new Date(iso + 'T00:00:00').getDate();
}

export function weekRangeLabel(startIso: string): string {
  const s = new Date(startIso + 'T00:00:00');
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  const month = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (s.getMonth() === e.getMonth()) {
    return `${month(s)} ${s.getDate()}–${e.getDate()}`;
  }
  return `${month(s)} ${s.getDate()} – ${month(e)} ${e.getDate()}`;
}

/**
 * One day's metadata for the strip — `date` is the only required field.
 * If `dotColor` is omitted, no dot renders (use this for "no data" days).
 */
export interface WeekDay {
  date: string;
  dotColor?: string;
}

interface WeekCalendarProps {
  weekStart: string;
  selectedDate: string;
  days: WeekDay[];
  onSelectDate: (date: string) => void;
  onPrev: () => void;
  onNext: () => void;
}

/**
 * Compact 7-day strip with prev/next-week arrows. Visually identical to the
 * Medication tracker's calendar — adopted across MacroTracker, WeightTracker,
 * etc. so all fitness-module calendars share a consistent footprint.
 */
export function WeekCalendar({
  weekStart,
  selectedDate,
  days,
  onSelectDate,
  onPrev,
  onNext,
}: WeekCalendarProps) {
  const { colors } = useTheme();
  const today = todayIso();

  return (
    <View style={[styles.calCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.calNav}>
        <SoundPressable onPress={onPrev} style={styles.calNavBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={18} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.calTitle, { color: colors.textPrimary }]}>
          {weekRangeLabel(weekStart)}
        </Text>
        <SoundPressable onPress={onNext} style={styles.calNavBtn} hitSlop={8}>
          <Ionicons name="chevron-forward" size={18} color={colors.textPrimary} />
        </SoundPressable>
      </View>
      <View style={styles.weekRow}>
        {days.map((d) => {
          const isSelected = d.date === selectedDate;
          const isToday = d.date === today;
          return (
            <SoundPressable
              key={d.date}
              style={[
                styles.dayCol,
                isSelected && {
                  backgroundColor: colors.gold + '20',
                  borderColor: colors.gold,
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => onSelectDate(d.date)}
            >
              <Text style={[styles.dayLabel, { color: colors.textMuted }]}>
                {dayLabel(d.date)}
              </Text>
              <Text style={[
                styles.dayNum,
                { color: isToday ? colors.gold : colors.textPrimary },
              ]}>
                {dayNumber(d.date)}
              </Text>
              {d.dotColor ? (
                <View style={[styles.dayDot, { backgroundColor: d.dotColor }]} />
              ) : (
                <View style={styles.dayDotPlaceholder} />
              )}
            </SoundPressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calCard: { padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  calNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  calNavBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  calTitle: { fontSize: 14, fontWeight: '800' },
  weekRow: { flexDirection: 'row', gap: 4 },
  dayCol: {
    flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8,
    borderRadius: 10,
  },
  dayLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  dayNum: { fontSize: 16, fontWeight: '800' },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  dayDotPlaceholder: { width: 6, height: 6 },
});
