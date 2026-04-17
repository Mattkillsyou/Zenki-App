import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { formatCount } from '../utils/formatCount';

interface PointsBadgeProps {
  points: number;
  compact?: boolean;
  onPress?: () => void;
}

/**
 * Diamonds display — earnable currency redeemable in the store.
 * Subtle gold sparkle pulse when points > 0.
 *
 * Always renders the same JSX structure regardless of points value —
 * only the colors and icon variant change. Ensures React re-renders
 * reliably when the points prop changes.
 */
export function PointsBadge({ points, compact, onPress }: PointsBadgeProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const sparkleAnim = useRef(new Animated.Value(0.7)).current;

  const hasPoints = points > 0;

  useEffect(() => {
    if (reduceMotion || !hasPoints) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleAnim, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(sparkleAnim, { toValue: 0.7, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hasPoints, reduceMotion, sparkleAnim]);

  const content = (
    <>
      <Animated.View style={{ opacity: hasPoints ? sparkleAnim : 1 }}>
        <Ionicons
          name={hasPoints ? 'diamond' : 'diamond-outline'}
          size={compact ? 16 : 22}
          color={hasPoints ? colors.gold : colors.textMuted}
        />
      </Animated.View>
      <Text
        style={[
          compact ? styles.compactCount : styles.count,
          { color: hasPoints ? colors.gold : colors.textMuted },
        ]}
      >
        {formatCount(points)}
      </Text>
      {!compact && (
        <Text style={[styles.label, { color: hasPoints ? colors.textSecondary : colors.textMuted }]}>
          diamonds
        </Text>
      )}
    </>
  );

  const containerStyle = [
    compact ? styles.compactContainer : styles.container,
    { backgroundColor: colors.surface },
  ];

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={containerStyle}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={containerStyle}>{content}</View>;
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
