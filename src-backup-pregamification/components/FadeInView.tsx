import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { duration, easing } from '../theme';
import { useMotion } from '../context/MotionContext';

interface FadeInViewProps {
  children: React.ReactNode;
  /** Delay before the animation starts (ms) */
  delay?: number;
  /** How far to slide up from (px). 0 = pure fade, no slide. */
  slideUp?: number;
  /** Animation duration override */
  durationMs?: number;
  style?: ViewStyle;
}

/**
 * Wraps children in a fade-in + optional slide-up entrance animation.
 * Respects Reduce Motion — skips animation if the user has it enabled.
 *
 *   <FadeInView delay={0}>Hero</FadeInView>
 *   <FadeInView delay={80}>Stats</FadeInView>
 *   <FadeInView delay={160}>Classes</FadeInView>
 */
export function FadeInView({
  children,
  delay = 0,
  slideUp = 12,
  durationMs = duration.standard,
  style,
}: FadeInViewProps) {
  const { reduceMotion } = useMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : slideUp)).current;

  useEffect(() => {
    if (reduceMotion) return; // Skip animation

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
    ]);
    animation.start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
