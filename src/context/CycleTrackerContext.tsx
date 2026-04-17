import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PeriodEntry, CycleInfo, CycleSymptom, FlowIntensity, computeCycleInfo } from '../types/cycle';
import { generateId } from '../utils/generateId';

const STORAGE_KEY = '@zenki_cycle_entries';
const SETTINGS_KEY = '@zenki_cycle_settings';

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
  const [entries, setEntries] = useState<PeriodEntry[]>([]);
  const [settings, setSettings] = useState<CycleSettings>({ showOnDashboard: true });
  const [loaded, setLoaded] = useState(false);

  // Load persisted data
  useEffect(() => {
    (async () => {
      try {
        const [entriesRaw, settingsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SETTINGS_KEY),
        ]);
        if (entriesRaw) setEntries(JSON.parse(entriesRaw));
        if (settingsRaw) setSettings(JSON.parse(settingsRaw));
      } catch {} finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries)).catch(() => {});
  }, [entries, loaded]);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings, loaded]);

  const logPeriodStart = useCallback((params: {
    memberId: string;
    startDate: string;
    flowIntensity: FlowIntensity;
    symptoms: CycleSymptom[];
    notes?: string;
  }): PeriodEntry => {
    const entry: PeriodEntry = {
      id: generateId('period'),
      memberId: params.memberId,
      startDate: params.startDate,
      flowIntensity: params.flowIntensity,
      symptoms: params.symptoms,
      notes: params.notes,
      createdAt: new Date().toISOString(),
    };
    setEntries((prev) => [entry, ...prev]);
    return entry;
  }, []);

  const logPeriodEnd = useCallback((entryId: string, endDate: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, endDate } : e)),
    );
  }, []);

  const updateEntry = useCallback((entryId: string, patch: Partial<Pick<PeriodEntry, 'flowIntensity' | 'symptoms' | 'notes' | 'endDate'>>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
    );
  }, []);

  const removeEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
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
