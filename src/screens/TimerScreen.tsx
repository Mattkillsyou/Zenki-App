import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  AppState,
  Vibration,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSound } from '../context/SoundContext';
import { spacing, borderRadius } from '../theme';

type TimerTab = 'round' | 'interval' | 'stopwatch';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}
function formatMMSS(totalSec: number): string {
  const m = Math.floor(Math.max(0, totalSec) / 60);
  const s = Math.max(0, totalSec) % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

export function TimerScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { play } = useSound();
  const initialTab: TimerTab = (route?.params?.mode as TimerTab) ?? 'round';
  const [tab, setTab] = useState<TimerTab>(initialTab);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Timer</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tab switcher */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(
          [
            { key: 'round' as TimerTab, label: 'Round', icon: 'timer-outline' as const },
            { key: 'interval' as TimerTab, label: 'Interval', icon: 'fitness-outline' as const },
            { key: 'stopwatch' as TimerTab, label: 'Stopwatch', icon: 'stopwatch-outline' as const },
          ]
        ).map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={16} color={active ? '#000' : colors.textSecondary} />
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textSecondary }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {tab === 'round' && <RoundTimer onBeep={() => play('navigate')} />}
      {tab === 'interval' && <IntervalTimer onBeep={() => play('navigate')} />}
      {tab === 'stopwatch' && <StopwatchAndCountdown />}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════
// Round Timer — configurable work / rest / rounds
// ═════════════════════════════════════════════════════

function RoundTimer({ onBeep }: { onBeep: () => void }) {
  const { colors } = useTheme();
  const [workMin, setWorkMin] = useState(5);
  const [restMin, setRestMin] = useState(1);
  const [rounds, setRounds] = useState(5);

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'work' | 'rest' | 'done' | 'idle'>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [remaining, setRemaining] = useState(workMin * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when config changes while idle
  useEffect(() => {
    if (!running && phase === 'idle') setRemaining(workMin * 60);
  }, [workMin, running, phase]);

  const start = () => {
    setRunning(true);
    setPhase('work');
    setCurrentRound(1);
    setRemaining(workMin * 60);
  };

  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setPhase('idle');
    setCurrentRound(1);
    setRemaining(workMin * 60);
  };

  // Tick
  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;

        // Transition
        onBeep();
        Vibration.vibrate(200);

        if (phase === 'work') {
          if (restMin > 0) {
            setPhase('rest');
            return restMin * 60;
          }
          // No rest — go straight to next round or done
          if (currentRound < rounds) {
            setCurrentRound((c) => c + 1);
            return workMin * 60;
          }
          setRunning(false);
          setPhase('done');
          return 0;
        } else if (phase === 'rest') {
          if (currentRound < rounds) {
            setCurrentRound((c) => c + 1);
            setPhase('work');
            return workMin * 60;
          }
          setRunning(false);
          setPhase('done');
          return 0;
        }
        return 0;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, phase, currentRound, rounds, workMin, restMin, onBeep]);

  // Pause on background
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && running) setRunning(false);
    });
    return () => sub.remove();
  }, [running]);

  const phaseColor =
    phase === 'work' ? colors.red :
    phase === 'rest' ? colors.info :
    phase === 'done' ? colors.success :
    colors.textMuted;
  const phaseLabel =
    phase === 'work' ? 'WORK' :
    phase === 'rest' ? 'REST' :
    phase === 'done' ? 'DONE' :
    'READY';

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* Big countdown */}
      <View style={[styles.bigDisplay, { backgroundColor: colors.surface, borderColor: phaseColor }]}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={[styles.countdown, { color: colors.textPrimary }]}>
          {formatMMSS(remaining)}
        </Text>
        <Text style={[styles.roundLabel, { color: colors.textMuted }]}>
          ROUND {currentRound} / {rounds}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controlRow}>
        {phase === 'idle' && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.red }]} onPress={start}>
            <Ionicons name="play" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>START</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && phase !== 'done' && running && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.warning }]} onPress={pause}>
            <Ionicons name="pause" size={20} color="#000" />
            <Text style={[styles.primaryBtnText, { color: '#000' }]}>PAUSE</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && phase !== 'done' && !running && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.red }]} onPress={resume}>
            <Ionicons name="play" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>RESUME</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && (
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={reset}>
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Config */}
      <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <NumberRow label="Work (min)" value={workMin} setValue={setWorkMin} disabled={phase !== 'idle'} />
        <NumberRow label="Rest (min)" value={restMin} setValue={setRestMin} disabled={phase !== 'idle'} />
        <NumberRow label="Rounds" value={rounds} setValue={setRounds} min={1} disabled={phase !== 'idle'} />
      </View>
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════
// Interval Timer — Tabata preset + custom
// ═════════════════════════════════════════════════════

function IntervalTimer({ onBeep }: { onBeep: () => void }) {
  const { colors } = useTheme();
  const [workSec, setWorkSec] = useState(20);
  const [restSec, setRestSec] = useState(10);
  const [rounds, setRounds] = useState(8);

  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'work' | 'rest' | 'done' | 'idle'>('idle');
  const [currentRound, setCurrentRound] = useState(1);
  const [remaining, setRemaining] = useState(workSec);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running && phase === 'idle') setRemaining(workSec);
  }, [workSec, running, phase]);

  const applyTabata = () => {
    setWorkSec(20);
    setRestSec(10);
    setRounds(8);
  };

  const start = () => {
    setRunning(true);
    setPhase('work');
    setCurrentRound(1);
    setRemaining(workSec);
  };
  const pause = () => setRunning(false);
  const resume = () => setRunning(true);
  const reset = () => {
    setRunning(false);
    setPhase('idle');
    setCurrentRound(1);
    setRemaining(workSec);
  };

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r > 1) return r - 1;

        onBeep();
        Vibration.vibrate(150);

        if (phase === 'work') {
          if (restSec > 0) {
            setPhase('rest');
            return restSec;
          }
          if (currentRound < rounds) {
            setCurrentRound((c) => c + 1);
            return workSec;
          }
          setRunning(false);
          setPhase('done');
          return 0;
        } else if (phase === 'rest') {
          if (currentRound < rounds) {
            setCurrentRound((c) => c + 1);
            setPhase('work');
            return workSec;
          }
          setRunning(false);
          setPhase('done');
          return 0;
        }
        return 0;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, phase, currentRound, rounds, workSec, restSec, onBeep]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' && running) setRunning(false);
    });
    return () => sub.remove();
  }, [running]);

  const phaseColor =
    phase === 'work' ? colors.red :
    phase === 'rest' ? colors.info :
    phase === 'done' ? colors.success :
    colors.textMuted;
  const phaseLabel =
    phase === 'work' ? 'GO' :
    phase === 'rest' ? 'REST' :
    phase === 'done' ? 'DONE' :
    'READY';

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <View style={[styles.bigDisplay, { backgroundColor: colors.surface, borderColor: phaseColor }]}>
        <Text style={[styles.phaseLabel, { color: phaseColor }]}>{phaseLabel}</Text>
        <Text style={[styles.countdown, { color: colors.textPrimary }]}>
          {formatMMSS(remaining)}
        </Text>
        <Text style={[styles.roundLabel, { color: colors.textMuted }]}>
          INTERVAL {currentRound} / {rounds}
        </Text>
      </View>

      <View style={styles.controlRow}>
        {phase === 'idle' && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.red }]} onPress={start}>
            <Ionicons name="play" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>START</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && phase !== 'done' && running && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.warning }]} onPress={pause}>
            <Ionicons name="pause" size={20} color="#000" />
            <Text style={[styles.primaryBtnText, { color: '#000' }]}>PAUSE</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && phase !== 'done' && !running && (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.red }]} onPress={resume}>
            <Ionicons name="play" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>RESUME</Text>
          </TouchableOpacity>
        )}
        {phase !== 'idle' && (
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={reset}>
            <Ionicons name="refresh" size={18} color={colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>RESET</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.presetBtn, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}
        onPress={applyTabata}
        disabled={phase !== 'idle'}
      >
        <Ionicons name="flash" size={16} color={colors.gold} />
        <Text style={[styles.presetBtnText, { color: colors.gold }]}>Tabata preset (20/10 × 8)</Text>
      </TouchableOpacity>

      <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <NumberRow label="Work (sec)" value={workSec} setValue={setWorkSec} step={5} disabled={phase !== 'idle'} />
        <NumberRow label="Rest (sec)" value={restSec} setValue={setRestSec} step={5} disabled={phase !== 'idle'} />
        <NumberRow label="Rounds" value={rounds} setValue={setRounds} min={1} disabled={phase !== 'idle'} />
      </View>
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════
// Stopwatch + Countdown
// ═════════════════════════════════════════════════════

function StopwatchAndCountdown() {
  const { colors } = useTheme();
  const [mode, setMode] = useState<'stopwatch' | 'countdown'>('stopwatch');

  // Stopwatch
  const [elapsed, setElapsed] = useState(0);
  const [laps, setLaps] = useState<number[]>([]);

  // Countdown
  const [target, setTarget] = useState(180); // 3 min default
  const [remaining, setRemaining] = useState(target);

  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode === 'countdown' && !running) setRemaining(target);
  }, [target, mode, running]);

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      if (mode === 'stopwatch') {
        setElapsed((e) => e + 1);
      } else {
        setRemaining((r) => {
          if (r <= 1) {
            Vibration.vibrate([0, 200, 100, 200]);
            setRunning(false);
            return 0;
          }
          return r - 1;
        });
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, mode]);

  const reset = () => {
    setRunning(false);
    if (mode === 'stopwatch') {
      setElapsed(0);
      setLaps([]);
    } else {
      setRemaining(target);
    }
  };
  const lap = () => setLaps((prev) => [elapsed, ...prev]);

  const display = mode === 'stopwatch' ? elapsed : remaining;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {/* Mode toggle */}
      <View style={[styles.tabRow, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 0, marginHorizontal: 0 }]}>
        {(['stopwatch', 'countdown'] as const).map((m) => {
          const active = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => {
                setMode(m);
                setRunning(false);
                setElapsed(0);
                setLaps([]);
                setRemaining(target);
              }}
            >
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textSecondary }]}>
                {m === 'stopwatch' ? 'Stopwatch' : 'Countdown'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.bigDisplay, { backgroundColor: colors.surface, borderColor: colors.gold }]}>
        <Text style={[styles.phaseLabel, { color: colors.gold }]}>
          {mode === 'stopwatch' ? 'ELAPSED' : 'REMAINING'}
        </Text>
        <Text style={[styles.countdown, { color: colors.textPrimary }]}>
          {formatMMSS(display)}
        </Text>
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: running ? colors.warning : colors.red }]}
          onPress={() => setRunning((r) => !r)}
        >
          <Ionicons name={running ? 'pause' : 'play'} size={20} color={running ? '#000' : '#FFF'} />
          <Text style={[styles.primaryBtnText, { color: running ? '#000' : '#FFF' }]}>
            {running ? 'PAUSE' : 'START'}
          </Text>
        </TouchableOpacity>
        {mode === 'stopwatch' && running && (
          <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={lap}>
            <Ionicons name="flag" size={18} color={colors.textSecondary} />
            <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>LAP</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.secondaryBtn, { borderColor: colors.border }]} onPress={reset}>
          <Ionicons name="refresh" size={18} color={colors.textSecondary} />
          <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>RESET</Text>
        </TouchableOpacity>
      </View>

      {mode === 'countdown' && (
        <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <NumberRow label="Target (sec)" value={target} setValue={setTarget} step={30} min={5} disabled={running} />
        </View>
      )}

      {mode === 'stopwatch' && laps.length > 0 && (
        <View style={[styles.lapsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.lapsHeader, { color: colors.textSecondary }]}>SPLITS</Text>
          {laps.map((l, i) => (
            <View key={i} style={styles.lapRow}>
              <Text style={[styles.lapIndex, { color: colors.textMuted }]}>#{laps.length - i}</Text>
              <Text style={[styles.lapValue, { color: colors.textPrimary }]}>{formatMMSS(l)}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ═════════════════════════════════════════════════════
// Shared number-stepper row
// ═════════════════════════════════════════════════════

function NumberRow({
  label,
  value,
  setValue,
  step = 1,
  min = 0,
  disabled = false,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  step?: number;
  min?: number;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.numberRow}>
      <Text style={[styles.numberLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.numberControls}>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.surfaceSecondary, opacity: disabled ? 0.5 : 1 }]}
          onPress={() => !disabled && setValue(Math.max(min, value - step))}
          disabled={disabled}
        >
          <Ionicons name="remove" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.numberValue, { color: colors.textPrimary }]}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, { backgroundColor: colors.surfaceSecondary, opacity: disabled ? 0.5 : 1 }]}
          onPress={() => !disabled && setValue(value + step)}
          disabled={disabled}
        >
          <Ionicons name="add" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },

  tabRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  body: { padding: spacing.lg, paddingBottom: 120, gap: 16 },

  bigDisplay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderRadius: 22,
    borderWidth: 2,
  },
  phaseLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 4 },
  countdown: { fontSize: 72, fontWeight: '900', letterSpacing: -2, marginVertical: 8, fontVariant: ['tabular-nums'] },
  roundLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 1.8 },

  controlRow: { flexDirection: 'row', gap: 10, justifyContent: 'center' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 1 },

  presetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  presetBtnText: { fontSize: 13, fontWeight: '700' },

  configCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  numberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  numberLabel: { fontSize: 14, fontWeight: '600', textAlign: 'left' },
  numberControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  numberValue: { minWidth: 38, textAlign: 'center', fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },

  lapsCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    gap: 6,
  },
  lapsHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  lapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lapIndex: { fontSize: 13, fontWeight: '700' },
  lapValue: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
