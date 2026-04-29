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
 * Composes two mechanisms that work together (NOT against each other):
 *
 *   1. <KeyboardAvoidingView behavior="padding"> on iOS / "height" on
 *      Android — when the keyboard appears, this shrinks the wrapper's
 *      bottom edge so its content frame stops just above the keyboard.
 *      For short centered forms (an icon, a label, a TextInput, a
 *      submit button stacked together with `justifyContent: 'center'`),
 *      this is what keeps the SUBMIT BUTTON visible — the button rises
 *      with the rest of the cluster instead of being clipped at the
 *      bottom.
 *
 *   2. ScrollView's `automaticallyAdjustKeyboardInsets` — once KAV has
 *      shifted the ScrollView frame above the keyboard, this prop
 *      handles auto-scrolling the focused TextInput into view INSIDE
 *      the (now-shifted) ScrollView. Necessary for tall forms where
 *      the field is near the bottom of a long list.
 *
 * They don't double-apply because KAV's shrink-from-bottom moves the
 * ScrollView's frame so its visible bottom is at or above the keyboard
 * top. Auto-inset then sees zero (or minimal) keyboard overlap with the
 * shifted frame and adds zero (or minimal) contentInset.
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
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="automatic"
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
