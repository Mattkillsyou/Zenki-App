# Prompt 4: Enhanced SenpaiOverlay

## Task
Rewrite `SenpaiOverlay` to add always-on ambient effects and enhanced reaction effects with Sailor Moon motifs.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. The existing `SenpaiOverlay` at `src/components/SenpaiOverlay.tsx` (~248 lines) renders fullscreen particle effects: FloatingHearts (12/24), FloatingKaomoji (8/16), SparkleParticles (10/20). Currently only active when `state.sparkleActive === true` (during reactions). Uses React Native `Animated` API with `useNativeDriver: true`.

The SenpaiContext now has `ambientEffects: boolean` (from prompt 3) controlling whether background effects show when Senpai is enabled but no reaction is active.

## File to Modify: `src/components/SenpaiOverlay.tsx`

### New Architecture

The overlay should have TWO layers:

**Layer 1 — Ambient (always-on when `state.enabled && state.ambientEffects`):**
- `AmbientStars` — 15 tiny stars (mix of ★ and ✦) drifting very slowly upward with gentle twinkle (opacity pulse 0.03→0.12→0.03 over 4-8 seconds). Random x positions. Colors: `#FFB3DF` (pink), `#5158FF` (blue), `#FFF666` (yellow) — randomly assigned.
- `AmbientMoons` — 5 tiny crescent moons (☽) at very low opacity (0.04-0.08), drifting extremely slowly. Size 10-14px. Color: `#FFB3DF`.
- `ShootingStar` — a single shooting star that animates across the top 20% of the screen every 15-30 seconds. Starts from random x on left half, travels diagonally right and slightly down. Trail effect: use 3 staggered dots with decreasing opacity. Duration: 800ms per crossing. After each crossing, wait 15-30s (random), then repeat from a new position.

**Layer 2 — Reaction (when `state.sparkleActive === true`):**
Keep existing FloatingHearts, FloatingKaomoji, SparkleParticles but enhance:
- `StarburstRing` — when sparkleActive becomes true, emit a single expanding ring of 8 small stars (★) from the bottom-right quadrant (where the mascot is). Stars move outward radially over 600ms, fading from opacity 0.8→0. Play once per reaction, not looping.
- `ConfettiBurst` — when mood is `'celebrating'`: 30 small rectangles (4x8px) in pink, blue, yellow, purple, white fall from the top of the screen with slight horizontal drift and rotation. Duration 2 seconds, then stop.

### Implementation Notes

- ALL animations must use `useNativeDriver: true` (only transform and opacity)
- Use `useMemo` for particle config arrays to prevent re-renders
- Ambient layer renders when `state.enabled && state.ambientEffects` (not just sparkleActive)
- Reaction layer renders when `state.enabled && state.sparkleActive` (same as before)
- Both layers use `pointerEvents="none"` so they don't block touches
- Container zIndex: 99989 (below mascot at 99990)
- Use `Dimensions.get('window')` for screen dimensions
- Maximum intensity (`state.sparkleIntensity === 'maximum'`) doubles ambient star count to 30, moon count to 10, shooting star frequency to every 8-15s, and applies existing reaction doubling

### Sailor Moon Motif Symbols (use as Text characters):
- Crescent moon: ☽ (U+263D)
- Five-pointed star: ★ (U+2605)
- Sparkle glint: ✦ (U+2726)
- Heart: ♡ (U+2661)
- Filled heart: ♥ (U+2665)

### Structure:
```typescript
export function SenpaiOverlay() {
  const { state } = useSenpai();
  if (!state.enabled) return null;
  const max = state.sparkleIntensity === 'maximum';

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Ambient layer — always on */}
      {state.ambientEffects && (
        <>
          <AmbientStars max={max} />
          <AmbientMoons max={max} />
          <ShootingStar max={max} />
        </>
      )}
      {/* Reaction layer — during sparkleActive */}
      {state.sparkleActive && (
        <>
          <FloatingHearts max={max} />
          <FloatingKaomoji max={max} />
          <SparkleParticles max={max} />
          <StarburstRing />
          {state.mascotMood === 'celebrating' && <ConfettiBurst max={max} />}
        </>
      )}
    </View>
  );
}
```

## Verification
- Enable Senpai Mode with no reaction active → ambient stars, moons, shooting stars visible
- Trigger a reaction → reaction particles appear ON TOP of ambient
- Trigger celebrating mood → confetti falls from top
- Toggle ambientEffects off in context → ambient layer disappears, reactions still work
- Maximum sparkle intensity → more particles, faster shooting stars
- No performance issues (check with React DevTools profiler or manual feel)
- `npx tsc --noEmit` passes
