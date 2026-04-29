import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';

/**
 * KAV-only wrapper for screens that own their own ScrollView / FlatList
 * AND have a sticky footer that needs to ride above the keyboard
 * (e.g. MacroSetup's Continue button, Onboarding's Next nav row,
 * MessagesChat's input bar). On iOS, behavior="padding" pushes the
 * whole subtree up; on Android, the system handles it via
 * windowSoftInputMode=adjustResize so we don't need a wrapper.
 *
 * If the screen has neither a sticky footer nor a custom inner
 * ScrollView, prefer `KeyboardAwareScrollView` below — it gives the
 * better "focused field auto-scrolls into view" UX.
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
  /** Android-only vertical offset (e.g. header height). iOS uses native
   *  inset adjustment and ignores this. Default 0. */
  offset?: number;
  /** Style for the outer flex:1 container. */
  outerStyle?: StyleProp<ViewStyle>;
  /** ContentContainerStyle for the inner ScrollView. paddingBottom 32
   *  is applied by default — this style is merged on top. */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * One-stop "keyboard-safe scrollable screen" wrapper used by sign-in,
 * onboarding, admin forms, and any other TextInput-heavy surface.
 *
 * On iOS (14+) this relies on the ScrollView's native
 * `automaticallyAdjustKeyboardInsets` — that single prop handles BOTH
 * (a) adding bottom contentInset equal to the keyboard height so the
 * keyboard doesn't cover content, AND (b) auto-scrolling the focused
 * TextInput above the keyboard. We deliberately do NOT wrap in
 * `KeyboardAvoidingView` on iOS because behavior="padding" + the
 * native inset adjustment double-apply, which not only wastes space
 * but also breaks the auto-scroll-to-focused-field. This is the
 * pattern Apple's own apps use (Notes, Messages, Mail).
 *
 * On Android, native keyboard handling via windowSoftInputMode
 * (typically `adjustResize`) shrinks the screen when the keyboard
 * appears, so we wrap in KeyboardAvoidingView with behavior="height"
 * as a belt-and-suspenders for screens that don't get the system's
 * adjustment for any reason.
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
  const scrollView = (
    <ScrollView
      contentContainerStyle={[{ flexGrow: 1, paddingBottom: 32 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // iOS 14+: native bottom-inset adjustment + auto-scroll the focused
      // TextInput above the keyboard. No-op on Android.
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      {...rest}
    >
      {children}
    </ScrollView>
  );
  if (Platform.OS === 'ios') {
    // No KeyboardAvoidingView on iOS — see header docblock.
    return <View style={[{ flex: 1 }, outerStyle]}>{scrollView}</View>;
  }
  return (
    <KeyboardAvoidingView
      behavior="height"
      keyboardVerticalOffset={Math.max(offset, 24)}
      style={[{ flex: 1 }, outerStyle]}
    >
      {scrollView}
    </KeyboardAvoidingView>
  );
}
