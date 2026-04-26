import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ClassType, DAYS, SCHEDULES, ScheduleEntry } from '../data/schedule';
import { generateId } from '../utils/generateId';

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
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<ScheduleByDay>;
          // Merge stored schedule on top of seed so newly-added seed classes
          // (via a code release) still appear unless explicitly overridden.
          const next = seedScheduleAsClasses();
          for (const day of DAYS) {
            if (parsed && Array.isArray(parsed[day])) next[day] = parsed[day] as ScheduleClass[];
          }
          setSchedule(next);
        } catch {
          /* ignore — fall through with seed */
        }
      }
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(schedule)).catch(() => {});
  }, [schedule, loaded]);

  const addClass = useCallback(async (day: DayKey, klass: Omit<ScheduleClass, 'id'>) => {
    const created: ScheduleClass = { ...klass, id: generateId('cls') };
    setSchedule((prev) => ({ ...prev, [day]: [...(prev[day] || []), created] }));
    return created;
  }, []);

  const updateClass = useCallback(async (day: DayKey, id: string, patch: Partial<ScheduleClass>) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: (prev[day] || []).map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c)),
    }));
  }, []);

  const removeClass = useCallback(async (day: DayKey, id: string) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: (prev[day] || []).filter((c) => c.id !== id),
    }));
  }, []);

  const resetToSeed = useCallback(async () => {
    setSchedule(seedScheduleAsClasses());
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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
