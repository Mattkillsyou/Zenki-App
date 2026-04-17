import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import {
  GpsActivityType,
  GPS_ACTIVITY_LABELS,
  GPS_ACTIVITY_ICONS,
} from '../types/activity';
import {
  formatDistance,
  distanceUnit,
  formatPaceForUnit,
  paceUnit,
} from '../utils/gps';
import { formatDuration } from '../utils/heartRate';
import { spacing } from '../theme';

import * as Location from 'expo-location';

const ACTIVITY_TYPES: GpsActivityType[] = ['run', 'walk', 'bike', 'hike'];

// Default center (dojo) — overridden by user's actual location on mount
const DEFAULT_LAT = 34.1006;
const DEFAULT_LNG = -118.2916;

/**
 * Leaflet map component — web only.
 * Uses CartoDB dark tiles (free, no API key, matches brand).
 */
function LeafletMap({ routeCoords, userLat, userLng }: {
  routeCoords: { lat: number; lng: number }[];
  userLat: number;
  userLng: number;
}) {
  const mapRef = useRef<any>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const polylineRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Dynamically import leaflet on web only
    const L = require('leaflet');

    // Inject Leaflet CSS if not already present
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!mapContainerRef.current) return;

    // Initialize map
    const map = L.map(mapContainerRef.current, {
      center: [userLat || DEFAULT_LAT, userLng || DEFAULT_LNG],
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer (CartoDB Dark Matter — free, no key)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
    }).addTo(map);

    // User location marker (blue pulsing dot)
    const userIcon = L.divIcon({
      html: `<div style="
        width: 16px; height: 16px;
        background: #3B82F6;
        border: 3px solid #93C5FD;
        border-radius: 50%;
        box-shadow: 0 0 12px rgba(59,130,246,0.6);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    });
    markerRef.current = L.marker([userLat || DEFAULT_LAT, userLng || DEFAULT_LNG], { icon: userIcon }).addTo(map);

    // Route polyline
    polylineRef.current = L.polyline([], {
      color: '#3B82F6',
      weight: 4,
      opacity: 0.9,
      smoothFactor: 1,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker + polyline + center on new coords
  useEffect(() => {
    if (!mapRef.current) return;
    const L = require('leaflet');

    if (userLat && userLng) {
      markerRef.current?.setLatLng([userLat, userLng]);
      mapRef.current.setView([userLat, userLng], mapRef.current.getZoom(), { animate: true });
    }

    if (routeCoords.length > 0) {
      polylineRef.current?.setLatLngs(routeCoords.map((c: any) => [c.lat, c.lng]));
    }
  }, [userLat, userLng, routeCoords]);

  if (Platform.OS !== 'web') return null;

  return (
    <div
      ref={mapContainerRef as any}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}

export function ActivityTrackerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    isTracking,
    currentActivityType,
    liveDistance,
    liveDuration,
    livePace,
    liveElevGain,
    liveSpeed,
    currentPosition,
    startTracking,
    stopTracking,
    memberActivities,
  } = useGpsActivity();

  const [selectedType, setSelectedType] = useState<GpsActivityType>('run');
  const [routeCoords, setRouteCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [initialLat, setInitialLat] = useState(DEFAULT_LAT);
  const [initialLng, setInitialLng] = useState(DEFAULT_LNG);

  // Get user's real location on mount for map centering
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setInitialLat(loc.coords.latitude);
          setInitialLng(loc.coords.longitude);
        }
      } catch { /* use default */ }
    })();
  }, []);

  // Accumulate route coordinates for the polyline
  useEffect(() => {
    if (currentPosition) {
      setRouteCoords((prev) => [...prev, {
        lat: currentPosition.latitude,
        lng: currentPosition.longitude,
      }]);
    }
  }, [currentPosition]);

  const handleStart = async () => {
    if (!user) return;
    setRouteCoords([]);
    const ok = await startTracking(selectedType, user.id);
    if (!ok) {
      Alert.alert('Location Required', 'Please allow location access to track your activity.');
    }
  };

  const handleStop = () => {
    Alert.alert(
      'End Activity?',
      `${formatDistance(liveDistance)} ${distanceUnit()} · ${formatDuration(liveDuration)}`,
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'End & Save',
          style: 'destructive',
          onPress: () => {
            const activity = stopTracking();
            if (activity) {
              Alert.alert(
                'Activity Saved',
                `${formatDistance(activity.distanceMeters)} ${distanceUnit()} in ${formatDuration(activity.durationSeconds)}`,
              );
              setRouteCoords([]);
            }
          },
        },
      ],
    );
  };

  const userLat = currentPosition?.latitude || initialLat;
  const userLng = currentPosition?.longitude || initialLng;

  return (
    <View style={styles.container}>
      {/* ── Full-screen map background (Strava-style) ── */}
      {Platform.OS === 'web' && (
        <LeafletMap
          routeCoords={routeCoords}
          userLat={userLat}
          userLng={userLng}
        />
      )}

      {/* ── Top bar (floating over map) ── */}
      <SafeAreaView style={styles.topBar} edges={['top']}>
        <TouchableOpacity
          onPress={() => {
            if (isTracking) {
              Alert.alert('Activity Running', 'Stop the activity before leaving.');
            } else {
              navigation.goBack();
            }
          }}
          style={[styles.backBtn, { backgroundColor: 'rgba(0,0,0,0.6)' }]}
        >
          <Ionicons name="chevron-back" size={22} color="#FFF" />
        </TouchableOpacity>
        <View style={[styles.titlePill, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <Text style={styles.titleText}>
            {isTracking ? GPS_ACTIVITY_LABELS[currentActivityType].toUpperCase() : 'TRACK ACTIVITY'}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </SafeAreaView>

      {/* ── Bottom panel (floating over map) ── */}
      <View style={[styles.bottomPanel, { backgroundColor: colors.background + 'F0' }]}>
        {/* Live stats — during tracking */}
        {isTracking ? (
          <>
            <View style={styles.liveStatsRow}>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.gold }]}>
                  {formatDistance(liveDistance)}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>{distanceUnit()}</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.textPrimary }]}>
                  {formatDuration(liveDuration)}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>time</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.textPrimary }]}>
                  {formatPaceForUnit(livePace)}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>pace {paceUnit()}</Text>
              </View>
            </View>
            <View style={styles.liveStatsRow}>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.textPrimary }]}>
                  {Math.round(liveElevGain)}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>ft gain</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.textPrimary }]}>
                  {(liveSpeed * 2.237).toFixed(1)}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>mph</Text>
              </View>
              <View style={styles.liveStat}>
                <Text style={[styles.liveStatValue, { color: colors.textPrimary }]}>
                  {routeCoords.length}
                </Text>
                <Text style={[styles.liveStatUnit, { color: colors.textMuted }]}>points</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.stopBtn, { backgroundColor: colors.red }]} onPress={handleStop}>
              <Ionicons name="stop" size={22} color="#FFF" />
              <Text style={styles.btnText}>STOP</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Activity type picker */}
            <View style={styles.typeRow}>
              {ACTIVITY_TYPES.map((type) => {
                const active = type === selectedType;
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeChip,
                      {
                        backgroundColor: active ? colors.gold : colors.surface,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedType(type)}
                  >
                    <Ionicons
                      name={GPS_ACTIVITY_ICONS[type] as any}
                      size={20}
                      color={active ? '#000' : colors.textSecondary}
                    />
                    <Text style={[styles.typeLabel, { color: active ? '#000' : colors.textSecondary }]}>
                      {GPS_ACTIVITY_LABELS[type]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity style={[styles.startBtn, { backgroundColor: colors.gold }]} onPress={handleStart}>
              <Ionicons name="play" size={22} color="#000" />
              <Text style={[styles.btnText, { color: '#000' }]}>
                START {GPS_ACTIVITY_LABELS[selectedType].toUpperCase()}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117', // dark fallback if map hasn't loaded
  },

  // Top bar — floats over map
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  titlePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  titleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // Bottom panel — floats over map
  bottomPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: 20,
    paddingBottom: 36,
  },

  // Live stats
  liveStatsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  liveStat: {
    flex: 1,
    alignItems: 'center',
  },
  liveStatValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -1,
  },
  liveStatUnit: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 2,
  },

  // Activity type picker
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  typeLabel: { fontSize: 12, fontWeight: '700' },

  // Buttons
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#FFF',
  },
});
