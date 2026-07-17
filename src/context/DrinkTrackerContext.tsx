import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import { todayDateString } from '../utils/dates';
import { DrinkEntry, DrinkType, DrinkTrackerState, MonthlySummary, PendingDrink } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { generateId } from '../utils/generateId';
import { pushDrinkEntry, markDrinksPaid } from '../services/drinkSheets';
import { useAuth } from './AuthContext';
import { getCurrentUid } from '../services/firebaseAuth';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { mergeById as mergeSyncById, markSyncedUnchanged, snapshotForPush } from '../services/syncCore';
import {
  pushDrink, deleteDrink, flushDrinks, migrateDrinks, subscribeDrinks, isSyncableDrink,
  type SyncedDrinkEntry,
} from '../services/billingSync';

// Per-uid run-once guard for the AsyncStorage -> Firestore drink-tab migration.
const DRINK_MIGRATED_KEY_PREFIX = '@zenki_drink_migrated_v1:';
// Durable tombstone of deleted charge ids. deleteRecord is an UN-queued deleteDoc
// that hangs offline and dies with the process, so a removed charge would
// resurrect from the next server snapshot and re-bill the member. Deleted ids
// are persisted here, re-issued on launch, and filter incoming upserts until the
// server delete confirms.
const DRINK_DELETED_KEY = '@zenki_drink_deleted_v1';

const STORAGE_KEY = '@zenki_drink_tracker';
const EMPTY_COUNTS: Record<DrinkType, number> = { water: 0, protein: 0, electrolytes: 0, bcaa: 0, coffee: 0, energy: 0, kombucha: 0, juice: 0, tea: 0 };

interface DrinkTrackerContextValue {
  entries: DrinkEntry[];
  todayEntries: DrinkEntry[];
  todayCounts: Record<DrinkType, number>;
  todayTotal: number;
  unpaidEntries: DrinkEntry[];
  unpaidTotal: number;

  // Pending cart (editable, not yet committed)
  pending: PendingDrink[];
  pendingCounts: Record<DrinkType, number>;
  pendingTotal: number;
  addToPending: (type: DrinkType) => void;
  removeFromPending: (type: DrinkType) => void;
  setPendingCount: (type: DrinkType, count: number) => void;
  clearPending: () => void;
  commitPending: (memberName?: string) => void;

  // Charge management
  removeDrink: (id: string) => void;
  payAllUnpaid: (memberName?: string) => Promise<void>;

  getMonthlySummary: (month?: string) => MonthlySummary;
  getAllMonths: () => MonthlySummary[];
}

const DrinkTrackerContext = createContext<DrinkTrackerContextValue>({
  entries: [],
  todayEntries: [],
  todayCounts: { ...EMPTY_COUNTS },
  todayTotal: 0,
  unpaidEntries: [],
  unpaidTotal: 0,
  pending: [],
  pendingCounts: { ...EMPTY_COUNTS },
  pendingTotal: 0,
  addToPending: () => {},
  removeFromPending: () => {},
  setPendingCount: () => {},
  clearPending: () => {},
  commitPending: () => {},
  removeDrink: () => {},
  payAllUnpaid: async () => {},
  getMonthlySummary: () => ({ month: '', label: '', counts: { ...EMPTY_COUNTS }, charges: { ...EMPTY_COUNTS }, totalCount: 0, totalCharge: 0, dailyEntries: 0 }),
  getAllMonths: () => [],
});

export function DrinkTrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrinkTrackerState>({ entries: [], pending: [] });
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  const [authUid, setAuthUid] = useState<string | null>(getCurrentUid());
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
  }, []);
  const entriesRef = useRef<SyncedDrinkEntry[]>([]);
  entriesRef.current = state.entries as SyncedDrinkEntry[];
  const deletedRef = useRef<Set<string>>(new Set());

  // Account switch on a shared device: drop the previous member's charges from
  // the view (their tab lives in their cloud /drinkTabs/{uid} and restores on
  // their next sign-in). Guarded so the initial null->uid sign-in never wipes
  // freshly-hydrated local charges before they migrate.
  const prevUidRef = useRef<string | null>(authUid);
  useEffect(() => {
    if (prevUidRef.current !== null && prevUidRef.current !== authUid) {
      setState((prev) => ({ ...prev, entries: [], pending: [] }));
      deletedRef.current = new Set();
    }
    prevUidRef.current = authUid;
  }, [authUid]);
  const persistDeleted = useCallback(() => {
    AsyncStorage.setItem(DRINK_DELETED_KEY, JSON.stringify([...deletedRef.current].slice(-1000))).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRINK_DELETED_KEY).then((raw) => {
      const ids = safeParseJSON<string[]>(raw, [], Array.isArray);
      deletedRef.current = new Set(ids);
    }).catch(() => {});
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      const parsed = safeParseJSON<{ entries?: any[]; pending?: any[] }>(raw, {}, (v) =>
        typeof v === 'object' && v !== null && !Array.isArray(v),
      );
      if (parsed.entries || parsed.pending) {
        setState({
          entries: (parsed.entries || []).map((e: any) => ({ ...e, paid: e.paid ?? false })),
          pending: parsed.pending || [],
        });
      }
      setLoaded(true);
    });
    // No .catch → a rejected read leaves loaded false, so the persist effect and
    // the sync migration below never arm with empty state (fails closed).
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  // Mark a set of entry ids synced after a confirmed write.
  const markEntriesSynced = useCallback((ids: Set<string>) => {
    if (!ids.size) return;
    setState((prev) => ({ ...prev, entries: prev.entries.map((e) => (ids.has(e.id) ? { ...e, synced: true } : e)) }));
  }, []);

  // Mark ONE pushed entry synced only if the in-state row still matches what we
  // sent (ignoring the synced flag). A concurrent edit (e.g. pay tapped while the
  // commit push is in flight) is a newer version and must stay queued, or the
  // paid flip would be marked synced and lost — server=unpaid, local=paid.
  const confirmPushed = useCallback((pushed: SyncedDrinkEntry) => {
    setState((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => {
        if (e.id !== pushed.id) return e;
        const { synced: _a, ...cur } = e;
        const { synced: _b, ...sent } = pushed;
        return JSON.stringify(cur) === JSON.stringify(sent) ? { ...e, synced: true } : e;
      }),
    }));
  }, []);

  // ── Firestore sync (durability) ──────────────────────────────────────
  // Drink-tab charges (money OWED to the dojo) were AsyncStorage-only and died
  // with the app. Now at /drinkTabs/{uid}/entries. The `pending` cart is a local
  // UI draft and is deliberately NOT synced.
  useEffect(() => {
    const uid = authUid;
    if (!loaded || !uid) return;

    let cancelled = false;
    let unsub: () => void = () => {};
    // Only ever touch charges rung up under THIS uid (or legacy rows with no
    // owner, treated as the signed-in user's — the device-local migration
    // assumption). A charge stamped to a DIFFERENT uid on a shared device is
    // never uploaded to this member's tab. (See DrinkEntry.ownerUid.)
    const isMine = (e: SyncedDrinkEntry) => (e.ownerUid ?? uid) === uid;
    // Reconcile deletes only among this uid's synced rows.
    const reconcileDrinks = (local: SyncedDrinkEntry[], serverIds: string[]) => {
      const server = new Set(serverIds);
      return local.filter((e) => !isMine(e) || !e.synced || server.has(e.id));
    };

    (async () => {
      // Re-issue any delete that never reached the server (durable tombstone).
      for (const id of deletedRef.current) { deleteDrink(uid, id).catch(() => {}); }

      try {
        const flagKey = `${DRINK_MIGRATED_KEY_PREFIX}${uid}`;
        const already = await AsyncStorage.getItem(flagKey);
        if (!already) {
          const rows = entriesRef.current.filter(isMine);
          const ids = await migrateDrinks(uid, rows);
          if (cancelled) return;
          markEntriesSynced(ids);
          if (ids.size >= rows.filter(isSyncableDrink).length) await AsyncStorage.setItem(flagKey, '1');
        }
      } catch { /* non-fatal — retries next launch */ }

      if (cancelled) return;
      try {
        const toPush = entriesRef.current.filter(isMine);
        const snap = snapshotForPush(toPush);
        const ok = await flushDrinks(uid, toPush);
        if (!cancelled) setState((prev) => ({ ...prev, entries: markSyncedUnchanged(prev.entries as SyncedDrinkEntry[], ok, snap) }));
      } catch { /* retried next launch */ }

      if (cancelled) return;
      unsub = subscribeDrinks(uid, (d) => {
        if (cancelled) return;
        // Drop resurrections of tombstoned charges and re-issue their delete.
        const upserts = d.upserts.filter((u) => {
          if (deletedRef.current.has(u.id)) { deleteDrink(uid, u.id).catch(() => {}); return false; }
          return true;
        });
        if (upserts.length || d.removedIds.length) {
          setState((prev) => ({ ...prev, entries: mergeSyncById(prev.entries as SyncedDrinkEntry[], upserts, d.removedIds) }));
        }
        if (d.allIds) setState((prev) => ({ ...prev, entries: reconcileDrinks(prev.entries as SyncedDrinkEntry[], d.allIds!) }));
      });
    })();

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, authUid]);

  // ── Pending cart actions ──
  const addToPending = useCallback((type: DrinkType) => {
    setState((prev) => {
      const existing = prev.pending.find((p) => p.type === type);
      const next = existing
        ? prev.pending.map((p) => (p.type === type ? { ...p, count: p.count + 1 } : p))
        : [...prev.pending, { type, count: 1 }];
      return { ...prev, pending: next };
    });
  }, []);

  const removeFromPending = useCallback((type: DrinkType) => {
    setState((prev) => ({
      ...prev,
      pending: prev.pending
        .map((p) => (p.type === type ? { ...p, count: p.count - 1 } : p))
        .filter((p) => p.count > 0),
    }));
  }, []);

  const setPendingCount = useCallback((type: DrinkType, count: number) => {
    setState((prev) => {
      if (count <= 0) {
        return { ...prev, pending: prev.pending.filter((p) => p.type !== type) };
      }
      const existing = prev.pending.find((p) => p.type === type);
      const next = existing
        ? prev.pending.map((p) => (p.type === type ? { ...p, count } : p))
        : [...prev.pending, { type, count }];
      return { ...prev, pending: next };
    });
  }, []);

  const clearPending = useCallback(() => {
    setState((prev) => ({ ...prev, pending: [] }));
  }, []);

  // ── Commit pending → unpaid charges ──
  const commitPending = useCallback((memberName: string = 'Member') => {
    // Capture the committed entries outside the updater so the network sync
    // fires exactly once per commit. The updater itself must stay pure —
    // React may invoke it more than once for a single logical update.
    const uid = getCurrentUid();
    let committed: SyncedDrinkEntry[] = [];
    setState((prev) => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const newEntries: DrinkEntry[] = [];
      prev.pending.forEach((p) => {
        const def = DRINK_DEFINITIONS.find((d) => d.type === p.type);
        if (!def) return;
        for (let i = 0; i < p.count; i++) {
          const entry: SyncedDrinkEntry = {
            id: generateId('drink'),
            type: p.type,
            price: def.price,
            timestamp: now.toISOString(),
            date,
            paid: false,
            synced: false, // queue marker set BEFORE the write
            ownerUid: uid ?? undefined, // attribute the charge to who rang it up
          };
          newEntries.push(entry);
        }
      });
      committed = newEntries;
      return { entries: [...prev.entries, ...newEntries], pending: [] };
    });
    // Sync each charge to Sheets AND to Firestore — after setState, exactly once.
    committed.forEach((entry) => {
      pushDrinkEntry(entry, memberName);
      if (uid) pushDrink(uid, entry).then((ok) => { if (ok) confirmPushed(entry); }).catch(() => {});
    });
  }, [confirmPushed]);

  // ── Charge management ──
  const removeDrink = useCallback((id: string) => {
    setState((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
    // Tombstone the id BEFORE the (un-queued) delete so a delete lost to offline
    // + process death is re-issued on next launch and the charge can't resurrect
    // and re-bill the member.
    deletedRef.current.add(id);
    persistDeleted();
    const uid = getCurrentUid();
    if (uid) deleteDrink(uid, id).catch(() => {});
  }, [persistDeleted]);

  const payAllUnpaid = useCallback(async (memberName: string = 'Member') => {
    const paidAt = new Date().toISOString();
    let paidIds: string[] = [];
    let paidEntries: SyncedDrinkEntry[] = [];
    setState((prev) => {
      const updated = prev.entries.map((e) => {
        if (!e.paid) {
          paidIds.push(e.id);
          const next = { ...e, paid: true, paidAt, synced: false as boolean };
          paidEntries.push(next);
          return next;
        }
        return e;
      });
      return { ...prev, entries: updated };
    });
    // Sync paid status to sheets AND Firestore.
    if (paidIds.length > 0) {
      markDrinksPaid(paidIds, memberName, paidAt);
      const uid = getCurrentUid();
      if (uid) paidEntries.forEach((entry) => {
        pushDrink(uid, entry).then((ok) => { if (ok) confirmPushed(entry); }).catch(() => {});
      });
    }
  }, [confirmPushed]);

  // ── Derived state ──
  const today = todayDateString();

  const todayEntries = useMemo(
    () => state.entries.filter((e) => e.date === today),
    [state.entries, today],
  );

  const todayCounts = useMemo(() => {
    const counts = { ...EMPTY_COUNTS };
    todayEntries.forEach((e) => { counts[e.type]++; });
    return counts;
  }, [todayEntries]);

  const todayTotal = useMemo(
    () => todayEntries.reduce((sum, e) => sum + e.price, 0),
    [todayEntries],
  );

  const unpaidEntries = useMemo(
    () => state.entries.filter((e) => !e.paid),
    [state.entries],
  );

  const unpaidTotal = useMemo(
    () => unpaidEntries.reduce((sum, e) => sum + e.price, 0),
    [unpaidEntries],
  );

  const pendingCounts = useMemo(() => {
    const counts = { ...EMPTY_COUNTS };
    state.pending.forEach((p) => { counts[p.type] = p.count; });
    return counts;
  }, [state.pending]);

  const pendingTotal = useMemo(() => {
    return state.pending.reduce((sum, p) => {
      const def = DRINK_DEFINITIONS.find((d) => d.type === p.type);
      return sum + (def ? def.price * p.count : 0);
    }, 0);
  }, [state.pending]);

  const getMonthlySummary = useCallback((month?: string): MonthlySummary => {
    const targetMonth = month || new Date().toISOString().slice(0, 7);
    const monthEntries = state.entries.filter((e) => e.date.startsWith(targetMonth));
    const counts = { ...EMPTY_COUNTS };
    const charges = { ...EMPTY_COUNTS };
    const uniqueDays = new Set<string>();
    let totalCharge = 0;
    monthEntries.forEach((e) => {
      counts[e.type]++;
      charges[e.type] += e.price;
      totalCharge += e.price;
      uniqueDays.add(e.date);
    });
    const [year, mon] = targetMonth.split('-');
    const date = new Date(parseInt(year), parseInt(mon) - 1);
    const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return {
      month: targetMonth,
      label,
      counts,
      charges,
      totalCount: monthEntries.length,
      totalCharge: Math.round(totalCharge * 100) / 100,
      dailyEntries: uniqueDays.size,
    };
  }, [state.entries]);

  const getAllMonths = useCallback((): MonthlySummary[] => {
    const months = new Set<string>();
    state.entries.forEach((e) => months.add(e.date.slice(0, 7)));
    months.add(new Date().toISOString().slice(0, 7));
    return Array.from(months).sort().reverse().map((m) => getMonthlySummary(m));
  }, [state.entries, getMonthlySummary]);

  return (
    <DrinkTrackerContext.Provider
      value={{
        entries: state.entries,
        todayEntries, todayCounts, todayTotal,
        unpaidEntries, unpaidTotal,
        pending: state.pending, pendingCounts, pendingTotal,
        addToPending, removeFromPending, setPendingCount, clearPending, commitPending,
        removeDrink, payAllUnpaid,
        getMonthlySummary, getAllMonths,
      }}
    >
      {children}
    </DrinkTrackerContext.Provider>
  );
}

export function useDrinkTracker() {
  return useContext(DrinkTrackerContext);
}
