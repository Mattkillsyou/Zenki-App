import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { pipboy } from '../theme/colors';
import { pipboyFont } from '../theme/typography';
import * as Location from 'expo-location';
import { PipBoyMap } from '../components/PipBoyMap';
// Metro resolves this to PipBoyMap.web.tsx on web, PipBoyMap.native.tsx on
// native — so the Leaflet dependency stays out of the native bundle.

const ACTIVITY_TYPES: GpsActivityType[] = ['run', 'walk', 'bike', 'hike'];
const DEFAULT_LAT = 34.1006;
const DEFAULT_LNG = -118.2916;

const PB = pipboy; // shorthand

// ─── Pip-Boy tabs ───
type PipTab = 'STAT' | 'MAP' | 'DATA' | 'RADIO';
const PIP_TABS: PipTab[] = ['STAT', 'MAP', 'DATA', 'RADIO'];

// ─── Dot-leader stat row (e.g. "DIST......... 2.34 MI") ───
function StatRow({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const dots = '.'.repeat(Math.max(2, 22 - label.length - value.length - (unit?.length || 0)));
  return (
    <View style={pb.statRow}>
      <Text style={pb.statLabel}>{label}</Text>
      <Text style={pb.statDots}>{dots}</Text>
      <Text style={pb.statValue}>{value}</Text>
      {unit && <Text style={pb.statUnit}> {unit}</Text>}
    </View>
  );
}

export function ActivityTrackerScreen({ navigation }: any) {
  const { user } = useAuth();
  const {
    isTracking, currentActivityType,
    liveDistance, liveDuration, livePace, liveElevGain, liveSpeed,
    currentPosition, startTracking, stopTracking, memberActivities,
  } = useGpsActivity();

  const [selectedType, setSelectedType] = useState<GpsActivityType>('run');
  const [routeCoords, setRouteCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [initialLat, setInitialLat] = useState(DEFAULT_LAT);
  const [initialLng, setInitialLng] = useState(DEFAULT_LNG);
  const [blinkVisible, setBlinkVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<PipTab>('MAP');

  // Blinking cursor
  useEffect(() => {
    const t = setInterval(() => setBlinkVisible((v) => !v), 600);
    return () => clearInterval(t);
  }, []);

  // Get user's real location on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setInitialLat(loc.coords.latitude);
          setInitialLng(loc.coords.longitude);
        }
      } catch {}
    })();
  }, []);

  // Accumulate route
  useEffect(() => {
    if (currentPosition) {
      setRouteCoords((prev) => [...prev, { lat: currentPosition.latitude, lng: currentPosition.longitude }]);
    }
  }, [currentPosition]);

  const handleStart = async () => {
    if (!user) return;
    setRouteCoords([]);
    const ok = await startTracking(selectedType, user.id);
    if (!ok) Alert.alert('LOCATION REQUIRED', 'Enable location access to track activity.');
  };

  const handleStop = () => {
    Alert.alert(
      'END ACTIVITY?',
      `${formatDistance(liveDistance)} ${distanceUnit()} · ${formatDuration(liveDuration)}`,
      [
        { text: 'NEGATIVE', style: 'cancel' },
        {
          text: 'AFFIRMATIVE',
          style: 'destructive',
          onPress: () => {
            const activity = stopTracking();
            if (activity) {
              Alert.alert('DATA LOGGED', `${formatDistance(activity.distanceMeters)} ${distanceUnit()} recorded.`);
              setRouteCoords([]);
            }
          },
        },
      ],
    );
  };

  const userLat = currentPosition?.latitude || initialLat;
  const userLng = currentPosition?.longitude || initialLng;
  const history = user ? memberActivities(user.id) : [];

  return (
    <View style={pb.container}>
      {/* Full-screen green-filtered map (z-index 1 — below UI panels) */}
      {Platform.OS === 'web' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1 }}>
          <PipBoyMap routeCoords={routeCoords} userLat={userLat} userLng={userLng} />
        </View>
      )}

      {/* CRT scanline overlay (z-index 50 — above map, below UI) */}
      {Platform.OS === 'web' && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }} pointerEvents="none">
          <div className="pipboy-scanlines" />
        </View>
      )}

      {/* ═══ Top: Pip-Boy tab bar ═══ */}
      <SafeAreaView style={pb.topBar} edges={['top']}>
        <TouchableOpacity onPress={() => { if (!isTracking) navigation.goBack(); }} style={pb.backBtn}>
          <Text style={pb.backText}>{'< BACK'}</Text>
        </TouchableOpacity>

        <View style={pb.tabBar}>
          {PIP_TABS.map((t) => (
            <TouchableOpacity key={t} style={[pb.tab, t === activeTab && pb.tabActive]} onPress={() => setActiveTab(t)} activeOpacity={0.7}>
              <Text style={[pb.tabText, t === activeTab && pb.tabTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* ═══ Bottom: Tab-aware panel ═══ */}
      <View style={pb.bottomPanel}>
        {/* Terminal header with blinking cursor */}
        <View style={pb.terminalHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={pb.terminalTitle}>
              {isTracking
                ? `TRACKING: ${GPS_ACTIVITY_LABELS[currentActivityType].toUpperCase()}`
                : activeTab === 'STAT' ? 'VITAL STATISTICS'
                : activeTab === 'DATA' ? 'ACTIVITY LOG'
                : activeTab === 'RADIO' ? 'ZENKI RADIO'
                : 'ZENKI GPS TRACKER v1.0'}
            </Text>
            <Text style={[pb.terminalTitle, { opacity: blinkVisible ? 1 : 0, width: 14 }]}>▮</Text>
          </View>
        </View>

        {/* ─── MAP TAB ─── */}
        {activeTab === 'MAP' && (
          isTracking ? (
            <>
              <View style={pb.statsBlock}>
                <StatRow label="DIST" value={formatDistance(liveDistance)} unit={distanceUnit().toUpperCase()} />
                <StatRow label="TIME" value={formatDuration(liveDuration)} />
                <StatRow label="PACE" value={formatPaceForUnit(livePace)} unit={paceUnit().toUpperCase()} />
                <StatRow label="ELEV" value={`${Math.round(liveElevGain * 3.281)}`} unit="FT" />
                <StatRow label="SPEED" value={`${(liveSpeed * 2.237).toFixed(1)}`} unit="MPH" />
                <StatRow label="COORDS" value={`${userLat.toFixed(4)},${userLng.toFixed(4)}`} />
              </View>
              <TouchableOpacity style={pb.stopBtn} onPress={handleStop} activeOpacity={0.8}>
                <Text style={pb.stopBtnText}>[ TERMINATE TRACKING ]</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={pb.typeRow}>
                {ACTIVITY_TYPES.map((type) => {
                  const active = type === selectedType;
                  return (
                    <TouchableOpacity key={type} style={[pb.typeChip, active && pb.typeChipActive]} onPress={() => setSelectedType(type)}>
                      <Text style={[pb.typeText, active && pb.typeTextActive]}>{GPS_ACTIVITY_LABELS[type].toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity style={pb.startBtn} onPress={handleStart} activeOpacity={0.8}>
                <Text style={pb.startBtnText}>[ INITIATE {GPS_ACTIVITY_LABELS[selectedType].toUpperCase()} ]</Text>
              </TouchableOpacity>
            </>
          )
        )}

        {/* ─── STAT TAB — full stats overview ─── */}
        {activeTab === 'STAT' && (
          <View style={pb.statsBlock}>
            <StatRow label="TOTAL RUNS" value={`${history.filter((a) => a.type === 'run').length}`} />
            <StatRow label="TOTAL WALKS" value={`${history.filter((a) => a.type === 'walk').length}`} />
            <StatRow label="TOTAL BIKES" value={`${history.filter((a) => a.type === 'bike').length}`} />
            <StatRow label="TOTAL HIKES" value={`${history.filter((a) => a.type === 'hike').length}`} />
            <StatRow label="ALL TIME DIST" value={formatDistance(history.reduce((s, a) => s + a.distanceMeters, 0))} unit={distanceUnit().toUpperCase()} />
            <StatRow label="ALL TIME CAL" value={`${history.reduce((s, a) => s + a.calories, 0)}`} unit="KCAL" />
            <StatRow label="TOTAL TIME" value={formatDuration(history.reduce((s, a) => s + a.durationSeconds, 0))} />
            <StatRow label="BEST PACE" value={history.length > 0 ? formatPaceForUnit(Math.min(...history.filter(a => a.avgPaceSecsPerKm > 0).map(a => a.avgPaceSecsPerKm))) : '--:--'} unit={paceUnit().toUpperCase()} />
            <StatRow label="LOCATION" value={`${userLat.toFixed(4)}, ${userLng.toFixed(4)}`} />
            <StatRow label="STATUS" value={isTracking ? 'ACTIVE' : 'STANDBY'} />
          </View>
        )}

        {/* ─── DATA TAB — activity log ─── */}
        {activeTab === 'DATA' && (
          <View style={pb.statsBlock}>
            {history.length === 0 ? (
              <Text style={pb.logEntry}>{'> NO ACTIVITIES RECORDED'}</Text>
            ) : (
              history.slice(0, 8).map((a) => (
                <Text key={a.id} style={pb.logEntry}>
                  {new Date(a.startedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}
                  {' '}{GPS_ACTIVITY_LABELS[a.type].toUpperCase().padEnd(6)}
                  {' '}{formatDistance(a.distanceMeters).padStart(5)} {distanceUnit()}
                  {' '}{formatDuration(a.durationSeconds)}
                  {' '}{a.calories}cal
                </Text>
              ))
            )}
          </View>
        )}

        {/* ─── RADIO TAB — music service launcher ─── */}
        {activeTab === 'RADIO' && (
          <View style={pb.statsBlock}>
            <Text style={pb.logEntry}>{'> ZENKI RADIO · SELECT SOURCE'}</Text>
            <Text style={pb.logEntry}>{' '}</Text>

            <TouchableOpacity
              style={pb.radioBtn}
              onPress={() => Linking.openURL('https://open.spotify.com').catch(() => {})}
              activeOpacity={0.7}
            >
              <Text style={pb.radioBtnText}>{'  ♫  SPOTIFY          [ LAUNCH ]'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={pb.radioBtn}
              onPress={() => Linking.openURL('https://music.apple.com').catch(() => {})}
              activeOpacity={0.7}
            >
              <Text style={pb.radioBtnText}>{'  ♫  APPLE MUSIC      [ LAUNCH ]'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={pb.radioBtn}
              onPress={() => Linking.openURL('https://youtube.com/music').catch(() => {})}
              activeOpacity={0.7}
            >
              <Text style={pb.radioBtnText}>{'  ♫  YOUTUBE MUSIC    [ LAUNCH ]'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={pb.radioBtn}
              onPress={() => Linking.openURL('https://soundcloud.com').catch(() => {})}
              activeOpacity={0.7}
            >
              <Text style={pb.radioBtnText}>{'  ♫  SOUNDCLOUD       [ LAUNCH ]'}</Text>
            </TouchableOpacity>

            <Text style={pb.logEntry}>{' '}</Text>
            <Text style={pb.logEntry}>{'> SIGNAL: STRONG'}</Text>
            <Text style={pb.logEntry}>{'> "TRAIN HARD. FIGHT SMART."'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════
// Pip-Boy StyleSheet — green monochrome terminal
// ═══════════════════════════════════════════════
const pb = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: PB.bg,
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    elevation: 100,
    backgroundColor: PB.bg + 'F0',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: PB.primary,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backText: {
    color: PB.dim,
    fontSize: 14,
    ...pipboyFont,
    // @ts-ignore web text-shadow
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderTopColor: PB.primary,
    marginTop: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: PB.dark,
  },
  tabActive: {
    borderBottomColor: PB.primary,
    backgroundColor: PB.primary + '15',
  },
  tabText: {
    color: PB.dark,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 3,
    ...pipboyFont,
  },
  tabTextActive: {
    color: PB.primary,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  // Bottom panel
  bottomPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 100,
    elevation: 100,
    backgroundColor: PB.bg + 'F5',
    borderTopWidth: 2,
    borderTopColor: PB.primary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },

  // Terminal header
  terminalHeader: {
    borderBottomWidth: 1,
    borderBottomColor: PB.dark,
    paddingBottom: 8,
    marginBottom: 10,
  },
  terminalTitle: {
    color: PB.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    ...pipboyFont,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Stats block — dot-leader rows
  statsBlock: {
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 3,
  },
  statLabel: {
    color: PB.dim,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    ...pipboyFont,
  },
  statDots: {
    color: PB.dark,
    fontSize: 16,
    flex: 1,
    letterSpacing: 1,
    ...pipboyFont,
  },
  statValue: {
    color: PB.primary,
    fontSize: 18,
    fontWeight: '700',
    ...pipboyFont,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  statUnit: {
    color: PB.dim,
    fontSize: 14,
    ...pipboyFont,
  },

  // Activity type selector
  typeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: PB.dark,
    borderRadius: 0, // sharp terminal corners
  },
  typeChipActive: {
    borderColor: PB.primary,
    backgroundColor: PB.primary + '20',
  },
  typeText: {
    color: PB.dark,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
    ...pipboyFont,
  },
  typeTextActive: {
    color: PB.primary,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },

  // Buttons
  startBtn: {
    borderWidth: 2,
    borderColor: PB.primary,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 0,
  },
  startBtnText: {
    color: PB.primary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    ...pipboyFont,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  stopBtn: {
    borderWidth: 2,
    borderColor: '#ff3333',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 0,
    backgroundColor: '#ff333315',
  },
  stopBtnText: {
    color: '#ff3333',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 2,
    ...pipboyFont,
    // @ts-ignore
    textShadowColor: '#ff3333',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },

  // Activity log
  logBlock: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: PB.dark,
    paddingTop: 8,
  },
  logHeader: {
    color: PB.dim,
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
    ...pipboyFont,
  },
  logEntry: {
    color: PB.dim,
    fontSize: 14,
    ...pipboyFont,
    paddingVertical: 2,
    letterSpacing: 0.5,
  },
  radioBtn: {
    borderWidth: 1,
    borderColor: PB.dark,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: 0,
  },
  radioBtnText: {
    color: PB.primary,
    fontSize: 14,
    ...pipboyFont,
    letterSpacing: 0.5,
    // @ts-ignore
    textShadowColor: PB.primary,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
});
