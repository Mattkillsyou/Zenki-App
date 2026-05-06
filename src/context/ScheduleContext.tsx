import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClassType, DAYS, SCHEDULES, ScheduleEntry } from '../data/schedule';
import { generateId } from '../utils/generateId';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { syncOrAlert } from '../utils/syncOrAlert';
import {
  subscribeToSchedule,
  upsertScheduleDay,
  clearScheduleDay,
} from '../services/scheduleSync';

const STORAGE_KEY = '@zenki_schedule_overrides_v1';

export type DayKey = (typeof DAYS)[number];

export interface ScheduleClass extends ScheduleEntry {
  /** Stable id used for edits/deletes. Seed entries get a synthetic id. */
  id: string;
}

export type ScheduleByDay = Record<DayKey, ScheduleClass[]>;

interface ScheduleContextValue {
  schedule: ScheduleByDay;
  loaded: boolean;
  /** Today's classes (Mon=0). Convenience for screens that don't need a day picker. */
  getToday: () => ScheduleClass[];
  addClass: (day: DayKey, klass: Omit<ScheduleClass, 'id'>) => Promise<ScheduleClass>;
  updateClass: (day: DayKey, id: string, patch: Partial<ScheduleClass>) => Promise<void>;
  removeClass: (day: DayKey, id: string) => Promise<void>;
  /** Wipe local edits and revert to the seed schedule. */
  resetToSeed: () => Promise<void>;
}

const empty = DAYS.reduce((acc, d) => { acc[d] = []; return acc; }, {} as ScheduleByDay);

const ScheduleContext = createContext<ScheduleContextValue>({
  schedule: empty,
  loaded: false,
  getToday: () => [],
  addClass: async () => ({} as ScheduleClass),
  updateClass: async () => {},
  removeClass: async () => {},
  resetToSeed: async () => {},
});

function seedScheduleAsClasses(): ScheduleByDay {
  const out = {} as ScheduleByDay;
  for (const day of DAYS) {
    const entries = SCHEDULES[day] || [];
    out[day] = entries.map((e, idx) => ({ ...e, id: `seed-${day}-${idx}` }));
  }
  return out;
}

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [schedule, setSchedule] = useState<ScheduleByDay>(seedScheduleAsClasses());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const parsed = safeParseJSON<Partial<ScheduleByDay>>(
        raw,
        {},
        (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      );
      // Merge stored schedule on top of seed so newly-added seed classes
      // (via a code release) still appear unless explicitly overridden.
      const next = seedScheduleAsClasses();
      for (const day of DAYS) {
        if (Array.isArray(parsed[day])) next[day] = parsed[day] as ScheduleClass[];
      }
      setSchedule(next);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Live Firestore subscription. Replaces local state for any day that has a
  // doc in /schedule; days with no doc fall back to the in-app seed. Cached
  // to AsyncStorage so cold-boot offline still shows last-known state.
  useEffect(() => {
    const unsub = subscribeToSchedule((byDay) => {
      setSchedule(() => {
        const next = seedScheduleAsClasses();
        for (const day of DAYS) {
          const fromFs = byDay[day];
          if (Array.isArray(fromFs)) next[day] = fromFs;
        }
        safeStorageSet(STORAGE_KEY, next, '[Schedule]');
        return next;
      });
    });
    return () => { unsub(); };
  }, []);

  // Push a single day's array to Firestore. The subscription listener
  // round-trips the change into local state + AsyncStorage cache.
  const writeDay = useCallback((day: DayKey, classes: ScheduleClass[]) => {
    syncOrAlert(upsertScheduleDay(day, classes), 'Schedule');
  }, []);

  const addClass = useCallback(async (day: DayKey, klass: Omit<ScheduleClass, 'id'>) => {
    const created: ScheduleClass = { ...klass, id: generateId('cls') };
    let nextDayClasses: ScheduleClass[] = [];
    setSchedule((prev) => {
      nextDayClasses = [...(prev[day] || []), created];
      return { ...prev, [day]: nextDayClasses };
    });
    writeDay(day, nextDayClasses);
    return created;
  }, [writeDay]);

  const updateClass = useCallback(async (day: DayKey, id: string, patch: Partial<ScheduleClass>) => {
    let nextDayClasses: ScheduleClass[] = [];
    setSchedule((prev) => {
      nextDayClasses = (prev[day] || []).map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c));
      return { ...prev, [day]: nextDayClasses };
    });
    writeDay(day, nextDayClasses);
  }, [writeDay]);

  const removeClass = useCallback(async (day: DayKey, id: string) => {
    let nextDayClasses: ScheduleClass[] = [];
    setSchedule((prev) => {
      nextDayClasses = (prev[day] || []).filter((c) => c.id !== id);
      return { ...prev, [day]: nextDayClasses };
    });
    writeDay(day, nextDayClasses);
  }, [writeDay]);

  const resetToSeed = useCallback(async () => {
    setSchedule(seedScheduleAsClasses());
    AsyncStorage.removeItem(STORAGE_KEY).catch((err) => {
      console.warn('[Schedule] AsyncStorage.removeItem failed:', err);
    });
    // Clear every day's Firestore doc so seed shows for everyone.
    await Promise.all(DAYS.map((d) => clearScheduleDay(d).catch(() => false)));
  }, []);

  const getToday = useCallback((): ScheduleClass[] => {
    const dayOfWeek = new Date().getDay();
    const idx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return schedule[DAYS[idx]] || [];
  }, [schedule]);

  const value = useMemo(
    () => ({ schedule, loaded, getToday, addClass, updateClass, removeClass, resetToSeed }),
    [schedule, loaded, getToday, addClass, updateClass, removeClass, resetToSeed],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule() {
  return useContext(ScheduleContext);
}

export type { ClassType };
