import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@zenki_senpai_mode';
const VOLUME_KEY = '@zenki_senpai_volume';
const SPARKLE_KEY = '@zenki_senpai_sparkle';
const MEMORY_KEY = '@zenki_senpai_memory';

const MEMORY_CAP = 100;

export type MascotMood =
  | 'idle'
  | 'cheering'
  | 'impressed'
  | 'encouraging'
  | 'celebrating'
  | 'sleeping'
  | 'disappointed';

export type SenpaiVolume = 'low' | 'med' | 'high';
export type SparkleIntensity = 'normal' | 'maximum';

export interface MemoryEntry {
  mood: MascotMood;
  dialogue: string;
  timestamp: number;
}

interface SenpaiState {
  enabled: boolean;
  mascotMood: MascotMood;
  lastReaction: string | null;
  reactionExpiry: number;
  sparkleActive: boolean;
  volume: SenpaiVolume;
  sparkleIntensity: SparkleIntensity;
  memoryLog: MemoryEntry[];
}

interface SenpaiContextValue {
  state: SenpaiState;
  setEnabled: (on: boolean) => void;
  triggerReaction: (mood: MascotMood, dialogue: string, durationMs?: number) => void;
  clearReaction: () => void;
  setVolume: (vol: SenpaiVolume) => void;
  setSparkleIntensity: (intensity: SparkleIntensity) => void;
  clearMemoryLog: () => void;
  shouldReact: () => boolean;
}

const defaultState: SenpaiState = {
  enabled: false,
  mascotMood: 'idle',
  lastReaction: null,
  reactionExpiry: 0,
  sparkleActive: false,
  volume: 'high',
  sparkleIntensity: 'normal',
  memoryLog: [],
};

const SenpaiContext = createContext<SenpaiContextValue>({
  state: defaultState,
  setEnabled: () => {},
  triggerReaction: () => {},
  clearReaction: () => {},
  setVolume: () => {},
  setSparkleIntensity: () => {},
  clearMemoryLog: () => {},
  shouldReact: () => false,
});

export function SenpaiProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SenpaiState>(defaultState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRef = useRef<SenpaiVolume>(defaultState.volume);

  // Load all persisted values on mount
  useEffect(() => {
    (async () => {
      try {
        const [enabledRaw, volumeRaw, sparkleRaw, memoryRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(VOLUME_KEY),
          AsyncStorage.getItem(SPARKLE_KEY),
          AsyncStorage.getItem(MEMORY_KEY),
        ]);
        const volume: SenpaiVolume =
          volumeRaw === 'low' || volumeRaw === 'med' || volumeRaw === 'high' ? volumeRaw : 'high';
        const sparkleIntensity: SparkleIntensity =
          sparkleRaw === 'maximum' ? 'maximum' : 'normal';
        let memoryLog: MemoryEntry[] = [];
        if (memoryRaw) {
          try {
            const parsed = JSON.parse(memoryRaw);
            if (Array.isArray(parsed)) memoryLog = parsed.slice(-MEMORY_CAP);
          } catch { /* ignore malformed memory */ }
        }
        volumeRef.current = volume;
        setState((s) => ({
          ...s,
          enabled: enabledRaw === 'true',
          volume,
          sparkleIntensity,
          memoryLog,
        }));
      } catch { /* ignore storage errors */ }
    })();
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setState((s) => ({ ...s, enabled: on }));
    AsyncStorage.setItem(STORAGE_KEY, String(on)).catch(() => {});
  }, []);

  const setVolume = useCallback((vol: SenpaiVolume) => {
    volumeRef.current = vol;
    setState((s) => ({ ...s, volume: vol }));
    AsyncStorage.setItem(VOLUME_KEY, vol).catch(() => {});
  }, []);

  const setSparkleIntensity = useCallback((intensity: SparkleIntensity) => {
    setState((s) => ({ ...s, sparkleIntensity: intensity }));
    AsyncStorage.setItem(SPARKLE_KEY, intensity).catch(() => {});
  }, []);

  const clearMemoryLog = useCallback(() => {
    setState((s) => ({ ...s, memoryLog: [] }));
    AsyncStorage.setItem(MEMORY_KEY, '[]').catch(() => {});
  }, []);

  const clearReaction = useCallback(() => {
    setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
  }, []);

  const shouldReact = useCallback(() => {
    const v = volumeRef.current;
    if (v === 'high') return true;
    if (v === 'med') return Math.random() < 0.7;
    return Math.random() < 0.3;
  }, []);

  const triggerReaction = useCallback((mood: MascotMood, dialogue: string, durationMs: number = 3000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const sparkle = mood === 'cheering' || mood === 'impressed' || mood === 'celebrating';
    const entry: MemoryEntry = { mood, dialogue, timestamp: Date.now() };
    setState((s) => {
      const nextLog = [...s.memoryLog, entry];
      const cappedLog = nextLog.length > MEMORY_CAP ? nextLog.slice(nextLog.length - MEMORY_CAP) : nextLog;
      AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(cappedLog)).catch(() => {});
      return {
        ...s,
        mascotMood: mood,
        lastReaction: dialogue,
        reactionExpiry: Date.now() + durationMs,
        sparkleActive: sparkle,
        memoryLog: cappedLog,
      };
    });
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return (
    <SenpaiContext.Provider value={{
      state,
      setEnabled,
      triggerReaction,
      clearReaction,
      setVolume,
      setSparkleIntensity,
      clearMemoryLog,
      shouldReact,
    }}>
      {children}
    </SenpaiContext.Provider>
  );
}

export function useSenpai() {
  return useContext(SenpaiContext);
}
