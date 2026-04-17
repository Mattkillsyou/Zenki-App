import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import {
  GpsActivity,
  GpsPoint,
  GpsActivityType,
  GPS_ACTIVITY_METS,
} from '../types/activity';
import {
  totalDistance,
  totalElevationGain,
  paceSecsPerKm,
  computeSplits,
  estimateCaloriesMET,
  downsampleRoute,
} from '../utils/gps';

const STORAGE_KEY = '@zenki_gps_activities';

interface GpsActivityContextValue {
  isTracking: boolean;
  currentActivityType: GpsActivityType;
  liveDistance: number;
  liveDuration: number;
  livePace: number;
  liveElevGain: number;
  liveSpeed: number;
  currentPosition: GpsPoint | null;
  startTracking: (type: GpsActivityType, memberId: string) => Promise<boolean>;
  stopTracking: (weightKg?: number) => GpsActivity | null;
  activities: GpsActivity[];
  memberActivities: (memberId: string) => GpsActivity[];
}

const GpsActivityContext = createContext<GpsActivityContextValue>({
  isTracking: false,
  currentActivityType: 'run',
  liveDistance: 0,
  liveDuration: 0,
  livePace: 0,
  liveElevGain: 0,
  liveSpeed: 0,
  currentPosition: null,
  startTracking: async () => false,
  stopTracking: () => null,
  activities: [],
  memberActivities: () => [],
});

function randomId(): string {
  return 'gps_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function GpsActivityProvider({ children }: { children: React.ReactNode }) {
  const [activities, setActivities] = useState<GpsActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [currentActivityType, setCurrentActivityType] = useState<GpsActivityType>('run');
  const [liveDistance, setLiveDistance] = useState(0);
  const [liveDuration, setLiveDuration] = useState(0);
  const [livePace, setLivePace] = useState(0);
  const [liveElevGain, setLiveElevGain] = useState(0);
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<GpsPoint | null>(null);

  const routeRef = useRef<GpsPoint[]>([]);
  const metaRef = useRef<{ id: string; memberId: string; type: GpsActivityType; startedAt: string } | null>(null);
  const startTimeRef = useRef(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setActivities(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(activities));
  }, [activities, loaded]);

  /** Clear all running timers and watches. */
  const cleanupTimers = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
    if (simTimerRef.current) { clearInterval(simTimerRef.current); simTimerRef.current = null; }
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
  }, []);

  const startTracking = useCallback(async (type: GpsActivityType, memberId: string): Promise<boolean> => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return false;

    routeRef.current = [];
    metaRef.current = { id: randomId(), memberId, type, startedAt: new Date().toISOString() };
    startTimeRef.current = Date.now();
    setCurrentActivityType(type);
    setIsTracking(true);
    setLiveDistance(0);
    setLiveDuration(0);
    setLivePace(0);
    setLiveElevGain(0);
    setLiveSpeed(0);

    const updateStats = () => {
      const dist = totalDistance(routeRef.current);
      setLiveDistance(dist);
      setLiveElevGain(totalElevationGain(routeRef.current));
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setLivePace(paceSecsPerKm(dist, elapsed));
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

    // GPS watch
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
      }
    }

    // Duration timer — always runs separately
    durationTimerRef.current = setInterval(() => {
      setLiveDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return true;
  }, []);

  const stopTracking = useCallback((weightKg: number = 80): GpsActivity | null => {
    if (!metaRef.current) return null;

    // Stop everything first
    cleanupTimers();
    setIsTracking(false);

    const route = [...routeRef.current];
    const meta = metaRef.current;
    metaRef.current = null;

    if (route.length < 2) return null;

    const durationSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
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
    setCurrentPosition(null);
    setLiveDistance(0);
    setLiveDuration(0);
    setLivePace(0);
    setLiveElevGain(0);
    setLiveSpeed(0);

    return activity;
  }, [cleanupTimers]);

  const memberActivities = useCallback(
    (memberId: string) => activities.filter((a) => a.memberId === memberId),
    [activities],
  );

  return (
    <GpsActivityContext.Provider
      value={{
        isTracking, currentActivityType,
        liveDistance, liveDuration, livePace, liveElevGain, liveSpeed,
        currentPosition, startTracking, stopTracking,
        activities, memberActivities,
      }}
    >
      {children}
    </GpsActivityContext.Provider>
  );
}

export function useGpsActivity() {
  return useContext(GpsActivityContext);
}
