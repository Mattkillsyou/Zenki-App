import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';

interface ClassCardProps {
  name: string;
  instructor: string;
  time: string;
  duration: string;
  spotsLeft: number;
  type: 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat';
  onBook: () => void;
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

export function ClassCard({ name, instructor, time, duration, spotsLeft, type, onBook }: ClassCardProps) {
  const { colors } = useTheme();
  const isAlmostFull = spotsLeft <= 3;
  const accent = typeColors[type] || colors.gold;

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onBook} style={[styles.container, { backgroundColor: colors.surface, marginBottom: 14 }]}>
      <View style={[styles.iconWrap, { backgroundColor: accent + '20' }]}>
        <Ionicons name={typeIcons[type] || 'fitness-outline'} size={26} color={accent} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
        <Text style={[styles.instructor, { color: colors.textSecondary }]}>with {instructor}</Text>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
            <Text style={[styles.metaText, { color: colors.textTertiary }]}>{time} · {duration}</Text>
          </View>
          <View style={[styles.spotsBadge, { backgroundColor: isAlmostFull ? colors.errorMuted : colors.accentTint }]}>
            <Text style={[styles.spotsText, { color: isAlmostFull ? colors.error : colors.textSecondary }]}>
              {spotsLeft} left
            </Text>
          </View>
        </View>
      </View>
      <TouchableOpacity onPress={onBook} style={[styles.bookBtn, { backgroundColor: colors.red }]} activeOpacity={0.8}>
        <Ionicons name="arrow-forward" size={18} color="#FFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  name: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  instructor: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '400',
  },
  spotsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  spotsText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bookBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
