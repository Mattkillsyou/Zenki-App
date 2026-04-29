import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { MAX_CONTENT_WIDTH, MAX_FORM_WIDTH } from '../theme';

/**
 * Soft horizontal-width cap for screens — prevents content from stretching
 * edge-to-edge on iPad while leaving phones unaffected.
 *
 * Per master prompt §36: "All screen content containers: add `maxWidth: 700`
 * (or 600 for form-heavy screens) with `alignSelf: 'center'` and
 * `width: '100%'`. This prevents content from stretching edge-to-edge on
 * iPad's wide viewport."
 *
 * Example:
 *   <SafeAreaView style={{ flex: 1 }}>
 *     <ScreenContainer>
 *       <ScrollView>...</ScrollView>
 *     </ScreenContainer>
 *   </SafeAreaView>
 *
 * For form-heavy screens (sign-in, profile edit, admin forms) pass
 * `maxWidth="form"` for the tighter 600px cap.
 */
export function ScreenContainer({
  children,
  maxWidth = 'content',
  style,
}: {
  children: React.ReactNode;
  /** 'content' (700px) for general screens, 'form' (600px) for form-heavy. */
  maxWidth?: 'content' | 'form';
  style?: StyleProp<ViewStyle>;
}) {
  const cap = maxWidth === 'form' ? MAX_FORM_WIDTH : MAX_CONTENT_WIDTH;
  return (
    <View
      style={[
        {
          flex: 1,
          width: '100%',
          maxWidth: cap,
          alignSelf: 'center',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
