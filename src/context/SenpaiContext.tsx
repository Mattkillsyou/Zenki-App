import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImpactType } from '../components/SenpaiImpactEffect';

const STORAGE_KEY = '@zenki_senpai_mode';
const VOLUME_KEY = '@zenki_senpai_volume';
const SPARKLE_KEY = '@zenki_senpai_sparkle';
const MEMORY_KEY = '@zenki_senpai_memory';
const OUTFIT_KEY = '@zenki_senpai_outfit';
const AMBIENT_KEY = '@zenki_senpai_ambient';
const CHAT_ENABLED_KEY = '@zenki_senpai_chat_enabled';

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
  outfitId: string;
  transformationPlayed: boolean;
  ambientEffects: boolean;
  activeImpact: ImpactType | null;
  /** SECRET LAB flag: when on, tapping the floating mascot opens the AI chat
   *  modal instead of triggering a one-shot reaction. */
  chatEnabled: boolean;
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
  setOutfit: (id: string) => void;
  markTransformationPlayed: () => void;
  setAmbientEffects: (on: boolean) => void;
  triggerImpact: (type: ImpactType) => void;
  clearImpact: () => void;
  setChatEnabled: (on: boolean) => void;
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
  outfitId: 'default',
  transformationPlayed: false,
  ambientEffects: true,
  activeImpact: null,
  chatEnabled: false,
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
  setOutfit: () => {},
  markTransformationPlayed: () => {},
  setAmbientEffects: () => {},
  triggerImpact: () => {},
  clearImpact: () => {},
  setChatEnabled: () => {},
});

export function SenpaiProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SenpaiState>(defaultState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRef = useRef<SenpaiVolume>(defaultState.volume);

  // Load all persisted values on mount
  useEffect(() => {
    (async () => {
      try {
        const [enabledRaw, volumeRaw, sparkleRaw, memoryRaw, outfitRaw, ambientRaw, chatEnabledRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(VOLUME_KEY),
          AsyncStorage.getItem(SPARKLE_KEY),
          AsyncStorage.getItem(MEMORY_KEY),
          AsyncStorage.getItem(OUTFIT_KEY),
          AsyncStorage.getItem(AMBIENT_KEY),
          AsyncStorage.getItem(CHAT_ENABLED_KEY),
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
        const outfitId = typeof outfitRaw === 'string' && outfitRaw.length > 0 ? outfitRaw : 'default';
        const ambientEffects = ambientRaw === null ? true : ambientRaw === 'true';
        volumeRef.current = volume;
        setState((s) => ({
          ...s,
          enabled: enabledRaw === 'true',
          volume,
          sparkleIntensity,
          memoryLog,
          outfitId,
          ambientEffects,
          chatEnabled: chatEnabledRaw === 'true',
        }));
      } catch { /* ignore storage errors */ }
    })();
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    setState((s) => ({
      ...s,
      enabled: on,
      transformationPlayed: on ? s.transformationPlayed : false,
    }));
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

  const setOutfit = useCallback((id: string) => {
    setState((s) => ({ ...s, outfitId: id }));
    AsyncStorage.setItem(OUTFIT_KEY, id).catch(() => {});
  }, []);

  const markTransformationPlayed = useCallback(() => {
    setState((s) => (s.transformationPlayed ? s : { ...s, transformationPlayed: true }));
  }, []);

  const setAmbientEffects = useCallback((on: boolean) => {
    setState((s) => ({ ...s, ambientEffects: on }));
    AsyncStorage.setItem(AMBIENT_KEY, String(on)).catch(() => {});
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
    // Mood-driven impact effect — only the biggest moments get one.
    const impactMap: Partial<Record<MascotMood, ImpactType>> = {
      impressed: 'explosion',
      celebrating: 'spiral',
    };
    const impact = impactMap[mood] ?? null;
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
        activeImpact: impact,
      };
    });
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
    }, durationMs);
  }, []);

  const triggerImpact = useCallback((type: ImpactType) => {
    setState((s) => ({ ...s, activeImpact: type }));
  }, []);

  const clearImpact = useCallback(() => {
    setState((s) => (s.activeImpact === null ? s : { ...s, activeImpact: null }));
  }, []);

  const setChatEnabled = useCallback((on: boolean) => {
    setState((s) => ({ ...s, chatEnabled: on }));
    AsyncStorage.setItem(CHAT_ENABLED_KEY, String(on)).catch(() => {});
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
      setOutfit,
      markTransformationPlayed,
      setAmbientEffects,
      triggerImpact,
      clearImpact,
      setChatEnabled,
    }}>
      {children}
    </SenpaiContext.Provider>
  );
}

export function useSenpai() {
  return useContext(SenpaiContext);
}
