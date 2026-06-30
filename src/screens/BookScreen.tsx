import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator} from 'react-native';
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

// Generate today's date for display
const getDisplayDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
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

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function BookScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { requestAppointment } = useAppointments();
  const { recordBooking, recordPrivateSession } = useGamification();
  const { sessionTypes, showPricing } = useSchedulingConfig();
  const [selectedInstructor, setSelectedInstructor] = useState(0);
  const [selectedType, setSelectedType] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentDateStr = todayDateString();
  const currentDate = useMemo(() => new Date(), []);
  // Clamp the selection in case the configured sessionTypes list is shorter
  // than the current index (e.g. an admin removed a type).
  const safeType = Math.min(selectedType, sessionTypes.length - 1);
  const currentDuration = parseDurationMinutes(sessionTypes[safeType].duration);

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

    // Defensive — shouldn't be reachable since busy slots are disabled
    const slotDate = slotToDate(currentDate, selectedTime);
    const conflict = isSlotBusy(slotDate, currentDuration, busyIntervals);
    if (conflict) {
      Alert.alert('Unavailable', 'That time is already booked. Please choose another slot.');
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
            <Text style={[styles.title, { color: colors.textPrimary, fontSize: 24 }]}>Book Private</Text>
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
                    borderRadius: 14,
                    paddingLeft: 6,
                    paddingRight: 12,
                    paddingVertical: 6,
                    borderWidth: 1.5,
                    backgroundColor: isSelected ? colors.goldMuted : colors.surface,
                    borderColor: isSelected ? colors.gold : colors.border,
                    gap: 8,
                    flexShrink: 0,
                  }}
                  onPress={() => setSelectedInstructor(index)}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isSelected ? colors.gold : colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[styles.avatarText, { color: isSelected ? colors.textInverse : colors.textMuted, fontSize: 12 }]}>
                      {inst.avatar}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{inst.name}</Text>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>{inst.specialty}</Text>
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
                      borderRadius: 20,
                      padding: 16,
                      alignItems: 'center',
                      borderWidth: 1.5,
                      backgroundColor: isSelected ? colors.gold : colors.surface,
                      borderColor: isSelected ? colors.gold : colors.border,
                    }
                  ]}
                  onPress={() => setSelectedType(index)}
                >
                  <Text style={[
                    styles.typeLabel,
                    { color: isSelected ? colors.textInverse : colors.textPrimary },
                  ]}>
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
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
            {getDisplayDate()}
          </Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((time) => {
              const isSelected = time === selectedTime;
              const slotDate = slotToDate(currentDate, time);
              const conflict = isSlotBusy(slotDate, currentDuration, busyIntervals);
              const isBusy = conflict !== null;
              return (
                <SoundPressable
                  key={time}
                  disabled={isBusy}
                  style={[
                    {
                      height: 52,
                      borderRadius: 14,
                      width: '23%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      backgroundColor: isBusy
                        ? colors.surfaceSecondary
                        : isSelected
                        ? colors.gold
                        : colors.surface,
                      borderColor: isBusy
                        ? colors.border
                        : isSelected
                        ? colors.gold
                        : colors.border,
                      opacity: isBusy ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text style={{
                    fontSize: 15,
                    fontWeight: '600',
                    color: isBusy
                      ? colors.textMuted
                      : isSelected
                      ? colors.textInverse
                      : colors.textSecondary,
                    textDecorationLine: isBusy ? 'line-through' : 'none',
                  }}>
                    {time}
                  </Text>
                  {isBusy && (
                    <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted, marginTop: 1, letterSpacing: 0.5 }}>
                      UNAVAILABLE
                    </Text>
                  )}
                </SoundPressable>
              );
            })}
          </View>
        </View>

        {/* Summary + Book — compact single row, always at bottom */}
        <View style={[styles.section, { paddingBottom: 12 }]}>
          {selectedTime && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, color: colors.textMuted }}>
                {sessionTypes[safeType].label} · {INSTRUCTORS[selectedInstructor].name} · {selectedTime}
              </Text>
              {showPricing && (
                <Text style={{ fontSize: 16, fontWeight: '900', color: colors.gold }}>
                  {priceLabelFor(sessionTypes[safeType])}
                </Text>
              )}
            </View>
          )}
          <Button
            title={selectedTime ? (showPricing ? `Request Booking · ${priceLabelFor(sessionTypes[safeType])}` : 'Request Booking') : 'Select a Time'}
            onPress={handleBooking}
            fullWidth
            size="lg"
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
    paddingBottom: spacing.md,
  },
  title: {
    fontSize: 34,
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
  instructorInfo: {
    flex: 1,
  },
  instructorSpecialty: {
    ...typography.bodySmall,
    marginTop: 2,
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
    marginTop: 4,
  },
  typePrice: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  dateLabel: {
    ...typography.body,
    marginBottom: spacing.md,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    ...typography.bodySmall,
  },
  summaryValue: {
    ...typography.body,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
  },
});
