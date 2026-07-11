import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle } from 'react-native';
import { duration, easing, stagger } from '../theme';
import { useMotion } from '../context/MotionContext';

/** Entrance role — tunes slide distance so headers travel less than cards. */
type FadeInRole = 'header' | 'card';

/** Slide distance (px) per role. Header slides a subtle 8px; cards 12px. */
const ROLE_SLIDE: Record<FadeInRole, number> = {
  header: 8,
  card: 12,
};

interface FadeInViewProps {
  children: React.ReactNode;
  /** Explicit delay before the animation starts (ms). Ignored when `index` is set. */
  delay?: number;
  /**
   * Position in an entrance group. When set, the delay is derived from
   * `stagger(index)` (30ms steps, capped at 120ms) instead of `delay`, so
   * screens stop hand-typing ladders. Grids should pass the row index so tiles
   * stagger by row, not per tile.
   */
  index?: number;
  /** Tier offset added before the per-child stagger (ms) — e.g. 60 for the content tier. */
  baseDelay?: number;
  /** Entrance role — sets the default slide distance (header 8px, card 12px). */
  role?: FadeInRole;
  /** How far to slide up from (px). 0 = pure fade. Overrides the role default. */
  slideUp?: number;
  /** Animation duration override */
  durationMs?: number;
  style?: ViewStyle;
}

/**
 * Wraps children in a fade-in + optional slide-up entrance animation.
 * Respects Reduce Motion — skips animation if the user has it enabled.
 *
 * Two-tier entrance (chrome at 0, content at ~60ms):
 *   <FadeInView role="header" index={0}>Header</FadeInView>
 *   <FadeInView role="card" baseDelay={60} index={0}>First card</FadeInView>
 *   <FadeInView role="card" baseDelay={60} index={1}>Second card</FadeInView>
 */
export function FadeInView({
  children,
  delay = 0,
  index,
  baseDelay = 0,
  role,
  slideUp,
  durationMs = duration.standard,
  style,
}: FadeInViewProps) {
  const { reduceMotion } = useMotion();

  // Derive the effective delay: index-driven stagger wins over the raw delay.
  const startDelay = index != null ? baseDelay + stagger(index) : delay;
  // Role default (header 8 / card 12), overridable by an explicit slideUp.
  const slide = slideUp ?? (role ? ROLE_SLIDE[role] : 12);

  const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduceMotion ? 0 : slide)).current;

  useEffect(() => {
    if (reduceMotion) return; // Skip animation

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durationMs,
        delay: startDelay,
        easing: easing.decelerate,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durationMs,
        delay: startDelay,
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
