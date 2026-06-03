import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import { TimeClockState, TimeEntry } from '../types/timeclock';
import type { PeriodTotals } from '../utils/timeclock';
import {
  createEmptyPeriod,
  generateEntryId,
  calculateRawMinutes,
  calculatePaidMinutes,
  getAutoMealDeductionMinutes,
  getElapsedMinutes,
  getCurrentBiweeklyPeriod,
  getPeriodTotals,
} from '../utils/timeclock';
import { getHolidayInfo } from '../data/holidays';
import { pushTimeEntry } from '../services/googleSheets';
import { useAuth } from './AuthContext';

// Legacy single-key store (pre-F03). Kept only so an existing employee's hours
// on this device migrate into their per-uid store on first load instead of
// vanishing. New writes go to the per-uid key below.
const LEGACY_STORAGE_KEY = '@zenki_timeclock_state';
/** Per-Firebase-uid persistence so two employees on one device never merge
 *  hours. Signed-out / no-uid falls back to the legacy key (single-user). */
const storageKeyForUid = (uid: string | null | undefined): string =>
  uid ? `@zenki_timeclock_state_${uid}` : LEGACY_STORAGE_KEY;

/** Last-resort hourly rate when neither the provider prop nor the member record
 *  carries one. NOT a per-employee value — pay math just needs a number rather
 *  than fabricating $0; the real rate should come from the member's hourlyRate. */
const DOJO_DEFAULT_HOURLY_RATE = 20;

interface TimeClockContextValue {
  state: TimeClockState;
  isClockedIn: boolean;
  elapsedMinutes: number;
  clockIn: () => void;
  clockOut: () => Promise<void>;
  markLunchTaken: () => void;
  markBreakTaken: () => void;
  periodSummary: PeriodTotals;
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
  periodSummary: {
    totalPaidHours: 0, totalPay: 0, daysWorked: 0,
    regularHours: 0, overtimeHours: 0, doubletimeHours: 0,
    holidayHours: 0, holidayPay: 0,
  },
});

export function TimeClockProvider({
  children,
  hourlyRate,
  employeeName,
}: {
  children: React.ReactNode;
  /** Per-employee rate, passed from App (the signed-in member's hourlyRate).
   *  When omitted, falls back to the member record then the dojo default. */
  hourlyRate?: number;
  /** Display name written onto each timesheet row. When omitted, derived from
   *  the signed-in member; never a hardcoded placeholder. */
  employeeName?: string;
}) {
  const { user } = useAuth();
  const uid = user?.firebaseUid ?? null;

  // Resolve the real employee identity. Props (passed by App from the signed-in
  // member) win; otherwise derive from the member record. No 'Apple'/$20
  // placeholder so payroll rows and the in-app pay total reflect the actual
  // employee (F03).
  const effectiveEmployeeName =
    (employeeName && employeeName.trim()) ||
    `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const effectiveHourlyRate =
    hourlyRate ?? user?.hourlyRate ?? DOJO_DEFAULT_HOURLY_RATE;

  const [state, setState] = useState<TimeClockState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load from AsyncStorage, scoped to the current uid so employees on a shared
  // device don't merge hours. Reloads when the signed-in uid changes.
  useEffect(() => {
    let cancelled = false;
    const storageKey = storageKeyForUid(uid);

    const hydrate = (raw: string | null) => {
      if (cancelled) return;
      const saved = safeParseJSON<TimeClockState | null>(raw, null, (v) =>
        typeof v === 'object' && v !== null && 'currentPeriod' in (v as object),
      );
      if (saved) {
        // Check if period needs rollover
        const current = getCurrentBiweeklyPeriod();
        if (saved.currentPeriod.startDate !== current.startDate) {
          setState({
            currentEntry: saved.currentEntry, // preserve if still clocked in
            // Carry the still-open shift into the new period so clockOut (which
            // only .maps existing entries) can find it and its hours/pay count.
            // The old period's history copy keeps the same entry with a null
            // clockOut, which getPeriodTotals skips — so no double-counting.
            currentPeriod: { ...current, entries: saved.currentEntry ? [saved.currentEntry] : [] },
            history: [...saved.history, saved.currentPeriod],
          });
        } else {
          setState(saved);
        }
      } else {
        // No state for this uid yet — start clean (don't leak another
        // employee's in-memory state across a uid switch).
        setState(defaultState);
      }
      setLoaded(true);
    };

    setLoaded(false);
    AsyncStorage.getItem(storageKey).then((raw) => {
      // One-time migration: a signed-in employee with no per-uid store yet
      // adopts the legacy single-key data (this device's prior hours) instead
      // of losing it. Only when there's a uid and no per-uid record. The legacy
      // key is then cleared so a *second* employee on the same device can't
      // inherit the first employee's hours (the merge bug F03 calls out) — the
      // per-uid key written by the persist effect becomes the source of truth.
      if (raw == null && uid) {
        AsyncStorage.getItem(LEGACY_STORAGE_KEY).then((legacyRaw) => {
          if (cancelled) return;
          hydrate(legacyRaw);
          if (legacyRaw != null) AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
        });
      } else {
        hydrate(raw);
      }
    });

    return () => { cancelled = true; };
  }, [uid]);

  // Persist on state change, to the uid-scoped key.
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(storageKeyForUid(uid), JSON.stringify(state));
    }
  }, [state, loaded, uid]);

  // Live timer while clocked in
  useEffect(() => {
    if (state.currentEntry) {
      const clockInTime = state.currentEntry.clockIn; // capture value to avoid stale closure
      setElapsedMinutes(getElapsedMinutes(clockInTime));
      timerRef.current = setInterval(() => {
        setElapsedMinutes(getElapsedMinutes(clockInTime));
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
    const dateStr = now.toISOString().split('T')[0];
    const hol = getHolidayInfo(dateStr);
    const entry: TimeEntry = {
      id: generateEntryId(),
      date: dateStr,
      clockIn: now.toISOString(),
      clockOut: null,
      lunchTaken: false,
      breakTaken: false,
      totalMinutes: null,
      paidMinutes: null,
      mealDeductionMinutes: null,
      isHoliday: hol.isHoliday,
      holidayName: hol.name,
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
    // Capture the completed entry and period bounds outside the updater so the
    // payroll Sheets write fires exactly once. The updater must stay pure —
    // React may invoke it more than once for a single logical update.
    let completed: TimeEntry | null = null;
    let periodStart = '';
    let periodEnd = '';
    setState((prev) => {
      if (!prev.currentEntry) return prev;
      const now = new Date().toISOString();
      const raw = calculateRawMinutes(prev.currentEntry.clockIn, now);
      const paid = calculatePaidMinutes(prev.currentEntry.clockIn, now);
      const mealDeduction = getAutoMealDeductionMinutes(raw);
      completed = {
        ...prev.currentEntry,
        clockOut: now,
        totalMinutes: raw,
        paidMinutes: paid,
        mealDeductionMinutes: mealDeduction,
      };
      periodStart = prev.currentPeriod.startDate;
      periodEnd = prev.currentPeriod.endDate;
      // Update the entry in the period (append if not already present, e.g.
      // after a biweekly rollover, so its hours/pay aren't dropped).
      const entries = prev.currentPeriod.entries.some((e) => e.id === completed!.id)
        ? prev.currentPeriod.entries.map((e) => (e.id === completed!.id ? completed! : e))
        : [...prev.currentPeriod.entries, completed];

      return {
        ...prev,
        currentEntry: null,
        currentPeriod: { ...prev.currentPeriod, entries },
      };
    });

    // After setState — fire the payroll Sheets sync exactly once, then flip the
    // matching entry to synced:true via a single follow-up setState.
    if (completed) {
      const synced: TimeEntry = completed;
      pushTimeEntry(synced, effectiveEmployeeName, effectiveHourlyRate, periodStart, periodEnd).then((ok) => {
        if (ok) {
          setState((s) => ({
            ...s,
            currentPeriod: {
              ...s.currentPeriod,
              entries: s.currentPeriod.entries.map((e) =>
                e.id === synced.id ? { ...e, synced: true } : e,
              ),
            },
          }));
        }
      });
    }
  }, [effectiveEmployeeName, effectiveHourlyRate]);

  const markLunchTaken = useCallback(() => {
    setState((prev) => {
      if (!prev.currentEntry) return prev;
      const updated = { ...prev.currentEntry, lunchTaken: true };
      return {
        ...prev,
        currentEntry: updated,
        currentPeriod: {
          ...prev.currentPeriod,
          entries: prev.currentPeriod.entries.some((e) => e.id === updated.id)
            ? prev.currentPeriod.entries.map((e) => (e.id === updated.id ? updated : e))
            : [...prev.currentPeriod.entries, updated],
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
          entries: prev.currentPeriod.entries.some((e) => e.id === updated.id)
            ? prev.currentPeriod.entries.map((e) => (e.id === updated.id ? updated : e))
            : [...prev.currentPeriod.entries, updated],
        },
      };
    });
  }, []);

  const periodSummary = getPeriodTotals(state.currentPeriod, effectiveHourlyRate);

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
