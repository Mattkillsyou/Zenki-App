import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';

/**
 * Caveat banner for AI-extracted medical data (DEXA, bloodwork).
 *
 * These values are parsed by an AI model from a user-uploaded report photo —
 * they are ESTIMATES, not authoritative lab/clinical results, and can contain
 * OCR/parse errors. Surfacing this prevents users from treating extracted
 * numbers as lab-grade truth (medical-liability surface, see launch report P1-4).
 */
export function AiExtractedBanner({ kind = 'report' }: { kind?: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.banner,
        { backgroundColor: colors.goldMuted ?? colors.surface, borderColor: colors.gold ?? colors.border },
      ]}
    >
      <Ionicons name="sparkles-outline" size={16} color={colors.gold} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        AI-extracted from your uploaded {kind}. These are estimates, not a substitute for your
        provider or lab — verify any value before acting on it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  text: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '500' },
});
