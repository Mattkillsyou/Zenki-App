import React from 'react';
import { TouchableOpacity, TouchableOpacityProps, GestureResponderEvent } from 'react-native';
import { useSound } from '../context/SoundContext';
import { SoundEvent } from '../sounds/synth';

interface Props extends TouchableOpacityProps {
  /** Which sound event to play on press. Defaults to 'tap'. */
  soundEvent?: SoundEvent;
  /** Skip sound for this press (e.g. for rapid repeated taps). */
  silent?: boolean;
}

// Per master prompt §36: minimum 44×44pt touch target with
// hitSlop={{top:8,bottom:8,left:8,right:8}}. Baking the default
// here means every SoundPressable callsite (~800+) gets the
// extended touch area for free; specific callsites can still
// override `hitSlop` (or pass a tighter value to disable).
const DEFAULT_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

/**
 * Drop-in replacement for TouchableOpacity that plays a themed sound on press.
 * Uses the current screen's sound theme from SoundContext.
 */
export function SoundPressable({ onPress, soundEvent = 'tap', silent, hitSlop, children, ...rest }: Props) {
  const { play } = useSound();
  const handlePress = (e: GestureResponderEvent) => {
    if (!silent) play(soundEvent);
    onPress?.(e);
  };
  return (
    <TouchableOpacity hitSlop={hitSlop ?? DEFAULT_HIT_SLOP} {...rest} onPress={handlePress}>
      {children}
    </TouchableOpacity>
  );
}
