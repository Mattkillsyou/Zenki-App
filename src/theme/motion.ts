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
  /** Spring-like overshoot for bounces */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1.0),
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
  /** Standard: most transitions */
  standard: 300,
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
