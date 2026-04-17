import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@zenki_senpai_mode';

export type MascotMood =
  | 'idle'
  | 'cheering'
  | 'impressed'
  | 'encouraging'
  | 'celebrating'
  | 'sleeping'
  | 'disappointed';

interface SenpaiState {
  enabled: boolean;
  mascotMood: MascotMood;
  lastReaction: string | null;
  reactionExpiry: number;
  sparkleActive: boolean;
}

interface SenpaiContextValue {
  state: SenpaiState;
  setEnabled: (on: boolean) => void;
  triggerReaction: (mood: MascotMood, dialogue: string, durationMs?: number) => void;
  clearReaction: () => void;
}

const SenpaiContext = createContext<SenpaiContextValue>({
  state: { enabled: false, mascotMood: 'idle', lastReaction: null, reactionExpiry: 0, sparkleActive: false },
  setEnabled: () => {},
  triggerReaction: () => {},
  clearReaction: () => {},
});

export function SenpaiProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SenpaiState>({
    enabled: false,
    mascotMood: 'idle',
    lastReaction: null,
    reactionExpiry: 0,
    sparkleActive: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'true') setState((s) => ({ ...s, enabled: true }));
    });
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setState((s) => ({ ...s, enabled: on }));
    AsyncStorage.setItem(STORAGE_KEY, String(on));
  }, []);

  const clearReaction = useCallback(() => {
    setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
  }, []);

  const triggerReaction = useCallback((mood: MascotMood, dialogue: string, durationMs: number = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const sparkle = mood === 'cheering' || mood === 'impressed' || mood === 'celebrating';
    setState((s) => ({
      ...s,
      mascotMood: mood,
      lastReaction: dialogue,
      reactionExpiry: Date.now() + durationMs,
      sparkleActive: sparkle,
    }));
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <SenpaiContext.Provider value={{ state, setEnabled, triggerReaction, clearReaction }}>
      {children}
    </SenpaiContext.Provider>
  );
}

export function useSenpai() {
  return useContext(SenpaiContext);
}
