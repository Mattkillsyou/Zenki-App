import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

const STORAGE_KEY = '@zenki_medications';
const LOG_STORAGE_KEY = '@zenki_medication_logs';

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
  const [medications, setMedications] = useState<MedicationEntry[]>([]);
  const [logs, setLogs] = useState<MedicationLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load persisted data
  useEffect(() => {
    (async () => {
      try {
        const [medsRaw, logsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(LOG_STORAGE_KEY),
        ]);
        if (medsRaw) {
          const parsed = JSON.parse(medsRaw);
          if (Array.isArray(parsed)) setMedications(parsed);
        }
        if (logsRaw) {
          const parsed = JSON.parse(logsRaw);
          if (Array.isArray(parsed)) setLogs(parsed);
        }
      } catch (err) {
        console.warn('[MedicationTracker] load failed:', err);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(medications)).catch(() => {});
  }, [medications, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs)).catch(() => {});
  }, [logs, loaded]);

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

    const final: MedicationEntry = { ...draft, scheduledNotificationIds: scheduledIds };
    setMedications((prev) => [final, ...prev]);
    return final;
  }, []);

  const updateMedication = useCallback(async (
    id: string,
    patch: Partial<Omit<MedicationEntry, 'id' | 'memberId' | 'createdAt'>>,
  ) => {
    // Read current state via setter to avoid stale closure
    let current: MedicationEntry | undefined;
    setMedications((prev) => {
      current = prev.find((m) => m.id === id);
      return prev;
    });
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

    setMedications((prev) =>
      prev.map((m) => (m.id === id ? { ...merged, scheduledNotificationIds: newIds } : m)),
    );
  }, []);

  const removeMedication = useCallback(async (id: string) => {
    let target: MedicationEntry | undefined;
    setMedications((prev) => {
      target = prev.find((m) => m.id === id);
      return prev.filter((m) => m.id !== id);
    });
    setLogs((prev) => prev.filter((l) => l.medicationId !== id));
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
    const med = medications.find((m) => m.id === medicationId);
    const dose = params.dose ?? med?.dose ?? '';
    const log: MedicationLog = {
      id: generateId('mlog'),
      medicationId,
      memberId: params.memberId,
      takenAt: params.takenAt ?? new Date().toISOString(),
      scheduledFor: params.scheduledFor,
      dose,
      injectionSite: params.injectionSite,
      skipped: params.skipped ?? false,
      notes: params.notes,
    };
    setLogs((prev) => [log, ...prev]);

    // Update lastInjectionSite on the medication if applicable
    if (params.injectionSite && med) {
      setMedications((prev) =>
        prev.map((m) =>
          m.id === medicationId ? { ...m, lastInjectionSite: params.injectionSite } : m,
        ),
      );
    }

    return log;
  }, [medications]);

  const removeLog = useCallback((logId: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== logId));
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

      // Match logs to slots
      for (const slot of scheduledSlots) {
        const slotIso = `${slot.date}T${slot.time}:00`;
        const slotTs = new Date(slotIso).getTime();
        // find a log within ±12h of the scheduled time for this slot's date
        const dayStart = new Date(slot.date + 'T00:00:00').getTime();
        const dayEnd = dayStart + 86400000;
        const log = logs.find(
          (l) => l.medicationId === medicationId &&
            new Date(l.scheduledFor).getTime() >= dayStart &&
            new Date(l.scheduledFor).getTime() < dayEnd &&
            l.scheduledFor.includes(`T${slot.time}`) === false
              ? Math.abs(new Date(l.scheduledFor).getTime() - slotTs) < 12 * 3600 * 1000
              : true,
        );
        // Simpler match: any log whose scheduledFor day matches and time matches
        const exactLog = logs.find((l) =>
          l.medicationId === medicationId &&
          l.scheduledFor.startsWith(slot.date) &&
          (l.scheduledFor.includes(`T${slot.time}`) ||
            Math.abs(new Date(l.scheduledFor).getTime() - slotTs) < 30 * 60 * 1000),
        );

        const matched = exactLog ?? log;
        if (matched) {
          if (matched.skipped) skipped++;
          else taken++;
        }
      }

      // Slots with no matching log AND in the past = missed
      const nowTs = Date.now();
      let missed = 0;
      for (const slot of scheduledSlots) {
        const slotIso = `${slot.date}T${slot.time}:00`;
        const slotTs = new Date(slotIso).getTime();
        if (slotTs >= nowTs) continue; // future — don't count as missed
        const exactLog = logs.find((l) =>
          l.medicationId === medicationId &&
          l.scheduledFor.startsWith(slot.date) &&
          (l.scheduledFor.includes(`T${slot.time}`) ||
            Math.abs(new Date(l.scheduledFor).getTime() - slotTs) < 30 * 60 * 1000),
        );
        if (!exactLog) missed++;
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
