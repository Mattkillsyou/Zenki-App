import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HRSession,
  HRSample,
  BLEStatus,
  ActivityType,
} from '../types/heartRate';
import { generateId } from '../utils/generateId';
import {
  computeZoneBreakdown,
  computeStrain,
  estimateCalories,
  avgBpm,
  maxBpmFromSamples,
  minBpmFromSamples,
} from '../utils/heartRate';

const STORAGE_KEY = '@zenki_hr_sessions';
const BLE_DEVICE_KEY = '@zenki_ble_device';

/** Max samples persisted per session to prevent AsyncStorage bloat.
 *  At 1 sample/sec, a 90-min session produces ~5400 samples.
 *  We keep every Nth so the stored count stays under ~600. */
const MAX_STORED_SAMPLES = 600;

function downsample(samples: HRSample[], maxCount: number): HRSample[] {
  if (samples.length <= maxCount) return samples;
  const step = samples.length / maxCount;
  const result: HRSample[] = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(samples[Math.floor(i * step)]);
  }
  // Always include the very last sample
  if (result[result.length - 1] !== samples[samples.length - 1]) {
    result.push(samples[samples.length - 1]);
  }
  return result;
}

interface HeartRateContextValue {
  bleStatus: BLEStatus;
  connectedDeviceName: string | null;
  scanAndConnect: () => Promise<boolean>;
  disconnect: () => void;
  currentBpm: number;
  isRecording: boolean;
  currentSession: Partial<HRSession> | null;
  startSession: (activityType: ActivityType, memberId: string) => void;
  stopSession: (age?: number, weightKg?: number, isMale?: boolean) => HRSession | null;
  addManualSample: (bpm: number) => void;
  sessions: HRSession[];
  memberSessions: (memberId: string) => HRSession[];
}

const HeartRateContext = createContext<HeartRateContextValue>({
  bleStatus: 'unavailable',
  connectedDeviceName: null,
  scanAndConnect: async () => false,
  disconnect: () => {},
  currentBpm: 0,
  isRecording: false,
  currentSession: null,
  startSession: () => {},
  stopSession: () => null,
  addManualSample: () => {},
  sessions: [],
  memberSessions: () => [],
});

function randomId(): string {
  return generateId('hrsess');
}

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<HRSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [bleStatus, setBleStatus] = useState<BLEStatus>('unavailable');
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Ref mirror of isRecording — safe to read inside BLE callbacks (no stale closure)
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // Session accumulator refs
  const samplesRef = useRef<HRSample[]>([]);
  const sessionMeta = useRef<{ id: string; memberId: string; activityType: ActivityType; startedAt: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // BLE refs
  const bleManagerRef = useRef<any>(null);
  const bleSubscriptionRef = useRef<any>(null);
  const connectedDeviceRef = useRef<any>(null);

  // ── Load persisted sessions
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setSessions(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, loaded]);

  // ── Check BLE availability
  useEffect(() => {
    if (Platform.OS === 'web') {
      setBleStatus('unavailable');
      return;
    }
    try {
      const { BleManager } = require('react-native-ble-plx');
      bleManagerRef.current = new BleManager();
      setBleStatus('disconnected');
      return () => { bleManagerRef.current?.destroy(); };
    } catch {
      setBleStatus('unavailable');
    }
  }, []);

  // ── BLE scan + connect
  const scanAndConnect = useCallback(async (): Promise<boolean> => {
    const manager = bleManagerRef.current;
    if (!manager) {
      setBleStatus('unavailable');
      return false;
    }

    setBleStatus('scanning');
    const HR_SERVICE = '0000180D-0000-1000-8000-00805f9b34fb';
    const HR_CHAR = '00002A37-0000-1000-8000-00805f9b34fb';

    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        manager.stopDeviceScan();
        setBleStatus('disconnected');
        resolve(false);
      }, 15000);

      manager.startDeviceScan([HR_SERVICE], null, async (error: any, device: any) => {
        if (error) {
          clearTimeout(timeout);
          setBleStatus('disconnected');
          resolve(false);
          return;
        }

        if (device) {
          manager.stopDeviceScan();
          clearTimeout(timeout);
          setBleStatus('connecting');

          try {
            const connected = await device.connect();
            await connected.discoverAllServicesAndCharacteristics();
            connectedDeviceRef.current = connected;
            setConnectedDeviceName(device.name || device.localName || 'HR Monitor');
            await AsyncStorage.setItem(BLE_DEVICE_KEY, device.id);

            bleSubscriptionRef.current = connected.monitorCharacteristicForService(
              HR_SERVICE,
              HR_CHAR,
              (_err: any, characteristic: any) => {
                if (_err || !characteristic?.value) return;
                try {
                  const bytes = atob(characteristic.value);
                  const flags = bytes.charCodeAt(0);
                  const hr = flags & 0x01
                    ? bytes.charCodeAt(1) | (bytes.charCodeAt(2) << 8)
                    : bytes.charCodeAt(1);
                  if (hr > 0 && hr < 250) {
                    setCurrentBpm(hr);
                    // Use ref (not state) to avoid stale closure
                    if (isRecordingRef.current) {
                      samplesRef.current.push({ bpm: hr, timestamp: Date.now() });
                    }
                  }
                } catch { /* malformed data */ }
              },
            );

            setBleStatus('connected');
            resolve(true);
          } catch {
            setBleStatus('disconnected');
            resolve(false);
          }
        }
      });
    });
  }, []);

  const disconnect = useCallback(() => {
    bleSubscriptionRef.current?.remove();
    bleSubscriptionRef.current = null;
    // Actually disconnect the BLE device to save battery
    try { connectedDeviceRef.current?.cancelConnection(); } catch { /* ignore */ }
    connectedDeviceRef.current = null;
    setConnectedDeviceName(null);
    setBleStatus('disconnected');
  }, []);

  // ── Manual HR sample (web / no-BLE)
  const addManualSample = useCallback((bpm: number) => {
    if (bpm > 0 && bpm < 250) {
      setCurrentBpm(bpm);
      // Use ref to avoid stale closure
      if (isRecordingRef.current) {
        samplesRef.current.push({ bpm, timestamp: Date.now() });
      }
    }
  }, []);

  // ── Session start/stop
  const startSession = useCallback((activityType: ActivityType, memberId: string) => {
    samplesRef.current = [];
    sessionMeta.current = {
      id: randomId(),
      memberId,
      activityType,
      startedAt: new Date().toISOString(),
    };
    setIsRecording(true);

    // Demo mode: simulate HR when BLE unavailable
    if (bleStatus === 'unavailable') {
      timerRef.current = setInterval(() => {
        const base = 120 + Math.sin(Date.now() / 30000) * 20;
        const bpm = Math.round(base + (Math.random() - 0.5) * 15);
        setCurrentBpm(bpm);
        samplesRef.current.push({ bpm, timestamp: Date.now() });
      }, 1000);
    }
  }, [bleStatus]);

  const stopSession = useCallback((
    age: number = 30,
    weightKg: number = 80,
    isMale: boolean = true,
  ): HRSession | null => {
    if (!sessionMeta.current) return null;
    setIsRecording(false);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const samples = [...samplesRef.current];
    const meta = sessionMeta.current;
    sessionMeta.current = null;

    if (samples.length < 2) return null;

    const durationMs = samples[samples.length - 1].timestamp - samples[0].timestamp;
    const durationMinutes = Math.round(durationMs / 60000 * 10) / 10;

    const zones = computeZoneBreakdown(samples, age);
    const strain = computeStrain(zones);
    const calories = estimateCalories(samples, weightKg, age, isMale);

    const session: HRSession = {
      id: meta.id,
      memberId: meta.memberId,
      startedAt: meta.startedAt,
      endedAt: new Date().toISOString(),
      durationMinutes,
      avgBpm: avgBpm(samples),
      maxBpm: maxBpmFromSamples(samples),
      minBpm: minBpmFromSamples(samples),
      samples: downsample(samples, MAX_STORED_SAMPLES), // prevent AsyncStorage bloat
      zones,
      strain,
      calories,
      activityType: meta.activityType,
      deviceName: connectedDeviceName || undefined,
    };

    setSessions((prev) => [session, ...prev].slice(0, 200));
    setCurrentBpm(0);
    return session;
  }, [connectedDeviceName]);

  const memberSessions = useCallback(
    (memberId: string) => sessions.filter((s) => s.memberId === memberId),
    [sessions],
  );

  const currentSession = isRecording && sessionMeta.current
    ? {
        id: sessionMeta.current.id,
        activityType: sessionMeta.current.activityType,
        startedAt: sessionMeta.current.startedAt,
      }
    : null;

  return (
    <HeartRateContext.Provider
      value={{
        bleStatus,
        connectedDeviceName,
        scanAndConnect,
        disconnect,
        currentBpm,
        isRecording,
        currentSession,
        startSession,
        stopSession,
        addManualSample,
        sessions,
        memberSessions,
      }}
    >
      {children}
    </HeartRateContext.Provider>
  );
}

export function useHeartRate() {
  return useContext(HeartRateContext);
}
