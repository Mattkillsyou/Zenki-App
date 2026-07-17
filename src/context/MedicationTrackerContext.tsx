import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import {
  MedicationEntry, MedicationLog,
  isMedicationScheduledForDate,
} from '../types/medication';
import { generateId } from '../utils/generateId';
import {
  scheduleMedicationNotifications,
  cancelMedicationNotifications,
  rescheduleMedicationNotifications,
} from '../services/medicationNotifications';
import { useAuth } from './AuthContext';
import { getCurrentUid } from '../services/firebaseAuth';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { mergeById as mergeSyncById, reconcileDeletes, markSyncedUnchanged, snapshotForPush } from '../services/syncCore';
import {
  pushMedication, deleteMedication, flushMedications, migrateMedications, subscribeMedications, isSyncableMedication,
  pushMedLog, deleteMedLog, flushMedLogs, migrateMedLogs, subscribeMedLogs, isSyncableMedLog,
  type SyncedMedication, type SyncedMedicationLog,
} from '../services/healthSync';

const STORAGE_KEY = '@zenki_medications';
const LOG_STORAGE_KEY = '@zenki_medication_logs';
// Per-uid run-once guard for the AsyncStorage → Firestore medication migration.
const MED_MIGRATED_KEY_PREFIX = '@zenki_med_migrated_v1:';
// One-time migration marker: weekly/biweekly reminders scheduled before the
// startDate weekday fix (UTC parse fired a day early west of UTC) have the
// wrong weekday baked into the OS triggers and must be re-scheduled once.
const WEEKDAY_FIX_KEY = '@zenki_med_notif_weekday_fix_v1';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

export interface DailyMedicationItem {
  medication: MedicationEntry;
  /** HH:mm strings scheduled for this day */
  times: string[];
  /** Logs that fall on this day for this med */
  logs: MedicationLog[];
}

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  medications: DailyMedicationItem[];
  /** 0..1 — fraction of doses that have a non-skipped log */
  completionRate: number;
  /** Total doses scheduled this day (across all meds) */
  totalDoses: number;
  /** How many were taken (logged, not skipped) */
  takenDoses: number;
}

export interface AdherenceStats {
  taken: number;
  missed: number;
  skipped: number;
  /** taken / (taken + missed + skipped). 0 if denominator is 0. */
  rate: number;
}

interface AddMedicationParams {
  memberId: string;
  name: string;
  brandName?: string;
  externalId?: string;
  category: MedicationEntry['category'];
  dose: string;
  doseUnit: string;
  route: MedicationEntry['route'];
  frequency: MedicationEntry['frequency'];
  customDays?: number[];
  timesOfDay: string[];
  startDate: string;
  endDate?: string;
  injectionSites?: string[];
  notes?: string;
  notificationsEnabled?: boolean;
}

interface LogDoseParams {
  memberId: string;
  scheduledFor: string;       // ISO timestamp of the scheduled slot
  takenAt?: string;           // ISO timestamp; defaults to now
  dose?: string;              // override actual dose if different
  injectionSite?: string;
  skipped?: boolean;
  notes?: string;
}

interface MedicationTrackerValue {
  medications: MedicationEntry[];
  logs: MedicationLog[];
  loaded: boolean;

  addMedication: (params: AddMedicationParams) => Promise<MedicationEntry>;
  updateMedication: (id: string, patch: Partial<Omit<MedicationEntry, 'id' | 'memberId' | 'createdAt'>>) => Promise<void>;
  removeMedication: (id: string) => Promise<void>;

  logDose: (medicationId: string, params: LogDoseParams) => MedicationLog;
  removeLog: (logId: string) => void;

  /** Scoped accessors */
  memberMedications: (memberId: string) => MedicationEntry[];
  getMedicationLogs: (medicationId: string, dateRange?: { start: string; end: string }) => MedicationLog[];
  getMedicationsForDate: (memberId: string, isoDate: string) => DailyMedicationItem[];
  getCalendarWeek: (memberId: string, weekStartIso: string) => CalendarDay[];
  getAdherence: (medicationId: string, days?: number) => AdherenceStats;

  /** Toggle notifications without editing other fields */
  setNotificationsEnabled: (medicationId: string, enabled: boolean) => Promise<void>;
}

const noop = async () => {};

const MedicationTrackerContext = createContext<MedicationTrackerValue>({
  medications: [],
  logs: [],
  loaded: false,
  addMedication: async () => ({} as MedicationEntry),
  updateMedication: noop,
  removeMedication: noop,
  logDose: () => ({} as MedicationLog),
  removeLog: () => {},
  memberMedications: () => [],
  getMedicationLogs: () => [],
  getMedicationsForDate: () => [],
  getCalendarWeek: () => [],
  getAdherence: () => ({ taken: 0, missed: 0, skipped: 0, rate: 0 }),
  setNotificationsEnabled: noop,
});

// ─────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────

function isoDateOf(d: Date): string {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${da}`;
}

function todayIso(): string {
  return isoDateOf(new Date());
}

function startOfWeek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return isoDateOf(d);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDateOf(d);
}

// ─────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────

export function MedicationTrackerProvider({ children }: { children: React.ReactNode }) {
  const [medications, setMedications] = useState<SyncedMedication[]>([]);
  const [logs, setLogs] = useState<SyncedMedicationLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  const [authUid, setAuthUid] = useState<string | null>(getCurrentUid());
  // getCurrentUid() is null on cold start until Firebase restores the session,
  // so sample it live — otherwise the sync effect never runs for that launch.
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
  }, []);

  // Load persisted data
  useEffect(() => {
    (async () => {
      try {
        const [medsRaw, logsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(LOG_STORAGE_KEY),
        ]);
        setMedications(safeParseJSON<MedicationEntry[]>(medsRaw, [], Array.isArray));
        setLogs(safeParseJSON<MedicationLog[]>(logsRaw, [], Array.isArray));
        // Only arm the persist effects when the hydrate actually SUCCEEDED.
        setLoaded(true);
      } catch (err) {
        // Audit 2.0.5 P2 (hydrate-wipe): setting loaded=true here armed the
        // persist effects with EMPTY state — the next change overwrote the
        // stored meds/logs, permanently destroying local histories after one
        // transient storage read failure. Leave persists disabled for this
        // session instead: new writes won't persist until relaunch (rare,
        // recoverable) but existing history is never clobbered.
        console.warn('[MedicationTracker] load failed — persist disabled this session to protect stored data:', err);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => { if (loaded) safeStorageSet(STORAGE_KEY, medications, '[Medications]'); }, [medications, loaded]);
  useEffect(() => { if (loaded) safeStorageSet(LOG_STORAGE_KEY, logs, '[Medication logs]'); }, [logs, loaded]);

  // Ref mirror of medications so one-shot effects can read COMMITTED state.
  // Reading via an identity setState updater (`setX((prev) => { copy = prev;
  // return prev; })`) is unreliable — React only runs the updater eagerly when
  // the fiber has no pending update, so the copy can silently stay stale/empty
  // (same pitfall documented in GamificationContext).
  const medicationsRef = useRef<SyncedMedication[]>(medications);
  useEffect(() => { medicationsRef.current = medications; }, [medications]);
  const logsRef = useRef<SyncedMedicationLog[]>(logs);
  useEffect(() => { logsRef.current = logs; }, [logs]);

  // ── Firestore sync (durability) ──────────────────────────────────────
  // Medications + dose logs were AsyncStorage-only and died with the app. They
  // now live under /nutrition/{uid}/{medications,medicationLogs} (purge-free via
  // the existing step('nutrition')). Owner-only unless the member flips the
  // SENSITIVE sharing switch — see healthSync + the /nutrition rules.
  useEffect(() => {
    const memberId = user?.id;
    const uid = authUid;
    if (!loaded || !uid || !memberId) return;

    let cancelled = false;
    let unsubM: () => void = () => {};
    let unsubL: () => void = () => {};
    const mine = <T extends { memberId: string }>(rows: T[]) => rows.filter((r) => r.memberId === memberId);
    const markSynced = <T extends { id: string; synced?: boolean }>(ids: Set<string>) =>
      (rows: T[]) => (ids.size ? rows.map((r) => (ids.has(r.id) ? { ...r, synced: true } : r)) : rows);

    (async () => {
      try {
        const flagKey = `${MED_MIGRATED_KEY_PREFIX}${uid}`;
        const already = await AsyncStorage.getItem(flagKey);
        if (!already) {
          // Read from disk, not state: independent of hydrate timing. Idempotent
          // by existing id, so re-running per device can't duplicate.
          const [mRaw, lRaw] = await Promise.all([
            AsyncStorage.getItem(STORAGE_KEY),
            AsyncStorage.getItem(LOG_STORAGE_KEY),
          ]);
          const myMeds = mine(safeParseJSON<SyncedMedication[]>(mRaw, [], Array.isArray));
          const myLogs = mine(safeParseJSON<SyncedMedicationLog[]>(lRaw, [], Array.isArray));
          const [mIds, lIds] = await Promise.all([migrateMedications(uid, myMeds), migrateMedLogs(uid, myLogs)]);
          if (cancelled) return;
          setMedications(markSynced(mIds));
          setLogs(markSynced(lIds));
          // Count with the SAME predicate migrate uses, or one unsyncable row
          // makes the flag unreachable and re-migrates the batch every launch.
          if (mIds.size >= myMeds.filter(isSyncableMedication).length
            && lIds.size >= myLogs.filter(isSyncableMedLog).length) {
            await AsyncStorage.setItem(flagKey, '1');
          }
        }
      } catch { /* non-fatal — retries next launch */ }

      if (cancelled) return;
      try {
        // Snapshot what we upload BY REFERENCE so a row the member edits during
        // the flush keeps synced:false and stays queued — a blanket mark-by-id
        // would drop that edit from the queue and it would never upload.
        const medsToPush = mine(medicationsRef.current);
        const logsToPush = mine(logsRef.current);
        const medsSnap = snapshotForPush(medsToPush);
        const logsSnap = snapshotForPush(logsToPush);
        const [okM, okL] = await Promise.all([
          flushMedications(uid, medsToPush),
          flushMedLogs(uid, logsToPush),
        ]);
        if (cancelled) return;
        setMedications((prev) => markSyncedUnchanged(prev, okM, medsSnap));
        setLogs((prev) => markSyncedUnchanged(prev, okL, logsSnap));
      } catch { /* retried next launch */ }

      if (cancelled) return;
      // Schedule OS notifications for a med restored from the cloud, then store
      // the new device-local handles so cancel/reschedule keep working.
      const scheduleRestored = (m: SyncedMedication) => {
        scheduleMedicationNotifications(m)
          .then((ids) => {
            if (cancelled || !ids?.length) return;
            setMedications((prev) => prev.map((x) => (x.id === m.id ? { ...x, scheduledNotificationIds: ids } : x)));
          })
          .catch((err) => console.warn('[MedicationTracker] schedule on cloud-restore failed:', err));
      };

      unsubM = subscribeMedications(uid, (d) => {
        if (cancelled) return;
        if (d.upserts.length || d.removedIds.length) {
          setMedications((prev) => {
            const localById = new Map(prev.map((m) => [m.id, m]));
            // Re-attach THIS device's OS notification handles: they're stripped
            // before upload, so a server upsert carries none — adopting blindly
            // would orphan the scheduled notifications this device owns.
            const upserts = d.upserts.map((u) => ({
              ...u,
              memberId: u.memberId || memberId,
              scheduledNotificationIds: localById.get(u.id)?.scheduledNotificationIds ?? [],
            }));
            // A med restored from the cloud onto a fresh install arrives with NO
            // OS handles (they're device-local and stripped on upload). Without
            // scheduling here the UI would show reminders ON while no dose
            // reminder ever fires again — a silent failure on medication data.
            upserts.forEach((u) => {
              const hadLocal = localById.has(u.id);
              const hasHandles = (u.scheduledNotificationIds?.length ?? 0) > 0;
              if (!hadLocal && u.notificationsEnabled && !hasHandles) scheduleRestored(u);
            });
            return mergeSyncById(prev, upserts, d.removedIds);
          });
        }
        if (d.allIds) setMedications((prev) => reconcileDeletes(prev, d.allIds!, memberId));
      });
      unsubL = subscribeMedLogs(uid, (d) => {
        if (cancelled) return;
        if (d.upserts.length || d.removedIds.length) {
          setLogs((prev) => mergeSyncById(prev, d.upserts.map((l) => ({ ...l, memberId: l.memberId || memberId })), d.removedIds));
        }
        if (d.allIds) setLogs((prev) => reconcileDeletes(prev, d.allIds!, memberId));
      });
    })();

    return () => { cancelled = true; unsubM(); unsubL(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user?.id, authUid]);

  // One-time weekday-fix migration (see WEEKDAY_FIX_KEY)
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const done = await AsyncStorage.getItem(WEEKDAY_FIX_KEY);
        if (done) return;
        // `loaded` flips in the same batch that commits the hydrated meds, so
        // by the time this async body resumes the ref holds the real list.
        const targets = medicationsRef.current.filter(
          (m) => (m.frequency === 'weekly' || m.frequency === 'biweekly') &&
            m.notificationsEnabled &&
            (m.scheduledNotificationIds?.length ?? 0) > 0,
        );
        let allOk = true;
        for (const med of targets) {
          try {
            const newIds = await rescheduleMedicationNotifications(med);
            setMedications((prev) =>
              prev.map((m) => (m.id === med.id ? { ...m, scheduledNotificationIds: newIds } : m)),
            );
          } catch (err) {
            allOk = false;
            console.warn('[MedicationTracker] weekday-fix reschedule failed:', err);
          }
        }
        // Only burn the one-shot marker when every target actually
        // rescheduled — a partial failure retries on the next launch instead
        // of leaving wrong-weekday triggers in place forever.
        if (allOk) await AsyncStorage.setItem(WEEKDAY_FIX_KEY, '1');
      } catch (err) {
        console.warn('[MedicationTracker] weekday-fix migration failed:', err);
      }
    })();
  }, [loaded]);

  // ─────────────────────────────────────────────────
  // Mutations
  // ─────────────────────────────────────────────────

  const addMedication = useCallback(async (params: AddMedicationParams): Promise<MedicationEntry> => {
    const now = new Date().toISOString();
    const draft: MedicationEntry = {
      id: generateId('med'),
      memberId: params.memberId,
      name: params.name.trim(),
      brandName: params.brandName?.trim() || undefined,
      externalId: params.externalId,
      category: params.category,
      dose: params.dose.trim(),
      doseUnit: params.doseUnit.trim(),
      route: params.route,
      frequency: params.frequency,
      customDays: params.customDays,
      timesOfDay: [...params.timesOfDay].sort(),
      startDate: params.startDate,
      endDate: params.endDate,
      injectionSites: params.injectionSites,
      notes: params.notes?.trim() || undefined,
      notificationsEnabled: params.notificationsEnabled ?? true,
      scheduledNotificationIds: [],
      createdAt: now,
      updatedAt: now,
    };

    // Schedule notifications (no-op on web / when permission denied)
    let scheduledIds: string[] = [];
    try {
      scheduledIds = await scheduleMedicationNotifications(draft);
    } catch (err) {
      console.warn('[MedicationTracker] schedule on add failed:', err);
    }

    // synced:false BEFORE the write — an offline write hangs, so a process death
    // must leave the record queued for the launch flush.
    const final: SyncedMedication = { ...draft, scheduledNotificationIds: scheduledIds, synced: false };
    setMedications((prev) => [final, ...prev]);
    const uid = getCurrentUid();
    if (uid) pushMedication(uid, final)
      .then((ok) => { if (ok) setMedications((prev) => prev.map((m) => (m.id === final.id ? { ...m, synced: true } : m))); })
      .catch(() => {});
    return final;
  }, []);

  const updateMedication = useCallback(async (
    id: string,
    patch: Partial<Omit<MedicationEntry, 'id' | 'memberId' | 'createdAt'>>,
  ) => {
    // Read COMMITTED state from the ref. Reading via an identity setState
    // updater is unreliable — React only runs the updater eagerly when the fiber
    // has no pending update, so `current` could stay undefined and the edit be
    // dropped locally AND never pushed (this file's own comment documents the
    // pitfall; the previous code did exactly what it warned against).
    const current: SyncedMedication | undefined = medicationsRef.current.find((m) => m.id === id);
    if (!current) return;

    const merged: MedicationEntry = {
      ...current,
      ...patch,
      timesOfDay: patch.timesOfDay ? [...patch.timesOfDay].sort() : current.timesOfDay,
      updatedAt: new Date().toISOString(),
    };

    // If schedule-affecting fields changed, re-schedule
    const scheduleAffecting = (
      patch.timesOfDay !== undefined ||
      patch.frequency !== undefined ||
      patch.customDays !== undefined ||
      patch.notificationsEnabled !== undefined ||
      patch.startDate !== undefined ||
      patch.endDate !== undefined ||
      patch.dose !== undefined ||
      patch.doseUnit !== undefined ||
      patch.route !== undefined ||
      patch.name !== undefined
    );

    let newIds = merged.scheduledNotificationIds;
    if (scheduleAffecting) {
      try {
        newIds = await rescheduleMedicationNotifications(merged);
      } catch (err) {
        console.warn('[MedicationTracker] reschedule failed:', err);
      }
    }

    const next: SyncedMedication = { ...merged, scheduledNotificationIds: newIds, synced: false };
    setMedications((prev) => prev.map((m) => (m.id === id ? next : m)));
    const uid = getCurrentUid();
    if (uid) pushMedication(uid, next)
      .then((ok) => { if (ok) setMedications((prev) => prev.map((m) => (m.id === id ? { ...m, synced: true } : m))); })
      .catch(() => {});
  }, []);

  const removeMedication = useCallback(async (id: string) => {
    // Read the cancel target from the ref BEFORE mutating — the identity-updater
    // read could return undefined and orphan this med's OS notifications forever.
    const target: SyncedMedication | undefined = medicationsRef.current.find((m) => m.id === id);
    setMedications((prev) => prev.filter((m) => m.id !== id));
    // Capture the logs being cascaded so each can be deleted server-side too —
    // a local-only delete is resurrected by the listener on the next snapshot.
    const cascadedLogIds = logsRef.current.filter((l) => l.medicationId === id).map((l) => l.id);
    setLogs((prev) => prev.filter((l) => l.medicationId !== id));
    const uid = getCurrentUid();
    if (uid) {
      deleteMedication(uid, id).catch(() => {});
      cascadedLogIds.forEach((lid) => { deleteMedLog(uid, lid).catch(() => {}); });
    }
    if (target?.scheduledNotificationIds?.length) {
      try {
        await cancelMedicationNotifications(target.scheduledNotificationIds);
      } catch (err) {
        console.warn('[MedicationTracker] cancel on remove failed:', err);
      }
    }
  }, []);

  const setNotificationsEnabled = useCallback(async (medicationId: string, enabled: boolean) => {
    await updateMedication(medicationId, { notificationsEnabled: enabled });
  }, [updateMedication]);

  const logDose = useCallback((medicationId: string, params: LogDoseParams): MedicationLog => {
    const med = medicationsRef.current.find((m) => m.id === medicationId);
    const dose = params.dose ?? med?.dose ?? '';
    const log: SyncedMedicationLog = {
      id: generateId('mlog'),
      medicationId,
      memberId: params.memberId,
      takenAt: params.takenAt ?? new Date().toISOString(),
      scheduledFor: params.scheduledFor,
      dose,
      injectionSite: params.injectionSite,
      skipped: params.skipped ?? false,
      notes: params.notes,
      synced: false,
    };
    setLogs((prev) => [log, ...prev]);
    const uid = getCurrentUid();
    if (uid) pushMedLog(uid, log)
      .then((ok) => { if (ok) setLogs((prev) => prev.map((l) => (l.id === log.id ? { ...l, synced: true } : l))); })
      .catch(() => {});

    // Update lastInjectionSite on the medication if applicable. This MUST be
    // written through: without it the change is local-only, the next server
    // snapshot echoes the old value back over it, and injection-site rotation
    // silently resets to the first site forever.
    if (params.injectionSite && med) {
      const rotated: SyncedMedication = { ...med, lastInjectionSite: params.injectionSite, synced: false };
      setMedications((prev) => prev.map((m) => (m.id === medicationId ? rotated : m)));
      if (uid) pushMedication(uid, rotated)
        .then((ok) => { if (ok) setMedications((prev) => prev.map((m) => (m.id === medicationId ? { ...m, synced: true } : m))); })
        .catch(() => {});
    }

    return log;
  }, []);

  const removeLog = useCallback((logId: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    const uid = getCurrentUid();
    if (uid) deleteMedLog(uid, logId).catch(() => {});
  }, []);

  // ─────────────────────────────────────────────────
  // Selectors
  // ─────────────────────────────────────────────────

  const memberMedications = useCallback(
    (memberId: string) => medications.filter((m) => m.memberId === memberId),
    [medications],
  );

  const getMedicationLogs = useCallback(
    (medicationId: string, dateRange?: { start: string; end: string }) => {
      let out = logs.filter((l) => l.medicationId === medicationId);
      if (dateRange) {
        const start = new Date(dateRange.start).getTime();
        const end = new Date(dateRange.end).getTime();
        out = out.filter((l) => {
          const t = new Date(l.takenAt).getTime();
          return t >= start && t <= end;
        });
      }
      return out.sort((a, b) => b.takenAt.localeCompare(a.takenAt));
    },
    [logs],
  );

  const getMedicationsForDate = useCallback(
    (memberId: string, isoDate: string): DailyMedicationItem[] => {
      const dayStart = new Date(isoDate + 'T00:00:00').getTime();
      const dayEnd = dayStart + 86400000;

      return medications
        .filter((m) => m.memberId === memberId)
        .filter((m) => isMedicationScheduledForDate(m, isoDate))
        .map((medication) => {
          const dayLogs = logs.filter(
            (l) => l.medicationId === medication.id &&
              new Date(l.scheduledFor).getTime() >= dayStart &&
              new Date(l.scheduledFor).getTime() < dayEnd,
          );
          return {
            medication,
            times: medication.timesOfDay,
            logs: dayLogs,
          };
        });
    },
    [medications, logs],
  );

  const getCalendarWeek = useCallback(
    (memberId: string, weekStartIso: string): CalendarDay[] => {
      const start = startOfWeek(weekStartIso);
      const days: CalendarDay[] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        const meds = getMedicationsForDate(memberId, date);
        let totalDoses = 0;
        let takenDoses = 0;
        for (const item of meds) {
          totalDoses += item.times.length;
          // count logs that aren't skipped
          takenDoses += item.logs.filter((l) => !l.skipped).length;
        }
        const completionRate = totalDoses > 0 ? takenDoses / totalDoses : 0;
        days.push({ date, medications: meds, totalDoses, takenDoses, completionRate });
      }
      return days;
    },
    [getMedicationsForDate],
  );

  const getAdherence = useCallback(
    (medicationId: string, days: number = 30): AdherenceStats => {
      const med = medications.find((m) => m.id === medicationId);
      if (!med) return { taken: 0, missed: 0, skipped: 0, rate: 0 };

      const today = todayIso();
      const startCheck = addDays(today, -(days - 1));

      // Build scheduled slot list in [startCheck, today]
      const scheduledSlots: { date: string; time: string }[] = [];
      let cursor = startCheck;
      while (cursor <= today) {
        if (isMedicationScheduledForDate(med, cursor)) {
          for (const t of med.timesOfDay) {
            scheduledSlots.push({ date: cursor, time: t });
          }
        }
        cursor = addDays(cursor, 1);
      }

      let taken = 0;
      let skipped = 0;
      let missed = 0;
      const nowTs = Date.now();
      // Each log may be consumed by at most one slot, so a single real dose
      // can't satisfy two nearby slots (e.g. 08:00 & 08:15) and let the other
      // escape being counted as missed.
      const consumedLogIds = new Set<string>();

      // Match logs to slots
      for (const slot of scheduledSlots) {
        const slotIso = `${slot.date}T${slot.time}:00`;
        const slotTs = new Date(slotIso).getTime();
        // find a log within ±12h of the scheduled time for this slot's date
        const dayStart = new Date(slot.date + 'T00:00:00').getTime();
        const dayEnd = dayStart + 86400000;
        const log = logs.find(
          (l) => l.medicationId === medicationId &&
            !consumedLogIds.has(l.id) &&
            new Date(l.scheduledFor).getTime() >= dayStart &&
            new Date(l.scheduledFor).getTime() < dayEnd &&
            Math.abs(new Date(l.scheduledFor).getTime() - slotTs) < 12 * 3600 * 1000,
        );
        // Simpler match: any log whose scheduledFor day matches and time matches
        const exactLog = logs.find((l) =>
          l.medicationId === medicationId &&
          !consumedLogIds.has(l.id) &&
          l.scheduledFor.startsWith(slot.date) &&
          (l.scheduledFor.includes(`T${slot.time}`) ||
            Math.abs(new Date(l.scheduledFor).getTime() - slotTs) < 30 * 60 * 1000),
        );

        const matched = exactLog ?? log;
        if (matched) {
          consumedLogIds.add(matched.id);
          if (matched.skipped) skipped++;
          else taken++;
        } else if (slotTs < nowTs) {
          // No log left for this slot and it's in the past → missed.
          // (future slots are not counted as missed)
          missed++;
        }
      }

      const denom = taken + missed + skipped;
      const rate = denom > 0 ? taken / denom : 0;
      return { taken, missed, skipped, rate };
    },
    [medications, logs],
  );

  const value = useMemo<MedicationTrackerValue>(() => ({
    medications,
    logs,
    loaded,
    addMedication,
    updateMedication,
    removeMedication,
    logDose,
    removeLog,
    memberMedications,
    getMedicationLogs,
    getMedicationsForDate,
    getCalendarWeek,
    getAdherence,
    setNotificationsEnabled,
  }), [
    medications, logs, loaded,
    addMedication, updateMedication, removeMedication,
    logDose, removeLog,
    memberMedications, getMedicationLogs, getMedicationsForDate,
    getCalendarWeek, getAdherence, setNotificationsEnabled,
  ]);

  return (
    <MedicationTrackerContext.Provider value={value}>
      {children}
    </MedicationTrackerContext.Provider>
  );
}

export function useMedicationTracker() {
  return useContext(MedicationTrackerContext);
}
