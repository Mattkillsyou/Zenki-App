import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';

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

export function ClassCard({
  name,
  instructor,
  time,
  duration,
  spotsLeft,
  type,
  onBook,
}: ClassCardProps) {
  const { colors } = useTheme();
  const isAlmostFull = spotsLeft <= 3;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onBook}
      style={[styles.container, { backgroundColor: colors.surface }]}
    >
      <View style={[styles.iconContainer, { backgroundColor: colors.goldMuted }]}>
        <Ionicons
          name={typeIcons[type] || 'fitness-outline'}
          size={24}
          color={colors.gold}
        />
      </View>
      <View style={styles.content}>
        <Text style={[styles.name, { color: colors.textPrimary }]}>{name}</Text>
        <Text style={[styles.instructor, { color: colors.textSecondary }]}>
          with {instructor}
        </Text>
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {time} ({duration})
            </Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons
              name="people-outline"
              size={14}
              color={isAlmostFull ? colors.red : colors.textMuted}
            />
            <Text
              style={[
                styles.metaText,
                { color: isAlmostFull ? colors.red : colors.textMuted },
              ]}
            >
              {spotsLeft} spots left
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.bookButton, { backgroundColor: colors.red }]}>
        <Text style={[styles.bookText, { color: colors.textInverse }]}>BOOK</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
  },
  name: {
    ...typography.cardTitle,
  },
  instructor: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  meta: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    ...typography.bodySmall,
  },
  bookButton: {
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bookText: {
    ...typography.label,
    fontWeight: '800',
  },
});
