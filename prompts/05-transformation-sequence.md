# Prompt 5: Transformation Sequence — SenpaiTransformation

## Task
Build the Sailor Moon-style 5-phase activation animation that plays when Senpai Mode is toggled ON.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. When the user toggles Senpai Mode on (in SettingsScreen, SECRET LAB section around line 602), a dramatic fullscreen transformation animation should play before the mascot appears. This mirrors Sailor Moon's canonical 5-step transformation sequence, compressed from 40 seconds to ~4 seconds.

SenpaiContext has `transformationPlayed: boolean` and `markTransformationPlayed()` (from prompt 3). The transformation should only play once per enable — if `transformationPlayed` is false and `enabled` is true.

## File to Create: `src/components/SenpaiTransformation.tsx`

### Component Behavior
- Renders a fullscreen overlay (position absolute, zIndex 99999 — above everything)
- Plays 5 animation phases sequentially over ~4 seconds
- When complete, calls `markTransformationPlayed()` and unmounts
- Only renders when `state.enabled && !state.transformationPlayed`
- Uses React Native `Animated` API with `useNativeDriver: true` wherever possible (opacity, transform). For color/background changes that can't use native driver, use JS-driven animations sparingly.

### Phase 1 — Activation Flash (0–600ms)
- Full-screen white overlay fades in (opacity 0→0.85) over 200ms, holds 200ms, fades out over 200ms
- Centered text "Moon Prism Power..." appears at opacity peak, large font (28px), color `#FF2E51` with pink glow effect
- Text fades out with the flash
- Sound: play ascending arpeggio if sound system available (or skip sound — handled in prompt 6)

### Phase 2 — Prismatic Wash (400–1600ms, overlaps Phase 1)
- Background transitions to deep sparkling blue `#0B0D2E`
- 20 small sparkle dots (Animated.View, 4px circles) appear at random positions, pulsing opacity 0→0.6→0 with staggered timing — simulating the "kaleidoscopic marbling" effect
- Colors cycle between pink (#FF2E51), blue (#5158FF), purple (#D260FF), yellow (#FFF666)
- Each dot has a random delay (0-800ms) and duration (400-800ms)

### Phase 3 — Ribbon Swirl (1200–2400ms, overlaps Phase 2)
- 6 ribbon elements (thin elongated Views, 60x4px, rounded ends) spiral outward from center
- Each ribbon rotates while translating outward along a radial path (60° apart)
- Colors: alternating pink and blue
- Ribbons fade from opacity 0.8→0 as they reach the edges
- Use `Animated.timing` with `useNativeDriver: true` for transform (translateX, translateY, rotate) and opacity

### Phase 4 — Sparkle Burst (2200–3400ms)
- 40 sparkle particles (★ and ✦ characters) explode outward from center
- Each particle has: random angle (0-360°), random distance (80-200px), random size (8-16px)
- Colors: pink, blue, yellow, white — randomly assigned
- Animate: translateX/translateY from center to final position over 500ms, opacity 0.9→0 over 800ms
- Stagger start times across 300ms

### Phase 5 — Reveal (3200–4200ms)
- The transformation overlay fades to transparent (opacity 1→0 over 500ms)
- A single large starburst ring (circle border) expands from center (scale 0→3) while fading (opacity 0.6→0) over 600ms — positioned at bottom-right where the mascot will appear
- Text "TRANSFORMATION COMPLETE! ✧" appears briefly (400ms) centered, then fades
- On completion: call `markTransformationPlayed()`

### Dialogue options (pick one randomly for Phase 5 text):
```typescript
const TRANSFORM_QUOTES = [
  'Moon Prism Power... MAKE UP! ✧',
  'In the name of the gains, I\'ll punish you!',
  'Senpai Mode... ACTIVATED! ♡',
  'TRANSFORMATION COMPLETE! ☆',
  'The pretty guardian of gainz has arrived!',
  'This isn\'t even my final form, Senpai~!',
];
```

### Mount Location
Render `<SenpaiTransformation />` alongside `<SenpaiMascot />` and `<SenpaiOverlay />` in the app component tree (check `App.tsx` around lines 59-64). It should be a sibling, inside both providers.

### Performance Notes
- All transform/opacity animations: `useNativeDriver: true`
- Use `Animated.parallel` and `Animated.sequence` to chain phases
- Particle arrays generated once with `useMemo`
- Component fully unmounts after completion (conditionally rendered based on `state.transformationPlayed`)
- No `setInterval` — use `Animated.delay` for timing

## Verification
- Toggle Senpai ON → transformation plays → mascot appears after
- Toggle Senpai OFF then ON again → transformation plays again
- Kill app with Senpai ON → relaunch → transformation plays once on first render
- Animation is smooth (60fps target, no jank)
- `npx tsc --noEmit` passes
