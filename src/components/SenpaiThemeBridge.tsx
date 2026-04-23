import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSenpai } from '../context/SenpaiContext';
import { useTheme, ThemeMode } from '../context/ThemeContext';

const PREV_THEME_KEY = '@zenki_senpai_prev_theme';

/**
 * When Senpai Mode toggles on, switches the app theme to 'senpai' and saves
 * the previously-active theme to AsyncStorage so it can be restored — even
 * across app relaunches — when Senpai turns off.
 *
 * Lives inside both ThemeProvider and SenpaiProvider.
 */
export function SenpaiThemeBridge() {
  const { state: senpaiState } = useSenpai();
  const { mode, setMode } = useTheme();

  const modeRef = useRef<ThemeMode>(mode);
  const prevEnabledRef = useRef<boolean | null>(null);
  const prevThemeRef = useRef<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(PREV_THEME_KEY).then((saved) => {
      if (saved) prevThemeRef.current = saved;
      loadedRef.current = true;
    }).catch(() => {
      loadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const prev = prevEnabledRef.current;
    prevEnabledRef.current = senpaiState.enabled;

    if (!loadedRef.current) return;

    if (senpaiState.enabled && modeRef.current !== 'senpai') {
      if (modeRef.current) {
        prevThemeRef.current = modeRef.current;
        AsyncStorage.setItem(PREV_THEME_KEY, modeRef.current).catch(() => {});
      }
      setMode('senpai');
    } else if (prev !== null && !senpaiState.enabled && modeRef.current === 'senpai') {
      const restore = (prevThemeRef.current as ThemeMode) || 'clean-dark';
      setMode(restore);
      prevThemeRef.current = null;
      AsyncStorage.removeItem(PREV_THEME_KEY).catch(() => {});
    }
  }, [senpaiState.enabled, setMode]);

  return null;
}
