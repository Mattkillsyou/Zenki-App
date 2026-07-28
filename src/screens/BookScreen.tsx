import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme';
import { Button, ScreenContainer } from '../components';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
import { useGamification } from '../context/GamificationContext';
import { fetchBusyIntervals, isSlotBusy, BusyInterval } from '../services/calendarAvailability';
import { addEventToCalendar } from '../services/calendarIntegration';
import { requireAuth } from '../utils/requireAuth';
import { useSchedulingConfig, priceLabelFor } from '../context/SchedulingConfigContext';

// Generate the booking date for display
const getDisplayDate = (now: Date) => {
  // Today-only booking — the year (and long-form names) are noise here.
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'short', day: 'numeric' };
  return now.toLocaleDateString('en-US', options);
};

const INSTRUCTORS = [
  { name: 'Sensei Tim', specialty: 'Jiu-Jitsu, Kenpo', avatar: 'ST' },
  { name: 'Carnage', specialty: 'Muay Thai', avatar: 'CA' },
  { name: 'Justin', specialty: 'Muay Thai', avatar: 'JU' },
  { name: 'Rachel', specialty: 'Mobility, Pilates', avatar: 'RA' },
];

// Session types (and their admin-editable prices) now live in
// SchedulingConfigContext, read via useSchedulingConfig() below.

const TIME_SLOTS = [
  '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM',
  '2:00 PM', '3:00 PM', '5:00 PM', '6:00 PM',
];

/** Parse a slot label like "2:00 PM" plus a base date into an absolute Date. */
function slotToDate(baseDate: Date, label: string): Date {
  const match = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return new Date(baseDate);
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  const d = new Date(baseDate);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Extract "60 min" → 60. Defaults to 60. */
function parseDurationMinutes(s: string): number {
  const m = s.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 60;
}

function dateStringFor(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BookScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { requestAppointment, myAppointments } = useAppointments();
  const { recordBooking, recordPrivateSession } = useGamification();
  const { sessionTypes, showPricing } = useSchedulingConfig();
  const [selectedInstructor, setSelectedInstructor] = useState(0);
  const [selectedType, setSelectedType] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // "Now" for slot math — refreshed on every focus, because tab screens stay
  // mounted and a mount-frozen value goes stale (past slots stayed bookable;
  // a post-midnight booking got stamped with yesterday's date).
  const [currentDate, setCurrentDate] = useState(() => new Date());
  useFocusEffect(useCallback(() => { setCurrentDate(new Date()); }, []));
  const currentDateStr = dateStringFor(currentDate);
  // Clamp the selection in case the configured sessionTypes list is shorter
  // than the current index (e.g. an admin removed a type).
  const safeType = Math.min(selectedType, sessionTypes.length - 1);
  const currentDuration = parseDurationMinutes(sessionTypes[safeType].duration);

  // Audit 2.0.5 (booking cluster): the busy-interval guard is hard-disabled
  // (empty calendar URL) and appointments were never consulted — the same
  // member could double-book the same slot in two taps. Cross-member
  // conflicts stay admin-side (rules only let a member read their OWN
  // appointments), but MY pending/confirmed sessions now block the slot.
  const myBusyAt = useCallback((slotStart: Date, durationMinutes: number): boolean => {
    const start = slotStart.getTime();
    const end = start + durationMinutes * 60_000;
    return myAppointments.some((a) => {
      if (a.status !== 'pending' && a.status !== 'confirmed') return false;
      const aStart = new Date(a.startsAt).getTime();
      if (Number.isNaN(aStart)) return false;
      const aEnd = aStart + (a.durationMinutes || 60) * 60_000;
      return start < aEnd && aStart < end;
    });
  }, [myAppointments]);

  // Evening dead-end: when every slot is already in the past, say so instead
  // of a wall of indistinguishable UNAVAILABLE chips.
  const allSlotsPast = TIME_SLOTS.every(
    (t) => slotToDate(currentDate, t).getTime() <= currentDate.getTime(),
  );

  // Fetch the owner's busy intervals whenever the date we're booking for changes.
  // Today's the only bookable date right now, but this is structured to expand.
  useEffect(() => {
    let cancelled = false;
    setCheckingAvailability(true);
    fetchBusyIntervals(currentDateStr)
      .then((intervals) => {
        if (!cancelled) setBusyIntervals(intervals);
      })
      .finally(() => {
        if (!cancelled) setCheckingAvailability(false);
      });
    return () => { cancelled = true; };
  }, [currentDateStr]);

  // Deselect a slot that has slipped into the past (e.g. re-focus later in the day).
  useEffect(() => {
    if (selectedTime && slotToDate(currentDate, selectedTime).getTime() <= currentDate.getTime()) {
      setSelectedTime(null);
    }
  }, [currentDate, selectedTime]);

  // Offer to drop the booked session onto the member's own device calendar via
  // the native calendar helper (Apple Calendar / Android, web link fallback).
  // This is a real, on-device add — NOT a server-side two-way Google sync (that
  // write-back is not built; see APP_AUDIT.md F26), so the copy stays honest.
  const offerAddToCalendar = (sessionLabel: string, instructorName: string, startsAt: Date, durationMinutes: number) => {
    Alert.alert(
      'Add to your calendar?',
      'Save this session to the calendar on this device so you get a reminder.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: 'Add',
          onPress: async () => {
            await addEventToCalendar({
              title: `Zenki Dojo · ${sessionLabel} with ${instructorName}`,
              startsAt,
              durationMinutes,
              location: 'Zenki Dojo, 1714 Hillhurst Ave, LA 90027',
              notes: `Private session at Zenki Dojo.\n\nInstructor: ${instructorName}\nType: ${sessionLabel}\n\nPlease arrive 10 minutes early.`,
            });
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleBooking = async () => {
    if (!selectedTime || submitting) return;

    const slotDate = slotToDate(currentDate, selectedTime);
    if (slotDate.getTime() <= Date.now()) {
      Alert.alert('Time has passed', 'That time slot has already passed. Please choose a later time.');
      setSelectedTime(null);
      return;
    }

    // Defensive — shouldn't be reachable since busy slots are disabled
    const conflict = isSlotBusy(slotDate, currentDuration, busyIntervals);
    if (conflict) {
      Alert.alert('Unavailable', 'That time is already booked. Please choose another slot.');
      return;
    }
    if (myBusyAt(slotDate, currentDuration)) {
      Alert.alert('Already booked', 'You already have a session requested or confirmed at that time.');
      setSelectedTime(null);
      return;
    }

    if (!requireAuth(user, navigation, 'request a booking')) return;

    const instructor = INSTRUCTORS[selectedInstructor];
    const sessionType = sessionTypes[safeType];

    setSubmitting(true);
    try {
      await requestAppointment({
        memberId: user.id,
        memberName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Member',
        instructor: instructor.name,
        sessionType: sessionType.label,
        startsAt: slotDate.toISOString(),
        durationMinutes: parseDurationMinutes(sessionType.duration),
        price: sessionType.price,
      });
      // Clear the slot immediately so a second tap can't double-submit while
      // the confirmation alert is up (the CTA disables with no selection).
      setSelectedTime(null);
      recordBooking();
      const label = sessionType.label.toLowerCase();
      if (label.includes('private') || label.includes('1:1')) recordPrivateSession();

      Alert.alert(
        'Inquiry Sent',
        `Your request for ${sessionType.label} with ${instructor.name} at ${selectedTime} has been sent. ` +
        `We'll confirm by text or email. Payment is handled in person at the dojo.`,
        [{
          text: 'OK',
          onPress: () => offerAddToCalendar(
            sessionType.label,
            instructor.name,
            slotDate,
            parseDurationMinutes(sessionType.duration),
          ),
        }],
      );
    } catch (e) {
      Alert.alert('Error', 'Could not send your booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
        {/* Header — no calendar "sync" chip: the app does not write to a remote
            calendar. After a booking is requested we offer to add the session
            to this device's own calendar (see offerAddToCalendar). */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Book Private</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              By appointment only
            </Text>
          </View>
        </View>

        {/* Select Instructor — horizontal chip row */}
        <View style={{ marginTop: 8 }}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted, paddingHorizontal: spacing.lg }]}>INSTRUCTOR</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: spacing.lg }}
            style={{ flexGrow: 0 }}
          >
            {INSTRUCTORS.map((inst, index) => {
              const isSelected = index === selectedInstructor;
              return (
                <SoundPressable
                  key={inst.name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 999,
                    paddingLeft: 6,
                    paddingRight: 14,
                    paddingVertical: 6,
                    borderWidth: 1,
                    backgroundColor: isSelected ? colors.goldMuted : colors.surface,
                    borderColor: isSelected ? colors.gold : colors.border,
                    gap: 8,
                    flexShrink: 0,
                  }}
                  onPress={() => setSelectedInstructor(index)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isSelected ? colors.gold : colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[styles.avatarText, { color: isSelected ? colors.textInverse : colors.textMuted, fontSize: 11 }]}>
                      {inst.avatar}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{inst.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 1 }}>{inst.specialty}</Text>
                  </View>
                </SoundPressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Session Type */}
        <View style={[styles.section, { marginTop: 12 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SESSION TYPE</Text>
          <View style={styles.typeGrid}>
            {sessionTypes.map((type, index) => {
              const isSelected = index === safeType;
              return (
                <SoundPressable
                  key={type.id}
                  style={[
                    {
                      flex: 1,
                      borderRadius: 16,
                      paddingVertical: 14,
                      paddingHorizontal: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      // Equal card heights even when one label wraps to two lines.
                      minHeight: showPricing ? 108 : 88,
                      borderWidth: 1.5,
                      backgroundColor: isSelected ? colors.gold : colors.surface,
                      borderColor: isSelected ? colors.gold : colors.border,
                    }
                  ]}
                  onPress={() => setSelectedType(index)}
                >
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.typeLabel,
                      { color: isSelected ? colors.textInverse : colors.textPrimary },
                    ]}
                  >
                    {type.label}
                  </Text>
                  <Text style={[styles.typeDuration, { color: isSelected ? colors.textInverse : colors.textMuted }]}>
                    {type.duration}
                  </Text>
                  {showPricing && (
                    <Text style={[
                      styles.typePrice,
                      { color: isSelected ? colors.textInverse : colors.gold },
                    ]}>
                      {priceLabelFor(type)}
                    </Text>
                  )}
                </SoundPressable>
              );
            })}
          </View>
        </View>

        {/* Time Slots */}
        <View style={[styles.section, { marginTop: 12, flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>AVAILABLE TIMES</Text>
            {checkingAvailability && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={{ fontSize: 11, color: colors.textMuted }}>Checking calendar…</Text>
              </View>
            )}
          </View>
          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
              {getDisplayDate(currentDate)}
            </Text>
          </View>
          {allSlotsPast ? (
            // Every slot is in the past — the info card says it all, so the
            // grid of struck-out chips stays hidden (it was pure noise).
            <View style={[styles.doneForDayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.doneForDayIcon, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="moon-outline" size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>
                  No more bookable times today
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 16 }}>
                  Sessions run through {TIME_SLOTS[TIME_SLOTS.length - 1]}. Check back tomorrow morning to book.
                </Text>
              </View>
            </View>
          ) : (
          <View style={styles.timeGrid}>
            {/* Past slots don't render at all — a row of struck-out "PASSED"
                chips was the biggest source of clutter on this screen. */}
            {TIME_SLOTS.filter((t) => slotToDate(currentDate, t).getTime() > currentDate.getTime()).map((time) => {
              const isSelected = time === selectedTime;
              const slotDate = slotToDate(currentDate, time);
              const conflict = isSlotBusy(slotDate, currentDuration, busyIntervals);
              const mine = myBusyAt(slotDate, currentDuration);
              const isBusy = conflict !== null || mine;
              return (
                <SoundPressable
                  key={time}
                  disabled={isBusy}
                  style={[
                    styles.timeChip,
                    {
                      backgroundColor: isBusy
                        ? 'transparent'
                        : isSelected
                        ? colors.gold
                        : colors.surface,
                      borderColor: isBusy
                        ? colors.borderSubtle
                        : isSelected
                        ? colors.gold
                        : colors.border,
                      opacity: isBusy ? 0.45 : 1,
                    },
                  ]}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text style={{
                    fontSize: 14,
                    fontWeight: isSelected ? '700' : '600',
                    color: isBusy
                      ? colors.textMuted
                      : isSelected
                      ? colors.textInverse
                      : colors.textSecondary,
                  }}>
                    {time}
                  </Text>
                  {isBusy && (
                    <Text style={{ fontSize: 8, fontWeight: '700', color: colors.textMuted, marginTop: 1, letterSpacing: 0.6 }}>
                      {mine ? 'YOUR SESSION' : 'UNAVAILABLE'}
                    </Text>
                  )}
                </SoundPressable>
              );
            })}
          </View>
          )}
        </View>

        {/* Summary + Book — compact single row, always at bottom */}
        <View style={[styles.section, { paddingBottom: 12 }]}>
          {selectedTime && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, flex: 1, marginRight: 8 }} numberOfLines={1}>
                {sessionTypes[safeType].label} · {INSTRUCTORS[selectedInstructor].name} · {selectedTime}
              </Text>
              {showPricing && (
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.gold }}>
                  {priceLabelFor(sessionTypes[safeType])}
                </Text>
              )}
            </View>
          )}
          {/* No selection yet → Button's disabled-primary state renders as a
              quiet surface card, not a loud dark-red slab. */}
          <Button
            title={selectedTime ? (showPricing ? `Request Booking · ${priceLabelFor(sessionTypes[safeType])}` : 'Request Booking') : allSlotsPast ? 'Booking Closed for Today' : 'Select a Time'}
            onPress={handleBooking}
            fullWidth
            size="lg"
            loading={submitting}
            disabled={!selectedTime}
          />
        </View>
      </ScreenContainer>
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
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.smd,
  },
  avatarText: {
    ...typography.label,
    fontSize: 14,
    fontWeight: '800',
  },
  typeGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  typeLabel: {
    ...typography.label,
    textAlign: 'center',
    fontSize: 11,
  },
  typeDuration: {
    ...typography.bodySmall,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  typePrice: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    height: 48,
    borderRadius: 12,
    // 4 columns: flexBasis under 25% so the gaps fit on every supported
    // width, flexGrow so each row fills edge-to-edge (no ragged 3+1 wrap).
    flexBasis: '22%',
    flexGrow: 1,
    maxWidth: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  doneForDayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  doneForDayIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
