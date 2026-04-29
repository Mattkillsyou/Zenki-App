import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SoundPressable } from './SoundPressable';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing } from '../theme';

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text maxFontSizeMultiplier={1.3} style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {actionLabel && onAction && (
        <SoundPressable onPress={onAction}>
          <Text maxFontSizeMultiplier={1.3} style={[styles.action, { color: colors.gold }]}>{actionLabel}</Text>
        </SoundPressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  action: {
    ...typography.label,
  },
});
