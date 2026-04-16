import { Easing } from 'react-native';

/**
 * Shared motion tokens for the Zenki Dojo app.
 * All animation timing and easing lives here — nothing ad-hoc.
 */

// Easing curves — iOS-inspired bezier feel
export const easing = {
  /** Standard deceleration — entering elements */
  decelerate: Easing.out(Easing.cubic),
  /** Standard acceleration — exiting elements */
  accelerate: Easing.in(Easing.cubic),
  /** Standard curve — most transitions */
  standard: Easing.bezier(0.25, 0.1, 0.25, 1.0),
  /** Emphasized — hero moments, auth crossfade */
  emphasized: Easing.bezier(0.2, 0.0, 0.0, 1.0),
  /** Spring-like overshoot for icon bounces */
  overshoot: Easing.bezier(0.34, 1.56, 0.64, 1.0),
};

// Duration tokens (ms)
export const duration = {
  /** Micro-interactions: icon press, selection highlight */
  instant: 100,
  /** Fast: selection changes, toggle states */
  fast: 180,
  /** Standard: most screen transitions */
  standard: 320,
  /** Slow: auth crossfade, modal presentation */
  slow: 400,
  /** Entrance: staggered content reveals */
  entrance: 500,
};

// Scale tokens — how much elements shrink/grow
export const scale = {
  /** Subtle press feedback */
  pressed: 0.96,
  /** Tab bar icon bounce peak */
  iconBounce: 1.15,
  /** Page enter scale (starts slightly smaller) */
  pageEnter: 0.94,
  /** Page exit scale (shrinks slightly behind) */
  pageExit: 0.92,
};

// Opacity tokens
export const opacity = {
  /** Behind-screen dimming during push */
  behindScreen: 0.3,
  /** Overlay dimming for modals */
  modalOverlay: 0.5,
};
