import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutLog, PersonalRecord } from '../types/workout';
import { EXERCISES_BY_KEY } from '../data/exercises';
import { generateId } from '../utils/generateId';
import { useGamification } from './GamificationContext';

const LOGS_KEY = '@zenki_workout_logs';
const PRS_KEY = '@zenki_personal_records';

const POINTS_PER_WORKOUT = 25;
const POINTS_PER_PR = 50;

interface WorkoutContextValue {
  logs: WorkoutLog[];
  prs: PersonalRecord[];

  // Logs
  myLogs: (memberId: string) => WorkoutLog[];
  hasMemberLoggedToday: (memberId: string) => boolean;
  logWorkout: (log: Omit<WorkoutLog, 'id' | 'createdAt'>) => WorkoutLog;
  removeLog: (id: string) => void;

  // PRs
  myPRs: (memberId: string) => PersonalRecord[];
  prsForExercise: (memberId: string, exerciseKey: string) => PersonalRecord[];
  currentBest: (memberId: string, exerciseKey: string) => PersonalRecord | null;
  addPR: (pr: Omit<PersonalRecord, 'id' | 'createdAt'>) => PersonalRecord;
  removePR: (id: string) => void;
}

const WorkoutContext = createContext<WorkoutContextValue>({
  logs: [],
  prs: [],
  myLogs: () => [],
  hasMemberLoggedToday: () => false,
  logWorkout: () => ({} as WorkoutLog),
  removeLog: () => {},
  myPRs: () => [],
  prsForExercise: () => [],
  currentBest: () => null,
  addPR: () => ({} as PersonalRecord),
  removePR: () => {},
});

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function genId(prefix: string): string {
  return generateId(prefix);
}

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [prs, setPRs] = useState<PersonalRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { awardPoints, recordSession } = useGamification();

  useEffect(() => {
    (async () => {
      try {
        const [lRaw, pRaw] = await Promise.all([
          AsyncStorage.getItem(LOGS_KEY),
          AsyncStorage.getItem(PRS_KEY),
        ]);
        if (lRaw) setLogs(JSON.parse(lRaw));
        if (pRaw) setPRs(JSON.parse(pRaw));
      } catch { /* ignore */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [logs, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(PRS_KEY, JSON.stringify(prs));
  }, [prs, loaded]);

  // ── Logs ────────────────────────────────────────────

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

  const logWorkout = useCallback(
    (log: Omit<WorkoutLog, 'id' | 'createdAt'>): WorkoutLog => {
      const full: WorkoutLog = {
        ...log,
        id: genId('log'),
        createdAt: new Date().toISOString(),
      };
      setLogs((prev) => [full, ...prev]);
      awardPoints(POINTS_PER_WORKOUT, 'workout_logged');
      recordSession();
      return full;
    },
    [awardPoints, recordSession],
  );

  const removeLog = useCallback((id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ── PRs ─────────────────────────────────────────────

  const myPRs = useCallback(
    (memberId: string) =>
      prs
        .filter((p) => p.memberId === memberId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [prs],
  );

  const prsForExercise = useCallback(
    (memberId: string, exerciseKey: string) =>
      prs
        .filter((p) => p.memberId === memberId && p.exerciseKey === exerciseKey)
        .sort((a, b) => a.date.localeCompare(b.date)), // chronological for charting
    [prs],
  );

  const currentBest = useCallback(
    (memberId: string, exerciseKey: string): PersonalRecord | null => {
      const exercise = EXERCISES_BY_KEY[exerciseKey];
      if (!exercise) return null;
      const list = prs.filter((p) => p.memberId === memberId && p.exerciseKey === exerciseKey);
      if (list.length === 0) return null;
      return list.reduce((best, curr) => {
        if (exercise.lowerIsBetter) {
          return curr.value < best.value ? curr : best;
        }
        return curr.value > best.value ? curr : best;
      });
    },
    [prs],
  );

  const addPR = useCallback(
    (pr: Omit<PersonalRecord, 'id' | 'createdAt'>): PersonalRecord => {
      const full: PersonalRecord = {
        ...pr,
        id: genId('pr'),
        createdAt: new Date().toISOString(),
      };
      setPRs((prev) => [full, ...prev]);
      awardPoints(POINTS_PER_PR, 'pr_logged');
      return full;
    },
    [awardPoints],
  );

  const removePR = useCallback((id: string) => {
    setPRs((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return (
    <WorkoutContext.Provider
      value={{
        logs,
        prs,
        myLogs,
        hasMemberLoggedToday,
        logWorkout,
        removeLog,
        myPRs,
        prsForExercise,
        currentBest,
        addPR,
        removePR,
      }}
    >
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkouts() {
  return useContext(WorkoutContext);
}
