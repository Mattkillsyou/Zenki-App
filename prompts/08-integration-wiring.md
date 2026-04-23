# Prompt 8: Integration Wiring — triggerReaction at Screen Level

## Task
Wire `triggerReaction()` calls from SenpaiContext into every relevant app event so the mascot reacts to workouts, PRs, streaks, achievements, nutrition, GPS, meditation, body measurements, and time-of-day.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. `SenpaiProvider` is nested INSIDE other providers. This means you CANNOT call `useSenpai()` from inside `GamificationContext`, `NutritionContext`, etc. You MUST wire reactions at the SCREEN level — in the screen components that already import both the feature context and have access to the Senpai context.

Always call `shouldReact()` before `triggerReaction()` — this respects the volume setting (high=100%, med=70%, low=30% chance).

Dialogue function: `import { randomDialogue } from '../data/senpaiDialogue';`

## Wiring Points — Exact Files and Locations

### 1. App Open — Time-based greeting
**File:** `src/screens/HomeScreen.tsx`
**Action:** Add a `useEffect` on mount that checks if Senpai is enabled, then triggers a time-based reaction:
```typescript
const { state, triggerReaction, shouldReact } = useSenpai();

useEffect(() => {
  if (!state.enabled || !shouldReact()) return;
  const hour = new Date().getHours();
  if (hour < 10) {
    triggerReaction('cheering', randomDialogue('morning'), 3000);
  } else if (hour >= 20) {
    triggerReaction('encouraging', randomDialogue('evening'), 3000);
  } else {
    triggerReaction('cheering', randomDialogue('appOpen'), 3000);
  }
}, []); // once on mount
```
Import `useSenpai` and `randomDialogue` at the top.

### 2. Workout Start
**File:** `src/screens/WorkoutSessionScreen.tsx`
**Function:** `handleStart()` at line ~118
**Action:** After `startSession(selectedActivity, user.id)` (line 123), add:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('encouraging', randomDialogue('workoutStart'), 3000);
}
```
Destructure from `useSenpai()` at the top of the component (use aliased names to avoid conflicts):
```typescript
const { state: senpaiState, triggerReaction: senpaiTrigger, shouldReact: senpaiShouldReact } = useSenpai();
```

### 3. Workout Complete
**File:** `src/screens/WorkoutSessionScreen.tsx`
**Function:** `handleStop()` → inside the Alert onPress callback, after `stopSession()` (line 136)
**Action:** After `const session = stopSession(age, weightKg, isMale);` and before `navigation.goBack()`:
```typescript
if (session && senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('celebrating', randomDialogue('workoutComplete'), 4000);
}
```

### 4. New PR Logged
**File:** `src/screens/PRDetailScreen.tsx`
**Function:** `handleSave()` at line ~88
**Action:** After `addPR({...})` (line 101), add:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('impressed', randomDialogue('newPR'), 4000);
}
```

### 5. Streak Milestone + Level Up + Achievement (GamificationContext celebrations)
**Strategy:** The GamificationContext creates `pendingCelebration` objects for these events. Screens that consume `pendingCelebration` and show celebration modals are the right place to wire Senpai reactions.

**Find where `pendingCelebration` is consumed** — grep for `pendingCelebration` in screen files. It's likely in `HomeScreen.tsx` or a `CelebrationModal` component. At the point where the celebration is displayed, add:

```typescript
useEffect(() => {
  if (!pendingCelebration || !senpaiState.enabled || !senpaiShouldReact()) return;
  
  switch (pendingCelebration.type) {
    case 'streak_milestone':
      senpaiTrigger('celebrating', randomDialogue('streakMilestone'), 4000);
      break;
    case 'level_up':
      senpaiTrigger('celebrating', randomDialogue('levelUp'), 4000);
      break;
    case 'achievement':
      senpaiTrigger('cheering', randomDialogue('achievement'), 3500);
      break;
  }
}, [pendingCelebration]);
```

### 6. Nutrition Logged
**File:** `src/screens/MacroTrackerScreen.tsx`
**Action:** Find where `addMacroEntry()` is called (around lines 70-92, inside a food search modal callback). After the entry is added:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('cheering', randomDialogue('nutritionLog'), 2500);
}
```

### 7. GPS Activity Completed
**File:** `src/screens/ActivityTrackerScreen.tsx`
**Function:** `handleStop()` at line ~100
**Action:** After `const activity = stopTracking();` (line 110), inside the `if (activity)` block:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('impressed', randomDialogue('gpsActivity'), 4000);
}
```

### 8. Timer/Meditation Completed
**File:** `src/screens/TimerScreen.tsx`
**Function:** `logSession()` at line ~69
**Action:** After the session is logged to history:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('encouraging', randomDialogue('meditation'), 3500);
}
```

### 9. Body Measurement / Weight Logged
**File:** `src/screens/WeightTrackerScreen.tsx`
**Action:** Find where `addWeight()` is called. After the weight entry is saved:
```typescript
if (senpaiState.enabled && senpaiShouldReact()) {
  senpaiTrigger('cheering', randomDialogue('bodyLab'), 3000);
}
```

### 10. Streak Broken
**File:** Where streak reset is detected and shown to the user. Check `HomeScreen.tsx` or wherever login streak is displayed. If the streak resets from >1 to 1, trigger:
```typescript
senpaiTrigger('disappointed', randomDialogue('streakBroken'), 4000);
```

## Important Notes
- Import `useSenpai` from `'../context/SenpaiContext'` and `randomDialogue` from `'../data/senpaiDialogue'`
- Use aliased destructuring to avoid naming conflicts with existing variables
- Always guard with `if (senpaiState.enabled && senpaiShouldReact())` 
- Duration: 2500-4000ms depending on importance (bigger events = longer display)
- Don't add reactions to rapid-fire events (e.g., every macro keystroke) — only on submit/save

## Verification
- Start a workout → mascot cheers with workoutStart dialogue
- Complete a workout → mascot celebrates with workoutComplete dialogue
- Log a PR → mascot is impressed with newPR dialogue
- Log a meal → mascot cheers with nutritionLog dialogue
- Complete a GPS activity → mascot impressed with gpsActivity dialogue
- Complete a timer → mascot encourages with meditation dialogue
- Open app in morning → morning greeting
- Open app at night → evening greeting
- Volume set to 'low' → only ~30% of events trigger reactions
- `npx tsc --noEmit` passes
