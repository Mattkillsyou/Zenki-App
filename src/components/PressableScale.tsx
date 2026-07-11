import React from 'react';
import { ViewStyle } from 'react-native';
import { SoundPressable } from './SoundPressable';

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  /** @deprecated Scale is now the fixed press primitive (scale.pressed). Accepted for back-compat, ignored. */
  scaleTo?: number;
  disabled?: boolean;
}

/**
 * Thin alias over SoundPressable — kept so its existing call sites don't break.
 * The scale-on-press behaviour now lives in SoundPressable (the single press
 * primitive), so this just forwards through and inherits the shared spring +
 * Reduce-Motion contract. New code should use SoundPressable directly.
 */
export function PressableScale({
  children,
  onPress,
  style,
  disabled = false,
}: PressableScaleProps) {
  return (
    <SoundPressable onPress={onPress} disabled={disabled} style={style}>
      {children}
    </SoundPressable>
  );
}
