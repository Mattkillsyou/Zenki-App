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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useSound } from '../context/SoundContext';
import { spacing, borderRadius } from '../theme';
import { TimerPreset, TimerSessionLog } from '../types/activity';

type TimerTab = 'round' | 'interval' | 'stopwatch' | 'meditate';

const TIMER_PRESETS_KEY = '@zenki_timer_presets';
const TIMER_HISTORY_KEY = '@zenki_timer_history';

/** Default presets available out of the box. */
const DEFAULT_PRESETS: TimerPreset[] = [
  { id: 'preset-tabata', name: 'Tabata', type: 'interval', rounds: 8, workSeconds: 20, restSeconds: 10, createdAt: '' },
  { id: 'preset-emom10', name: 'EMOM 10', type: 'emom', rounds: 10, workSeconds: 60, restSeconds: 0, createdAt: '' },
  { id: 'preset-hiit', name: '20-10 HIIT', type: 'interval', rounds: 12, workSeconds: 20, restSeconds: 10, createdAt: '' },
  { id: 'preset-fight', name: '5-Round Fight', type: 'custom', rounds: 5, workSeconds: 300, restSeconds: 60, createdAt: '' },
];

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

  // Saved presets
  const [presets, setPresets] = useState<TimerPreset[]>(DEFAULT_PRESETS);
  const [history, setHistory] = useState<TimerSessionLog[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(TIMER_PRESETS_KEY).then((raw) => {
      if (raw) try { const parsed = JSON.parse(raw); if (parsed.length > 0) setPresets(parsed); } catch {}
    });
    AsyncStorage.getItem(TIMER_HISTORY_KEY).then((raw) => {
      if (raw) try { setHistory(JSON.parse(raw)); } catch {}
    });
  }, []);

  const savePreset = (preset: TimerPreset) => {
    const next = [preset, ...presets.filter((p) => p.id !== preset.id)];
    setPresets(next);
    AsyncStorage.setItem(TIMER_PRESETS_KEY, JSON.stringify(next));
  };

  const logSession = (session: TimerSessionLog) => {
    const next = [session, ...history].slice(0, 50);
    setHistory(next);
    AsyncStorage.setItem(TIMER_HISTORY_KEY, JSON.stringify(next));
  };

  // Weekly summary
  const weekMinutes = React.useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 86400000;
    return Math.round(
      history
        .filter((h) => now - new Date(h.date).getTime() < weekMs)
        .reduce((sum, h) => sum + h.totalDurationSeconds, 0) / 60
    );
  }, [history]);

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
            { key: 'interval' as TimerTab, label: 'HIIT', icon: 'fitness-outline' as const },
            { key: 'stopwatch' as TimerTab, label: 'Watch', icon: 'stopwatch-outline' as const },
            { key: 'meditate' as TimerTab, label: 'Meditate', icon: 'leaf-outline' as const },
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

      {tab === 'round' && <RoundTimer onBeep={() => play('navigate')} onComplete={logSession} />}
      {tab === 'interval' && <IntervalTimer onBeep={() => play('navigate')} onComplete={logSession} presets={presets} onSavePreset={savePreset} />}
      {tab === 'stopwatch' && <StopwatchAndCountdown />}
      {tab === 'meditate' && <MeditationTimer onComplete={logSession} />}

      {/* Timer history (collapsible) */}
      {history.length > 0 && tab !== 'meditate' && (
        <View style={[styles.historySection, { borderTopColor: colors.border }]}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.historyTitle, { color: colors.textMuted }]}>TIMER HISTORY</Text>
              <Text style={[styles.historySummary, { color: colors.gold }]}>{weekMinutes}m this week</Text>
            </View>
            {history.slice(0, 5).map((h) => (
              <View key={h.id} style={[styles.historyRow, { borderBottomColor: colors.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyName, { color: colors.textPrimary }]}>
                    {h.presetName || h.type}
                  </Text>
                  <Text style={[styles.historyMeta, { color: colors.textMuted }]}>
                    {new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {Math.round(h.totalDurationSeconds / 60)}m · {h.roundsCompleted}/{h.roundsTarget} rounds
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════
// Round Timer — configurable work / rest / rounds
// ═════════════════════════════════════════════════════

function RoundTimer({ onBeep, onComplete }: { onBeep: () => void; onComplete?: (log: TimerSessionLog) => void }) {
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
          onComplete?.({
            id: 'tl_' + Date.now().toString(36),
            memberId: '',
            type: 'round',
            totalDurationSeconds: rounds * (workMin + restMin) * 60,
            roundsCompleted: rounds,
            roundsTarget: rounds,
            date: new Date().toISOString(),
          });
          return 0;
        } else if (phase === 'rest') {
          if (currentRound < rounds) {
            setCurrentRound((c) => c + 1);
            setPhase('work');
            return workMin * 60;
          }
          setRunning(false);
          setPhase('done');
          onComplete?.({
            id: 'tl_' + Date.now().toString(36),
            memberId: '',
            type: 'round',
            totalDurationSeconds: rounds * (workMin + restMin) * 60,
            roundsCompleted: rounds,
            roundsTarget: rounds,
            date: new Date().toISOString(),
          });
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

function IntervalTimer({ onBeep, onComplete, presets, onSavePreset }: {
  onBeep: () => void;
  onComplete?: (log: TimerSessionLog) => void;
  presets?: TimerPreset[];
  onSavePreset?: (preset: TimerPreset) => void;
}) {
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

      {/* Saved presets row */}
      {presets && presets.length > 0 && phase === 'idle' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {presets.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.presetBtn, { backgroundColor: colors.surface, borderColor: colors.border, paddingHorizontal: 14 }]}
              onPress={() => {
                setWorkSec(p.workSeconds);
                setRestSec(p.restSeconds);
                setRounds(p.rounds);
              }}
            >
              <Ionicons name="bookmark" size={14} color={colors.gold} />
              <Text style={[styles.presetBtnText, { color: colors.textPrimary }]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={[styles.configCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <NumberRow label="Work (sec)" value={workSec} setValue={setWorkSec} step={5} disabled={phase !== 'idle'} />
        <NumberRow label="Rest (sec)" value={restSec} setValue={setRestSec} step={5} disabled={phase !== 'idle'} />
        <NumberRow label="Rounds" value={rounds} setValue={setRounds} min={1} disabled={phase !== 'idle'} />
      </View>

      {/* Save as Preset button */}
      {phase === 'idle' && onSavePreset && (
        <TouchableOpacity
          style={[styles.presetBtn, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}
          onPress={() => {
            Alert.prompt
              ? Alert.prompt('Save Preset', 'Enter a name for this timer preset', (name: string) => {
                  if (name.trim()) {
                    onSavePreset({
                      id: 'tp_' + Date.now().toString(36),
                      name: name.trim(),
                      type: 'interval',
                      rounds,
                      workSeconds: workSec,
                      restSeconds: restSec,
                      createdAt: new Date().toISOString(),
                    });
                  }
                })
              : (() => {
                  const name = `${workSec}/${restSec} × ${rounds}`;
                  onSavePreset({
                    id: 'tp_' + Date.now().toString(36),
                    name,
                    type: 'interval',
                    rounds,
                    workSeconds: workSec,
                    restSeconds: restSec,
                    createdAt: new Date().toISOString(),
                  });
                  Alert.alert('Saved', `Preset "${name}" saved.`);
                })()
          }}
        >
          <Ionicons name="bookmark-outline" size={16} color={colors.gold} />
          <Text style={[styles.presetBtnText, { color: colors.gold }]}>Save as Preset</Text>
        </TouchableOpacity>
      )}
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

// ═════════════════════════════════════════════════════
// Meditation Timer — gentle singing bowl tones
// Presets: 21 min, 30 min, 60 min
// ═════════════════════════════════════════════════════

/** Play a pleasant singing-bowl tone via Web Audio API. */
function playSingingBowl(isEnd: boolean = false) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    Vibration.vibrate(isEnd ? [0, 300, 200, 300] : [0, 200]);
    return;
  }
  try {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();

    // Layer 3 sine oscillators at harmonic intervals for a rich bowl sound
    const freqs = isEnd ? [261.63, 392, 523.25] : [392, 523.25, 783.99]; // C4-G4-C5 or G4-C5-G5
    const duration = isEnd ? 4.0 : 2.5;

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      // Gentle attack, long natural decay
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.12 - i * 0.02, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.15); // slight stagger for shimmer
      osc.stop(ctx.currentTime + duration + 0.1);
    });
  } catch { /* ignore */ }
}

const MEDITATION_PRESETS = [
  { minutes: 21, label: 'Focus' },
  { minutes: 30, label: 'Deep' },
  { minutes: 60, label: 'Extended' },
];

function MeditationTimer({ onComplete }: { onComplete?: (log: TimerSessionLog) => void } = {}) {
  const { colors } = useTheme();
  const [selectedMinutes, setSelectedMinutes] = useState(21);
  const [remaining, setRemaining] = useState(21 * 60);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const totalSecsRef = useRef(21 * 60);

  // Reset when preset changes while not running
  useEffect(() => {
    if (!running && !done) {
      setRemaining(selectedMinutes * 60);
      totalSecsRef.current = selectedMinutes * 60;
    }
  }, [selectedMinutes, running, done]);

  const handleStart = () => {
    playSingingBowl(false); // opening bell
    setDone(false);
    setRunning(true);
    startTimeRef.current = Date.now();
    totalSecsRef.current = remaining;

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const left = Math.max(0, totalSecsRef.current - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(intervalRef.current!);
        intervalRef.current = null;
        setRunning(false);
        setDone(true);
        playSingingBowl(true); // closing bell — richer, longer
      }
    }, 250);
  };

  const handleStop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setRunning(false);
  };

  const handleReset = () => {
    handleStop();
    setDone(false);
    setRemaining(selectedMinutes * 60);
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const progress = totalSecsRef.current > 0 ? 1 - (remaining / totalSecsRef.current) : 0;

  return (
    <View style={styles.meditationWrap}>
      {/* Preset buttons */}
      <View style={styles.meditationPresets}>
        {MEDITATION_PRESETS.map((p) => {
          const active = selectedMinutes === p.minutes && !running;
          return (
            <TouchableOpacity
              key={p.minutes}
              style={[
                styles.meditationPreset,
                {
                  backgroundColor: active ? colors.gold : colors.surface,
                  borderColor: active ? colors.gold : colors.border,
                },
              ]}
              onPress={() => { if (!running) { setSelectedMinutes(p.minutes); setDone(false); } }}
              disabled={running}
            >
              <Text style={[styles.meditationPresetTime, { color: active ? '#000' : colors.textPrimary }]}>
                {p.minutes}
              </Text>
              <Text style={[styles.meditationPresetLabel, { color: active ? '#000' : colors.textMuted }]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Large timer display */}
      <Text style={[styles.meditationTimer, { color: done ? colors.gold : colors.textPrimary }]}>
        {pad2(minutes)}:{pad2(seconds)}
      </Text>

      {/* Status */}
      <Text style={[styles.meditationStatus, { color: done ? colors.gold : running ? colors.success : colors.textMuted }]}>
        {done ? 'SESSION COMPLETE' : running ? 'BREATHE' : 'READY'}
      </Text>

      {/* Progress bar */}
      {(running || done) && (
        <View style={{ width: '80%', height: 4, borderRadius: 2, backgroundColor: colors.backgroundElevated, marginBottom: 24, overflow: 'hidden' }}>
          <View style={{ width: `${Math.min(100, progress * 100)}%`, height: '100%', backgroundColor: done ? colors.gold : colors.success, borderRadius: 2 }} />
        </View>
      )}

      {/* Control button */}
      {!running && !done && (
        <TouchableOpacity
          style={[styles.meditationBtn, { backgroundColor: colors.gold }]}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={32} color="#000" />
        </TouchableOpacity>
      )}
      {running && (
        <TouchableOpacity
          style={[styles.meditationBtn, { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.border }]}
          onPress={handleStop}
          activeOpacity={0.8}
        >
          <Ionicons name="pause" size={32} color={colors.textPrimary} />
        </TouchableOpacity>
      )}
      {done && (
        <TouchableOpacity
          style={[styles.meditationBtn, { backgroundColor: colors.gold }]}
          onPress={handleReset}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={32} color="#000" />
        </TouchableOpacity>
      )}

      {/* Hint text */}
      <Text style={[styles.meditationHint, { color: colors.textMuted }]}>
        {running
          ? 'Close your eyes. Focus on your breath. The bell will ring when your session is complete.'
          : done
          ? `${selectedMinutes} minutes of stillness. Well done.`
          : 'Choose a duration and press play. A gentle bowl tone will mark the beginning and end of your session.'}
      </Text>
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
  // Meditation
  meditationWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    alignItems: 'center',
  },
  meditationPresets: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  meditationPreset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  meditationPresetTime: {
    fontSize: 22,
    fontWeight: '900',
  },
  meditationPresetLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  meditationTimer: {
    fontSize: 64,
    fontWeight: '200',
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
    marginBottom: 8,
  },
  meditationStatus: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
    marginBottom: 24,
  },
  meditationBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  meditationHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 32,
    fontStyle: 'italic',
  },

  lapsHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  lapRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  lapIndex: { fontSize: 13, fontWeight: '700' },
  lapValue: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },

  // ── Timer history ──
  historySection: {
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  historySummary: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  historyName: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
});
