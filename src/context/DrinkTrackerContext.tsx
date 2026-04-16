import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrinkEntry, DrinkType, DrinkTrackerState, MonthlySummary } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { pushDrinkEntry } from '../services/drinkSheets';

const STORAGE_KEY = '@zenki_drink_tracker';
const EMPTY_COUNTS: Record<DrinkType, number> = { water: 0, protein: 0, electrolytes: 0, bcaa: 0, coffee: 0, energy: 0 };

interface DrinkTrackerContextValue {
  entries: DrinkEntry[];
  todayEntries: DrinkEntry[];
  todayCounts: Record<DrinkType, number>;
  todayTotal: number;
  addDrink: (type: DrinkType) => void;
  removeDrink: (id: string) => void;
  getMonthlySummary: (month?: string) => MonthlySummary;
  getAllMonths: () => MonthlySummary[];
}

const DrinkTrackerContext = createContext<DrinkTrackerContextValue>({
  entries: [],
  todayEntries: [],
  todayCounts: { ...EMPTY_COUNTS },
  todayTotal: 0,
  addDrink: () => {},
  removeDrink: () => {},
  getMonthlySummary: () => ({ month: '', label: '', counts: { ...EMPTY_COUNTS }, charges: { ...EMPTY_COUNTS }, totalCount: 0, totalCharge: 0, dailyEntries: 0 }),
  getAllMonths: () => [],
});

export function DrinkTrackerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DrinkTrackerState>({ entries: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setState(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, loaded]);

  const addDrink = useCallback((type: DrinkType) => {
    const def = DRINK_DEFINITIONS.find((d) => d.type === type);
    if (!def) return;
    const now = new Date();
    const entry: DrinkEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      price: def.price,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
    };
    setState((prev) => ({ entries: [...prev.entries, entry] }));
    // Sync to Google Sheets
    pushDrinkEntry(entry, 'Member');
  }, []);

  const removeDrink = useCallback((id: string) => {
    setState((prev) => ({ entries: prev.entries.filter((e) => e.id !== id) }));
  }, []);

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
    <DrinkTrackerContext.Provider value={{ entries: state.entries, todayEntries, todayCounts, todayTotal, addDrink, removeDrink, getMonthlySummary, getAllMonths }}>
      {children}
    </DrinkTrackerContext.Provider>
  );
}

export function useDrinkTracker() {
  return useContext(DrinkTrackerContext);
}
