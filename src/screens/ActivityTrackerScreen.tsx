import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Alert, Platform, Linking, ScrollView, Pressable,
} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import { useSenpai } from '../context/SenpaiContext';
import { useTheme } from '../context/ThemeContext';
import { randomDialogue } from '../data/senpaiDialogue';
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
import { spacing, borderRadius } from '../theme';
import * as Location from 'expo-location';
import { ActivityMap } from '../components/ActivityMap';
import { MatrixActivityTrackerScreen } from './ActivityTrackerScreen.matrix';

const ACTIVITY_TYPES: GpsActivityType[] = ['run', 'walk', 'bike', 'hike'];
const DEFAULT_LAT = 34.1006;
const DEFAULT_LNG = -118.2916;

type Tab = 'track' | 'stats' | 'history' | 'radio';

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'track',   label: 'Track',   icon: 'navigate-outline' },
  { key: 'stats',   label: 'Stats',   icon: 'stats-chart-outline' },
  { key: 'history', label: 'History', icon: 'time-outline' },
  { key: 'radio',   label: 'Radio',   icon: 'musical-notes-outline' },
];

const RADIO_SERVICES: { name: string; url: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: 'Spotify',       url: 'https://open.spotify.com',  icon: 'logo-soundcloud' },
  { name: 'Apple Music',   url: 'https://music.apple.com',   icon: 'musical-note' },
  { name: 'YouTube Music', url: 'https://youtube.com/music', icon: 'logo-youtube' },
  { name: 'SoundCloud',    url: 'https://soundcloud.com',    icon: 'cloud-outline' },
];

/**
 * Top-level GPS screen. Routes to the matrix-only Pip-Boy version for
 * `themeMode === 'matrix'`, otherwise renders the clean themed experience.
 */
export function ActivityTrackerScreen(props: any) {
  const { mode } = useTheme();
  if (mode === 'matrix') return <MatrixActivityTrackerScreen {...props} />;
  return <CleanActivityTrackerScreen {...props} />;
}

// ═════════════════════════════════════════════════════
// Clean theme-aware GPS tracker
// ═════════════════════════════════════════════════════

function CleanActivityTrackerScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const {
    isTracking, currentActivityType,
    liveDistance, liveDuration, livePace, liveElevGain, liveSpeed,
    currentPosition, startTracking, stopTracking, memberActivities,
  } = useGpsActivity();
  const { state: senpaiState, triggerReaction: senpaiTrigger, shouldReact: senpaiShouldReact } = useSenpai();

  const [selectedType, setSelectedType] = useState<GpsActivityType>('run');
  const [routeCoords, setRouteCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [initialLat, setInitialLat] = useState(DEFAULT_LAT);
  const [initialLng, setInitialLng] = useState(DEFAULT_LNG);
  const [activeTab, setActiveTab] = useState<Tab>('track');

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

  // Accumulate route while tracking
  useEffect(() => {
    if (currentPosition) {
      setRouteCoords((prev) => [...prev, { lat: currentPosition.latitude, lng: currentPosition.longitude }]);
    }
  }, [currentPosition]);

  const handleStart = async () => {
    if (!user) return;
    setRouteCoords([]);
    const ok = await startTracking(selectedType, user.id);
    if (!ok) Alert.alert('Location required', 'Enable location access to track your activity.');
  };

  const handleStop = () => {
    Alert.alert(
      'End activity?',
      `${formatDistance(liveDistance)} ${distanceUnit()} · ${formatDuration(liveDuration)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            const activity = stopTracking();
            if (activity) {
              Alert.alert('Activity saved', `${formatDistance(activity.distanceMeters)} ${distanceUnit()} recorded.`);
              setRouteCoords([]);
              if (senpaiState.enabled && senpaiShouldReact()) {
                try { senpaiTrigger('impressed', randomDialogue('gpsActivity'), 4000); } catch { /* ignore */ }
              }
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Map background — extends up under the simulated Dynamic Island on
          web so the dark map reads as a single full-bleed surface instead of
          sitting below a white notch bar. The phone frame's overflow: hidden
          clips the bleed at the top edge. */}
      {Platform.OS === 'web' && (
        <View style={[styles.mapLayer, styles.mapLayerWebBleed]}>
          <ActivityMap
            routeCoords={routeCoords}
            userLat={userLat}
            userLng={userLng}
            tileFilter={colors.mapTileFilter}
            accentColor={colors.mapRouteColor || colors.gold}
          />
        </View>
      )}

      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerWrap}>
        <View style={styles.header}>
          <Pressable
            onPress={() => { if (!isTracking) navigation.goBack(); }}
            style={[
              styles.iconBtn,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                opacity: isTracking ? 0.4 : 1,
              },
            ]}
            disabled={isTracking}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>GPS Tracker</Text>
          <View style={styles.iconBtn} />
        </View>

        {/* Tab bar */}
        <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <SoundPressable
                key={t.key}
                style={[styles.tab, active && { backgroundColor: colors.gold }]}
                onPress={() => setActiveTab(t.key)}
              >
                <Ionicons name={t.icon} size={15} color={active ? colors.textInverse : colors.textSecondary} />
                <Text style={[styles.tabLabel, { color: active ? colors.textInverse : colors.textSecondary }]}>
                  {t.label}
                </Text>
              </SoundPressable>
            );
          })}
        </View>
      </SafeAreaView>

      {/* Bottom panel — content varies by tab */}
      <SafeAreaView edges={['bottom']} style={styles.panelWrap}>
        <View style={[
          styles.panel,
          { backgroundColor: colors.background, borderColor: colors.border },
        ]}>
          {activeTab === 'track' && (
            <TrackPanel
              isTracking={isTracking}
              currentActivityType={currentActivityType}
              selectedType={selectedType}
              setSelectedType={setSelectedType}
              liveDistance={liveDistance}
              liveDuration={liveDuration}
              livePace={livePace}
              liveElevGain={liveElevGain}
              liveSpeed={liveSpeed}
              onStart={handleStart}
              onStop={handleStop}
            />
          )}

          {activeTab === 'stats' && (
            <StatsPanel
              history={history}
              isTracking={isTracking}
              userLat={userLat}
              userLng={userLng}
            />
          )}

          {activeTab === 'history' && (
            <HistoryPanel history={history} />
          )}

          {activeTab === 'radio' && (
            <RadioPanel />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// Track panel — start/stop activity with live stats
// ═════════════════════════════════════════════════════

function TrackPanel({
  isTracking, currentActivityType, selectedType, setSelectedType,
  liveDistance, liveDuration, livePace, liveElevGain, liveSpeed,
  onStart, onStop,
}: {
  isTracking: boolean;
  currentActivityType: GpsActivityType;
  selectedType: GpsActivityType;
  setSelectedType: (t: GpsActivityType) => void;
  liveDistance: number;
  liveDuration: number;
  livePace: number;
  liveElevGain: number;
  liveSpeed: number;
  onStart: () => void;
  onStop: () => void;
}) {
  const { colors } = useTheme();

  if (isTracking) {
    return (
      <View>
        <Text style={[styles.panelTitle, { color: colors.textMuted }]}>
          Tracking · {GPS_ACTIVITY_LABELS[currentActivityType]}
        </Text>

        <View style={styles.heroStat}>
          <Text style={[styles.heroValue, { color: colors.textPrimary }]}>
            {formatDistance(liveDistance)}
          </Text>
          <Text style={[styles.heroUnit, { color: colors.textMuted }]}>
            {distanceUnit()}
          </Text>
        </View>

        <View style={styles.statGrid}>
          <StatCell label="Time" value={formatDuration(liveDuration)} />
          <StatCell label={`Pace (${paceUnit()})`} value={formatPaceForUnit(livePace)} />
          <StatCell label="Speed" value={`${(liveSpeed * 2.237).toFixed(1)} mph`} />
          <StatCell label="Elev" value={`${Math.round(liveElevGain * 3.281)} ft`} />
        </View>

        <Pressable
          style={[styles.primaryBtn, { backgroundColor: colors.error }]}
          onPress={onStop}
        >
          <Ionicons name="stop" size={18} color="#FFF" />
          <Text style={styles.primaryBtnText}>End Activity</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.panelTitle, { color: colors.textMuted }]}>Choose activity</Text>

      <View style={styles.typeRow}>
        {ACTIVITY_TYPES.map((type) => {
          const active = type === selectedType;
          return (
            <SoundPressable
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
                name={GPS_ACTIVITY_ICONS[type] as keyof typeof Ionicons.glyphMap}
                size={20}
                color={active ? colors.textInverse : colors.textSecondary}
              />
              <Text style={[styles.typeText, { color: active ? colors.textInverse : colors.textSecondary }]}>
                {GPS_ACTIVITY_LABELS[type]}
              </Text>
            </SoundPressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
        onPress={onStart}
      >
        <Ionicons name="play" size={18} color={colors.textInverse} />
        <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>
          Start {GPS_ACTIVITY_LABELS[selectedType]}
        </Text>
      </Pressable>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// Stats panel — all-time totals
// ═════════════════════════════════════════════════════

function StatsPanel({ history, isTracking, userLat, userLng }: {
  history: any[];
  isTracking: boolean;
  userLat: number;
  userLng: number;
}) {
  const { colors } = useTheme();
  const totalDist = history.reduce((s, a) => s + a.distanceMeters, 0);
  const totalCal = history.reduce((s, a) => s + a.calories, 0);
  const totalTime = history.reduce((s, a) => s + a.durationSeconds, 0);
  const validPaces = history.filter((a) => a.avgPaceSecsPerKm > 0).map((a) => a.avgPaceSecsPerKm);
  const bestPace = validPaces.length > 0 ? Math.min(...validPaces) : null;

  return (
    <View>
      <Text style={[styles.panelTitle, { color: colors.textMuted }]}>All-time stats</Text>

      <View style={styles.statGrid}>
        <StatCell label="Total distance" value={`${formatDistance(totalDist)} ${distanceUnit()}`} />
        <StatCell label="Total time" value={formatDuration(totalTime)} />
        <StatCell label="Calories" value={`${totalCal} kcal`} />
        <StatCell label="Best pace" value={bestPace ? `${formatPaceForUnit(bestPace)} ${paceUnit()}` : '—'} />
      </View>

      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      <View style={styles.statGrid}>
        <StatCell label="Runs"  value={`${history.filter((a) => a.type === 'run').length}`} />
        <StatCell label="Walks" value={`${history.filter((a) => a.type === 'walk').length}`} />
        <StatCell label="Bikes" value={`${history.filter((a) => a.type === 'bike').length}`} />
        <StatCell label="Hikes" value={`${history.filter((a) => a.type === 'hike').length}`} />
      </View>

      <View style={[styles.metaRow, { borderTopColor: colors.divider }]}>
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          {userLat.toFixed(4)}, {userLng.toFixed(4)}
        </Text>
        <View style={[styles.statusDot, { backgroundColor: isTracking ? colors.success : colors.textTertiary }]} />
        <Text style={[styles.metaText, { color: colors.textMuted }]}>
          {isTracking ? 'Tracking' : 'Standby'}
        </Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// History panel — recent activity log
// ═════════════════════════════════════════════════════

function HistoryPanel({ history }: { history: any[] }) {
  const { colors } = useTheme();

  if (history.length === 0) {
    return (
      <View>
        <Text style={[styles.panelTitle, { color: colors.textMuted }]}>Recent activity</Text>
        <View style={styles.emptyState}>
          <Ionicons name="footsteps-outline" size={32} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No activities recorded yet
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={[styles.panelTitle, { color: colors.textMuted }]}>Recent activity</Text>
      <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
        {history.slice(0, 8).map((a) => (
          <View key={a.id} style={[styles.historyRow, { borderBottomColor: colors.divider }]}>
            <View style={[styles.historyIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Ionicons
                name={GPS_ACTIVITY_ICONS[a.type as GpsActivityType] as keyof typeof Ionicons.glyphMap}
                size={16}
                color={colors.gold}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.historyName, { color: colors.textPrimary }]}>
                {GPS_ACTIVITY_LABELS[a.type as GpsActivityType]}
              </Text>
              <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                {new Date(a.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {formatDuration(a.durationSeconds)} · {a.calories} kcal
              </Text>
            </View>
            <Text style={[styles.historyDist, { color: colors.textPrimary }]}>
              {formatDistance(a.distanceMeters)} {distanceUnit()}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// Radio panel — quick links to streaming services
// ═════════════════════════════════════════════════════

function RadioPanel() {
  const { colors } = useTheme();
  return (
    <View>
      <Text style={[styles.panelTitle, { color: colors.textMuted }]}>Music</Text>
      <View style={styles.radioGrid}>
        {RADIO_SERVICES.map((s) => (
          <SoundPressable
            key={s.name}
            style={[
              styles.radioBtn,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={() => Linking.openURL(s.url).catch(() => {})}
          >
            <Ionicons name={s.icon} size={20} color={colors.gold} />
            <Text style={[styles.radioBtnText, { color: colors.textPrimary }]}>{s.name}</Text>
          </SoundPressable>
        ))}
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// Shared cells
// ═════════════════════════════════════════════════════

function StatCell({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statCellLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.statCellValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════
// Styles — clean, theme-driven, no monospace / scanlines
// ═════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: { flex: 1 },

  mapLayer: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1,
  },
  // Web-only bleed: phone frame in App.tsx reserves 54px of paddingTop for the
  // simulated Dynamic Island. Pull the map up by that amount so the dark map
  // surface fills the entire phone frame and the notch sits on top of the map
  // rather than on a separate white bar.
  mapLayerWebBleed: {
    top: -54,
  },

  // ── Header ──
  headerWrap: {
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // ── Tab bar ──
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Panel ──
  panelWrap: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    zIndex: 10,
  },
  panel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  panelTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // ── Hero stat (live distance) ──
  heroStat: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 6,
  },
  heroValue: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // ── Stat grid ──
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  statCell: {
    width: '50%',
    paddingVertical: 8,
  },
  statCellLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statCellValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  divider: {
    height: 1,
    marginVertical: 4,
    marginBottom: 12,
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
  },

  // ── Activity-type chips ──
  typeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    gap: 4,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Buttons ──
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // ── History rows ──
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  historyIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  historyName: {
    fontSize: 14,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  historyDist: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Radio grid ──
  radioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  radioBtn: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: 8,
  },
  radioBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
