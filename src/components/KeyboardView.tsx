import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

/**
 * Shared keyboard-avoidance wrapper.
 *
 * Applies the correct behavior per platform:
 *   iOS → "padding" (pushes the content up above the keyboard)
 *   Android → undefined (system-level handling)
 *
 * Pair with a ScrollView using `keyboardShouldPersistTaps="handled"` inside
 * so taps on buttons while the keyboard is up don't require a second press.
 */
export function KeyboardView({
  children,
  style,
  offset = 0,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Extra vertical offset applied on iOS (e.g. 64 when inside a header). */
  offset?: number;
}) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
