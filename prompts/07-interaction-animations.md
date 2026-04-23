# Prompt 7: Interaction Animations — Tap Starbursts, Transitions, Tab Sparkle

## Task
Add magical girl interaction feedback throughout the app when Senpai Mode is active: tap starbursts, enhanced screen transitions, and tab bar sparkle effects.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. Navigation uses `@react-navigation/stack` with `createStackNavigator`. Custom transitions are defined in `src/navigation/RootNavigator.tsx` (crossfade, push with slide+fade+scale, modal slide-up). Tab bar is in `src/navigation/TabNavigator.tsx` — already tints active tab `#FF69B4` when senpai enabled.

Uses React Native `Animated` API throughout (NOT Reanimated). All animations must use `useNativeDriver: true` for transform/opacity.

## Part A: Tab Bar Sparkle (`src/navigation/TabNavigator.tsx`)

The tab bar already switches active tint to `#FF69B4` when senpai is enabled. Enhance:

1. **Bouncing active icon** — when Senpai Mode is on, the active tab icon should have a gentle continuous bounce (translateY oscillation, 1.5px amplitude, 1200ms period). Use `Animated.loop` with `Animated.sequence`. Only animate the active tab; stop animation on inactive tabs.

2. **Sparkle dot** — render a tiny sparkle character (✦) above the active tab icon, 6px font size, color `#FFF666` (yellow), with a slow pulse animation (opacity 0.3→0.8→0.3, 2s period). Position: 4px above the icon. Only visible when Senpai Mode is on.

Implementation: The tab bar likely uses a custom `tabBar` prop or `tabBarIcon` render function. Find where tab icons are rendered and wrap the active icon in an `Animated.View` with the bounce transform when `senpaiState.enabled`. Add the sparkle as an absolutely positioned `Animated.Text` above it.

Access senpai state via `useSenpai()` — import from `../context/SenpaiContext`.

## Part B: Screen Transition Override (`src/navigation/RootNavigator.tsx`)

When Senpai Mode is active, modify the push transition to include a subtle pink flash:

The current `pushTransition` (around line 188) uses `cardStyleInterpolator` with slide, fade, and scale. When Senpai is on:

1. Add a `cardOverlay` to the transition that flashes pink: `backgroundColor: 'rgba(255, 46, 81, 0.08)'` at the transition midpoint (progress 0.5), fading in from 0 and back to 0.

The challenge: `cardStyleInterpolator` is a static function — it doesn't have access to React context. Two approaches:

**Option A (simpler):** Create a wrapper component `SenpaiScreenWrapper` that wraps every screen's content and, on mount, plays a 150ms pink flash overlay (Animated opacity 0→0.06→0). This is less precise but works without modifying the navigation config.

**Option B (more complex):** Make the transition config dynamic by moving it inside the `RootNavigator` component where `useSenpai()` is accessible, and conditionally return different `screenOptions` based on senpai state.

Choose Option A — it's simpler and more reliable. Create a `SenpaiScreenFlash` component:

```typescript
// src/components/SenpaiScreenFlash.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';

export function SenpaiScreenFlash() {
  const { state } = useSenpai();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.enabled) return;
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.06, duration: 75, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 75, useNativeDriver: true }),
    ]).start();
  }, []); // plays once on mount

  if (!state.enabled) return null;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#FF2E51', opacity, zIndex: 99980 }]}
      pointerEvents="none"
    />
  );
}
```

Then add `<SenpaiScreenFlash />` to the key screens where navigation push occurs. OR better: add it to a layout wrapper used by multiple screens. Check if there's a common screen wrapper component. If not, add it to the 5-10 most navigated screens (Home, Workout, Timer, PRDetail, MacroTracker, ActivityTracker, Settings, Achievements, WeightTracker, BodyLab).

## Part C: Mascot Drag Rainbow Trail

In `src/components/SenpaiMascot.tsx`, when the mascot is being dragged, render a fading trail of 3 small colored dots behind it:

- During `onPanResponderMove`, track the last 3 positions
- Render 3 `Animated.View` circles (8px diameter) at those positions with decreasing opacity (0.4, 0.25, 0.1)
- Colors: `#FF2E51`, `#5158FF`, `#D260FF` (pink, blue, purple)
- When drag ends, fade all trail dots to opacity 0 over 200ms

This requires adding state to track trail positions during drag. Use a ref array updated in `onPanResponderMove`.

## Verification
- Active tab icon bounces gently when Senpai is on
- Tiny yellow sparkle pulses above active tab
- Navigating between screens shows a brief pink tint flash
- Dragging the mascot leaves a 3-dot colored trail
- Disabling Senpai Mode stops all effects
- No performance regressions on navigation
- `npx tsc --noEmit` passes
