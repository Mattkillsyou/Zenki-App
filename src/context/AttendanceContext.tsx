import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';
import { generateId } from '../utils/generateId';
import { AttendanceVisit, AttendanceState } from '../types/attendance';
import { isWithinDojo, getTodayString, POLLING_INTERVAL_MS } from '../utils/location';
import {
  pushAttendanceToSheets,
  pushAttendanceToFirestore,
  fetchTodayAttendance,
  fetchAllAttendance,
  subscribeToTodayAttendance,
  subscribeToAllAttendance,
} from '../services/attendanceSync';
import { FIREBASE_CONFIGURED } from '../config/firebase';

const STORAGE_KEY = '@zenki_attendance';
// Audit 2.0.5 P2: ids of visits whose Firestore push hasn't been confirmed.
// Persisted so a push that dies at the dojo door (offline, app killed) is
// re-pushed on the next launch instead of living only on-device all day.
const UNSYNCED_KEY = '@zenki_attendance_unsynced';

interface AttendanceContextValue {
  visits: AttendanceVisit[];
  todayVisitors: AttendanceVisit[];
  allVisitsHistory: AttendanceVisit[];
  isTracking: boolean;
  isAtDojo: boolean;
  locationPermission: string | null;
  startTracking: () => void;
  stopTracking: () => void;
  refreshFromFirestore: () => Promise<void>;
  getVisitHistory: (memberId?: string) => AttendanceVisit[];
  getVisitCountByMember: () => { memberId: string; memberName: string; count: number }[];
}

const AttendanceContext = createContext<AttendanceContextValue>({
  visits: [],
  todayVisitors: [],
  allVisitsHistory: [],
  isTracking: false,
  isAtDojo: false,
  locationPermission: null,
  startTracking: () => {},
  stopTracking: () => {},
  refreshFromFirestore: async () => {},
  getVisitHistory: () => [],
  getVisitCountByMember: () => [],
});

export function AttendanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<AttendanceState>({ visits: [] });
  const [loaded, setLoaded] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isAtDojo, setIsAtDojo] = useState(false);
  const [locationPermission, setLocationPermission] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visitsRef = useRef(state.visits);
  // Cloud-sync retry queue (see UNSYNCED_KEY). Ref-mirrored so the polling
  // closure can check it every tick without an AsyncStorage read.
  const unsyncedIdsRef = useRef<string[]>([]);
  const inFlightPushesRef = useRef<Set<string>>(new Set());
  const flushingRef = useRef(false);

  // Firestore-synced data (admin-only)
  const [firestoreTodayVisitors, setFirestoreTodayVisitors] = useState<AttendanceVisit[]>([]);
  const [firestoreAllVisits, setFirestoreAllVisits] = useState<AttendanceVisit[]>([]);
  // Track whether the live subscriptions have delivered their first snapshot.
  // Gating on these (instead of `.length > 0`) lets an empty Firestore day
  // render as an empty list rather than falling back to the admin's local visit.
  const [firestoreTodayLoaded, setFirestoreTodayLoaded] = useState(false);
  const [firestoreAllLoaded, setFirestoreAllLoaded] = useState(false);

  const isAdmin = user?.isAdmin === true;
  const useFirestore = FIREBASE_CONFIGURED && isAdmin;

  // Keep ref in sync so the interval closure always has fresh data
  useEffect(() => {
    visitsRef.current = state.visits;
  }, [state.visits]);

  // Load visits (and the unsynced-push queue) from AsyncStorage
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(UNSYNCED_KEY),
    ]).then(([raw, rawUnsynced]) => {
      const parsed = safeParseJSON<AttendanceState | null>(raw, null, (v) =>
        typeof v === 'object' && v !== null && 'visits' in (v as object),
      );
      if (parsed) setState(parsed);
      unsyncedIdsRef.current = safeParseJSON<string[]>(rawUnsynced, [], Array.isArray);
      setLoaded(true);
    });
  }, []);

  // Persist on change
  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, loaded]);

  // Check permission on mount
  useEffect(() => {
    if (Platform.OS === 'web') {
      setLocationPermission('unavailable');
      return;
    }
    Location.getForegroundPermissionsAsync().then(({ status }) => {
      setLocationPermission(status);
    });
  }, []);

  // Auto-start tracking if permission granted and user logged in
  useEffect(() => {
    if (locationPermission === 'granted' && user && loaded && !isTracking) {
      startTracking();
    }
  }, [locationPermission, user, loaded]);

  // ─── Firestore live subscriptions for admins ───
  // Replaces the old 60s polling — admin sees member check-ins within seconds.
  // refreshFromFirestore is kept as an explicit pull-to-refresh fallback.
  const refreshFromFirestore = useCallback(async () => {
    if (!useFirestore) return;
    const [todayData, allData] = await Promise.all([
      fetchTodayAttendance(),
      fetchAllAttendance(500),
    ]);
    setFirestoreTodayVisitors(todayData);
    setFirestoreAllVisits(allData);
    setFirestoreTodayLoaded(true);
    setFirestoreAllLoaded(true);
  }, [useFirestore]);

  // Track the local date so the today-subscription re-arms after midnight.
  // `subscribeToTodayAttendance` captures `getTodayString()` at call-time,
  // so a long-running session would otherwise show yesterday's visitors.
  const [todayKey, setTodayKey] = useState<string>(getTodayString());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        const fresh = getTodayString();
        setTodayKey((prev) => (prev === fresh ? prev : fresh));
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!useFirestore) return;
    // Re-arming (useFirestore flip or midnight todayKey change) re-gates on a
    // fresh first snapshot so we never trust a stale "loaded" from a prior day.
    setFirestoreTodayLoaded(false);
    const unsubToday = subscribeToTodayAttendance((visits) => {
      setFirestoreTodayVisitors(visits);
      setFirestoreTodayLoaded(true);
    });
    const unsubAll = subscribeToAllAttendance((visits) => {
      setFirestoreAllVisits(visits);
      setFirestoreAllLoaded(true);
    });
    return () => {
      unsubToday();
      unsubAll();
    };
  }, [useFirestore, todayKey]);

  // ─── Cloud-sync retry queue for member check-ins ───
  // Audit 2.0.5 P2: the check-in push was fire-and-forget, and `alreadyVisited`
  // (correctly) blocks a same-day re-check-in — so a failed push at the door
  // left the visit on-device for the rest of the day and the admin's live
  // roster never showed the member. Unconfirmed pushes now keep their visit id
  // queued (same idiom as orderSync.flushUnsyncedOrders and
  // waiverSync.flushPendingSignupWrites) and are re-pushed on the next poll
  // tick and the next app open. Sheets stays fire-and-forget: it's a
  // best-effort mirror and a re-POST would duplicate the row.
  const setUnsyncedIds = useCallback((ids: string[]) => {
    unsyncedIdsRef.current = ids;
    AsyncStorage.setItem(UNSYNCED_KEY, JSON.stringify(ids)).catch(() => {});
  }, []);

  const pushVisitToCloud = useCallback(async (visit: AttendanceVisit): Promise<boolean> => {
    // Without Firebase nothing can ever flush — keep legacy skip-and-log
    // behavior rather than growing a queue that has nowhere to drain.
    if (!FIREBASE_CONFIGURED) return pushAttendanceToFirestore(visit);
    if (inFlightPushesRef.current.has(visit.id)) return false;
    inFlightPushesRef.current.add(visit.id);
    // Queue BEFORE the write (removed on success): an offline Firestore write
    // never rejects — it hangs until connectivity — so marking only on failure
    // would still lose the visit if the app is killed while the write pends.
    if (!unsyncedIdsRef.current.includes(visit.id)) {
      setUnsyncedIds([...unsyncedIdsRef.current, visit.id]);
    }
    try {
      const ok = await pushAttendanceToFirestore(visit);
      if (ok) {
        setUnsyncedIds(unsyncedIdsRef.current.filter((x) => x !== visit.id));
      } else {
        console.warn('[Attendance] visit kept locally; cloud sync queued for retry:', visit.id);
      }
      return ok;
    } finally {
      inFlightPushesRef.current.delete(visit.id);
    }
  }, [setUnsyncedIds]);

  // Re-push queued visits. Safe to call repeatedly; no-ops when queue is empty.
  const flushUnsyncedVisits = useCallback(async () => {
    if (!FIREBASE_CONFIGURED || flushingRef.current || !user) return;
    if (unsyncedIdsRef.current.length === 0) return;
    flushingRef.current = true;
    try {
      for (const id of [...unsyncedIdsRef.current]) {
        if (inFlightPushesRef.current.has(id)) continue;
        const visit = visitsRef.current.find((v) => v.id === id);
        if (!visit) {
          // No local record left to push — drop the stale marker.
          setUnsyncedIds(unsyncedIdsRef.current.filter((x) => x !== id));
          continue;
        }
        // Only flush the signed-in member's own visits: the Firestore write
        // stamps the LIVE auth uid, so pushing another member's queued visit
        // (shared device) would mis-attribute it. Theirs wait for their login.
        if (visit.memberId !== user.id) continue;
        const ok = await pushVisitToCloud(visit);
        if (!ok) break; // still offline/rejected — keep the rest for the next flush
      }
    } finally {
      flushingRef.current = false;
    }
  }, [user, pushVisitToCloud, setUnsyncedIds]);

  // Flush on app open (post-hydrate) and whenever the signed-in member changes.
  useEffect(() => {
    if (loaded) flushUnsyncedVisits();
  }, [loaded, flushUnsyncedVisits]);

  const checkLocation = useCallback(async () => {
    if (!user || Platform.OS === 'web') return;
    // Opportunistic retry of any queued check-in pushes (no-op when empty).
    flushUnsyncedVisits();
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const within = isWithinDojo(loc.coords.latitude, loc.coords.longitude);
      setIsAtDojo(within);

      if (within) {
        const today = getTodayString();
        const alreadyVisited = visitsRef.current.some(
          (v) => v.memberId === user.id && v.date === today,
        );
        if (!alreadyVisited) {
          const visit: AttendanceVisit = {
            id: generateId('visit'),
            memberId: user.id,
            memberName: `${user.firstName} ${user.lastName}`.trim(),
            date: today,
            checkInTime: new Date().toISOString(),
          };
          // Save locally
          setState((prev) => ({ visits: [...prev.visits, visit] }));
          // Sheets mirror stays fire-and-forget (see queue note above)
          pushAttendanceToSheets(visit);
          // Firestore feeds the admin's live roster — queue-tracked so a
          // failed push at the door retries instead of vanishing for the day
          pushVisitToCloud(visit);
        }
      }
    } catch {
      // Location unavailable — silently skip
    }
  }, [user, flushUnsyncedVisits, pushVisitToCloud]);

  const startTracking = useCallback(() => {
    if (intervalRef.current || Platform.OS === 'web') return;
    setIsTracking(true);
    checkLocation();
    intervalRef.current = setInterval(checkLocation, POLLING_INTERVAL_MS);
  }, [checkLocation]);

  const stopTracking = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Stop tracking whenever the signed-in member changes (including logout → null).
  // The polling interval captures `checkLocation`, which is bound to the previous
  // `user`. Without this teardown, a stale interval keeps recording visits for the
  // logged-out member, and `isTracking` stays true so a newly-logged-in user is never
  // tracked. Using the cleanup form: React runs this stop (clear interval + reset
  // isTracking) for the previous member BEFORE the auto-start effect's body for the new
  // member, so the stale closure is discarded and tracking restarts with the fresh
  // checkLocation binding — without ever leaving two intervals running.
  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [user?.id, stopTracking]);

  // Pause/resume tracking on app state changes
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && locationPermission === 'granted' && user && !intervalRef.current) {
        startTracking();
      } else if (nextState !== 'active') {
        stopTracking();
      }
    });
    return () => sub.remove();
  }, [locationPermission, user, startTracking, stopTracking]);

  // ─── Derived data: use Firestore for admins, local for everyone else ───
  const today = getTodayString();

  const todayVisitors = useMemo(() => {
    if (useFirestore && firestoreTodayLoaded) {
      return firestoreTodayVisitors;
    }
    return state.visits.filter((v) => v.date === today);
  }, [useFirestore, firestoreTodayLoaded, firestoreTodayVisitors, state.visits, today]);

  const allVisitsHistory = useMemo(() => {
    if (useFirestore && firestoreAllLoaded) {
      return firestoreAllVisits;
    }
    return [...state.visits].reverse();
  }, [useFirestore, firestoreAllLoaded, firestoreAllVisits, state.visits]);

  const getVisitHistory = useCallback(
    (memberId?: string) => {
      const source = useFirestore && firestoreAllLoaded
        ? firestoreAllVisits
        : [...state.visits].reverse();
      return memberId ? source.filter((v) => v.memberId === memberId) : source;
    },
    [useFirestore, firestoreAllLoaded, firestoreAllVisits, state.visits],
  );

  const getVisitCountByMember = useCallback(() => {
    const source = useFirestore && firestoreAllLoaded
      ? firestoreAllVisits
      : state.visits;
    const counts: Record<string, { memberId: string; memberName: string; count: number }> = {};
    source.forEach((v) => {
      if (!counts[v.memberId]) {
        counts[v.memberId] = { memberId: v.memberId, memberName: v.memberName, count: 0 };
      }
      counts[v.memberId].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [useFirestore, firestoreAllLoaded, firestoreAllVisits, state.visits]);

  return (
    <AttendanceContext.Provider
      value={{
        visits: state.visits,
        todayVisitors,
        allVisitsHistory,
        isTracking,
        isAtDojo,
        locationPermission,
        startTracking,
        stopTracking,
        refreshFromFirestore,
        getVisitHistory,
        getVisitCountByMember,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

export function useAttendance() {
  return useContext(AttendanceContext);
}
