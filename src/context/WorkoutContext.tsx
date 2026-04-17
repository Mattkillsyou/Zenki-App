import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WOD, WorkoutLog } from '../types/workout';
import { useGamification } from './GamificationContext';

const WODS_KEY = '@zenki_wods';
const LOGS_KEY = '@zenki_workout_logs';

const POINTS_PER_WORKOUT = 25;

interface WorkoutContextValue {
  wods: WOD[];
  logs: WorkoutLog[];
  todaysWOD: WOD | null;
  myLogs: (memberId: string) => WorkoutLog[];
  hasMemberLoggedToday: (memberId: string) => boolean;

  // Admin
  publishWOD: (wod: Omit<WOD, 'id' | 'createdAt'>) => WOD;
  updateWOD: (id: string, patch: Partial<WOD>) => void;
  removeWOD: (id: string) => void;

  // Member
  logWorkout: (log: Omit<WorkoutLog, 'id' | 'createdAt'>) => WorkoutLog;
  removeLog: (id: string) => void;
}

const WorkoutContext = createContext<WorkoutContextValue>({
  wods: [],
  logs: [],
  todaysWOD: null,
  myLogs: () => [],
  hasMemberLoggedToday: () => false,
  publishWOD: () => ({} as WOD),
  updateWOD: () => {},
  removeWOD: () => {},
  logWorkout: () => ({} as WorkoutLog),
  removeLog: () => {},
});

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [wods, setWods] = useState<WOD[]>([]);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { awardPoints, recordSession } = useGamification();

  // Load from AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const [wRaw, lRaw] = await Promise.all([
          AsyncStorage.getItem(WODS_KEY),
          AsyncStorage.getItem(LOGS_KEY),
        ]);
        if (wRaw) setWods(JSON.parse(wRaw));
        if (lRaw) setLogs(JSON.parse(lRaw));
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (loaded) AsyncStorage.setItem(WODS_KEY, JSON.stringify(wods));
  }, [wods, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [logs, loaded]);

  const todaysWOD = useMemo(() => {
    const t = todayISO();
    // If admin published multiple for today, take the most recent
    const todays = wods.filter((w) => w.date === t);
    return todays.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }, [wods]);

  const myLogs = useCallback(
    (memberId: string) =>
      logs
        .filter((l) => l.memberId === memberId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [logs],
  );

  const hasMemberLoggedToday = useCallback(
    (memberId: string) => {
      const t = todayISO();
      return logs.some((l) => l.memberId === memberId && l.date === t);
    },
    [logs],
  );

  // ── Admin ───────────────────────────────────────────

  const publishWOD = useCallback((wod: Omit<WOD, 'id' | 'createdAt'>): WOD => {
    const full: WOD = {
      ...wod,
      id: genId('wod'),
      createdAt: new Date().toISOString(),
    };
    setWods((prev) => [full, ...prev]);
    return full;
  }, []);

  const updateWOD = useCallback((id: string, patch: Partial<WOD>) => {
    setWods((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const removeWOD = useCallback((id: string) => {
    setWods((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // ── Member ──────────────────────────────────────────

  const logWorkout = useCallback(
    (log: Omit<WorkoutLog, 'id' | 'createdAt'>): WorkoutLog => {
      const full: WorkoutLog = {
        ...log,
        id: genId('log'),
        createdAt: new Date().toISOString(),
      };
      setLogs((prev) => [full, ...prev]);
      // Credit the member — routes through existing streak + achievement system
      awardPoints(POINTS_PER_WORKOUT, 'workout_logged');
      recordSession();
      return full;
    },
    [awardPoints, recordSession],
  );

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  return (
    <WorkoutContext.Provider
      value={{
        wods,
        logs,
        todaysWOD,
        myLogs,
        hasMemberLoggedToday,
        publishWOD,
        updateWOD,
        removeWOD,
        logWorkout,
        removeLog,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkouts() {
  return useContext(WorkoutContext);
}
