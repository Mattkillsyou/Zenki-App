import React, { useRef } from 'react';
import { Animated, TouchableOpacity, TouchableOpacityProps, GestureResponderEvent } from 'react-native';
import { useSound } from '../context/SoundContext';
import { SoundEvent } from '../sounds/synth';
import { useMotion } from '../context/MotionContext';
import { duration, easing, scale as scaleTokens, spring } from '../theme';

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

// Wrap TouchableOpacity so its `style` prop accepts an Animated transform
// (the press-scale) alongside the built-in opacity dim. Both ride the native
// driver on the same view — no extra layout node, so the ~800 call sites keep
// their existing flex layout untouched.
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

/**
 * The app's single press primitive. Plays a themed sound and gives every
 * press one consistent physical response: a subtle scale-down + softened
 * opacity dim on press-in, a spring back on release. This replaces the old
 * 2012-era `activeOpacity 0.2` lottery — the dim is now a gentle 0.9 and the
 * scale is what the eye actually reads.
 *
 * Reduce Motion → opacity-only (no scale transform, no spring).
 */
export function SoundPressable({
  onPress,
  onPressIn,
  onPressOut,
  soundEvent = 'tap',
  silent,
  hitSlop,
  style,
  children,
  ...rest
}: Props) {
  const { play } = useSound();
  const { reduceMotion } = useMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = (e: GestureResponderEvent) => {
    if (!silent) play(soundEvent);
    onPress?.(e);
  };

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!reduceMotion) {
      Animated.timing(scaleAnim, {
        toValue: scaleTokens.pressed,
        duration: duration.instant,
        easing: easing.decelerate,
        useNativeDriver: true,
      }).start();
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: GestureResponderEvent) => {
    if (!reduceMotion) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: spring.press.friction,
        tension: spring.press.tension,
        useNativeDriver: true,
      }).start();
    }
    onPressOut?.(e);
  };

  // Reduce Motion: plain TouchableOpacity, opacity-only feedback, no transform.
  if (reduceMotion) {
    return (
      <TouchableOpacity
        hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
        activeOpacity={0.9}
        {...rest}
        style={style}
        onPress={handlePress}
      >
        {children}
      </TouchableOpacity>
    );
  }

  // Base transform is applied first so a call-site's own `transform` (rare on a
  // press target) still wins the flatten and keeps its visual — it only forgoes
  // the press-scale rather than breaking.
  return (
    <AnimatedTouchable
      hitSlop={hitSlop ?? DEFAULT_HIT_SLOP}
      activeOpacity={0.9}
      {...rest}
      style={[{ transform: [{ scale: scaleAnim }] }, style]}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedTouchable>
  );
}
