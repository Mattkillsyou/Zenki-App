import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import { useSyncedState } from '../hooks/useSyncedState';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {
  GpsActivity,
  GpsPoint,
  GpsActivityType,
  GPS_ACTIVITY_METS,
} from '../types/activity';
import { generateId } from '../utils/generateId';
import {
  totalDistance,
  totalElevationGain,
  paceSecsPerKm,
  computeSplits,
  estimateCaloriesMET,
  downsampleRoute,
  computeActivityTotals,
  ActivityTotals,
} from '../utils/gps';

const STORAGE_KEY = '@zenki_gps_activities';

// ─────────────────────────────────────────────
// Background location task (APP_AUDIT F17 — true background tracking)
//
// On iOS the `location` background mode keeps the JS runtime alive, so this
// module-level buffer survives screen-lock / app-switch and the foreground
// provider drains it for live UI + reads it as the authoritative route on stop.
// Process-eviction recovery (app killed by the OS mid-run) is intentionally out
// of scope. Registered at module scope so it exists before the provider mounts.
// ─────────────────────────────────────────────
const BG_LOCATION_TASK = 'zenki-bg-location';

let bgPointBuffer: GpsPoint[] = [];

// Set by the provider while a session is paused. The background task is module
// scope and can't read component refs, so we gate appends through this flag —
// mirrors the foreground watch's `if (isPausedRef.current) return;` guard so a
// pause freezes the route in BOTH modes (in-flight fixes after the async
// stopLocationUpdatesAsync are dropped instead of inflating distance/pace).
let bgPaused = false;

try {
  TaskManager.defineTask(BG_LOCATION_TASK, async ({ data, error }: any) => {
    if (error) return;
    if (bgPaused) return;
    const locs: Location.LocationObject[] | undefined = data?.locations;
    if (!locs?.length) return;
    for (const loc of locs) {
      bgPointBuffer.push({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude,
        speed: loc.coords.speed,
        timestamp: loc.timestamp,
      });
    }
  });
} catch {
  // expo-task-manager unavailable (web / unsupported) — background tracking
  // simply won't engage and the foreground watch remains the fallback.
}

interface GpsActivityContextValue {
  isTracking: boolean;
  /** True once OS-level background location updates are actually running for
   *  the current session (Always permission granted). When false while
   *  tracking, we fell back to a foreground-only watch. */
  backgroundTracking: boolean;
  isPaused: boolean;
  currentActivityType: GpsActivityType;
  liveDistance: number;
  liveDuration: number;
  livePace: number;
  liveElevGain: number;
  liveSpeed: number;
  currentPosition: GpsPoint | null;
  /** The full live route so far. The screen draws its polyline from this rather
   *  than accumulating currentPosition deltas — in background mode each 2s drain
   *  advances currentPosition by many fixes at once, so a delta-append polyline
   *  would skip every interior point. */
  liveRoute: GpsPoint[];
  startTracking: (type: GpsActivityType, memberId: string) => Promise<boolean>;
  stopTracking: (weightKg?: number) => GpsActivity | null;
  pauseTracking: () => void;
  /** Resolves false when the GPS watch failed to restart (the session stays
   *  paused so it can't tick while recording nothing) — callers should alert. */
  resumeTracking: () => Promise<boolean>;
  removeActivity: (id: string) => void;
  activities: GpsActivity[];
  memberActivities: (memberId: string) => GpsActivity[];
  totalStats: (memberId: string) => ActivityTotals;
}

const GpsActivityContext = createContext<GpsActivityContextValue>({
  isTracking: false,
  backgroundTracking: false,
  isPaused: false,
  currentActivityType: 'run',
  liveDistance: 0,
  liveDuration: 0,
  livePace: 0,
  liveElevGain: 0,
  liveSpeed: 0,
  currentPosition: null,
  liveRoute: [],
  startTracking: async () => false,
  stopTracking: () => null,
  pauseTracking: () => {},
  resumeTracking: async () => false,
  removeActivity: () => {},
  activities: [],
  memberActivities: () => [],
  totalStats: () => ({
    totalActivities: 0, totalDistanceMeters: 0, totalDurationSeconds: 0,
    totalElevationGainMeters: 0, totalCalories: 0, avgPaceSecsPerKm: 0,
    longestDistanceMeters: 0, longestDurationSeconds: 0, fastestPaceSecsPerKm: 0,
    activitiesByType: {},
  }),
});

function randomId(): string {
  return generateId('gps');
}

export function GpsActivityProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities, loaded] = useSyncedState<GpsActivity[]>(STORAGE_KEY, [], {
    validate: Array.isArray,
  });
  const [isTracking, setIsTracking] = useState(false);
  const [backgroundTracking, setBackgroundTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentActivityType, setCurrentActivityType] = useState<GpsActivityType>('run');
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveDuration, setLiveDuration] = useState(0);
  const [livePace, setLivePace] = useState(0);
  const [liveElevGain, setLiveElevGain] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<GpsPoint | null>(null);
  const [liveRoute, setLiveRoute] = useState<GpsPoint[]>([]);

  const routeRef = useRef<GpsPoint[]>([]);
  const metaRef = useRef<{ id: string; memberId: string; type: GpsActivityType; startedAt: string } | null>(null);
  const startTimeRef = useRef(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const drainTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bgModeRef = useRef(false);        // true while OS background updates run
  const pausedTimeRef = useRef(0);        // accumulated paused time in ms
  const pauseStartRef = useRef(0);        // when current pause started
  const isPausedRef = useRef(false);

  /** Clear all running timers and watches. */
  const cleanupTimers = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
  }, []);

  // Start OS-level background location updates. Returns true only if the user
  // grants Always/background permission and the updates start — otherwise the
  // caller falls back to a foreground-only watch. No-ops on web.
  const startBgUpdates = useCallback(async (promptIfNeeded = true): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      // On resume we already hold the grant from start — only PROMPT on the
      // initial start, so a pause→resume can't eject the user to Settings
      // (Android 11+) or re-prompt. If the grant was revoked mid-run, the check
      // returns non-granted and the caller degrades to a foreground watch.
      const { status } = promptIfNeeded
        ? await Location.requestBackgroundPermissionsAsync()
        : await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') return false;
      const already = await Location.hasStartedLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => false);
      if (already) { await Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {}); }
      await Location.startLocationUpdatesAsync(BG_LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        distanceInterval: 5,
        timeInterval: 3000,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Zenki Dojo — workout in progress',
          notificationBody: 'Recording your route, distance, and pace.',
          notificationColor: '#D4A017',
        },
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  // Stop OS-level background updates (fire-and-forget; safe if not running).
  const stopBgUpdates = useCallback(() => {
    try { Location.stopLocationUpdatesAsync(BG_LOCATION_TASK).catch(() => {}); } catch { /* not started */ }
  }, []);

  // Drain the background buffer into routeRef + live UI. The buffer is the full
  // background-recorded route (seeded with the initial point), so we rebuild
  // routeRef from it idempotently — no double-counting across drains.
  const drainBgBuffer = useCallback(() => {
    if (isPausedRef.current || bgPointBuffer.length === 0) return;
    routeRef.current = [...bgPointBuffer];
    setLiveRoute(routeRef.current);
    const last = routeRef.current[routeRef.current.length - 1];
    if (last) {
      setCurrentPosition(last);
      setLiveSpeed(Math.max(0, last.speed || 0));
    }
    const dist = totalDistance(routeRef.current);
    setLiveDistance(dist);
    setLiveElevGain(totalElevationGain(routeRef.current));
    const activeTime = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
    setLivePace(paceSecsPerKm(dist, activeTime));
  }, []);

  // Tear down any active watch/timers if the provider unmounts while tracking.
  useEffect(() => () => { cleanupTimers(); stopBgUpdates(); }, []);

  // Catch the live UI up the moment the app returns to foreground (the drain
  // interval is suspended while backgrounded; the bg task keeps buffering).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && bgModeRef.current && metaRef.current && !isPausedRef.current) {
        drainBgBuffer();
      }
    });
    return () => sub.remove();
  }, [drainBgBuffer]);

  const startTracking = useCallback(async (type: GpsActivityType, memberId: string): Promise<boolean> => {
    // Tracking strategy (APP_AUDIT F17 — resolved):
    //  1. Require When-In-Use permission (the baseline).
    //  2. Try to upgrade to OS-level BACKGROUND updates (startBgUpdates): if the
    //     user grants Always, a TaskManager task records the route while the app
    //     is backgrounded / the screen is locked (iOS `location` background mode
    //     + Android foreground service, both configured in app.json).
    //  3. If background permission is denied, fall back to a foreground-only
    //     watchPositionAsync — the UI then shows an honest "keep this screen
    //     open" notice (backgroundTracking=false).
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    routeRef.current = [];
    bgPointBuffer = [];
    bgPaused = false;
    bgModeRef.current = false;
    setBackgroundTracking(false);
    metaRef.current = { id: randomId(), memberId, type, startedAt: new Date().toISOString() };
    startTimeRef.current = Date.now();
    setCurrentActivityType(type);
    setIsTracking(true);
    setIsPaused(false);
    isPausedRef.current = false;
    pausedTimeRef.current = 0;
    pauseStartRef.current = 0;
    setLiveDistance(0);
    setLiveDuration(0);
    setLivePace(0);
    setLiveElevGain(0);
    setLiveSpeed(0);
    setLiveRoute([]);

    const updateStats = () => {
      const dist = totalDistance(routeRef.current);
      setLiveDistance(dist);
      setLiveElevGain(totalElevationGain(routeRef.current));
      // Subtract paused time so live pace matches the resume path + saved value.
      const elapsed = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
      setLivePace(paceSecsPerKm(dist, elapsed));
      setLiveRoute([...routeRef.current]);
    };

    // Get user's ACTUAL current position first (for centering + sim start)
    let startLat = 34.1006;
    let startLon = -118.2916;
    try {
      const currentLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      startLat = currentLoc.coords.latitude;
      startLon = currentLoc.coords.longitude;
      // Set initial position immediately so map centers on user
      const initialPoint: GpsPoint = {
        latitude: startLat, longitude: startLon,
        altitude: currentLoc.coords.altitude, speed: 0,
        timestamp: Date.now(),
      };
      routeRef.current.push(initialPoint);
      setCurrentPosition(initialPoint);
    } catch { /* fallback to defaults */ }

    // ── Try TRUE BACKGROUND tracking first ──────────────────────────────
    // Seed the buffer with the initial point so the derived route includes it,
    // then start OS background updates. On success we drive live UI from a drain
    // interval and return — no foreground watch (startLocationUpdatesAsync
    // delivers in foreground too, so a second watch would double-record).
    bgPointBuffer = [...routeRef.current];
    if (await startBgUpdates()) {
      bgModeRef.current = true;
      setBackgroundTracking(true);
      drainTimerRef.current = setInterval(drainBgBuffer, 2000);
      durationTimerRef.current = setInterval(() => {
        setLiveDuration(Math.max(0, Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current - (isPausedRef.current ? Date.now() - pauseStartRef.current : 0)) / 1000)));
      }, 1000);
      return true;
    }

    // GPS watch (foreground-only fallback)
    try {
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          const point: GpsPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: loc.coords.altitude,
            speed: loc.coords.speed,
            timestamp: loc.timestamp,
          };
          routeRef.current.push(point);
          setCurrentPosition(point);
          setLiveSpeed(Math.max(0, loc.coords.speed || 0));
          updateStats();
        },
      );
    } catch {
      // Web fallback — simulate GPS starting from user's ACTUAL location
      if (Platform.OS === 'web') {
        let simLat = startLat;
        let simLon = startLon;
        simTimerRef.current = setInterval(() => {
          simLat += (Math.random() - 0.5) * 0.0002;
          simLon += (Math.random() - 0.5) * 0.0002;
          const point: GpsPoint = {
            latitude: simLat, longitude: simLon,
            altitude: 150 + Math.random() * 5,
            speed: 2.5 + Math.random() * 2,
            timestamp: Date.now(),
          };
          routeRef.current.push(point);
          setCurrentPosition(point);
          setLiveSpeed(point.speed || 0);
          updateStats();
        }, 3000);
      } else {
        // Native watch failed to start — do NOT proceed as if tracking began.
        // Without a watch the session would tick but record 0 GPS points and be
        // silently lost on stop. Clean up and return false so the caller can
        // surface an error (ActivityTrackerScreen.handleStart alerts on false).
        cleanupTimers();
        metaRef.current = null;
        routeRef.current = [];
        setIsTracking(false);
        setIsPaused(false);
        isPausedRef.current = false;
        setCurrentPosition(null);
        setLiveDistance(0);
        setLiveDuration(0);
        setLivePace(0);
        setLiveElevGain(0);
        setLiveSpeed(0);
        setLiveRoute([]);
        return false;
      }
    }

    // Duration timer — always runs separately. Subtract paused time (and the
    // in-progress pause delta) so the headline timer freezes during a pause and
    // matches both live pace and the saved durationSeconds.
    durationTimerRef.current = setInterval(() => {
      setLiveDuration(Math.max(0, Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current - (isPausedRef.current ? Date.now() - pauseStartRef.current : 0)) / 1000)));
    }, 1000);

    return true;
  }, [startBgUpdates, drainBgBuffer]);

  const stopTracking = useCallback((weightKg: number = 80): GpsActivity | null => {
    if (!metaRef.current) return null;

    // If stopped WHILE paused, fold the in-progress pause into pausedTimeRef so
    // the saved durationSeconds (and the pace/calories derived from it) exclude
    // it — matching the frozen live timer. Without this, ending mid-pause counts
    // the paused stretch as active time.
    if (isPausedRef.current) {
      pausedTimeRef.current += Date.now() - pauseStartRef.current;
      isPausedRef.current = false;
      setIsPaused(false);
    }

    // Background mode: the buffer holds the authoritative route (incl. points
    // the last drain may have missed). Fold it in, then stop OS updates.
    if (bgModeRef.current) {
      routeRef.current = [...bgPointBuffer];
      stopBgUpdates();
    }
    bgModeRef.current = false;
    setBackgroundTracking(false);
    bgPointBuffer = [];

    // Stop everything first
    cleanupTimers();
    setIsTracking(false);

    const route = [...routeRef.current];
    const meta = metaRef.current;
    metaRef.current = null;

    // Always reset live UI state so a short/zero-point route doesn't leave a
    // stale position marker, polyline, or stats behind.
    setCurrentPosition(null);
    setLiveRoute([]);
    setLiveDistance(0);
    setLiveDuration(0);
    setLivePace(0);
    setLiveElevGain(0);
    setLiveSpeed(0);

    if (route.length < 2) return null;

    const durationSeconds = Math.max(0, Math.floor((Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000));
    const distanceMeters = totalDistance(route);
    const elevationGainMeters = totalElevationGain(route);
    const avgPace = paceSecsPerKm(distanceMeters, durationSeconds);
    const maxSpeed = route.reduce((max, p) => Math.max(max, p.speed || 0), 0);
    const splits = computeSplits(route);
    const met = GPS_ACTIVITY_METS[meta.type] || 5;
    const calories = estimateCaloriesMET(met, weightKg, durationSeconds);

    const activity: GpsActivity = {
      id: meta.id,
      memberId: meta.memberId,
      type: meta.type,
      startedAt: meta.startedAt,
      endedAt: new Date().toISOString(),
      durationSeconds,
      distanceMeters,
      elevationGainMeters,
      avgPaceSecsPerKm: avgPace,
      maxSpeedMps: maxSpeed,
      route: downsampleRoute(route, 500),
      splits,
      calories,
    };

    setActivities((prev) => [activity, ...prev].slice(0, 100));

    return activity;
  }, [cleanupTimers, stopBgUpdates]);

  const pauseTracking = useCallback(() => {
    if (!isTracking || isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    pauseStartRef.current = Date.now();

    // Stop GPS recording during pause
    if (bgModeRef.current) {
      bgPaused = true;       // freeze the buffer; drops any in-flight OS fixes
      stopBgUpdates();
      setLiveSpeed(0);       // zero the gauge while paused (matches frozen timer/pace)
    } else {
      watchRef.current?.remove();
      watchRef.current = null;
      if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
      setLiveSpeed(0);       // zero the gauge while paused (matches frozen timer/pace)
    }
    // Keep duration + drain timers running — they show elapsed time
  }, [isTracking, stopBgUpdates]);

  const resumeTracking = useCallback(async (): Promise<boolean> => {
    if (!isTracking || !isPausedRef.current) return false;
    // Accumulate paused time
    pausedTimeRef.current += Date.now() - pauseStartRef.current;
    isPausedRef.current = false;
    setIsPaused(false);

    // Background mode: unfreeze the buffer and restart OS updates (no re-prompt).
    // If the Always grant was revoked mid-run, startBgUpdates(false) returns
    // false — degrade to a foreground watch so recording continues and the UI
    // notice stops claiming background recording (instead of silently dying).
    if (bgModeRef.current) {
      bgPaused = false;
      if (await startBgUpdates(false)) {
        return true; // drain interval already running handles live UI
      }
      routeRef.current = [...bgPointBuffer];   // fold the bg route captured so far
      bgModeRef.current = false;
      setBackgroundTracking(false);
      if (drainTimerRef.current) { clearInterval(drainTimerRef.current); drainTimerRef.current = null; }
      // fall through to the foreground watch restart below
    }

    // Restart GPS watch / simulation
    const lastPoint = routeRef.current[routeRef.current.length - 1];
    const updateStats = () => {
      const dist = totalDistance(routeRef.current);
      setLiveDistance(dist);
      setLiveElevGain(totalElevationGain(routeRef.current));
      const activeTime = (Date.now() - startTimeRef.current - pausedTimeRef.current) / 1000;
      setLivePace(paceSecsPerKm(dist, activeTime));
      setLiveRoute([...routeRef.current]);
    };

    try {
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 3000 },
        (loc) => {
          if (isPausedRef.current) return;
          const point: GpsPoint = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: loc.coords.altitude,
            speed: loc.coords.speed,
            timestamp: loc.timestamp,
          };
          routeRef.current.push(point);
          setCurrentPosition(point);
          setLiveSpeed(Math.max(0, loc.coords.speed || 0));
          updateStats();
        },
      );
      return true;
    } catch {
      if (Platform.OS === 'web') {
        let simLat = lastPoint?.latitude ?? 34.1006;
        let simLon = lastPoint?.longitude ?? -118.2916;
        simTimerRef.current = setInterval(() => {
          if (isPausedRef.current) return;
          simLat += (Math.random() - 0.5) * 0.0002;
          simLon += (Math.random() - 0.5) * 0.0002;
          const point: GpsPoint = {
            latitude: simLat, longitude: simLon,
            altitude: 150 + Math.random() * 5,
            speed: 2.5 + Math.random() * 2,
            timestamp: Date.now(),
          };
          routeRef.current.push(point);
          setCurrentPosition(point);
          setLiveSpeed(point.speed || 0);
          updateStats();
        }, 3000);
        return true;
      }
      // Native watch failed to restart (e.g. Location Services turned off
      // mid-pause) — do NOT proceed as if recording resumed, or the timer
      // ticks an "active" session that records zero points (mirrors
      // startTracking's guard above). Re-freeze the paused state and report
      // failure so the caller can surface it.
      isPausedRef.current = true;
      setIsPaused(true);
      pauseStartRef.current = Date.now();
      return false;
    }
  }, [isTracking, startBgUpdates]);

  const removeActivity = useCallback((id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const memberActivities = useCallback(
    (memberId: string) => activities.filter((a) => a.memberId === memberId),
    [activities],
  );

  const totalStats = useCallback(
    (memberId: string) => computeActivityTotals(activities.filter((a) => a.memberId === memberId)),
    [activities],
  );

  return (
    <GpsActivityContext.Provider
      value={{
        isTracking, backgroundTracking, isPaused, currentActivityType,
        liveDistance, liveDuration, livePace, liveElevGain, liveSpeed,
        currentPosition, liveRoute, startTracking, stopTracking,
        pauseTracking, resumeTracking, removeActivity,
        activities, memberActivities, totalStats,
      }}
    >
      {children}
    </GpsActivityContext.Provider>
  );
}

export function useGpsActivity() {
  return useContext(GpsActivityContext);
}
