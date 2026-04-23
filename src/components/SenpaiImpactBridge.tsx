import React from 'react';
import { useSenpai } from '../context/SenpaiContext';
import { SenpaiImpactEffect } from './SenpaiImpactEffect';

/**
 * Mounts the current impact effect driven by senpai state.
 * Auto-clears when the one-shot animation completes so a new reaction
 * can re-trigger a fresh effect.
 */
export function SenpaiImpactBridge() {
  const { state, clearImpact } = useSenpai();
  if (!state.enabled || !state.activeImpact) return null;
  return (
    <SenpaiImpactEffect
      key={`${state.activeImpact}-${state.reactionExpiry}`}
      type={state.activeImpact}
      onComplete={() => clearImpact()}
    />
  );
}
