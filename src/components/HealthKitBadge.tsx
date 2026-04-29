import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

/**
 * Apple App Store Review Guideline 2.5.1: apps using HealthKit must
 * clearly identify HealthKit functionality in the UI. This badge is
 * placed on every screen that reads from or writes to HealthKit
 * (Weight, MacroTracker, WorkoutSession, BodyLab, Bloodwork, DEXA).
 *
 * The label says "Syncs with Apple Health" so users know data is
 * flowing to/from Apple Health on iOS.
 */
export function HealthKitBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: colors.surface, borderColor: colors.border },
        style,
      ]}
      accessibilityLabel="This screen syncs with Apple Health"
    >
      <Ionicons name="heart" size={12} color="#FF3B30" />
      <Text
        style={[styles.text, { color: colors.textSecondary }]}
        maxFontSizeMultiplier={1.3}
      >
        Syncs with Apple Health
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
