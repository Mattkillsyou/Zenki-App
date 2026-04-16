import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography, borderRadius, spacing } from '../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
  fullWidth = false,
}: ButtonProps) {
  const { colors } = useTheme();

  const variantStyles: Record<string, ViewStyle> = {
    primary: { backgroundColor: colors.red },
    secondary: { backgroundColor: colors.surfaceSecondary },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.gold },
    ghost: { backgroundColor: 'transparent' },
  };

  const textColor =
    variant === 'outline' || variant === 'ghost'
      ? colors.gold
      : variant === 'secondary'
      ? colors.textPrimary
      : colors.textInverse;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.base,
        variantStyles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm,
  },
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  md: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
  },
  lg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    ...typography.button,
  },
});
