import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrinkEntry, DrinkType, DrinkTrackerState, MonthlySummary, PendingDrink } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { generateId } from '../utils/generateId';
import { pushDrinkEntry, markDrinksPaid } from '../services/drinkSheets';

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

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          // Backfill paid status + pending array for older saves
          setState({
            entries: (parsed.entries || []).map((e: any) => ({ ...e, paid: e.paid ?? false })),
            pending: parsed.pending || [],
          });
        } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

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
    setState((prev) => {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const newEntries: DrinkEntry[] = [];
      prev.pending.forEach((p) => {
        const def = DRINK_DEFINITIONS.find((d) => d.type === p.type);
        if (!def) return;
        for (let i = 0; i < p.count; i++) {
          const entry: DrinkEntry = {
            id: generateId('drink'),
            type: p.type,
            price: def.price,
            timestamp: now.toISOString(),
            date,
            paid: false,
          };
          newEntries.push(entry);
          // Sync each charge to Sheets as unpaid
          pushDrinkEntry(entry, memberName);
        }
      });
      return { entries: [...prev.entries, ...newEntries], pending: [] };
    });
  }, []);

  // ── Charge management ──
  const removeDrink = useCallback((id: string) => {
    setState((prev) => ({ ...prev, entries: prev.entries.filter((e) => e.id !== id) }));
  }, []);

  const payAllUnpaid = useCallback(async (memberName: string = 'Member') => {
    const paidAt = new Date().toISOString();
    let paidIds: string[] = [];
    setState((prev) => {
      const updated = prev.entries.map((e) => {
        if (!e.paid) {
          paidIds.push(e.id);
          return { ...e, paid: true, paidAt };
        }
        return e;
      });
      return { ...prev, entries: updated };
    });
    // Sync paid status to sheets (fire-and-forget)
    if (paidIds.length > 0) {
      markDrinksPaid(paidIds, memberName, paidAt);
    }
  }, []);

  // ── Derived state ──
  const today = new Date().toISOString().split('T')[0];

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
