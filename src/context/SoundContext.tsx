import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { playSynth, SoundTheme, SoundEvent } from '../sounds/synth';

const STORAGE_KEY = '@zenki_sound_prefs';

interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0..1
}

interface SoundContextValue extends SoundPrefs {
  theme: SoundTheme;
  setTheme: (t: SoundTheme) => void;
  play: (event: SoundEvent) => void;
  setEnabled: (on: boolean) => void;
  setVolume: (v: number) => void;
}

const defaultPrefs: SoundPrefs = { enabled: true, volume: 0.8 };

const SoundContext = createContext<SoundContextValue>({
  ...defaultPrefs,
  theme: 'default',
  setTheme: () => {},
  play: () => {},
  setEnabled: () => {},
  setVolume: () => {},
});

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<SoundPrefs>(defaultPrefs);
  const [theme, setTheme] = useState<SoundTheme>('default');
  const [loaded, setLoaded] = useState(false);
  const lastPlayRef = useRef<{ [k: string]: number }>({});

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setPrefs({ ...defaultPrefs, ...JSON.parse(raw) }); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [prefs, loaded]);

  const play = useCallback((event: SoundEvent) => {
    if (!prefs.enabled) return;
    // Debounce rapid-fire taps (avoid ear-piercing machine-gun clicks)
    const key = `${theme}:${event}`;
    const now = Date.now();
    const last = lastPlayRef.current[key] || 0;
    const minGap = event === 'tap' ? 60 : 120;
    if (now - last < minGap) return;
    lastPlayRef.current[key] = now;

    try {
      playSynth(theme, event);
    } catch { /* ignore — sound is non-critical */ }
  }, [prefs.enabled, theme]);

  const setEnabled = useCallback((on: boolean) => setPrefs((p) => ({ ...p, enabled: on })), []);
  const setVolume  = useCallback((v: number) => setPrefs((p) => ({ ...p, volume: Math.max(0, Math.min(1, v)) })), []);

  return (
    <SoundContext.Provider
      value={{ ...prefs, theme, setTheme, play, setEnabled, setVolume }}
    >
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  return useContext(SoundContext);
}

/** Set the sound theme for the duration a screen is mounted. */
export function useScreenSoundTheme(theme: SoundTheme) {
  const { setTheme } = useSound();
  useEffect(() => {
    setTheme(theme);
    // Don't reset on unmount — next screen's hook will switch it. Avoids a
    // brief "default" flash between transitions.
  }, [theme, setTheme]);
}
