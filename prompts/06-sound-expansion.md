# Prompt 6: Sound Expansion — Senpai Sound Theme

## Task
Rewrite the `senpai` sound theme in `src/sounds/synth.ts` with magical girl audio character, and add a `transform` sound event for the activation sequence.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. The sound system at `src/sounds/synth.ts` uses Web Audio API (AudioContext) for procedural tone synthesis. It works on web only — native platforms no-op. The system generates short tones for these events: `tap`, `success`, `error`, `navigate`, `open`, `close`.

A `senpai` sound theme already exists but needs to be expanded with the proper magical girl aesthetic. The sound engine uses `ToneSpec` objects:
```typescript
interface ToneSpec {
  freq: number;         // base frequency Hz
  wave?: Waveform;      // 'sine' | 'square' | 'sawtooth' | 'triangle'
  duration?: number;    // seconds
  attack?: number;      // seconds
  release?: number;     // seconds
  gain?: number;        // 0..1
  sweep?: number;       // target freq for portamento
  detune?: number;      // cents
  delay?: number;       // seconds before playing (for chord stacking)
}
```

Multiple `ToneSpec` objects can be combined for chords by using the `delay` field.

## File to Modify: `src/sounds/synth.ts`

### Find the senpai sound theme definition
Look for where sound themes are mapped to event handlers. There should be a section like `senpai: { tap: [...], success: [...], ... }` or similar. Replace the senpai entries with the specs below.

### Senpai Sound Palette

The Sailor Moon aesthetic demands: high-pitched, sparkly, magical. Think wind chimes, music boxes, crystal bells. Use triangle and sine waves at high frequencies (800-2000Hz), short staccato with shimmer effects.

```
senpai: {
  tap: [
    // Single bright chime — triangle wave, quick staccato
    { freq: 1200, wave: 'triangle', duration: 0.06, attack: 0.003, release: 0.05, gain: 0.12 },
    // Subtle harmonic shimmer
    { freq: 2400, wave: 'sine', duration: 0.04, attack: 0.002, release: 0.03, gain: 0.05, delay: 0.01 },
  ],

  success: [
    // 3-note ascending chord: C5 → E5 → G5, staggered 50ms
    { freq: 523, wave: 'sine', duration: 0.25, attack: 0.01, release: 0.15, gain: 0.12 },
    { freq: 659, wave: 'sine', duration: 0.25, attack: 0.01, release: 0.15, gain: 0.12, delay: 0.05 },
    { freq: 784, wave: 'sine', duration: 0.30, attack: 0.01, release: 0.20, gain: 0.12, delay: 0.10 },
    // High sparkle overtone
    { freq: 1568, wave: 'triangle', duration: 0.15, attack: 0.005, release: 0.12, gain: 0.04, delay: 0.12 },
  ],

  error: [
    // Descending minor — comedic boing: E5 → C5
    { freq: 659, wave: 'square', duration: 0.08, attack: 0.005, release: 0.06, gain: 0.08, sweep: 523 },
    // Low thud
    { freq: 220, wave: 'sine', duration: 0.10, attack: 0.01, release: 0.08, gain: 0.06, delay: 0.08 },
  ],

  navigate: [
    // Single high chime with harmonic
    { freq: 880, wave: 'sine', duration: 0.10, attack: 0.005, release: 0.08, gain: 0.10 },
    { freq: 1760, wave: 'triangle', duration: 0.08, attack: 0.003, release: 0.06, gain: 0.04, delay: 0.02 },
  ],

  open: [
    // Rising sparkle glissando 800→1600Hz
    { freq: 800, wave: 'triangle', duration: 0.18, attack: 0.01, release: 0.12, gain: 0.10, sweep: 1600 },
    // Shimmer tail
    { freq: 1600, wave: 'sine', duration: 0.12, attack: 0.005, release: 0.10, gain: 0.04, delay: 0.12 },
  ],

  close: [
    // Falling sparkle 1600→800Hz
    { freq: 1600, wave: 'triangle', duration: 0.15, attack: 0.008, release: 0.10, gain: 0.10, sweep: 800 },
  ],
}
```

### New Sound Event: `transform`

Add a `transform` event to the sound system. This is the ascending arpeggio that plays during the Phase 1 of the transformation sequence. If the event system doesn't support custom events beyond the 6 standard ones, add it.

```
transform: [
  // Ascending arpeggio C5→E5→G5→C6, 100ms apart, triangle wave
  { freq: 523, wave: 'triangle', duration: 0.20, attack: 0.01, release: 0.15, gain: 0.12 },
  { freq: 659, wave: 'triangle', duration: 0.20, attack: 0.01, release: 0.15, gain: 0.12, delay: 0.10 },
  { freq: 784, wave: 'triangle', duration: 0.20, attack: 0.01, release: 0.15, gain: 0.12, delay: 0.20 },
  { freq: 1047, wave: 'triangle', duration: 0.35, attack: 0.01, release: 0.25, gain: 0.14, delay: 0.30 },
  // Final shimmer chord
  { freq: 2094, wave: 'sine', duration: 0.20, attack: 0.005, release: 0.18, gain: 0.04, delay: 0.35 },
  { freq: 1568, wave: 'sine', duration: 0.25, attack: 0.005, release: 0.20, gain: 0.03, delay: 0.35 },
]
```

### Export the transform player
Make the transform sound callable from `SenpaiTransformation.tsx`. Either:
- Export a `playSenpaiTransform()` function
- Or add `'transform'` to the standard sound event type and let the existing `playSound(theme, event)` API handle it

## Verification
- On web: tap sounds produce a bright chime
- Success sound is a 3-note ascending chord
- Navigate produces a high chime
- Transform produces a sweeping ascending arpeggio (~600ms)
- On native: all sounds no-op without errors
- `npx tsc --noEmit` passes
