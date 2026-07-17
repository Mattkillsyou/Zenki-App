import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import { PeriodEntry, CycleInfo, CycleSymptom, FlowIntensity, computeCycleInfo } from '../types/cycle';
import { generateId } from '../utils/generateId';
import { useAuth } from './AuthContext';
import { getCurrentUid } from '../services/firebaseAuth';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { mergeById as mergeSyncById, reconcileDeletes, markSyncedUnchanged, snapshotForPush } from '../services/syncCore';
import {
  pushCycleEntry, deleteCycleEntry, flushCycleEntries, migrateCycleEntries,
  subscribeCycleEntries, isSyncableCycleEntry, type SyncedPeriodEntry,
} from '../services/healthSync';

const STORAGE_KEY = '@zenki_cycle_entries';
// showOnDashboard is a UI preference — losing it on reinstall is a non-event (it
// re-defaults), so it stays device-local rather than becoming Firestore noise.
const SETTINGS_KEY = '@zenki_cycle_settings';
// Per-uid run-once guard for the AsyncStorage -> Firestore cycle migration.
const CYCLE_MIGRATED_KEY_PREFIX = '@zenki_cycle_migrated_v1:';

interface CycleSettings {
  /** Show cycle phase indicator on dashboard */
  showOnDashboard: boolean;
}

interface CycleTrackerContextValue {
  entries: PeriodEntry[];
  cycleInfo: CycleInfo | null;
  settings: CycleSettings;

  /** Log a new period start */
  logPeriodStart: (params: {
    memberId: string;
    startDate: string;
    flowIntensity: FlowIntensity;
    symptoms: CycleSymptom[];
    notes?: string;
  }) => PeriodEntry;

  /** Mark the end of the current period */
  logPeriodEnd: (entryId: string, endDate: string) => void;

  /** Update an existing entry */
  updateEntry: (entryId: string, patch: Partial<Pick<PeriodEntry, 'flowIntensity' | 'symptoms' | 'notes' | 'endDate'>>) => void;

  /** Delete an entry */
  removeEntry: (entryId: string) => void;

  /** Get entries for a specific member */
  memberEntries: (memberId: string) => PeriodEntry[];

  /** Get cycle info for a specific member */
  memberCycleInfo: (memberId: string) => CycleInfo | null;

  /** Toggle dashboard visibility */
  setShowOnDashboard: (show: boolean) => void;
}

const CycleTrackerContext = createContext<CycleTrackerContextValue>({
  entries: [],
  cycleInfo: null,
  settings: { showOnDashboard: true },
  logPeriodStart: () => ({} as PeriodEntry),
  logPeriodEnd: () => {},
  updateEntry: () => {},
  removeEntry: () => {},
  memberEntries: () => [],
  memberCycleInfo: () => null,
  setShowOnDashboard: () => {},
});

export function CycleTrackerProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<SyncedPeriodEntry[]>([]);
  const [settings, setSettings] = useState<CycleSettings>({ showOnDashboard: true });
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  const [authUid, setAuthUid] = useState<string | null>(getCurrentUid());
  // Sample the uid live: getCurrentUid() is null on cold start until Firebase
  // restores the session, which would skip the sync effect for that whole launch.
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
  }, []);
  const entriesRef = useRef<SyncedPeriodEntry[]>(entries);
  useEffect(() => { entriesRef.current = entries; }, [entries]);

  // Load persisted data
  useEffect(() => {
    (async () => {
      try {
        const [entriesRaw, settingsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        setEntries(safeParseJSON<SyncedPeriodEntry[]>(entriesRaw, [], Array.isArray));
        setSettings(safeParseJSON<CycleSettings>(settingsRaw, { showOnDashboard: true }));
        // Only arm the persist effects when the hydrate actually SUCCEEDED.
        setLoaded(true);
      } catch (err) {
        // Audit 2.0.5 P2 (hydrate-wipe): setting loaded=true here armed the
        // persist effects with EMPTY state — the next change overwrote the
        // stored period history, permanently destroying it after one transient
        // storage read failure. Leave persists disabled for this session
        // instead: new writes won't persist until relaunch (rare, recoverable)
        // but existing history is never clobbered.
        console.warn('[Cycle] cold-boot hydrate failed — persist disabled this session to protect stored data:', err);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => { if (loaded) safeStorageSet(STORAGE_KEY, entries, '[Cycle entries]'); }, [entries, loaded]);
  useEffect(() => { if (loaded) safeStorageSet(SETTINGS_KEY, settings, '[Cycle settings]'); }, [settings, loaded]);

  // ── Firestore sync (durability) ──────────────────────────────────────
  // Period history was AsyncStorage-only and died with the app. Now at
  // /nutrition/{uid}/cycleEntries (purge-free via the existing step('nutrition')).
  // Owner-only unless the member flips the SENSITIVE sharing switch.
  useEffect(() => {
    const memberId = user?.id;
    const uid = authUid;
    if (!loaded || !uid || !memberId) return;

    let cancelled = false;
    let unsub: () => void = () => {};
    const mine = (rows: SyncedPeriodEntry[]) => rows.filter((r) => r.memberId === memberId);
    const markSynced = (ids: Set<string>) => (rows: SyncedPeriodEntry[]) =>
      (ids.size ? rows.map((r) => (ids.has(r.id) ? { ...r, synced: true } : r)) : rows);

    (async () => {
      try {
        const flagKey = `${CYCLE_MIGRATED_KEY_PREFIX}${uid}`;
        const already = await AsyncStorage.getItem(flagKey);
        if (!already) {
          // From disk, not state: independent of hydrate timing; idempotent by id.
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          const myEntries = mine(safeParseJSON<SyncedPeriodEntry[]>(raw, [], Array.isArray));
          const ids = await migrateCycleEntries(uid, myEntries);
          if (cancelled) return;
          setEntries(markSynced(ids));
          // Count with the SAME predicate migrate uses, or one unsyncable row
          // pins the flag off forever and re-migrates every launch.
          if (ids.size >= myEntries.filter(isSyncableCycleEntry).length) {
            await AsyncStorage.setItem(flagKey, '1');
          }
        }
      } catch { /* non-fatal — retries next launch */ }

      if (cancelled) return;
      try {
        // By-reference snapshot: an entry edited during the flush must stay
        // queued rather than be marked synced and dropped from the queue.
        const toPush = mine(entriesRef.current);
        const snap = snapshotForPush(toPush);
        const ok = await flushCycleEntries(uid, toPush);
        if (!cancelled) setEntries((prev) => markSyncedUnchanged(prev, ok, snap));
      } catch { /* retried next launch */ }

      if (cancelled) return;
      unsub = subscribeCycleEntries(uid, (d) => {
        if (cancelled) return;
        if (d.upserts.length || d.removedIds.length) {
          setEntries((prev) => mergeSyncById(prev, d.upserts.map((e) => ({ ...e, memberId: e.memberId || memberId })), d.removedIds));
        }
        if (d.allIds) setEntries((prev) => reconcileDeletes(prev, d.allIds!, memberId));
      });
    })();

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user?.id, authUid]);

  // Write-through: push the record, mark it synced only on server confirmation.
  const pushEntry = useCallback((entry: SyncedPeriodEntry) => {
    const uid = getCurrentUid();
    if (!uid) return;
    pushCycleEntry(uid, entry)
      .then((ok) => { if (ok) setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, synced: true } : e))); })
      .catch(() => {});
  }, []);

  const logPeriodStart = useCallback((params: {
    memberId: string;
    startDate: string;
    flowIntensity: FlowIntensity;
    symptoms: CycleSymptom[];
    notes?: string;
  }): PeriodEntry => {
    // synced:false BEFORE the write — an offline write hangs, so a process death
    // must leave the entry queued for the launch flush.
    const entry: SyncedPeriodEntry = {
      id: generateId('period'),
      memberId: params.memberId,
      startDate: params.startDate,
      flowIntensity: params.flowIntensity,
      symptoms: params.symptoms,
      notes: params.notes,
      createdAt: new Date().toISOString(),
      synced: false,
    };
    setEntries((prev) => [entry, ...prev]);
    pushEntry(entry);
    return entry;
  }, [pushEntry]);

  const logPeriodEnd = useCallback((entryId: string, endDate: string) => {
    // Compute from the COMMITTED ref. Assigning inside a setState updater and
    // reading it on the next line is unreliable — React skips the eager pass
    // whenever the fiber already has a pending update, so the push would be
    // silently skipped (the pitfall this codebase documents elsewhere).
    const current = entriesRef.current.find((e) => e.id === entryId);
    if (!current) return;
    const next: SyncedPeriodEntry = { ...current, endDate, synced: false };
    setEntries((prev) => prev.map((e) => (e.id === entryId ? next : e)));
    pushEntry(next);
  }, [pushEntry]);

  const updateEntry = useCallback((entryId: string, patch: Partial<Pick<PeriodEntry, 'flowIntensity' | 'symptoms' | 'notes' | 'endDate'>>) => {
    // See logPeriodEnd — read committed state from the ref, never from inside
    // an updater.
    const current = entriesRef.current.find((e) => e.id === entryId);
    if (!current) return;
    const next: SyncedPeriodEntry = { ...current, ...patch, synced: false };
    setEntries((prev) => prev.map((e) => (e.id === entryId ? next : e)));
    pushEntry(next);
  }, [pushEntry]);

  const removeEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    // Server delete too, or the listener resurrects it on the next snapshot.
    const uid = getCurrentUid();
    if (uid) deleteCycleEntry(uid, entryId).catch(() => {});
  }, []);

  const memberEntries = useCallback(
    (memberId: string) => entries.filter((e) => e.memberId === memberId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [entries],
  );

  const memberCycleInfo = useCallback(
    (memberId: string) => computeCycleInfo(entries.filter((e) => e.memberId === memberId)),
    [entries],
  );

  // Global cycle info (convenience — uses all entries, should be filtered by member in practice)
  const cycleInfo = useMemo(() => computeCycleInfo(entries), [entries]);

  const setShowOnDashboard = useCallback((show: boolean) => {
    setSettings((prev) => ({ ...prev, showOnDashboard: show }));
  }, []);

  return (
    <CycleTrackerContext.Provider
      value={{
        entries,
        cycleInfo,
        settings,
        logPeriodStart,
        logPeriodEnd,
        updateEntry,
        removeEntry,
        memberEntries,
        memberCycleInfo,
        setShowOnDashboard,
      }}
    >
      {children}
    </CycleTrackerContext.Provider>
  );
}

export function useCycleTracker() {
  return useContext(CycleTrackerContext);
}
