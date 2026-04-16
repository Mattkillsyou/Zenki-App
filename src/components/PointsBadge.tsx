import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';

interface PointsBadgeProps {
  points: number;
  compact?: boolean;
  onPress?: () => void;
}

/**
 * Dojo Points display — earnable currency redeemable in the store.
 * Subtle gold sparkle pulse when points > 0.
 */
export function PointsBadge({ points, compact, onPress }: PointsBadgeProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const sparkleAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (reduceMotion || points === 0) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(sparkleAnim, { toValue: 0.7, duration: 1400, useNativeDriver: true }),
      ]),
    ).start();
  }, [points, reduceMotion]);

  const Wrapper: any = onPress ? TouchableOpacity : View;
  const wrapperProps = onPress ? { onPress, activeOpacity: 0.7 } : {};

  if (points === 0) {
    return (
      <Wrapper {...wrapperProps} style={[compact ? styles.compactContainer : styles.container, { backgroundColor: colors.surface }]}>
        <Ionicons name="diamond-outline" size={compact ? 16 : 22} color={colors.textMuted} />
        <Text style={[compact ? styles.compactCount : styles.count, { color: colors.textMuted }]}>0</Text>
        {!compact && <Text style={[styles.label, { color: colors.textMuted }]}>diamonds</Text>}
      </Wrapper>
    );
  }

  return (
    <Wrapper {...wrapperProps} style={[compact ? styles.compactContainer : styles.container, { backgroundColor: colors.surface }]}>
      <Animated.View style={{ opacity: sparkleAnim }}>
        <Ionicons name="diamond" size={compact ? 16 : 22} color={colors.gold} />
      </Animated.View>
      <Text style={[compact ? styles.compactCount : styles.count, { color: colors.gold }]}>
        {points.toLocaleString()}
      </Text>
      {!compact && <Text style={[styles.label, { color: colors.textSecondary }]}>diamonds</Text>}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 2,
  },
  count: {
    fontSize: 26,
    fontWeight: '800',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
    fontSize: 14,
    fontWeight: '800',
  },
});
