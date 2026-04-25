import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { Achievement, difficultyColor } from '../types/gamification';
import { useGamification } from '../context/GamificationContext';
import { typography, spacing } from '../theme';

const COLS = 5;
const GAP = 10;

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: number;
  onPress?: () => void;
}

export function AchievementBadge({ achievement, size = 56, onPress }: AchievementBadgeProps) {
  const { colors } = useTheme();
  const iconSize = Math.round(size * 0.46);
  const diff = difficultyColor(achievement.difficulty);

  return (
    <SoundPressable activeOpacity={0.7} onPress={onPress} style={{ alignItems: 'center' }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: achievement.unlocked ? colors.goldMuted : colors.surfaceSecondary,
            borderColor: achievement.unlocked ? diff : 'transparent',
            borderWidth: achievement.unlocked ? 2 : 0,
          },
        ]}
      >
        <Ionicons
          name={achievement.icon as any}
          size={iconSize}
          color={achievement.unlocked ? colors.gold : colors.textMuted}
          style={achievement.unlocked ? undefined : { opacity: 0.35 }}
        />
        {achievement.unlocked && (
          <View style={[styles.flameChip, { backgroundColor: diff }]}>
            <Text style={styles.flameChipText}>{achievement.flameReward}</Text>
          </View>
        )}
      </View>
    </SoundPressable>
  );
}

interface AchievementGridProps {
  achievements: Achievement[];
  maxShow?: number;
}

export function AchievementGrid({ achievements, maxShow }: AchievementGridProps) {
  const { colors } = useTheme();
  const { state } = useGamification();
  const navigation = useNavigation<any>();

  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return a.requirement.value - b.requirement.value;
  });
  const displayed = maxShow ? sorted.slice(0, maxShow) : sorted;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Achievements</Text>
        <View style={styles.counterWrap}>
          <Ionicons name="flame" size={14} color={colors.gold} />
          <Text style={[styles.counter, { color: colors.gold }]}>{' '}{state.flames || 0}</Text>
          <Text style={[styles.counterDot, { color: colors.textMuted }]}>  ·  </Text>
          <Text style={[styles.counter, { color: colors.gold }]}>
            {unlockedCount}/{achievements.length}
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        {displayed.map((a) => (
          <View key={a.id} style={styles.gridCell}>
            <AchievementBadge
              achievement={a}
              onPress={() => navigation.navigate('AchievementDetail', { achievementId: a.id })}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameChip: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameChipText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.cardTitle,
    fontSize: 17,
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counter: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
  },
  counterDot: { fontSize: 13 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: `${100 / COLS}%`,
    alignItems: 'center',
    marginBottom: GAP,
  },
});
