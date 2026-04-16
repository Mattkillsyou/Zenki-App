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

/**
 * Drop-in replacement for TouchableOpacity that plays a themed sound on press.
 * Uses the current screen's sound theme from SoundContext.
 */
export function SoundPressable({ onPress, soundEvent = 'tap', silent, children, ...rest }: Props) {
  const { play } = useSound();
  const handlePress = (e: GestureResponderEvent) => {
    if (!silent) play(soundEvent);
    onPress?.(e);
  };
  return (
    <TouchableOpacity {...rest} onPress={handlePress}>
      {children}
    </TouchableOpacity>
  );
}
