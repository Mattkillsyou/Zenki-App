import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

/**
 * Shared keyboard-avoidance wrapper.
 *
 * Applies the correct behavior per platform:
 *   iOS → "padding" (pushes the content up above the keyboard)
 *   Android → undefined (system-level handling)
 *
 * Pair with a ScrollView using `keyboardShouldPersistTaps="handled"` inside
 * so taps on buttons while the keyboard is up don't require a second press.
 *
 * For the common "form on a scrollable screen" case, prefer
 * `KeyboardAwareScrollView` below — it bakes in the right ScrollView props
 * (auto-adjust insets, dismiss-on-drag, paddingBottom for the submit button).
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

interface KeyboardAwareScrollViewProps
  extends Omit<ScrollViewProps, 'contentContainerStyle'> {
  children: React.ReactNode;
  /** Extra vertical offset applied on iOS (e.g. header height). Default 0. */
  offset?: number;
  /** Style for the outer KeyboardAvoidingView. */
  outerStyle?: StyleProp<ViewStyle>;
  /** ContentContainerStyle for the inner ScrollView. paddingBottom 32
   *  is applied by default — this style is merged on top. */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * One-stop "keyboard-safe scrollable screen" wrapper used by sign-in,
 * onboarding, admin forms, and any other TextInput-heavy surface.
 *
 * Applies the polish props that prevent the iPad / large-iPhone keyboard from
 * covering the submit button when it slides up:
 *   • iOS: behavior="padding", keyboardVerticalOffset honored
 *   • Android: behavior="height", default 24 offset for status bar
 *   • ScrollView: automaticallyAdjustKeyboardInsets (auto-scrolls focused
 *     input above the keyboard), keyboardShouldPersistTaps="handled"
 *     (so a tap on Sign In doesn't get eaten by keyboard dismissal),
 *     keyboardDismissMode="on-drag" (swipe down dismisses), paddingBottom: 32
 *     (button has breathing room when content shifts up).
 *
 * Per master prompt §32. Reference call site: SignInScreen.
 */
export function KeyboardAwareScrollView({
  children,
  offset = 0,
  outerStyle,
  contentContainerStyle,
  ...rest
}: KeyboardAwareScrollViewProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : Math.max(offset, 24)}
      style={[{ flex: 1 }, outerStyle]}
    >
      <ScrollView
        contentContainerStyle={[{ flexGrow: 1, paddingBottom: 32 }, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // RN 0.71+ iOS-native auto-adjustment so focused TextInput stays above keyboard.
        automaticallyAdjustKeyboardInsets
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
