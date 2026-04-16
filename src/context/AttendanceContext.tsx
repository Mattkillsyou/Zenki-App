import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useAuth } from './AuthContext';
import { AttendanceVisit, AttendanceState } from '../types/attendance';
import { isWithinDojo, getTodayString, POLLING_INTERVAL_MS } from '../utils/location';

const STORAGE_KEY = '@zenki_attendance';

interface AttendanceContextValue {
  visits: AttendanceVisit[];
  todayVisitors: AttendanceVisit[];
  isTracking: boolean;
  isAtDojo: boolean;
  locationPermission: string | null;
  startTracking: () => void;
  stopTracking: () => void;
  getVisitHistory: (memberId?: string) => AttendanceVisit[];
  getVisitCountByMember: () => { memberId: string; memberName: string; count: number }[];
}

const AttendanceContext = createContext<AttendanceContextValue>({
  visits: [],
  todayVisitors: [],
  isTracking: false,
  isAtDojo: false,
  locationPermission: null,
  startTracking: () => {},
  stopTracking: () => {},
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
            id: 'visit_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
            memberId: user.id,
            memberName: `${user.firstName} ${user.lastName}`.trim(),
            date: today,
            checkInTime: new Date().toISOString(),
          };
          setState((prev) => ({ visits: [...prev.visits, visit] }));
        }
      }
    } catch {
      // Location unavailable — silently skip
    }
  }, [user]);

  const startTracking = useCallback(() => {
    if (intervalRef.current || Platform.OS === 'web') return;
    setIsTracking(true);
    // Check immediately, then every 30s
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

  const today = getTodayString();
  const todayVisitors = useMemo(
    () => state.visits.filter((v) => v.date === today),
    [state.visits, today],
  );

  const getVisitHistory = useCallback(
    (memberId?: string) => {
      const filtered = memberId
        ? state.visits.filter((v) => v.memberId === memberId)
        : state.visits;
      return [...filtered].reverse(); // most recent first
    },
    [state.visits],
  );

  const getVisitCountByMember = useCallback(() => {
    const counts: Record<string, { memberId: string; memberName: string; count: number }> = {};
    state.visits.forEach((v) => {
      if (!counts[v.memberId]) {
        counts[v.memberId] = { memberId: v.memberId, memberName: v.memberName, count: 0 };
      }
      counts[v.memberId].count++;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [state.visits]);

  return (
    <AttendanceContext.Provider
      value={{
        visits: state.visits,
        todayVisitors,
        isTracking,
        isAtDojo,
        locationPermission,
        startTracking,
        stopTracking,
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
