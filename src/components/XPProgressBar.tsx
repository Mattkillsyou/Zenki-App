import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { typography, spacing, borderRadius, easing } from '../theme';

interface XPProgressBarProps {
  level: number;
  currentXP: number;
  nextLevelXP: number;
  progress: number;
  totalXP: number;
}

export function XPProgressBar({ level, currentXP, nextLevelXP, progress, totalXP }: XPProgressBarProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Eased fill — decelerate curve so the bar settles into the new progress
    // instead of tracking a flat linear ramp. (The perpetual linear shine loop
    // that used to live here was never rendered in the JSX; it was dropped so a
    // native-driver loop no longer runs forever off-screen.)
    Animated.timing(widthAnim, {
      toValue: progress,
      duration: reduceMotion ? 0 : 600,
      easing: easing.decelerate,
      useNativeDriver: false,
    }).start();
  }, [progress, reduceMotion]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <View style={styles.topRow}>
        <View style={styles.levelBadge}>
          <View style={[styles.levelCircle, { backgroundColor: colors.gold, borderColor: colors.gold }]}>
            <Text maxFontSizeMultiplier={1.3} style={styles.levelNumber}>{level}</Text>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.levelLabel, { color: colors.textSecondary }]}>Level</Text>
        </View>
        <View style={styles.xpInfo}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.xpText, { color: colors.gold }]}>
            {currentXP} / {nextLevelXP} XP
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.totalXP, { color: colors.textMuted }]}>
            {totalXP} total XP
          </Text>
        </View>
      </View>
      <View style={[styles.barBackground, { backgroundColor: colors.surfaceSecondary }]}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: colors.gold,
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.md + 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.smd,
    gap: spacing.md + 4,
  },
  levelBadge: {
    alignItems: 'center',
    gap: 2,
  },
  levelCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  levelNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
  },
  levelLabel: {
    ...typography.label,
    fontSize: 13,
  },
  xpInfo: {
    flex: 1,
  },
  xpText: {
    fontSize: 16,
    fontWeight: '600',
  },
  totalXP: {
    ...typography.bodySmall,
    fontSize: 14,
    marginTop: 2,
  },
  barBackground: {
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 7,
  },
});
