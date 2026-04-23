# Prompt 11: Impact Effects Component — Explosion/Hearts/Flash/Spiral

## Task
Create a reusable `SenpaiImpactEffect` component for "big moment" animations (PR set, level up, achievement, workout complete) and wire it into `triggerReaction`.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. When major events happen (new PR, level up, achievement unlock, workout complete), the mascot reacts with `triggerReaction()`. Currently this shows a speech bubble and activates sparkle particles. For these BIG moments, we also want a dramatic full-screen impact effect — a one-shot animation that plays once and disappears.

Uses React Native `Animated` API with `useNativeDriver: true`. The impact renders as a fullscreen overlay (`pointerEvents="none"`, zIndex 99988 — below overlay at 99989 and mascot at 99990).

## File to Create: `src/components/SenpaiImpactEffect.tsx`

### Impact Types

```typescript
export type ImpactType = 'explosion' | 'hearts' | 'flash' | 'spiral';
```

### Component API
```typescript
interface SenpaiImpactEffectProps {
  type: ImpactType;
  onComplete?: () => void;
}
```

The component plays the animation once on mount, then calls `onComplete` (which should unmount it).

### Effect 1: `explosion` — Star Burst
Used for: new PR, achievement unlock, level up

- 12 star characters (★) burst outward from screen center
- Each star has a random angle (0-360°, evenly distributed at 30° intervals + random ±10° jitter)
- Animate: translateX/translateY from center to 120-200px outward over 500ms (decelerate easing)
- Size: 14-22px randomly
- Colors: cycle through `#FF2E51` (pink), `#FFF666` (yellow), `#5158FF` (blue), `#FFB3DF` (light pink)
- Opacity: 0.9→0 over 600ms
- Add a central flash: 30px circle, white, scale 0→2→0 over 400ms, opacity 0.7→0
- Total duration: 700ms

### Effect 2: `hearts` — Heart Shower
Used for: workout complete

- 25 heart characters (♡ and ♥, alternating) fall from the top of the screen
- Random x positions across full screen width
- Each heart: translateY from -30 to screenHeight+30 over 1500-2500ms (random per heart)
- Slight horizontal drift: translateX ±20px sine wave
- Rotation: rotate 0→360° or 0→-360° (random direction)
- Size: 12-20px randomly
- Colors: `#FF2E51`, `#FFB3DF`, `#D260FF`
- Opacity: 0→0.7 over 200ms, hold, then 0.7→0 in last 300ms
- Stagger: hearts start over 500ms window (random delay 0-500ms each)
- Total duration: 2500ms

### Effect 3: `flash` — Screen Flash
Used for: transformation (but can also accent other moments)

- Full screen overlay: white→pink→transparent
- Phase 1: white overlay opacity 0→0.7 over 100ms
- Phase 2: color shifts to `rgba(255, 46, 81, 0.4)` over 100ms
- Phase 3: fade to transparent over 200ms
- Total duration: 400ms
- Simple but punchy

### Effect 4: `spiral` — Converging Star Spiral
Used for: streak milestone, celebrating mood

- 16 sparkle characters (✦) arranged in a spiral pattern
- Start positions: scattered in a ring 200px from center at evenly spaced angles
- Animate: translate from ring position to center over 800ms
- Each sparkle also rotates 180° during the journey
- As they converge, they scale up slightly (1→1.3)
- At the convergence point (center), a single bright flash (★, 28px, scale 0→2→0, 300ms)
- Colors: `#FF2E51`, `#5158FF`, `#FFF666`, `#D260FF` cycling
- Stagger: sparkles start in sequence, 30ms apart (total 480ms stagger + 800ms travel = ~1300ms)
- Opacity: 0.8→0.4 during travel, then all fade to 0 in final 200ms
- Total duration: 1500ms

### Implementation Pattern

```typescript
export function SenpaiImpactEffect({ type, onComplete }: SenpaiImpactEffectProps) {
  const particles = useMemo(() => generateParticles(type), [type]);
  
  useEffect(() => {
    const animations = createAnimations(type, particles);
    Animated.parallel(animations).start(() => {
      onComplete?.();
    });
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: SW / 2,
            top: SH / 2,
            fontSize: p.size,
            color: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.translateX },
              { translateY: p.translateY },
              { scale: p.scale },
              { rotate: p.rotation },
            ],
          }}
        >
          {p.char}
        </Animated.Text>
      ))}
    </View>
  );
}
```

### Wiring Into SenpaiContext

Add `activeImpact: ImpactType | null` to SenpaiState (default `null`).
Add `clearImpact: () => void` to context value.

Modify `triggerReaction()` to automatically set `activeImpact` based on mood:
```typescript
const impactMap: Partial<Record<MascotMood, ImpactType>> = {
  impressed: 'explosion',    // PR, GPS complete
  celebrating: 'spiral',     // level up, streak milestone, workout complete
  cheering: undefined,       // no impact for casual cheering
};

// In triggerReaction:
const impact = impactMap[mood] ?? null;
// ... add activeImpact: impact to the setState
```

### Rendering the Impact

In the app component tree (where SenpaiMascot, SenpaiOverlay, SenpaiTransformation are rendered), add:

```tsx
{senpaiState.activeImpact && (
  <SenpaiImpactEffect
    type={senpaiState.activeImpact}
    onComplete={() => clearImpact()}
  />
)}
```

This auto-triggers when `triggerReaction` is called with `impressed` or `celebrating` moods and auto-cleans up via `onComplete`.

## Verification
- New PR → star explosion plays (12 stars burst from center)
- Workout complete → heart shower falls from top
- Level up → spiral converges to center with flash
- Streak milestone → spiral effect
- Effects don't block touches (pointerEvents="none")
- Effects play once and unmount cleanly (no memory leak)
- No impact on casual reactions (cheering, encouraging, idle)
- Multiple rapid reactions don't stack effects (new one replaces old)
- `npx tsc --noEmit` passes
