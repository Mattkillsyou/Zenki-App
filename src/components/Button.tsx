import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  ActivityIndicator,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography, borderRadius, spacing, shadows } from '../theme';

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
    primary: { backgroundColor: colors.red, ...shadows.md },
    secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
    outline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent' },
  };

  const textColor =
    variant === 'outline' || variant === 'ghost'
      ? colors.textPrimary
      : variant === 'secondary'
      ? colors.textPrimary
      : '#FFFFFF';

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
        <Text style={[styles.text, styles[`${size}Text` as keyof typeof styles] as any, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.md,
  },
  sm: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    minHeight: 40,
  },
  md: {
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    minHeight: 50,
  },
  lg: {
    paddingVertical: 16,
    paddingHorizontal: spacing.xl,
    minHeight: 56,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.35,
  },
  text: {
    ...typography.button,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  smText: {
    fontSize: 14,
  },
  mdText: {
    fontSize: 15,
  },
  lgText: {
    fontSize: 16,
  },
});
