import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

// Generate today's date for display
const getDisplayDate = () => {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
  return now.toLocaleDateString('en-US', options);
};

const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

const INSTRUCTORS = [
  { name: 'Sensei Tim', specialty: 'Jiu-Jitsu, Kenpo', avatar: 'ST' },
  { name: 'Carnage', specialty: 'Muay Thai', avatar: 'CA' },
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

export function BookScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [selectedInstructor, setSelectedInstructor] = useState(0);
  const [selectedType, setSelectedType] = useState(0);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calendarLinked, setCalendarLinked] = useState(false);

  const discovery = AuthSession.useAutoDiscovery('https://accounts.google.com');

  const [, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: CALENDAR_SCOPES,
      redirectUri: AuthSession.makeRedirectUri({ scheme: 'com.zenki.dojo' }),
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
    const title = encodeURIComponent(`Zenki Dojo — ${sessionType} with ${instructor}`);
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

  const handleBooking = () => {
    if (!selectedTime) return;

    const instructor = INSTRUCTORS[selectedInstructor];
    const sessionType = SESSION_TYPES[selectedType];

    navigation.navigate('BookingPayment', {
      instructor: instructor.name,
      sessionType: sessionType.label,
      time: selectedTime,
      price: sessionType.price,
      calendarUrl: addToGoogleCalendar(instructor.name, sessionType.label, selectedTime),
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Book Private</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              By appointment only
            </Text>
          </View>
          {/* Google Calendar Link */}
          <TouchableOpacity
            style={[
              styles.calendarButton,
              { backgroundColor: calendarLinked ? colors.goldMuted : colors.surface, borderColor: calendarLinked ? colors.gold : colors.border, borderWidth: 1.5 },
            ]}
            onPress={calendarLinked ? undefined : linkGoogleCalendar}
          >
            <Ionicons
              name={calendarLinked ? 'checkmark-circle' : 'logo-google'}
              size={18}
              color={calendarLinked ? colors.gold : colors.textSecondary}
            />
            <Text style={[styles.calendarButtonText, { color: calendarLinked ? colors.gold : colors.textSecondary }]}>
              {calendarLinked ? 'Synced' : 'Sync Cal'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Select Instructor */}
        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>INSTRUCTOR</Text>
          {INSTRUCTORS.map((inst, index) => {
            const isSelected = index === selectedInstructor;
            return (
              <TouchableOpacity
                key={inst.name}
                style={[
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 20,
                    padding: 20,
                    marginBottom: 16,
                    borderWidth: 1.5,
                    backgroundColor: isSelected ? colors.goldMuted : colors.surface,
                    borderColor: isSelected ? colors.gold : colors.border,
                    gap: 16,
                  }
                ]}
                onPress={() => setSelectedInstructor(index)}
              >
                <View style={[{ width: 64, height: 64, borderRadius: 32, backgroundColor: isSelected ? colors.gold : colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={[styles.avatarText, { color: isSelected ? colors.textInverse : colors.textMuted }]}>
                    {inst.avatar}
                  </Text>
                </View>
                <View style={styles.instructorInfo}>
                  <Text style={[{ fontSize: 18, fontWeight: '700', color: colors.textPrimary }]}>
                    {inst.name}
                  </Text>
                  <Text style={[styles.instructorSpecialty, { color: colors.textSecondary }]}>
                    {inst.specialty}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={24} color={colors.gold} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Session Type */}
        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SESSION TYPE</Text>
          <View style={styles.typeGrid}>
            {SESSION_TYPES.map((type, index) => {
              const isSelected = index === selectedType;
              return (
                <TouchableOpacity
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
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Time Slots */}
        <View style={[styles.section, { marginTop: 32 }]}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>AVAILABLE TIMES</Text>
          <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>
            {getDisplayDate()}
          </Text>
          <View style={styles.timeGrid}>
            {TIME_SLOTS.map((time) => {
              const isSelected = time === selectedTime;
              return (
                <TouchableOpacity
                  key={time}
                  style={[
                    {
                      height: 52,
                      borderRadius: 14,
                      width: '23%',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1.5,
                      backgroundColor: isSelected ? colors.gold : colors.surface,
                      borderColor: isSelected ? colors.gold : colors.border,
                    }
                  ]}
                  onPress={() => setSelectedTime(time)}
                >
                  <Text style={[
                    {
                      fontSize: 15,
                      fontWeight: '600',
                      color: isSelected ? colors.textInverse : colors.textSecondary,
                    }
                  ]}>
                    {time}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Summary & Book */}
        {selectedTime && (
          <View style={[{ borderRadius: 20, padding: 20, borderWidth: 1.5, backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: spacing.lg, marginTop: 32 }]}>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Session</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {SESSION_TYPES[selectedType].label}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Instructor</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
                {INSTRUCTORS[selectedInstructor].name}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Time</Text>
              <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{selectedTime}</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total</Text>
              <Text style={[styles.summaryValue, { color: colors.gold, fontWeight: '900', fontSize: 20 }]}>
                {SESSION_TYPES[selectedType].priceLabel}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.section, { marginTop: 32, paddingHorizontal: 24, paddingBottom: 24 }]}>
          <Button
            title={selectedTime ? `Pay & Book — ${SESSION_TYPES[selectedType].priceLabel}` : 'Select a Time'}
            onPress={handleBooking}
            fullWidth
            size="lg"

            disabled={!selectedTime}
          />
        </View>

        <View style={{ height: spacing.xxl * 2 }} />
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
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
