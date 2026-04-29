import React, {
  createContext, useContext, useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { useNutrition } from './NutritionContext';
import { useWorkouts } from './WorkoutContext';
import { useHeartRate } from './HeartRateContext';
import {
  initHealthKit, isHealthKitAvailable,
  pushWeight, pushWorkout, pushFood, pushHeartRate,
  pullDailyTotals, pullLatestHeartRate, pullLatestWeight,
  mapActivityTypeToHK,
  HKDailyTotals,
  HealthCategory,
} from '../services/healthKit';

const ENABLED_KEY = '@zenki_healthkit_enabled';
const SYNCED_IDS_KEY = '@zenki_healthkit_synced';

// ─────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────

interface HealthKitContextValue {
  /** True only on iOS with the native module linked. */
  available: boolean;
  /** True after the user has granted HealthKit permissions. */
  authorized: boolean;
  /** User toggle (persisted). When false, no syncs run. */
  enabled: boolean;
  setEnabled: (on: boolean) => void;

  /** Latest pulled daily totals (today). */
  dailyTotals: HKDailyTotals | null;
  /** Most recent watch heart-rate sample (last 24h). */
  latestHrFromHK: { bpm: number; date: string } | null;
  /** Most recent weight sample in HK (kg). */
  latestWeightFromHK: { kg: number; date: string } | null;

  /** Force a full re-sync now (push everything new + pull). */
  syncNow: () => Promise<void>;
  /** Pull-only refresh (called automatically on app foreground). */
  refreshFromHK: () => Promise<void>;
  /** Request permissions explicitly (e.g. from a Settings toggle). */
  authorize: (categories?: HealthCategory[]) => Promise<boolean>;
}

const noopAsync = async () => {};

const HealthKitContext = createContext<HealthKitContextValue>({
  available: false,
  authorized: false,
  enabled: false,
  setEnabled: () => {},
  dailyTotals: null,
  latestHrFromHK: null,
  latestWeightFromHK: null,
  syncNow: noopAsync,
  refreshFromHK: noopAsync,
  authorize: async () => false,
});

// ─────────────────────────────────────────────────
// "Already synced" tracker — persisted across launches.
// Keyed by entity-type + id so each piece of local data is pushed exactly once.
// ─────────────────────────────────────────────────

type SyncedSet = Record<string, true>;

async function loadSynced(): Promise<SyncedSet> {
  try {
    const raw = await AsyncStorage.getItem(SYNCED_IDS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveSynced(set: SyncedSet): Promise<void> {
  try {
    await AsyncStorage.setItem(SYNCED_IDS_KEY, JSON.stringify(set));
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────

export function HealthKitProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const memberId = user?.id;
  const isIOS = Platform.OS === 'ios';
  const available = useMemo(() => isIOS && isHealthKitAvailable(), [isIOS]);

  const [enabled, setEnabledState] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [dailyTotals, setDailyTotals] = useState<HKDailyTotals | null>(null);
  const [latestHrFromHK, setLatestHrFromHK] = useState<{ bpm: number; date: string } | null>(null);
  const [latestWeightFromHK, setLatestWeightFromHK] = useState<{ kg: number; date: string } | null>(null);

  // Existing app data
  const { myWeights, myMacros } = useNutrition();
  const { myLogs: myWorkoutLogs } = useWorkouts();
  const { sessions: hrSessions, currentBpm } = useHeartRate();

  // In-memory cache of synced ids (mirrors AsyncStorage). Mutated on push.
  const syncedRef = useRef<SyncedSet>({});

  // ── Load enabled flag + synced cache ──
  useEffect(() => {
    (async () => {
      try {
        const [enRaw, syncedSet] = await Promise.all([
          AsyncStorage.getItem(ENABLED_KEY),
          loadSynced(),
        ]);
        if (enRaw === 'true') setEnabledState(true);
        syncedRef.current = syncedSet;
      } catch {
        /* ignore */
      }
    })();
  }, []);

  // ── Authorize on enable ──
  const authorize = useCallback(async (categories?: HealthCategory[]): Promise<boolean> => {
    if (!available) return false;
    const ok = await initHealthKit(categories);
    setAuthorized(ok);
    return ok;
  }, [available]);

  // Auto-authorize when feature toggled on
  useEffect(() => {
    if (!available || !enabled || authorized) return;
    authorize();
  }, [available, enabled, authorized, authorize]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    AsyncStorage.setItem(ENABLED_KEY, String(on)).catch(() => {});
  }, []);

  // ── Mark / check sync state ──
  const isSynced = useCallback((kind: string, id: string) => {
    return !!syncedRef.current[`${kind}:${id}`];
  }, []);

  const markSynced = useCallback(async (kind: string, id: string) => {
    syncedRef.current[`${kind}:${id}`] = true;
    await saveSynced(syncedRef.current);
  }, []);

  // ─────────────────────────────────────────────────
  // PUSH — push only entries that haven't been synced yet.
  // ─────────────────────────────────────────────────

  const pushPendingWeights = useCallback(async () => {
    if (!authorized || !memberId) return;
    const weights = myWeights(memberId);
    for (const w of weights) {
      if (isSynced('weight', w.id)) continue;
      const whenIso = (w.date + 'T12:00:00Z'); // noon of the logged day
      const ok = await pushWeight(w.weight, w.unit === 'lb' ? 'lb' : 'kg', whenIso);
      if (ok) await markSynced('weight', w.id);
    }
  }, [authorized, memberId, myWeights, isSynced, markSynced]);

  const pushPendingFood = useCallback(async () => {
    if (!authorized || !memberId) return;
    const macros = myMacros(memberId);
    for (const m of macros) {
      if (isSynced('food', m.id)) continue;
      const ok = await pushFood({
        name: m.name,
        date: m.createdAt,
        calories: m.calories,
        proteinG: m.protein,
        carbsG: m.carbs,
        fatG: m.fat,
        mealType: m.mealType,
      });
      if (ok) await markSynced('food', m.id);
    }
  }, [authorized, memberId, myMacros, isSynced, markSynced]);

  const pushPendingWorkouts = useCallback(async () => {
    if (!authorized || !memberId) return;

    // 1. Strength / WOD logs (WorkoutContext)
    const logs = myWorkoutLogs(memberId);
    for (const log of logs) {
      if (isSynced('workout', log.id)) continue;
      // Logs may not have explicit start/end — anchor on date + duration
      const startMs = new Date(`${log.date}T18:00:00`).getTime();
      const durMs = (log.durationMinutes ?? 30) * 60 * 1000;
      const ok = await pushWorkout({
        startIso: new Date(startMs).toISOString(),
        endIso: new Date(startMs + durMs).toISOString(),
        metadata: { format: log.format, title: log.title },
      });
      if (ok) await markSynced('workout', log.id);
    }

    // 2. Heart-rate sessions (HeartRateContext)
    for (const sess of hrSessions) {
      if (sess.memberId !== memberId) continue;
      if (!sess.endedAt) continue; // skip in-progress
      if (isSynced('hrsession', sess.id)) continue;
      const activity = mapActivityTypeToHK(sess.activityType);
      const ok = await pushWorkout({
        startIso: sess.startedAt,
        endIso: sess.endedAt,
        activityType: activity,
        energyBurnedKcal: sess.calories,
        metadata: { device: sess.deviceName, avgBpm: sess.avgBpm, strain: sess.strain },
      });
      if (ok) await markSynced('hrsession', sess.id);

      // Push downsampled HR samples too (one push per sample is expensive —
      // we cap at the strain-key samples already in storage, ~600 max)
      for (const sample of sess.samples) {
        const sampleKey = `${sess.id}_${sample.timestamp}`;
        if (isSynced('hrsample', sampleKey)) continue;
        const sampleOk = await pushHeartRate(sample.bpm, new Date(sample.timestamp).toISOString());
        if (sampleOk) await markSynced('hrsample', sampleKey);
      }
    }
  }, [authorized, memberId, myWorkoutLogs, hrSessions, isSynced, markSynced]);

  // ─────────────────────────────────────────────────
  // PULL — fetch the latest read-only data from HK.
  // ─────────────────────────────────────────────────

  const refreshFromHK = useCallback(async () => {
    if (!authorized) return;
    try {
      const [totals, hr, wt] = await Promise.all([
        pullDailyTotals(),
        pullLatestHeartRate(),
        pullLatestWeight(),
      ]);
      setDailyTotals(totals);
      setLatestHrFromHK(hr);
      setLatestWeightFromHK(wt);
    } catch (err) {
      console.warn('[HealthKit] refresh failed:', err);
    }
  }, [authorized]);

  const syncNow = useCallback(async () => {
    if (!enabled || !available) return;
    if (!authorized) {
      const ok = await authorize();
      if (!ok) return;
    }
    await Promise.all([
      pushPendingWeights(),
      pushPendingFood(),
      pushPendingWorkouts(),
    ]);
    await refreshFromHK();
  }, [enabled, available, authorized, authorize, pushPendingWeights, pushPendingFood, pushPendingWorkouts, refreshFromHK]);

  // ─────────────────────────────────────────────────
  // Triggers
  // ─────────────────────────────────────────────────

  // Initial sync once authorized
  useEffect(() => {
    if (!authorized || !enabled) return;
    syncNow();
    // Don't run on every syncNow change — only when auth/enabled toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, enabled]);

  // Push when local data changes (debounced via setTimeout to coalesce bursts)
  const pushDebounce = useRef<any>(null);
  useEffect(() => {
    if (!authorized || !enabled) return;
    if (pushDebounce.current) clearTimeout(pushDebounce.current);
    pushDebounce.current = setTimeout(() => {
      pushPendingWeights();
      pushPendingFood();
      pushPendingWorkouts();
    }, 1500);
    return () => {
      if (pushDebounce.current) clearTimeout(pushDebounce.current);
    };
  }, [
    authorized, enabled,
    // Trigger on any mutation in source data
    memberId,
    myWeights,
    myMacros,
    myWorkoutLogs,
    hrSessions,
    pushPendingWeights, pushPendingFood, pushPendingWorkouts,
  ]);

  // Pull on app foreground
  useEffect(() => {
    if (!authorized || !enabled) return;
    const onChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshFromHK();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [authorized, enabled, refreshFromHK]);

  // Live HR push — every fresh BPM during recording goes into HK in near-real-time.
  // Throttle to 1 push every 5s to avoid spamming.
  const lastLivePushRef = useRef(0);
  useEffect(() => {
    if (!authorized || !enabled) return;
    if (!currentBpm || currentBpm <= 0) return;
    const now = Date.now();
    if (now - lastLivePushRef.current < 5000) return;
    lastLivePushRef.current = now;
    pushHeartRate(currentBpm).catch(() => {});
  }, [authorized, enabled, currentBpm]);

  const value = useMemo<HealthKitContextValue>(() => ({
    available,
    authorized,
    enabled,
    setEnabled,
    dailyTotals,
    latestHrFromHK,
    latestWeightFromHK,
    syncNow,
    refreshFromHK,
    authorize,
  }), [
    available, authorized, enabled, setEnabled,
    dailyTotals, latestHrFromHK, latestWeightFromHK,
    syncNow, refreshFromHK, authorize,
  ]);

  return (
    <HealthKitContext.Provider value={value}>
      {children}
    </HealthKitContext.Provider>
  );
}

export function useHealthKit() {
  return useContext(HealthKitContext);
}
