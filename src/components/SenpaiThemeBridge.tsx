import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSenpai } from '../context/SenpaiContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';

const PREV_THEME_KEY = '@zenki_senpai_prev_theme';

/**
 * Senpai (the companion) and the 'senpai' visual theme are UNBUNDLED:
 * enabling the mascot no longer forces the app theme, and the senpai theme
 * is a normal option in the Settings theme picker — the mascot works on any
 * theme, and her theme works without her.
 *
 * The one job left for this bridge is unwinding the OLD bundling: builds
 * before the split force-switched the theme to 'senpai' on enable and
 * stashed the user's real theme under PREV_THEME_KEY. When Senpai is
 * turned off IN THIS SESSION (a live true→false transition — never the
 * pre-hydrate enabled=false default, which would un-theme legacy users on
 * launch) while the theme is still 'senpai' and that stash exists, restore
 * the stash and delete it. Nothing writes PREV_THEME_KEY anymore, so after
 * the unwind this bridge never acts again.
 *
 * Lives inside both ThemeProvider and SenpaiProvider.
 */
export function SenpaiThemeBridge() {
  const { state: senpaiState } = useSenpai();
  const { mode, setMode } = useTheme();

  const prevThemeRef = useRef<string | null>(null);
  const prevEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PREV_THEME_KEY).then((saved) => {
      if (saved) prevThemeRef.current = saved;
    }).catch((err) => {
      console.warn('[SenpaiThemeBridge] hydrate failed:', err);
    });
  }, []);

  useEffect(() => {
    const prevEnabled = prevEnabledRef.current;
    prevEnabledRef.current = senpaiState.enabled;
    // Legacy unwind only fires on an observed enable→disable transition.
    if (prevEnabled !== true || senpaiState.enabled) return;
    if (mode !== 'senpai' || !prevThemeRef.current) return;
    const restore = prevThemeRef.current as ThemeMode;
    prevThemeRef.current = null;
    setMode(restore);
    AsyncStorage.removeItem(PREV_THEME_KEY).catch((err) => {
      console.warn('[SenpaiThemeBridge] removeItem failed:', err);
    });
  }, [senpaiState.enabled, mode, setMode]);

  return null;
}
