import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Achievement } from '../types/gamification';
import { typography, spacing, borderRadius } from '../theme';

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: 'sm' | 'md';
}

export function AchievementBadge({ achievement, size = 'md' }: AchievementBadgeProps) {
  const { colors } = useTheme();
  const isSmall = size === 'sm';
  const iconSize = isSmall ? 28 : 36;
  const containerSize = isSmall ? 67 : 86;

  return (
    <View style={[styles.container, { width: containerSize }]}>
      <View
        style={[
          styles.circle,
          {
            width: containerSize,
            height: containerSize,
            borderRadius: containerSize / 2,
            backgroundColor: achievement.unlocked ? colors.goldMuted : colors.surfaceSecondary,
            borderColor: achievement.unlocked ? colors.gold : 'transparent',
            borderWidth: achievement.unlocked ? 2 : 0,
          },
        ]}
      >
        <Ionicons
          name={achievement.icon as any}
          size={iconSize}
          color={achievement.unlocked ? colors.gold : colors.textMuted}
          style={achievement.unlocked ? undefined : { opacity: 0.3 }}
        />
      </View>
      <Text
        style={[
          styles.title,
          {
            color: achievement.unlocked ? colors.textPrimary : colors.textMuted,
            fontSize: isSmall ? 11 : 12,
            fontWeight: '600',
          },
        ]}
        numberOfLines={2}
      >
        {achievement.title}
      </Text>
    </View>
  );
}

interface AchievementGridProps {
  achievements: Achievement[];
  maxShow?: number;
}

export function AchievementGrid({ achievements, maxShow }: AchievementGridProps) {
  const { colors } = useTheme();
  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return 0;
  });
  const displayed = maxShow ? sorted.slice(0, maxShow) : sorted;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <View>
      <View style={[styles.headerRow, { marginBottom: spacing.smd }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: 17 }]}>Achievements</Text>
        <Text style={[styles.counter, { color: colors.gold }]}>
          {unlockedCount}/{achievements.length}
        </Text>
      </View>
      <View style={styles.grid}>
        {displayed.map((a) => (
          <AchievementBadge key={a.id} achievement={a} size="sm" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.label,
    textAlign: 'center',
    lineHeight: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.cardTitle,
    fontSize: 16,
  },
  counter: {
    ...typography.label,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.smd,
  },
});
