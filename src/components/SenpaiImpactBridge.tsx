import React, { useEffect } from 'react';
import { useSenpai } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';
import { bigBeat } from '../services/senpaiHaptics';
import { SenpaiImpactEffect } from './SenpaiImpactEffect';

/**
 * Mounts the current impact effect driven by senpai state.
 * Auto-clears when the one-shot animation completes so a new reaction
 * can re-trigger a fresh effect.
 *
 * H5 haptics: every milestone impact lands with a bigBeat() thump — the
 * util self-gates on sound prefs, system Reduce Motion, and a debounce, so
 * it's called unconditionally here (impacts are milestone-only since D2).
 *
 * D5: under system Reduce Motion the full-screen effect is skipped entirely;
 * the effect state is still cleared so the next milestone starts clean.
 */
export function SenpaiImpactBridge() {
  const { state, clearImpact } = useSenpai();
  const { reduceMotion } = useMotion();

  // One key per fired impact (reactionExpiry changes per reaction), so the
  // thump fires exactly once per milestone even across re-renders.
  const impactKey =
    state.enabled && state.activeImpact ? `${state.activeImpact}-${state.reactionExpiry}` : null;

  useEffect(() => {
    if (impactKey) bigBeat();
  }, [impactKey]);

  // Reduce Motion: no visual, so onComplete would never run — clear the
  // impact state here instead of leaving it wedged until the next milestone.
  useEffect(() => {
    if (impactKey && reduceMotion) clearImpact();
  }, [impactKey, reduceMotion, clearImpact]);

  if (!state.enabled || !state.activeImpact || reduceMotion) return null;
  return (
    <SenpaiImpactEffect
      key={`${state.activeImpact}-${state.reactionExpiry}`}
      type={state.activeImpact}
      onComplete={() => clearImpact()}
    />
  );
}
