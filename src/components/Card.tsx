import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { borderRadius, spacing, shadows } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined' | 'subtle';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export function Card({ children, style, variant = 'default', padding = 'md' }: CardProps) {
  const { colors } = useTheme();

  const paddingMap = {
    none: 0,
    sm: spacing.smd,
    md: 20,
    lg: spacing.lg,
  };

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.md }
      : variant === 'outlined'
      ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
      : variant === 'subtle'
      ? { backgroundColor: colors.backgroundSubtle, borderWidth: 1, borderColor: colors.borderSubtle }
      : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderSubtle };

  return (
    <View style={[styles.base, variantStyle, { padding: paddingMap[padding] }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
});
