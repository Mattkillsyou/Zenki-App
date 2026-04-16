import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { borderRadius, spacing } from '../theme';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined';
}

export function Card({ children, style, variant = 'default' }: CardProps) {
  const { colors } = useTheme();

  const variantStyle: ViewStyle =
    variant === 'elevated'
      ? { backgroundColor: colors.surface, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }
      : variant === 'outlined'
      ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }
      : { backgroundColor: colors.surface };

  return (
    <View style={[styles.base, variantStyle, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
});
