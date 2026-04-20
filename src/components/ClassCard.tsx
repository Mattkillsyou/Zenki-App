import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { addEventToCalendar } from '../services/calendarIntegration';

interface ClassCardProps {
  name: string;
  instructor: string;
  time: string;
  duration: string;
  spotsLeft: number;
  type: 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat';
  onBook: () => void;
  booked?: boolean;                                        // user already has this class booked
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
}

/** Parse "12:00 PM" + today's date into a Date object. */
function toTodayAt(timeLabel: string): Date | null {
  const m = timeLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

function parseDurationMinutes(dur: string): number {
  const m = dur.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 60;
}

const typeIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  'jiu-jitsu': 'body-outline',
  'muay-thai': 'fitness-outline',
  'pilates': 'leaf-outline',
  'open-mat': 'people-outline',
};

const typeColors: Record<string, string> = {
  'jiu-jitsu': '#D4A017',
  'muay-thai': '#EF4444',
  'pilates': '#22C55E',
  'open-mat': '#3B82F6',
};

export function ClassCard({ name, instructor, time, duration, spotsLeft, type, onBook, booked, status }: ClassCardProps) {
  const { colors } = useTheme();
  const [addingToCal, setAddingToCal] = useState(false);
  const isAlmostFull = spotsLeft <= 3;
  const accent = typeColors[type] || colors.gold;
  const statusLabel = booked
    ? status === 'pending'
      ? 'PENDING'
      : status === 'confirmed'
      ? 'BOOKED'
      : (status || 'BOOKED').toString().toUpperCase()
    : null;
  const statusColor = status === 'pending' ? colors.gold : ((colors as any).green || '#22C55E');

  const handleAddToCalendar = async (e: any) => {
    e.stopPropagation();
    const startsAt = toTodayAt(time);
    if (!startsAt) {
      Alert.alert('Can’t add to calendar', 'This class doesn’t have a scheduled time.');
      return;
    }
    setAddingToCal(true);
    try {
      const result = await addEventToCalendar({
        title: `${name} · Zenki Dojo`,
        startsAt,
        durationMinutes: parseDurationMinutes(duration),
        location: 'Zenki Dojo, Los Angeles',
        notes: `Instructor: ${instructor}`,
      });
      if (result.ok) {
        Alert.alert(
          'Added to calendar',
          result.method === 'native'
            ? 'Event saved to your Apple Calendar with a 1-hour reminder.'
            : 'Opened Google Calendar. Confirm to save the event.',
        );
      } else {
        Alert.alert('Couldn’t add', 'Calendar permission was denied or no calendar is available.');
      }
    } finally {
      setAddingToCal(false);
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onBook} style={[styles.container, { backgroundColor: colors.surface, marginBottom: 10 }]}>
      <View style={[styles.iconWrap, { backgroundColor: accent + '20' }]}>
        <Ionicons name={typeIcons[type] || 'fitness-outline'} size={22} color={accent} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.instructor, { color: colors.textSecondary }]} numberOfLines={1}>with {instructor}</Text>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>{time} · {duration}</Text>
          </View>
          {booked ? (
            <View style={[styles.spotsBadge, { backgroundColor: statusColor + '25' }]}>
              <Text style={[styles.spotsText, { color: statusColor, fontWeight: '800', letterSpacing: 1 }]}>
                {statusLabel}
              </Text>
            </View>
          ) : (
            <View style={[styles.spotsBadge, { backgroundColor: isAlmostFull ? colors.errorMuted : colors.accentTint }]}>
              <Text style={[styles.spotsText, { color: isAlmostFull ? colors.error : colors.textSecondary }]}>
                {spotsLeft} left
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Calendar quick-add */}
      <TouchableOpacity
        onPress={handleAddToCalendar}
        style={[styles.calBtn, { backgroundColor: colors.backgroundElevated, opacity: addingToCal ? 0.5 : 1 }]}
        activeOpacity={0.7}
        disabled={addingToCal}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
      </TouchableOpacity>

      <TouchableOpacity onPress={onBook} style={[styles.bookBtn, { backgroundColor: booked ? colors.backgroundElevated : colors.red }]} activeOpacity={0.8}>
        <Ionicons name={booked ? 'checkmark' : 'arrow-forward'} size={16} color={booked ? statusColor : '#FFF'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  name: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  instructor: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '400',
  },
  spotsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  spotsText: {
    fontSize: 10,
    fontWeight: '600',
  },
  bookBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
