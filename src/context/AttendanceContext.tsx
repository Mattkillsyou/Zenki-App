import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
} from '../services/attendanceSync';
import { FIREBASE_CONFIGURED } from '../config/firebase';

const STORAGE_KEY = '@zenki_attendance';
const FIRESTORE_POLL_MS = 60_000; // Refresh Firestore data every 60s for admins

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
  const firestorePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const visitsRef = useRef(state.visits);

  // Firestore-synced data (admin-only)
  const [firestoreTodayVisitors, setFirestoreTodayVisitors] = useState<AttendanceVisit[]>([]);
  const [firestoreAllVisits, setFirestoreAllVisits] = useState<AttendanceVisit[]>([]);

  const isAdmin = user?.isAdmin === true;
  const useFirestore = FIREBASE_CONFIGURED && isAdmin;

  // Keep ref in sync so the interval closure always has fresh data
  useEffect(() => {
    visitsRef.current = state.visits;
  }, [state.visits]);

  // Load visits from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          setState(JSON.parse(raw));
        } catch { /* ignore */ }
      }
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

  // ─── Firestore polling for admins ───
  const refreshFromFirestore = useCallback(async () => {
    if (!useFirestore) return;
    const [todayData, allData] = await Promise.all([
      fetchTodayAttendance(),
      fetchAllAttendance(500),
    ]);
    setFirestoreTodayVisitors(todayData);
    setFirestoreAllVisits(allData);
  }, [useFirestore]);

  useEffect(() => {
    if (useFirestore) {
      // Fetch immediately, then poll
      refreshFromFirestore();
      firestorePollRef.current = setInterval(refreshFromFirestore, FIRESTORE_POLL_MS);
    }
    return () => {
      if (firestorePollRef.current) {
        clearInterval(firestorePollRef.current);
        firestorePollRef.current = null;
      }
    };
  }, [useFirestore, refreshFromFirestore]);

  const checkLocation = useCallback(async () => {
    if (!user || Platform.OS === 'web') return;
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
          // Sync to Sheets + Firestore (fire-and-forget)
          pushAttendanceToSheets(visit);
          pushAttendanceToFirestore(visit);
        }
      }
    } catch {
      // Location unavailable — silently skip
    }
  }, [user]);

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
    if (useFirestore && firestoreTodayVisitors.length > 0) {
      return firestoreTodayVisitors;
    }
    return state.visits.filter((v) => v.date === today);
  }, [useFirestore, firestoreTodayVisitors, state.visits, today]);

  const allVisitsHistory = useMemo(() => {
    if (useFirestore && firestoreAllVisits.length > 0) {
      return firestoreAllVisits;
    }
    return [...state.visits].reverse();
  }, [useFirestore, firestoreAllVisits, state.visits]);

  const getVisitHistory = useCallback(
    (memberId?: string) => {
      const source = useFirestore && firestoreAllVisits.length > 0
        ? firestoreAllVisits
        : [...state.visits].reverse();
      return memberId ? source.filter((v) => v.memberId === memberId) : source;
    },
    [useFirestore, firestoreAllVisits, state.visits],
  );

  const getVisitCountByMember = useCallback(() => {
    const source = useFirestore && firestoreAllVisits.length > 0
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
  }, [useFirestore, firestoreAllVisits, state.visits]);

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
