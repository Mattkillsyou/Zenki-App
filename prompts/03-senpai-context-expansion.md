# Prompt 3: SenpaiContext Expansion

## Task
Add `outfitId`, `transformationPlayed`, and `ambientEffects` to SenpaiContext state, plus their setters.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. The SenpaiContext at `src/context/SenpaiContext.tsx` currently manages: `enabled`, `mascotMood` (7 moods), `lastReaction`, `reactionExpiry`, `sparkleActive`, `volume` (low/med/high), `sparkleIntensity` (normal/maximum), `memoryLog` (MemoryEntry[]). Persistence via AsyncStorage with `@zenki_senpai_*` key prefix.

## File to Modify: `src/context/SenpaiContext.tsx`

### Add storage keys (after line 7):
```typescript
const OUTFIT_KEY = '@zenki_senpai_outfit';
const AMBIENT_KEY = '@zenki_senpai_ambient';
```

### Add to `SenpaiState` interface (after `memoryLog`):
```typescript
outfitId: string;
transformationPlayed: boolean;
ambientEffects: boolean;
```

### Update `defaultState`:
```typescript
outfitId: 'default',
transformationPlayed: false,
ambientEffects: true,
```

### Add to `SenpaiContextValue` interface:
```typescript
setOutfit: (id: string) => void;
markTransformationPlayed: () => void;
setAmbientEffects: (on: boolean) => void;
```

### Update default context value:
```typescript
setOutfit: () => {},
markTransformationPlayed: () => {},
setAmbientEffects: () => {},
```

### Load persisted values on mount
In the existing `useEffect` that calls `AsyncStorage.getItem` for STORAGE_KEY, VOLUME_KEY, SPARKLE_KEY, MEMORY_KEY — add OUTFIT_KEY and AMBIENT_KEY to the `Promise.all`:
```typescript
const [enabledRaw, volumeRaw, sparkleRaw, memoryRaw, outfitRaw, ambientRaw] = await Promise.all([
  AsyncStorage.getItem(STORAGE_KEY),
  AsyncStorage.getItem(VOLUME_KEY),
  AsyncStorage.getItem(SPARKLE_KEY),
  AsyncStorage.getItem(MEMORY_KEY),
  AsyncStorage.getItem(OUTFIT_KEY),
  AsyncStorage.getItem(AMBIENT_KEY),
]);
```
Parse and add to setState:
```typescript
const outfitId = outfitRaw || 'default';
const ambientEffects = ambientRaw !== 'false'; // default true
```
Add `outfitId` and `ambientEffects` to the setState spread.

### Add setter callbacks:
```typescript
const setOutfit = useCallback((id: string) => {
  setState((s) => ({ ...s, outfitId: id }));
  AsyncStorage.setItem(OUTFIT_KEY, id).catch(() => {});
}, []);

const markTransformationPlayed = useCallback(() => {
  setState((s) => ({ ...s, transformationPlayed: true }));
  // Not persisted — resets each app session
}, []);

const setAmbientEffects = useCallback((on: boolean) => {
  setState((s) => ({ ...s, ambientEffects: on }));
  AsyncStorage.setItem(AMBIENT_KEY, String(on)).catch(() => {});
}, []);
```

### Important: `transformationPlayed`
This is session-only state. It tracks whether the 5-phase Sailor Moon transformation animation has played THIS session. It defaults to `false` and is set to `true` after the animation completes. It is NOT persisted to AsyncStorage — when the app relaunches, it resets to `false` so the transformation plays again on first enable.

### Important: Reset `transformationPlayed` when Senpai is disabled
When `setEnabled(false)` is called, also reset `transformationPlayed` to `false` so the next enable triggers the animation again:
```typescript
const setEnabled = useCallback((on: boolean) => {
  setState((s) => ({ ...s, enabled: on, transformationPlayed: on ? s.transformationPlayed : false }));
  AsyncStorage.setItem(STORAGE_KEY, String(on)).catch(() => {});
}, []);
```

### Update Provider value
Add `setOutfit`, `markTransformationPlayed`, `setAmbientEffects` to the Provider's `value` prop.

## Verification
- `npx tsc --noEmit` passes
- `outfitId` persists across app restarts
- `ambientEffects` persists across app restarts
- `transformationPlayed` does NOT persist — resets to false on relaunch
- Toggling Senpai off resets `transformationPlayed` to false
- All existing functionality (volume, sparkleIntensity, memoryLog, triggerReaction) still works
