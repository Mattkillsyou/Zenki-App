import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TimeClockState, TimeEntry } from '../types/timeclock';
import {
  createEmptyPeriod,
  generateEntryId,
  calculateRawMinutes,
  calculatePaidMinutes,
  getElapsedMinutes,
  getCurrentBiweeklyPeriod,
  getPeriodTotals,
} from '../utils/timeclock';
import { pushTimeEntry } from '../services/googleSheets';

const STORAGE_KEY = '@zenki_timeclock_state';

interface TimeClockContextValue {
  state: TimeClockState;
  isClockedIn: boolean;
  elapsedMinutes: number;
  clockIn: () => void;
  clockOut: () => Promise<void>;
  markLunchTaken: () => void;
  markBreakTaken: () => void;
  periodSummary: { totalPaidHours: number; totalPay: number; daysWorked: number };
}

const defaultState: TimeClockState = {
  currentEntry: null,
  currentPeriod: createEmptyPeriod(),
  history: [],
};

const TimeClockContext = createContext<TimeClockContextValue>({
  state: defaultState,
  isClockedIn: false,
  elapsedMinutes: 0,
  clockIn: () => {},
  clockOut: async () => {},
  markLunchTaken: () => {},
  markBreakTaken: () => {},
  periodSummary: { totalPaidHours: 0, totalPay: 0, daysWorked: 0 },
});

export function TimeClockProvider({
  children,
  hourlyRate = 30,
  employeeName = 'Apple',
}: {
  children: React.ReactNode;
  hourlyRate?: number;
  employeeName?: string;
}) {
  const [state, setState] = useState<TimeClockState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved: TimeClockState = JSON.parse(raw);
          // Check if period needs rollover
          const current = getCurrentBiweeklyPeriod();
          if (saved.currentPeriod.startDate !== current.startDate) {
            // Archive old period, start fresh
            const newState: TimeClockState = {
              currentEntry: saved.currentEntry, // preserve if still clocked in
              currentPeriod: { ...current, entries: [] },
              history: [...saved.history, saved.currentPeriod],
            };
            setState(newState);
          } else {
            setState(saved);
          }
        } catch {
          setState(defaultState);
        }
      }
      setLoaded(true);
    });
  }, []);

  // Persist on state change
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, loaded]);

  // Live timer while clocked in
  useEffect(() => {
    if (state.currentEntry) {
      setElapsedMinutes(getElapsedMinutes(state.currentEntry.clockIn));
      timerRef.current = setInterval(() => {
        setElapsedMinutes(getElapsedMinutes(state.currentEntry!.clockIn));
      }, 1000);
    } else {
      setElapsedMinutes(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.currentEntry?.clockIn]);

  const clockIn = useCallback(() => {
    const now = new Date();
    const entry: TimeEntry = {
      id: generateEntryId(),
      date: now.toISOString().split('T')[0],
      clockIn: now.toISOString(),
      clockOut: null,
      lunchTaken: false,
      breakTaken: false,
      totalMinutes: null,
      paidMinutes: null,
      synced: false,
    };
    setState((prev) => ({
      ...prev,
      currentEntry: entry,
      currentPeriod: {
        ...prev.currentPeriod,
        entries: [...prev.currentPeriod.entries, entry],
      },
    }));
  }, []);

  const clockOut = useCallback(async () => {
    setState((prev) => {
      if (!prev.currentEntry) return prev;
      const now = new Date().toISOString();
      const raw = calculateRawMinutes(prev.currentEntry.clockIn, now);
      const paid = calculatePaidMinutes(prev.currentEntry.clockIn, now);
      const completed: TimeEntry = {
        ...prev.currentEntry,
        clockOut: now,
        totalMinutes: raw,
        paidMinutes: paid,
      };
      // Update the entry in the period
      const entries = prev.currentPeriod.entries.map((e) =>
        e.id === completed.id ? completed : e,
      );

      // Fire and forget Sheets sync
      pushTimeEntry(completed, employeeName, hourlyRate, prev.currentPeriod.startDate, prev.currentPeriod.endDate).then((ok) => {
        if (ok) {
          setState((s) => ({
            ...s,
            currentPeriod: {
              ...s.currentPeriod,
              entries: s.currentPeriod.entries.map((e) =>
                e.id === completed.id ? { ...e, synced: true } : e,
              ),
            },
          }));
        }
      });

      return {
        ...prev,
        currentEntry: null,
        currentPeriod: { ...prev.currentPeriod, entries },
      };
    });
  }, [employeeName, hourlyRate]);

  const markLunchTaken = useCallback(() => {
    setState((prev) => {
      if (!prev.currentEntry) return prev;
      const updated = { ...prev.currentEntry, lunchTaken: true };
      return {
        ...prev,
        currentEntry: updated,
        currentPeriod: {
          ...prev.currentPeriod,
          entries: prev.currentPeriod.entries.map((e) =>
            e.id === updated.id ? updated : e,
          ),
        },
      };
    });
  }, []);

  const markBreakTaken = useCallback(() => {
    setState((prev) => {
      if (!prev.currentEntry) return prev;
      const updated = { ...prev.currentEntry, breakTaken: true };
      return {
        ...prev,
        currentEntry: updated,
        currentPeriod: {
          ...prev.currentPeriod,
          entries: prev.currentPeriod.entries.map((e) =>
            e.id === updated.id ? updated : e,
          ),
        },
      };
    });
  }, []);

  const periodSummary = getPeriodTotals(state.currentPeriod, hourlyRate);

  return (
    <TimeClockContext.Provider
      value={{
        state,
        isClockedIn: state.currentEntry !== null,
        elapsedMinutes,
        clockIn,
        clockOut,
        markLunchTaken,
        markBreakTaken,
        periodSummary,
      }}
    >
      {children}
    </TimeClockContext.Provider>
  );
}

export function useTimeClock() {
  return useContext(TimeClockContext);
}
