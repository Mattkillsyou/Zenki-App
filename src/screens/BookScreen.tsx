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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button, ScreenContainer } from '../components';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';
import { useGamification } from '../context/GamificationContext';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { fetchBusyIntervals, isSlotBusy, BusyInterval } from '../services/calendarAvailability';

WebBrowser.maybeCompleteAuthSession();

// Generate today's date for display
const getDisplayDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  return now.toLocaleDateString('en-US', options);
};

import { GOOGLE_CLIENT_ID } from '../config/env';
// GOOGLE_CLIENT_ID loaded from Expo config extra or env vars — see src/config/env.ts
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const INSTRUCTORS = [
  { name: 'Sensei Tim', specialty: 'Jiu-Jitsu, Kenpo', avatar: 'ST' },
  { name: 'Carnage', specialty: 'Muay Thai', avatar: 'CA' },
  { name: 'Justin', specialty: 'Muay Thai', avatar: 'JU' },
  { name: 'Rachel', specialty: 'Mobility, Pilates', avatar: 'RA' },
];

const SESSION_TYPES = [
  { label: '1:1 Private', duration: '60 min', price: 150, priceLabel: '$150' },
  { label: 'Partner Session', duration: '60 min', price: 100, priceLabel: '$100/ea' },
  { label: 'Pilates', duration: '50 min', price: 120, priceLabel: '$120' },
];

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
  const [selectedInstructor, setSelectedInstructor] = useState(0);
  const [selectedType, setSelectedType] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calendarLinked, setCalendarLinked] = useState(false);
  const [busyIntervals, setBusyIntervals] = useState<BusyInterval[]>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const currentDateStr = todayDateString();
  const currentDate = useMemo(() => new Date(), []);
  const currentDuration = parseDurationMinutes(SESSION_TYPES[selectedType].duration);

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

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const [, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: CALENDAR_SCOPES,
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'zenkidojo' }),
    },
    discovery,
  );

  const linkGoogleCalendar = async () => {
    try {
      const result = await promptAsync();
      if (result?.type === 'success') {
        setCalendarLinked(true);
        Alert.alert('Connected', 'Google Calendar linked. Bookings will sync automatically.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not connect to Google Calendar.');
    }
  };

  const addToGoogleCalendar = (instructor: string, sessionType: string, time: string) => {
    // Create a Google Calendar event URL as a fallback
    const title = encodeURIComponent(`Zenki Dojo · ${sessionType} with ${instructor}`);
    const location = encodeURIComponent('Zenki Dojo, 1714 Hillhurst Ave, LA 90027');
    const details = encodeURIComponent(`Private session at Zenki Dojo.\n\nInstructor: ${instructor}\nType: ${sessionType}\n\nPlease arrive 10 minutes early.`);

    // Build date string from current date
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${month}${day}`;
    const timeMap: Record<string, string> = {
      '9:00 AM': '090000', '10:00 AM': '100000', '11:00 AM': '110000',
      '1:00 PM': '130000', '2:00 PM': '140000', '3:00 PM': '150000',
      '5:00 PM': '170000', '6:00 PM': '180000',
    };
    const startTime = timeMap[time] || '100000';
    const endHour = (parseInt(startTime.substring(0, 2)) + 1).toString().padStart(2, '0');
    const endTime = `${endHour}0000`;

    const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateStr}T${startTime}/${dateStr}T${endTime}&location=${location}&details=${details}`;

    return calUrl;
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

    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to request a booking.');
      return;
    }

    const instructor = INSTRUCTORS[selectedInstructor];
    const sessionType = SESSION_TYPES[selectedType];

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
        [{ text: 'OK', onPress: () => navigation.goBack() }],
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
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary, fontSize: 24 }]}>Book Private</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              By appointment only
            </Text>
          </View>
          <SoundPressable
            style={[
              styles.calendarButton,
              { backgroundColor: calendarLinked ? colors.goldMuted : colors.surface, borderColor: calendarLinked ? colors.gold : colors.border, borderWidth: 1.5 },
            ]}
            onPress={calendarLinked ? undefined : linkGoogleCalendar}
          >
            <Ionicons
              name={calendarLinked ? 'checkmark-circle' : 'logo-google'}
              size={16}
              color={calendarLinked ? colors.gold : colors.textSecondary}
            />
            <Text style={[styles.calendarButtonText, { color: calendarLinked ? colors.gold : colors.textSecondary }]}>
              {calendarLinked ? 'Synced' : 'Sync'}
            </Text>
          </SoundPressable>
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
            {SESSION_TYPES.map((type, index) => {
              const isSelected = index === selectedType;
              return (
                <SoundPressable
                  key={type.label}
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
                  <Text style={[
                    styles.typePrice,
                    { color: isSelected ? colors.textInverse : colors.gold },
                  ]}>
                    {type.priceLabel}
                  </Text>
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
                {SESSION_TYPES[selectedType].label} · {INSTRUCTORS[selectedInstructor].name} · {selectedTime}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '900', color: colors.gold }}>
                {SESSION_TYPES[selectedType].priceLabel}
              </Text>
            </View>
          )}
          <Button
            title={selectedTime ? `Request Booking · ${SESSION_TYPES[selectedType].priceLabel}` : 'Select a Time'}
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
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  calendarButtonText: {
    ...typography.label,
    fontSize: 11,
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
