import React from 'react';
import { Text, StyleSheet, Platform, StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/**
 * Quiet, low-key footnote disclosing that a screen syncs with Apple Health.
 *
 * Apple does NOT require an in-app HealthKit badge — App Review Guideline 2.5.1
 * only asks that HealthKit be used for health/fitness and that the integration
 * be noted in the App Store description (metadata), and the Human Interface
 * Guidelines actively discourage Health-app imagery in the UI. So this is plain,
 * muted text (no heart icon), worded "Apple Health" (not "HealthKit"), meant to
 * sit at the BOTTOM of screens that read/write Health data. iOS-only — renders
 * nothing on web/Android, where Apple Health doesn't exist.
 */
export function AppleHealthFootnote({ style }: { style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  if (Platform.OS !== 'ios') return null;
  return (
    <Text
      style={[styles.text, { color: colors.textMuted }, style]}
      maxFontSizeMultiplier={1.3}
      accessibilityLabel="This screen syncs with Apple Health"
    >
      Syncs with Apple Health
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
});
