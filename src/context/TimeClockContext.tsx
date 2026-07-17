import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isoDateOf } from '../components/WeekCalendar';
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
import {
  pushTimeEntryFs, migrateTimeEntries, subscribeTimeEntries, isSyncableTimeEntry,
} from '../services/billingSync';

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

// Per-uid run-once guard for the AsyncStorage -> Firestore time-entry migration.
const TIME_MIGRATED_KEY_PREFIX = '@zenki_timeclock_migrated_v1:';

/**
 * Every shift entry the blob holds, deduped by id. The open shift lives in BOTH
 * currentEntry and currentPeriod.entries (see clockIn), so a Map by id collapses
 * the duplicate. This flat set is what's mirrored to Firestore — one doc per
 * shift, rather than the unbounded nested history blob.
 */
function flatTimeEntries(s: TimeClockState): TimeEntry[] {
  const byId = new Map<string, TimeEntry>();
  if (s.currentEntry) byId.set(s.currentEntry.id, s.currentEntry);
  for (const e of s.currentPeriod.entries) byId.set(e.id, e);
  for (const p of s.history) for (const e of p.entries) byId.set(e.id, e);
  return [...byId.values()];
}

/**
 * Reconstruct the blob from a flat entry set (a fresh-install restore). Buckets
 * every entry into its biweekly period via the canonical getCurrentBiweeklyPeriod,
 * so the pay math sees exactly the structure clockIn/clockOut maintain: the open
 * shift (clockOut === null) is currentEntry AND lives in currentPeriod.entries
 * (getPeriodTotals skips null-clockOut entries, so no double-count).
 */
const OPEN_SHIFT_MAX_MS = 18 * 60 * 60 * 1000; // a real shift is never this long
function rebuildTimeClockState(entries: TimeEntry[]): TimeClockState {
  const open = entries.find((e) => e.clockOut === null) ?? null;
  // A cloud-restored open shift whose clock-in is implausibly old (forgot to
  // clock out, then reinstalled days later) must NOT resurrect as the active
  // shift — a later clock-out would bill a multi-day duration. Leave it as a
  // null-clockOut ghost in its period (getPeriodTotals skips those, so no pay)
  // and start the new device NOT clocked in.
  const openStale = !!open && (Date.now() - Date.parse(open.clockIn) > OPEN_SHIFT_MAX_MS);
  const currentEntry = openStale ? null : open;
  const { startDate: curStart, endDate: curEnd } = getCurrentBiweeklyPeriod();
  const byPeriod = new Map<string, { startDate: string; endDate: string; entries: TimeEntry[] }>();
  for (const e of entries) {
    const { startDate, endDate } = getCurrentBiweeklyPeriod(new Date(e.date + 'T00:00:00'));
    let p = byPeriod.get(startDate);
    if (!p) { p = { startDate, endDate, entries: [] }; byPeriod.set(startDate, p); }
    p.entries.push(e);
  }
  const currentPeriod = byPeriod.get(curStart) ?? { startDate: curStart, endDate: curEnd, entries: [] };
  byPeriod.delete(curStart);
  const history = [...byPeriod.values()].sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  return { currentEntry, currentPeriod, history };
}

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

  // Ref mirror so async flows (flushUnsynced) read the LATEST state without
  // re-creating their callbacks on every entry change.
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Firestore sync (durability) ──────────────────────────────────────
  // Staff timesheets were AsyncStorage-only — a lost/wiped phone lost payroll
  // hours. They now mirror to /users/{uid}/timeEntries (one doc per shift, so the
  // unbounded biweekly history blob never rides in one doc; purge-free via the
  // users step). The pay math and the mutations are untouched: a signature-diff
  // effect pushes whichever entries actually changed, and Firestore-sync state is
  // tracked HERE (not on TimeEntry.synced, which already means "pushed to the
  // Google Sheets timesheet").
  const pushedSigRef = useRef<Map<string, string>>(new Map());

  // Signature EXCLUDES synced — that flag flips when the Google Sheets push
  // completes, which is not a Firestore-relevant change (synced isn't stored
  // server-side), so keying on it would cause pointless re-pushes.
  const entrySig = (e: TimeEntry) => { const { synced: _s, ...rest } = e; return JSON.stringify(rest); };

  // Write-through: push any entry whose content changed since we last pushed it.
  // Fires only on discrete events (clock in/out, lunch/break) — `state` doesn't
  // tick with elapsedMinutes, which is separate state.
  useEffect(() => {
    if (!loaded || !uid) return;
    for (const e of flatTimeEntries(stateRef.current)) {
      const sig = entrySig(e);
      if (pushedSigRef.current.get(e.id) === sig) continue;
      pushTimeEntryFs(uid, e).then((ok) => { if (ok) pushedSigRef.current.set(e.id, sig); }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, loaded, uid]);

  // Migrate existing shifts once, then restore from the cloud on a fresh install.
  useEffect(() => {
    if (!loaded || !uid) return;
    let cancelled = false;
    let unsub: () => void = () => {};

    (async () => {
      try {
        const flagKey = `${TIME_MIGRATED_KEY_PREFIX}${uid}`;
        const already = await AsyncStorage.getItem(flagKey);
        if (!already) {
          const entries = flatTimeEntries(stateRef.current);
          const ids = await migrateTimeEntries(uid, entries);
          if (cancelled) return;
          // Record what we uploaded so the write-through above doesn't re-push it.
          entries.forEach((e) => { if (ids.has(e.id)) pushedSigRef.current.set(e.id, entrySig(e)); });
          if (ids.size >= entries.filter(isSyncableTimeEntry).length) await AsyncStorage.setItem(flagKey, '1');
        }
      } catch { /* non-fatal — retries next launch */ }

      if (cancelled) return;
      // Reconcile against the server ONCE, on the first server-confirmed snapshot
      // (not a one-shot localEmpty check at snapshot time — a clock-in during the
      // pre-snapshot window would have permanently skipped the restore, and the
      // employee's current-period pay would silently under-report). ADDITIVE
      // union: server entries fill in this device's history, but LOCAL wins per
      // id so an in-progress shift started before the snapshot is never clobbered.
      let restored = false;
      unsub = subscribeTimeEntries(uid, (entries, fromServer) => {
        if (cancelled || !fromServer || restored) return;
        restored = true;
        if (entries.length === 0) return;
        const byId = new Map<string, TimeEntry>();
        for (const e of entries) byId.set(e.id, e);
        for (const e of flatTimeEntries(stateRef.current)) byId.set(e.id, e); // local wins
        entries.forEach((e) => { if (!pushedSigRef.current.has(e.id)) pushedSigRef.current.set(e.id, entrySig(e)); });
        setState(rebuildTimeClockState([...byId.values()]));
      });
    })();

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, uid]);
  // Late-bound handle so clockIn (defined above flushUnsynced) can trigger it.
  const flushUnsyncedRef = useRef<null | (() => Promise<void>)>(null);

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
    // Opportunistic retry of any unsynced completed shifts (see flushUnsynced).
    flushUnsyncedRef.current?.();
    const now = new Date();
    // Audit 2.0.5: LOCAL calendar day, not UTC. The UTC key shifted any shift
    // starting ≥5pm PT onto tomorrow's date — losing holiday 2× pay on the
    // holiday evening and wrongly granting it the evening before (the UI
    // banner already used local, so pay math contradicted the banner).
    const dateStr = isoDateOf(now);
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
    // Audit 2.0.5 P1 (payroll data loss): a failed push used to be silent and
    // permanent — synced:false was never read again and no one was told. Now
    // the employee is alerted, and unsynced completed shifts are re-pushed by
    // flushUnsynced() on the next provider mount (app launch) and next
    // clock-in, so a dead-Wi-Fi clock-out heals instead of vanishing.
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
        } else {
          Alert.alert(
            'Shift saved locally',
            "Your clock-out was recorded on this phone but couldn't reach the payroll sheet. It will retry automatically next time you open the app or clock in — if this keeps happening, tell your admin.",
          );
        }
      });
    }
  }, [effectiveEmployeeName, effectiveHourlyRate]);

  // Re-push completed-but-unsynced shifts (payroll must never silently lose a
  // clock-out). Runs on mount-after-hydrate and before each new clock-in.
  const flushingRef = useRef(false);
  const flushUnsynced = useCallback(async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      const { entries, startDate, endDate } = stateRef.current.currentPeriod;
      const pending = entries.filter((e) => !e.synced && e.clockOut);
      for (const entry of pending) {
        const ok = await pushTimeEntry(entry, effectiveEmployeeName, effectiveHourlyRate, startDate, endDate);
        if (!ok) break; // still offline — keep remaining for the next flush
        setState((s) => ({
          ...s,
          currentPeriod: {
            ...s.currentPeriod,
            entries: s.currentPeriod.entries.map((e) =>
              e.id === entry.id ? { ...e, synced: true } : e,
            ),
          },
        }));
      }
    } finally {
      flushingRef.current = false;
    }
  }, [effectiveEmployeeName, effectiveHourlyRate]);
  flushUnsyncedRef.current = flushUnsynced;
  useEffect(() => {
    if (loaded) flushUnsynced();
  }, [loaded, flushUnsynced]);

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
