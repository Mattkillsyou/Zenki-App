import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { typography, spacing, borderRadius } from '../theme';

interface StreakBadgeProps {
  streak: number;
  compact?: boolean;
}

export function StreakBadge({ streak, compact }: StreakBadgeProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (reduceMotion || streak === 0) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [streak, reduceMotion]);

  if (streak === 0) {
    return (
      <View style={[compact ? styles.compactContainer : styles.container, { backgroundColor: colors.surface }]}>
        <Ionicons name="flame-outline" size={compact ? 20 : 28} color={colors.textMuted} />
        <Text style={[compact ? styles.compactCount : styles.count, { color: colors.textMuted }]}>0</Text>
        {!compact && <Text style={[styles.label, { color: colors.textMuted }]}>day streak</Text>}
      </View>
    );
  }

  const flameColor = streak >= 30 ? '#FF4500' : streak >= 7 ? '#FF6B35' : colors.gold;

  return (
    <View style={[compact ? styles.compactContainer : styles.container, { backgroundColor: colors.surface }]}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Animated.View style={{ opacity: glowAnim }}>
          <Ionicons name="flame" size={compact ? 22 : 32} color={flameColor} />
        </Animated.View>
      </Animated.View>
      <Text style={[compact ? styles.compactCount : styles.count, { color: flameColor }]}>
        {streak}
      </Text>
      {!compact && (
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          day streak
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.md + 4,
    paddingHorizontal: spacing.xl,
    borderRadius: 16,
    gap: 2,
  },
  count: {
    fontSize: 30,
    fontWeight: '900',
  },
  label: {
    ...typography.label,
    fontSize: 10,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    gap: 4,
  },
  compactCount: {
    fontSize: 16,
    fontWeight: '800',
  },
});
