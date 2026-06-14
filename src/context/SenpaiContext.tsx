import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImpactType } from '../components/SenpaiImpactEffect';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';

const STORAGE_KEY = '@zenki_senpai_mode';
const VOLUME_KEY = '@zenki_senpai_volume';
const SPARKLE_KEY = '@zenki_senpai_sparkle';
const MEMORY_KEY = '@zenki_senpai_memory';
const AMBIENT_KEY = '@zenki_senpai_ambient';

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

// Reaction precedence: when several reactions fire within COALESCE_MS of each
// other (e.g. a single GPS save increments totalSessions AND unlocks an
// achievement AND a screen fires its own line), the highest-priority one wins
// instead of the last writer stomping the others. Also makes "streak broken"
// (disappointed) lose to the "you trained!" (cheering) it always coincides with.
const MOOD_PRIORITY: Record<MascotMood, number> = {
  celebrating: 5,
  impressed: 4,
  cheering: 3,
  encouraging: 2,
  disappointed: 1,
  idle: 0,
  sleeping: 0,
};
const COALESCE_MS = 250;

interface SenpaiState {
  enabled: boolean;
  mascotMood: MascotMood;
  lastReaction: string | null;
  reactionExpiry: number;
  sparkleActive: boolean;
  volume: SenpaiVolume;
  sparkleIntensity: SparkleIntensity;
  memoryLog: MemoryEntry[];
  transformationPlayed: boolean;
  ambientEffects: boolean;
  activeImpact: ImpactType | null;
}

interface SenpaiContextValue {
  state: SenpaiState;
  setEnabled: (on: boolean) => void;
  triggerReaction: (mood: MascotMood, dialogue: string, durationMs?: number) => void;
  setVolume: (vol: SenpaiVolume) => void;
  setSparkleIntensity: (intensity: SparkleIntensity) => void;
  clearMemoryLog: () => void;
  shouldReact: () => boolean;
  markTransformationPlayed: () => void;
  setAmbientEffects: (on: boolean) => void;
  clearImpact: () => void;
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
  transformationPlayed: false,
  ambientEffects: true,
  activeImpact: null,
};

const SenpaiContext = createContext<SenpaiContextValue>({
  state: defaultState,
  setEnabled: () => {},
  triggerReaction: () => {},
  setVolume: () => {},
  setSparkleIntensity: () => {},
  clearMemoryLog: () => {},
  shouldReact: () => false,
  markTransformationPlayed: () => {},
  setAmbientEffects: () => {},
  clearImpact: () => {},
});

function isMemoryEntry(e: unknown): e is MemoryEntry {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof (e as MemoryEntry).dialogue === 'string' &&
    typeof (e as MemoryEntry).timestamp === 'number' &&
    typeof (e as MemoryEntry).mood === 'string'
  );
}

export function SenpaiProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SenpaiState>(defaultState);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRef = useRef<SenpaiVolume>(defaultState.volume);
  // Coalescing bookkeeping (see MOOD_PRIORITY).
  const lastTriggerAtRef = useRef(0);
  const lastPriorityRef = useRef(-1);

  // Load all persisted values on mount
  useEffect(() => {
    (async () => {
      try {
        const [enabledRaw, volumeRaw, sparkleRaw, memoryRaw, ambientRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(VOLUME_KEY),
          AsyncStorage.getItem(SPARKLE_KEY),
          AsyncStorage.getItem(MEMORY_KEY),
          AsyncStorage.getItem(AMBIENT_KEY),
        ]);
        const volume: SenpaiVolume =
          volumeRaw === 'low' || volumeRaw === 'med' || volumeRaw === 'high' ? volumeRaw : 'high';
        const sparkleIntensity: SparkleIntensity =
          sparkleRaw === 'maximum' ? 'maximum' : 'normal';
        const parsedMemory = safeParseJSON<MemoryEntry[]>(memoryRaw, [], Array.isArray);
        // Validate element shape, not just Array.isArray — a corrupt blob must
        // not produce undefined-mood / Invalid-Date rows in the Memory screen.
        const memoryLog: MemoryEntry[] = parsedMemory.filter(isMemoryEntry).slice(-MEMORY_CAP);
        const ambientEffects = ambientRaw === null ? true : ambientRaw === 'true';
        volumeRef.current = volume;
        setState((s) => ({
          ...s,
          enabled: enabledRaw === 'true',
          volume,
          sparkleIntensity,
          memoryLog,
          ambientEffects,
        }));
      } catch { /* ignore storage errors */ }
    })();
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    // Disabling must fully quiesce the mascot: cancel the pending auto-clear
    // timer and reset transient reaction state so nothing fires after the user
    // turns Senpai off (and a long-lived `sleeping` doesn't linger into re-enable).
    if (!on && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setState((s) => ({
      ...s,
      enabled: on,
      transformationPlayed: on ? s.transformationPlayed : false,
      ...(on
        ? {}
        : {
            mascotMood: 'idle' as MascotMood,
            lastReaction: null,
            reactionExpiry: 0,
            sparkleActive: false,
            activeImpact: null,
          }),
    }));
    safeStorageSet(STORAGE_KEY, String(on), '[Senpai]');
  }, []);

  const setVolume = useCallback((vol: SenpaiVolume) => {
    volumeRef.current = vol;
    setState((s) => ({ ...s, volume: vol }));
    safeStorageSet(VOLUME_KEY, vol, '[Senpai]');
  }, []);

  const setSparkleIntensity = useCallback((intensity: SparkleIntensity) => {
    setState((s) => ({ ...s, sparkleIntensity: intensity }));
    safeStorageSet(SPARKLE_KEY, intensity, '[Senpai]');
  }, []);

  const clearMemoryLog = useCallback(() => {
    setState((s) => ({ ...s, memoryLog: [] }));
    safeStorageSet(MEMORY_KEY, '[]', '[Senpai]');
  }, []);

  const markTransformationPlayed = useCallback(() => {
    setState((s) => (s.transformationPlayed ? s : { ...s, transformationPlayed: true }));
  }, []);

  const setAmbientEffects = useCallback((on: boolean) => {
    setState((s) => ({ ...s, ambientEffects: on }));
    safeStorageSet(AMBIENT_KEY, String(on), '[Senpai]');
  }, []);

  const shouldReact = useCallback(() => {
    const v = volumeRef.current;
    if (v === 'high') return true;
    if (v === 'med') return Math.random() < 0.7;
    return Math.random() < 0.3;
  }, []);

  const triggerReaction = useCallback((mood: MascotMood, dialogue: string, durationMs: number = 3000) => {
    const now = Date.now();
    const priority = MOOD_PRIORITY[mood] ?? 0;
    // A non-finite/0 duration means "terminal" — no auto-clear. Used by the
    // idle→sleep ('zzz…') so she stays asleep until the next interaction,
    // instead of flipping back to idle ~100s later and re-arming the cycle.
    const terminal = !Number.isFinite(durationMs) || durationMs <= 0;
    // Coalesce same-moment bursts: if a strictly higher-priority reaction just
    // fired, keep it instead of letting this lower one stomp it.
    if (now - lastTriggerAtRef.current < COALESCE_MS && priority < lastPriorityRef.current) {
      return;
    }
    lastTriggerAtRef.current = now;
    lastPriorityRef.current = priority;

    if (timerRef.current) clearTimeout(timerRef.current);
    const sparkle = mood === 'cheering' || mood === 'impressed' || mood === 'celebrating';
    // Mood-driven impact effect — every ImpactType is reachable from a mood.
    const impactMap: Partial<Record<MascotMood, ImpactType>> = {
      impressed: 'explosion',
      celebrating: 'spiral',
      cheering: 'hearts',
      encouraging: 'flash',
    };
    const impact = impactMap[mood] ?? null;
    const entry: MemoryEntry = { mood, dialogue, timestamp: now };
    // Keep the updater pure (React may run it more than once): compute the next
    // memory log here, then persist once OUTSIDE setState below.
    let cappedLog: MemoryEntry[] = [];
    setState((s) => {
      const nextLog = [...s.memoryLog, entry];
      cappedLog = nextLog.length > MEMORY_CAP ? nextLog.slice(nextLog.length - MEMORY_CAP) : nextLog;
      return {
        ...s,
        mascotMood: mood,
        lastReaction: dialogue,
        reactionExpiry: terminal ? Number.MAX_SAFE_INTEGER : now + durationMs,
        sparkleActive: sparkle,
        memoryLog: cappedLog,
        activeImpact: impact,
      };
    });
    safeStorageSet(MEMORY_KEY, cappedLog, '[Senpai]');
    if (!terminal) {
      timerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
      }, durationMs);
    }
  }, []);

  const clearImpact = useCallback(() => {
    setState((s) => (s.activeImpact === null ? s : { ...s, activeImpact: null }));
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const value = useMemo<SenpaiContextValue>(() => ({
    state,
    setEnabled,
    triggerReaction,
    setVolume,
    setSparkleIntensity,
    clearMemoryLog,
    shouldReact,
    markTransformationPlayed,
    setAmbientEffects,
    clearImpact,
  }), [state, setEnabled, triggerReaction, setVolume, setSparkleIntensity, clearMemoryLog, shouldReact, markTransformationPlayed, setAmbientEffects, clearImpact]);

  return <SenpaiContext.Provider value={value}>{children}</SenpaiContext.Provider>;
}

export function useSenpai() {
  return useContext(SenpaiContext);
}
