# Prompt 2: Auto-Theme Switching — SenpaiThemeBridge

## Task
Create a `SenpaiThemeBridge` component that automatically switches the app theme to `'senpai'` when Senpai Mode is enabled, and restores the previous theme when disabled.

## Context
Zenki Dojo (`D:\Zenki\App`) is a React Native / Expo SDK 52 app. The theme system uses `ThemeContext` (`src/context/ThemeContext.tsx`) which exposes `{ mode, setMode }` via `useTheme()`. The Senpai system uses `SenpaiContext` (`src/context/SenpaiContext.tsx`) which exposes `{ state: { enabled }, setEnabled }` via `useSenpai()`.

**Provider nesting constraint:** `SenpaiProvider` is INSIDE `ThemeProvider` in the component tree. This means `useSenpai()` can call `useTheme()`, but NOT vice versa. The bridge component must be rendered where BOTH contexts are accessible — inside both providers.

## Architecture

The bridge is a renderless component (returns `null`). It watches `state.enabled` from SenpaiContext and calls `setMode()` from ThemeContext.

### Key behaviors:
1. When Senpai Mode turns ON → save the current `mode` to a ref → call `setMode('senpai')`
2. When Senpai Mode turns OFF → call `setMode(savedMode)` to restore previous theme
3. On mount, if Senpai Mode is already enabled (persisted from last session) → set theme to senpai without saving current mode as "previous" (previous was already saved)
4. Must NOT trigger on every render — only on actual enabled state changes

### Edge cases:
- User was on Matrix theme → enables Senpai → disables Senpai → should return to Matrix
- App relaunches with Senpai already enabled → theme should be senpai immediately, no need to save "previous"
- User changes theme while Senpai is off → no interaction needed
- User should NOT be able to change theme while Senpai is on (the theme picker in Settings should be disabled or hidden when Senpai is active)

## File to Create: `src/components/SenpaiThemeBridge.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { useSenpai } from '../context/SenpaiContext';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREV_THEME_KEY = '@zenki_senpai_prev_theme';

export function SenpaiThemeBridge() {
  const { state } = useSenpai();
  const { mode, setMode } = useTheme();
  const prevThemeRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    // On mount, load the saved previous theme
    AsyncStorage.getItem(PREV_THEME_KEY).then((saved) => {
      if (saved) prevThemeRef.current = saved;
      initialLoadRef.current = false;
    });
  }, []);

  useEffect(() => {
    if (initialLoadRef.current) return; // wait for AsyncStorage load

    if (state.enabled && mode !== 'senpai') {
      // Save current theme before switching
      prevThemeRef.current = mode;
      AsyncStorage.setItem(PREV_THEME_KEY, mode).catch(() => {});
      setMode('senpai');
    } else if (!state.enabled && mode === 'senpai') {
      // Restore previous theme
      const restore = prevThemeRef.current || 'clean-dark';
      setMode(restore);
      prevThemeRef.current = null;
      AsyncStorage.removeItem(PREV_THEME_KEY).catch(() => {});
    }
  }, [state.enabled]);

  // Also ensure theme stays senpai if enabled on mount
  useEffect(() => {
    if (state.enabled && mode !== 'senpai') {
      setMode('senpai');
    }
  }, [mode, state.enabled]);

  return null;
}
```

## File to Modify: Mount the bridge

Find where `SenpaiMascot` and `SenpaiOverlay` are rendered in the app component tree. This is likely in `App.tsx` or `AppContent`. Add `<SenpaiThemeBridge />` alongside them — it must be inside BOTH `ThemeProvider` and `SenpaiProvider`.

Check `App.tsx` around lines 59-64 and the provider hierarchy around line 127. The bridge should be a sibling of `SenpaiMascot`.

## File to Modify: Settings theme picker

In `src/screens/SettingsScreen.tsx`, the theme picker section should be disabled or show a message when Senpai Mode is active. Find the theme selection UI (look for where `ALL_THEMES` is mapped or theme buttons are rendered). When `senpaiState.enabled` is true, either:
- Grey out the theme options with a note "Disable Senpai Mode to change theme"
- Or hide the theme picker entirely

The senpai toggle is already in SettingsScreen at lines 593-720 in the SECRET LAB section. The theme picker is in a separate section above it — find it and add the conditional.

## Verification
- Toggle Senpai ON → app theme changes to senpai colors (deep blue bg, pink accents)
- Toggle Senpai OFF → app returns to the theme that was active before
- Kill app with Senpai ON → relaunch → theme is still senpai
- Toggle Senpai OFF after relaunch → restores correct previous theme
- Theme picker is disabled/hidden while Senpai is active
- `npx tsc --noEmit` passes
