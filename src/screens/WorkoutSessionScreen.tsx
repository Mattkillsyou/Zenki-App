import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer, HealthKitBadge } from '../components';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHeartRate } from '../context/HeartRateContext';
import { useNutrition } from '../context/NutritionContext';
import { ActivityType, ACTIVITY_LABELS } from '../types/heartRate';
import {
  bpmToZone,
  zoneColor,
  computeZones,
  formatDuration,
  strainColor,
  computeStrain,
  caloriesPerMinute,
} from '../utils/heartRate';
import { spacing } from '../theme';
import { useSenpai } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';

const ACTIVITY_OPTIONS: ActivityType[] = [
  'martial_arts', 'strength', 'cardio', 'hiit', 'yoga', 'open_mat', 'other',
];

export function WorkoutSessionScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    bleStatus,
    connectedDeviceName,
    scanAndConnect,
    disconnect,
    currentBpm,
    isRecording,
    startSession,
    stopSession,
  } = useHeartRate();
  const { profileFor, latestWeight } = useNutrition();
  const { state: senpaiState, triggerReaction: senpaiTrigger, shouldReact: senpaiShouldReact } = useSenpai();

  // Pull real user profile data for accurate calculations
  const profile = user ? profileFor(user.id) : null;
  const latestW = user ? latestWeight(user.id) : null;
  const age = profile?.ageYears || 30;
  const weightKg = latestW
    ? (latestW.unit === 'lb' ? latestW.weight * 0.453592 : latestW.weight)
    : 80;
  const isMale = profile?.sex !== 'female';

  const [selectedActivity, setSelectedActivity] = useState<ActivityType>('martial_arts');
  const [elapsed, setElapsed] = useState(0);
  const [liveCalories, setLiveCalories] = useState(0);
  const [liveStrain, setLiveStrain] = useState(0);

  // Accumulators — refs to avoid resetting on re-render
  const startTimeRef = useRef(0);
  const caloriesAccRef = useRef(0);
  const zonesAccRef = useRef({ zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 });
  const initedRef = useRef(false);
  // Ref mirror of currentBpm — interval reads this instead of stale closure
  const bpmRef = useRef(0);
  useEffect(() => { bpmRef.current = currentBpm; }, [currentBpm]);

  const zones = computeZones(age);
  const currentZone = currentBpm > 0 ? bpmToZone(currentBpm, age) : 0;
  const currentZoneColor = zoneColor(currentZone);
  const currentZoneName = currentZone > 0 ? zones[currentZone - 1]?.name : 'Below zones';

  // Initialize accumulators ONCE when recording starts
  useEffect(() => {
    if (isRecording && !initedRef.current) {
      startTimeRef.current = Date.now();
      caloriesAccRef.current = 0;
      zonesAccRef.current = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
      initedRef.current = true;
    }
    if (!isRecording) {
      initedRef.current = false;
    }
  }, [isRecording]);

  // Timer tick — update elapsed, accumulate calories + strain every second
  // Only depends on isRecording (NOT currentBpm — avoids the accumulator-reset bug)
  useEffect(() => {
    if (!isRecording) return;

    const tick = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);

      // Accumulate every tick — read BPM from ref (not stale closure)
      const bpm = bpmRef.current;
      if (bpm > 0) {
        const kcalSec = caloriesPerMinute(bpm, weightKg, age, isMale) / 60;
        caloriesAccRef.current += kcalSec;
        setLiveCalories(Math.round(caloriesAccRef.current));

        const z = bpmToZone(bpm, age);
        if (z >= 1 && z <= 5) {
          const zKey = `zone${z}` as keyof typeof zonesAccRef.current;
          zonesAccRef.current[zKey] += 1 / 60; // 1 second = 1/60 minute
        }
        setLiveStrain(computeStrain(zonesAccRef.current));
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [isRecording]); // eslint-disable-line react-hooks/exhaustive-deps
  // currentBpm is read from state inside the interval — not a dependency

  const handleStart = () => {
    if (!user) return;
    setElapsed(0);
    setLiveCalories(0);
    setLiveStrain(0);
    startSession(selectedActivity, user.id);
    if (senpaiState.enabled && senpaiShouldReact()) {
      try { senpaiTrigger('encouraging', randomDialogue('workoutStart'), 3000); } catch { /* ignore */ }
    }
  };

  const handleStop = () => {
    Alert.alert(
      'End Session?',
      `${formatDuration(elapsed)} · ${liveCalories} kcal · Strain ${liveStrain.toFixed(1)}`,
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'End & Save',
          style: 'destructive',
          onPress: () => {
            const session = stopSession(age, weightKg, isMale);
            if (session) {
              navigation.goBack();
            }
          },
        },
      ],
    );
  };

  const handleBLEToggle = async () => {
    if (bleStatus === 'connected') {
      disconnect();
    } else if (bleStatus === 'disconnected') {
      await scanAndConnect();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => {
            if (isRecording) {
              Alert.alert('Session Running', 'Stop the session before leaving.');
            } else {
              navigation.goBack();
            }
          }}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isRecording ? 'Session Active' : 'Start Session'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <HealthKitBadge style={{ marginBottom: spacing.md }} />
        {/* BLE status chip */}
        <SoundPressable
          style={[styles.bleChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={handleBLEToggle}
          disabled={bleStatus === 'unavailable' || bleStatus === 'scanning' || bleStatus === 'connecting'}
        >
          <Ionicons
            name={bleStatus === 'connected' ? 'bluetooth' : 'bluetooth-outline'}
            size={16}
            color={
              bleStatus === 'connected' ? '#22C55E' :
              bleStatus === 'scanning' || bleStatus === 'connecting' ? colors.gold :
              colors.textMuted
            }
          />
          <Text style={[styles.bleText, { color: colors.textSecondary }]}>
            {bleStatus === 'connected' ? connectedDeviceName :
             bleStatus === 'scanning' ? 'Scanning…' :
             bleStatus === 'connecting' ? 'Connecting…' :
             bleStatus === 'unavailable' ? 'Demo Mode (no BLE on web)' :
             'Tap to pair HR strap'}
          </Text>
        </SoundPressable>

        {/* ── HERO: Live HR display ── */}
        <View style={[styles.hrHero, { backgroundColor: isRecording ? currentZoneColor + '15' : colors.surface, borderColor: isRecording ? currentZoneColor : colors.border }]}>
          <Text style={[styles.hrLabel, { color: isRecording ? currentZoneColor : colors.textMuted }]}>
            {isRecording ? currentZoneName.toUpperCase() : 'HEART RATE'}
          </Text>
          <View style={styles.hrRow}>
            <Ionicons
              name="heart"
              size={36}
              color={isRecording && currentBpm > 0 ? currentZoneColor : colors.textMuted}
            />
            <Text style={[styles.hrNumber, { color: isRecording && currentBpm > 0 ? colors.textPrimary : colors.textMuted }]}>
              {currentBpm > 0 ? currentBpm : '--'}
            </Text>
            <Text style={[styles.hrUnit, { color: colors.textMuted }]}>BPM</Text>
          </View>
          {isRecording && currentZone > 0 && (
            <View style={styles.zoneBarRow}>
              {[1, 2, 3, 4, 5].map((z) => (
                <View
                  key={z}
                  style={[
                    styles.zoneBarSegment,
                    {
                      backgroundColor: z <= currentZone ? zoneColor(z) : colors.backgroundElevated,
                      flex: 1,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Live stats (visible during recording) ── */}
        {isRecording && (
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="time-outline" size={18} color={colors.gold} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{formatDuration(elapsed)}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Duration</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flame" size={18} color={strainColor(liveStrain)} />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{liveStrain.toFixed(1)}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Strain</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flash" size={18} color="#F97316" />
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>{liveCalories}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>kcal</Text>
            </View>
          </View>
        )}

        {/* ── Activity type picker (before start) ── */}
        {!isRecording && (
          <View style={styles.activitySection}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACTIVITY TYPE</Text>
            <View style={styles.activityGrid}>
              {ACTIVITY_OPTIONS.map((act) => {
                const active = act === selectedActivity;
                return (
                  <SoundPressable
                    key={act}
                    style={[
                      styles.activityChip,
                      {
                        backgroundColor: active ? colors.gold : colors.surface,
                        borderColor: active ? colors.gold : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedActivity(act)}
                  >
                    <Text style={[styles.activityText, { color: active ? '#000' : colors.textSecondary }]}>
                      {ACTIVITY_LABELS[act]}
                    </Text>
                  </SoundPressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Zone reference (before start) ── */}
        {!isRecording && (
          <View style={styles.zonesSection}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>HR ZONES</Text>
            {zones.map((z) => (
              <View key={z.zone} style={[styles.zoneRow, { borderLeftColor: z.color }]}>
                <Text style={[styles.zoneNum, { color: z.color }]}>Z{z.zone}</Text>
                <Text style={[styles.zoneName, { color: colors.textPrimary }]}>{z.name}</Text>
                <Text style={[styles.zoneBpm, { color: colors.textMuted }]}>{z.minBpm}–{z.maxBpm} bpm</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Start / Stop button ── */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background }]}>
        {isRecording ? (
          <SoundPressable
            style={[styles.stopBtn, { backgroundColor: colors.red }]}
            onPress={handleStop}
          >
            <Ionicons name="stop" size={22} color="#FFF" />
            <Text style={styles.btnText}>END SESSION</Text>
          </SoundPressable>
        ) : (
          <SoundPressable
            style={[styles.startBtn, { backgroundColor: colors.gold }]}
            onPress={handleStart}
          >
            <Ionicons name="play" size={22} color="#000" />
            <Text style={[styles.btnText, { color: '#000' }]}>
              START {ACTIVITY_LABELS[selectedActivity].toUpperCase()}
            </Text>
          </SoundPressable>
        )}
      </View>
      </ScreenContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: 120 },

  bleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  bleText: { fontSize: 12, fontWeight: '600' },

  hrHero: {
    alignItems: 'center',
    paddingVertical: 28,
    borderRadius: 24,
    borderWidth: 2,
    marginBottom: 16,
    gap: 8,
  },
  hrLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  hrRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  hrNumber: { fontSize: 72, fontWeight: '900', letterSpacing: -3 },
  hrUnit: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  zoneBarRow: { flexDirection: 'row', gap: 3, width: '80%', height: 6, marginTop: 8 },
  zoneBarSegment: { borderRadius: 3 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
  },
  statValue: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  activitySection: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  activityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  activityChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  activityText: { fontSize: 13, fontWeight: '700' },

  zonesSection: { marginBottom: 20 },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    borderLeftWidth: 4,
    marginBottom: 4,
  },
  zoneNum: { fontSize: 14, fontWeight: '900', width: 30 },
  zoneName: { fontSize: 14, fontWeight: '600', flex: 1 },
  zoneBpm: { fontSize: 12, fontWeight: '500' },

  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: spacing.lg,
    paddingBottom: 32,
  },
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
  },
  btnText: { fontSize: 16, fontWeight: '900', letterSpacing: 1.5, color: '#FFF' },
});
