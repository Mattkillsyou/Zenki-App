import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeStorageSet } from '../utils/safeStorage';
import { useSenpai } from '../context/SenpaiContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';

const PREV_THEME_KEY = '@zenki_senpai_prev_theme';

/**
 * When Senpai Mode toggles on, switches the app theme to 'senpai' and saves
 * the previously-active theme to AsyncStorage so it can be restored — even
 * across app relaunches — when Senpai turns off.
 *
 * Implemented as a RECONCILER over the live (enabled, mode) pair rather than a
 * one-render-lagged transition: whenever Senpai-on disagrees with theme-is-senpai
 * we fix it. This is race-free under fast enable→disable toggles (the old
 * `modeRef` lag could strand the user on the Senpai theme).
 *
 * Lives inside both ThemeProvider and SenpaiProvider.
 */
export function SenpaiThemeBridge() {
  const { state: senpaiState } = useSenpai();
  const { mode, setMode } = useTheme();

  const prevThemeRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(PREV_THEME_KEY).then((saved) => {
      if (saved) prevThemeRef.current = saved;
      loadedRef.current = true;
    }).catch((err) => {
      console.warn('[SenpaiThemeBridge] hydrate failed:', err);
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;

    if (senpaiState.enabled) {
      // Senpai on but theme isn't senpai → remember the current theme, switch.
      if (mode !== 'senpai') {
        prevThemeRef.current = mode;
        safeStorageSet(PREV_THEME_KEY, mode, '[SenpaiThemeBridge]');
        setMode('senpai');
      }
    } else {
      // Senpai off but theme is still senpai (incl. the fast-toggle case, where
      // a queued setMode('senpai') lands after disable) → restore the prior theme.
      if (mode === 'senpai') {
        const restore = (prevThemeRef.current as ThemeMode) || 'clean-dark';
        setMode(restore);
        prevThemeRef.current = null;
        AsyncStorage.removeItem(PREV_THEME_KEY).catch((err) => {
          console.warn('[SenpaiThemeBridge] removeItem failed:', err);
        });
      }
    }
  }, [senpaiState.enabled, mode, setMode]);

  return null;
}
