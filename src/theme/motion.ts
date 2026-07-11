import { Easing } from 'react-native';

// Easing curves — iOS-inspired, never linear
export const easing = {
  /** Standard deceleration — entering elements */
  decelerate: Easing.out(Easing.cubic),
  /** Standard acceleration — exiting elements */
  accelerate: Easing.in(Easing.cubic),
  /** Standard curve — most transitions */
  standard: Easing.bezier(0.25, 0.1, 0.25, 1.0),
  /** Emphasized — hero moments, auth crossfade */
  emphasized: Easing.bezier(0.2, 0.0, 0.0, 1.0),
  /** Smooth ease-out for hover/color changes */
  smooth: Easing.bezier(0.4, 0.0, 0.2, 1.0),
};

// Duration tokens (ms)
export const duration = {
  /** Micro-interactions: color, opacity */
  instant: 100,
  /** Subtle transitions: hover, focus */
  subtle: 150,
  /** Fast: selection changes, toggles */
  fast: 200,
  /** Standard: most transitions (retuned 300→250 — snappier element entrances) */
  standard: 250,
  /** Slow: modals, auth crossfade */
  slow: 400,
  /** Entrance: staggered content reveals */
  entrance: 500,
};

// Scale tokens
export const scale = {
  /** Button/card press */
  pressed: 0.97,
  /** Tab bar icon bounce */
  iconBounce: 1.12,
  /** Card hover lift */
  hover: 1.01,
  /** Page enter */
  pageEnter: 0.96,
  /** Page exit */
  pageExit: 0.94,
};

// Opacity tokens
export const opacity = {
  /** Disabled state */
  disabled: 0.4,
  /** Behind-screen dimming during push */
  behindScreen: 0.4,
  /** Overlay dimming for modals */
  modalOverlay: 0.65,
  /** Hover tint */
  hoverTint: 0.06,
};

// Spring tokens (Animated.spring friction/tension form) — the three named
// springs that replace the ~10 ad-hoc friction/tension pairs in the wild.
// friction/tension so they drop straight into Animated.spring and the
// stack navigator's SpringAnimationConfig alike.
export const spring = {
  /** Press release, icon focus — quick and tight (matches AnimatedTabIcon). */
  press: { friction: 5, tension: 300 },
  /** Drag release, reorder settle, card arrivals — a touch under-damped. */
  settle: { friction: 6, tension: 120 },
  /** Celebratory scale — likes, badges, milestone pops. */
  pop: { friction: 4, tension: 200 },
};

/**
 * Stagger delay for the i-th element in an entrance group.
 * 30ms steps, capped at 4 (120ms) so grids never delay real content past the
 * transition. Screens use a two-tier entrance (chrome at 0, content at ~60ms)
 * rather than hand-typed ladders.
 */
export const stagger = (i: number, step = 30): number => Math.min(i, 4) * step;

// Ambient loop rhythm — one shared breath period so persistent pulses
// (streak, points, XP shine) derive from a single sine cadence instead of
// desynced metronomes. Loops are sine-eased and stop when off-screen.
export const ambient = {
  /** Base breath period (ms) for sine-eased ambient loops. */
  period: 2400,
};
