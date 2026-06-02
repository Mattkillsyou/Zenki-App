import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncedState } from '../hooks/useSyncedState';
import {
  HRSession,
  HRSample,
  BLEStatus,
  BLEReason,
  BLEDeviceInfo,
  SavedBLEDevice,
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

// ── BLE GATT UUIDs (16-bit SIG UUIDs expanded to 128-bit base form)
const HR_SERVICE = '0000180D-0000-1000-8000-00805f9b34fb';
const HR_CHAR = '00002A37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180F-0000-1000-8000-00805f9b34fb';
const BATTERY_CHAR = '00002A19-0000-1000-8000-00805f9b34fb';

/** How long a user-initiated scan runs before giving up (ms). */
const SCAN_TIMEOUT_MS = 12000;
/** Poll interval for live signal-strength reads while connected (ms). */
const RSSI_POLL_MS = 5000;
/** Consecutive readRSSI() rejections that count as a silent link death.
 *  Acts as a liveness watchdog for drops that never fire onDisconnected.
 *  4 × RSSI_POLL_MS ≈ 20s — long enough that transient hiccups never trip it. */
const MAX_RSSI_FAILURES = 4;
/** One-shot backoff delay before auto-retrying after an unexpected drop (ms). */
const DROP_RECONNECT_DELAY_MS = 2000;
/** Max consecutive auto-reconnect attempts after drops before giving up. */
const MAX_DROP_RETRIES = 3;

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
  // ───────── EXISTING — unchanged signatures/behavior ─────────
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

  // ───────── NEW: honest status ─────────
  bleReason: BLEReason;
  bleAdapterState: string;                   // raw ble-plx State name

  // ───────── NEW: device picker ─────────
  discoveredDevices: BLEDeviceInfo[];        // deduped by id, freshest RSSI; cleared at scan start
  startScan: () => Promise<void>;            // populate list; DOES NOT auto-connect; bounded by SCAN_TIMEOUT_MS
  stopScan: () => void;
  connectToDevice: (deviceId: string) => Promise<boolean>;

  // ───────── NEW: saved device / reconnect / forget ─────────
  savedDevice: SavedBLEDevice | null;        // loaded from BLE_DEVICE_KEY on mount (read is safe, no manager)
  reconnectSaved: () => Promise<boolean>;     // silent reconnect to savedDevice.id; false if none/failed
  forgetDevice: () => Promise<void>;          // clears BLE_DEVICE_KEY, disconnects, savedDevice = null

  // ───────── NEW: rich info ─────────
  batteryLevel: number | null;               // 0–100 from Battery Service 0x180F / 0x2A19, when exposed
  signalRssi: number | null;                 // live RSSI (dBm) of the connected device
  lastConnectedAt: number | null;            // Date.now() of the active/most-recent connection
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
  // NEW (no-op defaults)
  bleReason: 'none',
  bleAdapterState: 'Unknown',
  discoveredDevices: [],
  startScan: async () => {},
  stopScan: () => {},
  connectToDevice: async () => false,
  savedDevice: null,
  reconnectSaved: async () => false,
  forgetDevice: async () => {},
  batteryLevel: null,
  signalRssi: null,
  lastConnectedAt: null,
});

function randomId(): string {
  return generateId('hrsess');
}

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions, loaded] = useSyncedState<HRSession[]>(STORAGE_KEY, [], {
    validate: Array.isArray,
  });
  const [bleStatus, setBleStatus] = useState<BLEStatus>('unavailable');
  const [connectedDeviceName, setConnectedDeviceName] = useState<string | null>(null);
  const [currentBpm, setCurrentBpm] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // ── NEW BLE state (all additive; existing fields above are untouched)
  const [bleReason, setBleReason] = useState<BLEReason>('none');
  const [bleAdapterState, setBleAdapterState] = useState<string>('Unknown');
  const [discoveredDevices, setDiscoveredDevices] = useState<BLEDeviceInfo[]>([]);
  const [savedDevice, setSavedDevice] = useState<SavedBLEDevice | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [signalRssi, setSignalRssi] = useState<number | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<number | null>(null);

  // Ref mirror of isRecording — safe to read inside BLE callbacks (no stale closure)
  const isRecordingRef = useRef(false);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  // Session accumulator refs
  const samplesRef = useRef<HRSample[]>([]);
  const sessionMeta = useRef<{ id: string; memberId: string; activityType: ActivityType; startedAt: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // BLE refs
  const bleManagerRef = useRef<any>(null);
  const bleSubscriptionRef = useRef<any>(null);       // HR characteristic monitor
  const connectedDeviceRef = useRef<any>(null);
  const stateSubscriptionRef = useRef<any>(null);      // manager.onStateChange subscription
  const disconnectSubscriptionRef = useRef<any>(null); // device.onDisconnected subscription
  const rssiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulator for the active scan: id → BLEDeviceInfo (deduped, freshest RSSI)
  const scanFoundRef = useRef<Map<string, BLEDeviceInfo>>(new Map());
  // Guards the single post-drop reconnect so a flapping link can't loop forever
  const dropReconnectingRef = useRef(false);
  // In-flight connect guard. True from the moment a connect attempt starts
  // (connectToDevice / reconnectSaved / a scanAndConnect device-found callback)
  // until it settles. Ensures AT MOST ONE connect is ever in flight, so an
  // AppState-foreground reconnect, an onStateChange:PoweredOn reconnect, and a
  // user tap can't run concurrent connects that cancel each other. Cleared on
  // every settle path and on disconnect()/handleDrop so a drop frees the guard.
  const connectingRef = useRef(false);
  // Handle for the post-drop backoff reconnect timer, so it can be cancelled.
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Consecutive auto-reconnect attempts since the last successful/user connect.
  // Caps the post-drop retry loop so a flapping link can't reconnect forever.
  const dropRetryCountRef = useRef(0);
  // Consecutive readRSSI() rejections on the live poll. Liveness watchdog for
  // links that die WITHOUT firing onDisconnected; resets on any successful
  // RSSI read, any real BPM notification, and on (re)connect.
  const rssiFailCountRef = useRef(0);

  // Ref mirrors so BLE callbacks (state-change, disconnect, AppState) read fresh
  // values instead of values captured at the time the callback was registered.
  const savedDeviceRef = useRef<SavedBLEDevice | null>(null);
  useEffect(() => { savedDeviceRef.current = savedDevice; }, [savedDevice]);
  const bleStatusRef = useRef<BLEStatus>('unavailable');
  useEffect(() => { bleStatusRef.current = bleStatus; }, [bleStatus]);
  const bleAdapterStateRef = useRef<string>('Unknown');
  useEffect(() => { bleAdapterStateRef.current = bleAdapterState; }, [bleAdapterState]);

  // (sessions hydration + persistence handled by useSyncedState above.)

  // ── Latest-callback ref for reconnectSaved. The onStateChange / onDisconnected
  // / AppState callbacks are registered once but must invoke the *current*
  // reconnectSaved closure; storing it in a ref keeps those callbacks out of
  // every useCallback dep array while still avoiding stale closures.
  const reconnectSavedRef = useRef<(() => Promise<boolean>) | null>(null);

  // ── Persist the active device to AsyncStorage + local state (new JSON schema).
  const persistSavedDevice = useCallback(async (id: string, name: string | null) => {
    const at = Date.now();
    const record: SavedBLEDevice = { id, name, lastConnectedAt: at };
    setSavedDevice(record);
    setLastConnectedAt(at);
    try {
      await AsyncStorage.setItem(BLE_DEVICE_KEY, JSON.stringify(record));
    } catch { /* storage write best-effort */ }
  }, []);

  // ── Tear down per-connection resources (HR monitor, drop listener, RSSI poll,
  // device ref). Used by disconnect(), drop-recovery, forget, and unmount.
  // Does NOT touch the manager or its onStateChange subscription.
  const clearConnectionState = useCallback((cancelConnection: boolean) => {
    try { bleSubscriptionRef.current?.remove(); } catch { /* ignore */ }
    bleSubscriptionRef.current = null;
    try { disconnectSubscriptionRef.current?.remove(); } catch { /* ignore */ }
    disconnectSubscriptionRef.current = null;
    if (rssiIntervalRef.current) {
      clearInterval(rssiIntervalRef.current);
      rssiIntervalRef.current = null;
    }
    if (cancelConnection) {
      // Actually disconnect the BLE device to save battery.
      try { connectedDeviceRef.current?.cancelConnection(); } catch { /* ignore */ }
    }
    connectedDeviceRef.current = null;
  }, []);

  // ── Cancel any pending post-drop backoff reconnect. Clears the dropTimerRef
  // (so a queued reconnect ~2s out can't tear down a link the user just made)
  // and releases the drop-reconnect guard. Called at the entry of every new
  // connect path BEFORE a fresh attempt, and from handleDrop's own scheduler.
  const cancelPendingDropReconnect = useCallback(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current);
      dropTimerRef.current = null;
    }
    dropReconnectingRef.current = false;
  }, []);

  // ── Shared unexpected-drop handler. Invoked by device.onDisconnected AND by
  // the RSSI liveness watchdog (a link can die silently without firing
  // onDisconnected). Performs the teardown/transition and one guarded backoff
  // reconnect, capped at MAX_DROP_RETRIES so a flapping link can't loop forever.
  // Centralised so both callers share the SAME single reconnect loop/refs.
  const handleDrop = useCallback(() => {
    // A drop ends any in-flight connect — free the guard so the backoff
    // reconnect (and any later user tap) isn't blocked by a stale flag.
    connectingRef.current = false;
    clearConnectionState(false);
    setCurrentBpm(0);
    setConnectedDeviceName(null);
    setBatteryLevel(null);
    setSignalRssi(null);
    setBleStatus('disconnected');
    setBleReason('dropped');
    // One guarded backoff reconnect to ride out brief dropouts. Capped at
    // MAX_DROP_RETRIES consecutive attempts so a flapping link can't loop
    // forever; the counter resets on a successful or user-initiated connect.
    if (dropRetryCountRef.current >= MAX_DROP_RETRIES) return;
    if (savedDeviceRef.current && !dropReconnectingRef.current) {
      dropReconnectingRef.current = true;
      dropRetryCountRef.current += 1;
      dropTimerRef.current = setTimeout(() => {
        dropTimerRef.current = null;
        const p = reconnectSavedRef.current?.();
        if (p && typeof p.finally === 'function') {
          p.finally(() => { dropReconnectingRef.current = false; });
        } else {
          dropReconnectingRef.current = false;
        }
      }, DROP_RECONNECT_DELAY_MS);
    }
  }, [clearConnectionState]);

  // ── Lazily create the single BleManager. CRITICAL: never call this on mount
  // or in a mount effect. Constructing `new BleManager()` synthesizes a
  // CBCentralManager on iOS, which immediately fires the Bluetooth permission
  // dialog. We instantiate only from a user-initiated action (startScan /
  // connectToDevice / scanAndConnect) or a silent reconnect that already
  // verified a savedDevice exists (so the dialog was granted on a prior
  // connect). Returns the manager, or null on web / load failure (caller sets
  // 'unavailable'/'unsupported').
  const ensureManager = useCallback((): any => {
    if (Platform.OS === 'web') {
      setBleStatus('unavailable');
      setBleReason('unsupported');
      return null;
    }
    if (bleManagerRef.current) return bleManagerRef.current;
    let manager: any;
    try {
      const { BleManager } = require('react-native-ble-plx');
      manager = new BleManager();
    } catch {
      setBleStatus('unavailable');
      setBleReason('unsupported');
      return null;
    }
    bleManagerRef.current = manager;

    // Subscribe to adapter-state changes the moment the manager is first
    // created (and only then). `true` emits the current state immediately.
    stateSubscriptionRef.current = manager.onStateChange((state: string) => {
      setBleAdapterState(state);
      switch (state) {
        case 'PoweredOn':
          // Adapter usable again. Clear any blocking reason. If we have a saved
          // device and aren't connected, opportunistically reconnect (manager
          // already exists, so no surprise dialog).
          setBleReason((prev) => (
            prev === 'poweredOff' || prev === 'unauthorized' || prev === 'unsupported'
              ? 'none' : prev
          ));
          if (savedDeviceRef.current && bleStatusRef.current !== 'connected') {
            reconnectSavedRef.current?.();
          }
          break;
        case 'PoweredOff':
          // If we were connected, this is effectively a drop.
          if (bleStatusRef.current === 'connected') {
            clearConnectionState(false); // adapter is off; can't cancel cleanly
            setCurrentBpm(0);
            setConnectedDeviceName(null);
            setBatteryLevel(null);
            setSignalRssi(null);
          }
          setBleStatus('disconnected');
          setBleReason('poweredOff');
          break;
        case 'Unauthorized':
          setBleStatus('disconnected');
          setBleReason('unauthorized');
          break;
        case 'Unsupported':
          setBleStatus('unavailable');
          setBleReason('unsupported');
          break;
        default:
          // 'Resetting' | 'Unknown' — transient; leave status as-is.
          break;
      }
    }, true);

    return manager;
  }, [clearConnectionState]);

  // ── Shared connect tail for ALL connect paths (connectToDevice,
  // reconnectSaved, scanAndConnect). Assumes `device` is already connected at
  // the GATT level. Discovers services, wires the HR monitor (parser verbatim
  // from the original implementation), registers drop recovery, reads battery
  // once, starts the RSSI poll, persists the saved device, and flips status to
  // 'connected'.
  const finalizeConnection = useCallback(async (device: any): Promise<boolean> => {
    try {
      await device.discoverAllServicesAndCharacteristics();
    } catch {
      setBleStatus('disconnected');
      setBleReason('failed');
      try { device.cancelConnection(); } catch {}
      return false;
    }

    // Fresh connection — cancel + drop any previous one's link/listeners/poll
    // first (true), so switching straps via the picker doesn't leak the old
    // device's connection. No-ops safely when there's no previous device.
    clearConnectionState(true);
    connectedDeviceRef.current = device;
    const name = device.name || device.localName || 'HR Monitor';
    setConnectedDeviceName(name);

    // HR characteristic subscription — BPM parser kept VERBATIM from original.
    bleSubscriptionRef.current = device.monitorCharacteristicForService(
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
            // A live BPM notification proves the link is alive — clear any RSSI
            // watchdog strikes so transient readRSSI hiccups can't trip a drop
            // on a healthy, actively-streaming strap.
            rssiFailCountRef.current = 0;
            // Use ref (not state) to avoid stale closure
            if (isRecordingRef.current) {
              samplesRef.current.push({ bpm: hr, timestamp: Date.now() });
            }
          }
        } catch { /* malformed data */ }
      },
    );

    // Drop recovery — fires on unexpected disconnects.
    disconnectSubscriptionRef.current = device.onDisconnected(() => {
      // Ignore if this device is no longer the active one (e.g. we replaced it).
      if (connectedDeviceRef.current && connectedDeviceRef.current !== device) return;
      handleDrop();
    });

    // Battery — best effort; many straps don't expose 0x180F.
    try {
      const ch = await device.readCharacteristicForService(BATTERY_SERVICE, BATTERY_CHAR);
      if (ch?.value) {
        const pct = atob(ch.value).charCodeAt(0);
        if (pct >= 0 && pct <= 100) setBatteryLevel(pct);
      }
    } catch { /* no battery service — leave null */ }

    // If the device dropped during the battery await, its onDisconnected
    // handler already tore down and set 'disconnected'/'dropped'. Bail before
    // creating an orphaned RSSI interval. (Re-checked again before 'connected'.)
    if (connectedDeviceRef.current !== device) return false;

    // Live RSSI poll (~5s) doubling as a liveness watchdog. Stored in a ref;
    // cleared on teardown. Fresh connection → reset the failure counter.
    setSignalRssi(null);
    rssiFailCountRef.current = 0;
    if (rssiIntervalRef.current) clearInterval(rssiIntervalRef.current);
    rssiIntervalRef.current = setInterval(() => {
      const dev = connectedDeviceRef.current;
      if (!dev) return;
      dev.readRSSI()
        .then((d: any) => {
          // Successful read → link is alive; clear strikes + publish RSSI.
          rssiFailCountRef.current = 0;
          if (typeof d?.rssi === 'number') setSignalRssi(d.rssi);
        })
        .catch(() => {
          // A single rejection is usually transient (keep last value). But a run
          // of consecutive failures means the link silently died without firing
          // onDisconnected — treat it as a drop via the SAME shared handler.
          rssiFailCountRef.current += 1;
          if (rssiFailCountRef.current >= MAX_RSSI_FAILURES) {
            // Re-check identity: another teardown may have already cleared this
            // device/interval. Guard so a late strike can't clobber fresh state.
            if (connectedDeviceRef.current !== dev) return;
            rssiFailCountRef.current = 0;
            handleDrop();
          }
        });
    }, RSSI_POLL_MS);

    await persistSavedDevice(device.id, name);

    // Identity guard: if the device dropped during the awaits above (battery
    // read / persist), its onDisconnected handler already ran — nulling
    // connectedDeviceRef and setting 'disconnected'/'dropped'. Don't clobber
    // that with a stale 'connected', and clear the orphaned RSSI interval we
    // just created. Leave the handler's status/reason intact.
    if (connectedDeviceRef.current !== device) {
      if (rssiIntervalRef.current) {
        clearInterval(rssiIntervalRef.current);
        rssiIntervalRef.current = null;
      }
      return false;
    }

    // Successful connection — reset the post-drop retry counter.
    dropRetryCountRef.current = 0;
    setBleStatus('connected');
    setBleReason('none');
    return true;
  }, [clearConnectionState, persistSavedDevice, handleDrop]);

  // ── Stop an in-progress scan (clear timeout + tell the manager to stop).
  const stopScan = useCallback(() => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
    try { bleManagerRef.current?.stopDeviceScan(); } catch { /* ignore */ }
    // Back to disconnected unless a device is actually live.
    setBleStatus((prev) => (prev === 'scanning'
      ? (connectedDeviceRef.current ? 'connected' : 'disconnected')
      : prev));
  }, []);

  // ── Scan for nearby HR monitors WITHOUT connecting. Populates a deduped
  // discoveredDevices list with freshest RSSI; bounded by SCAN_TIMEOUT_MS.
  const startScan = useCallback(async (): Promise<void> => {
    const manager = ensureManager();
    if (!manager) return; // ensureManager already set unavailable/unsupported

    // Don't scan if the adapter isn't usable — surface the reason instead.
    const state = bleAdapterStateRef.current;
    if (state && state !== 'PoweredOn') {
      if (state === 'PoweredOff') { setBleStatus('disconnected'); setBleReason('poweredOff'); }
      else if (state === 'Unauthorized') { setBleStatus('disconnected'); setBleReason('unauthorized'); }
      else if (state === 'Unsupported') { setBleStatus('unavailable'); setBleReason('unsupported'); }
      return;
    }

    // Reset accumulator + UI list.
    scanFoundRef.current = new Map();
    setDiscoveredDevices([]);
    setBleStatus('scanning');
    setBleReason('none');

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      scanTimeoutRef.current = null;
      // Only revert status if we're still scanning (not mid-connect).
      setBleStatus((prev) => (prev === 'scanning' ? 'disconnected' : prev));
      if (scanFoundRef.current.size === 0) setBleReason('noDeviceFound');
    }, SCAN_TIMEOUT_MS);

    manager.startDeviceScan([HR_SERVICE], null, (error: any, device: any) => {
      if (error) {
        if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
        try { manager.stopDeviceScan(); } catch { /* ignore */ }
        setBleStatus('disconnected');
        setBleReason('failed');
        return;
      }
      if (!device) return;
      // Dedupe by id, keep the freshest RSSI; never auto-connect.
      const info: BLEDeviceInfo = {
        id: device.id,
        name: device.name || device.localName || 'HR Monitor',
        rssi: typeof device.rssi === 'number' ? device.rssi : null,
      };
      scanFoundRef.current.set(device.id, info);
      setDiscoveredDevices(Array.from(scanFoundRef.current.values()));
    });
  }, [ensureManager]);

  // ── Connect to a specific device id chosen from the picker.
  const connectToDevice = useCallback(async (deviceId: string): Promise<boolean> => {
    // In-flight guard: at most one connect attempt ever runs at a time.
    if (connectingRef.current) return false;
    const manager = ensureManager();
    if (!manager) return false;
    stopScan();
    // A new user connect supersedes any pending post-drop reconnect — cancel its
    // timer (Race #1) so it can't tear down the link we're about to make.
    cancelPendingDropReconnect();
    dropRetryCountRef.current = 0; // user-initiated connect → reset drop cap
    connectingRef.current = true;
    setBleStatus('connecting');
    setBleReason('none');
    try {
      const device = await manager.connectToDevice(deviceId);
      return await finalizeConnection(device);
    } catch {
      setBleStatus('disconnected');
      setBleReason('failed');
      return false;
    } finally {
      connectingRef.current = false;
    }
  }, [ensureManager, stopScan, cancelPendingDropReconnect, finalizeConnection]);

  // ── Silent reconnect to the saved device (no dialog if it already exists).
  const reconnectSaved = useCallback(async (): Promise<boolean> => {
    const saved = savedDeviceRef.current;
    if (!saved) return false;
    // In-flight guard (Race #3): AppState-foreground + onStateChange:PoweredOn +
    // a user tap can all fire reconnectSaved at once. Bail if one is already
    // running so concurrent reconnects can't cancel each other.
    if (connectingRef.current) return false;
    const manager = ensureManager();
    if (!manager) return false;
    // Capture whether this is a post-drop backoff reconnect BEFORE we cancel the
    // pending timer/guard. Reset the drop cap only for genuinely user-initiated
    // reconnects; when the backoff timer calls us, dropReconnectingRef is still
    // true — don't reset then, or a flapping link would never hit MAX_DROP_RETRIES.
    const isPostDropReconnect = dropReconnectingRef.current;
    if (!isPostDropReconnect) dropRetryCountRef.current = 0;
    // Cancel any still-pending post-drop reconnect timer (Race #1). When the
    // backoff timer itself invoked us it already nulled the timer, so this just
    // clears the guard — matching the prior dropReconnectingRef reset.
    cancelPendingDropReconnect();
    connectingRef.current = true;
    setBleStatus('connecting');
    setBleReason('none');
    try {
      const device = await manager.connectToDevice(saved.id);
      return await finalizeConnection(device);
    } catch {
      // Leave status disconnected; do NOT clobber an existing blocking reason.
      setBleStatus('disconnected');
      return false;
    } finally {
      connectingRef.current = false;
    }
  }, [ensureManager, cancelPendingDropReconnect, finalizeConnection]);
  useEffect(() => { reconnectSavedRef.current = reconnectSaved; }, [reconnectSaved]);

  // ── BLE scan + connect (COMPAT — WorkoutSessionScreen depends on this).
  // Reconnect-first: try the saved device silently, else first-match scan and
  // route the found device through the shared finalizeConnection tail.
  const scanAndConnect = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setBleStatus('unavailable');
      setBleReason('unsupported');
      return false;
    }
    // A new connect supersedes any pending post-drop reconnect — cancel its
    // timer (Race #1) before starting, so it can't tear down the new link ~2s in.
    cancelPendingDropReconnect();
    // Try the saved monitor first.
    if (savedDeviceRef.current) {
      const ok = await reconnectSaved();
      if (ok) return true;
    }
    const manager = ensureManager();
    if (!manager) return false;

    setBleStatus('scanning');
    setBleReason('none');

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timeout = setTimeout(() => {
        try { manager.stopDeviceScan(); } catch { /* ignore */ }
        setBleStatus((prev) => (prev === 'scanning' ? 'disconnected' : prev));
        setBleReason((prev) => (prev === 'none' ? 'noDeviceFound' : prev));
        finish(false);
      }, SCAN_TIMEOUT_MS);
      scanTimeoutRef.current = timeout;

      manager.startDeviceScan([HR_SERVICE], null, async (error: any, device: any) => {
        if (error) {
          clearTimeout(timeout);
          scanTimeoutRef.current = null;
          setBleStatus('disconnected');
          setBleReason('failed');
          finish(false);
          return;
        }
        if (device) {
          // Re-entrancy guard (Race #2): two device-found events in one scan
          // batch must not both run connect()+finalizeConnection. Bail if this
          // attempt is already settled or another connect is in flight.
          if (settled || connectingRef.current) return;
          connectingRef.current = true;
          // First match wins.
          try { manager.stopDeviceScan(); } catch { /* ignore */ }
          clearTimeout(timeout);
          scanTimeoutRef.current = null;
          cancelPendingDropReconnect();
          setBleStatus('connecting');
          try {
            const connected = await device.connect();
            const ok = await finalizeConnection(connected);
            finish(ok);
          } catch {
            // Only flip to failed if THIS attempt is still the active one — a
            // settled sibling may have already succeeded; don't clobber it.
            if (!settled) {
              setBleStatus('disconnected');
              setBleReason('failed');
              finish(false);
            }
          } finally {
            connectingRef.current = false;
          }
        }
      });
    });
  }, [ensureManager, reconnectSaved, cancelPendingDropReconnect, finalizeConnection]);

  // ── User-initiated disconnect (keeps the saved device — just drops the link).
  const disconnect = useCallback(() => {
    // Suppress the drop-recovery path; this is intentional.
    dropReconnectingRef.current = true;
    // A user disconnect cancels any in-flight connect attempt — free the guard.
    connectingRef.current = false;
    // User-initiated disconnect — reset the post-drop retry cap for next time.
    dropRetryCountRef.current = 0;
    // Cancel any pending post-drop auto-reconnect (e.g. tapping Disconnect
    // within the ~2s backoff window).
    if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
    clearConnectionState(true);
    setConnectedDeviceName(null);
    setCurrentBpm(0);
    setBatteryLevel(null);
    setSignalRssi(null);
    setBleStatus('disconnected');
    // Clear only connection-lifecycle reasons; preserve an honest blocking
    // reason (Bluetooth off / permission needed / unsupported / no monitor
    // found) so forgetDevice()→disconnect() can't wipe it until the adapter
    // state actually changes.
    setBleReason((prev) => (prev === 'dropped' || prev === 'failed' ? 'none' : prev));
    dropReconnectingRef.current = false;
  }, [clearConnectionState]);

  // ── Forget the saved device entirely (disconnect + wipe storage).
  const forgetDevice = useCallback(async (): Promise<void> => {
    disconnect();
    setSavedDevice(null);
    setLastConnectedAt(null);
    try { await AsyncStorage.removeItem(BLE_DEVICE_KEY); } catch { /* ignore */ }
  }, [disconnect]);

  // ── Load the saved device on mount. Pure AsyncStorage read — SAFE, no
  // manager instantiated. Migrates the legacy bare-string (device.id) form to
  // the new JSON schema.
  useEffect(() => {
    if (Platform.OS === 'web') {
      setBleStatus('unavailable');
      setBleReason('unsupported');
      return;
    }
    setBleStatus('disconnected');
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BLE_DEVICE_KEY);
        if (cancelled || !raw) return;
        let record: SavedBLEDevice;
        try {
          const parsed = JSON.parse(raw);
          // Guard against JSON that isn't our shape (e.g. a bare number).
          if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
            record = {
              id: parsed.id,
              name: typeof parsed.name === 'string' ? parsed.name : null,
              lastConnectedAt: typeof parsed.lastConnectedAt === 'number' ? parsed.lastConnectedAt : null,
            };
          } else {
            record = { id: String(raw), name: null, lastConnectedAt: null };
          }
        } catch {
          // Legacy bare-string id.
          record = { id: raw, name: null, lastConnectedAt: null };
        }
        setSavedDevice(record);
        setLastConnectedAt(record.lastConnectedAt);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Manager teardown — destroy on unmount only. Per-connection resources and
  // the onStateChange subscription are released here too. (Kept separate from
  // the savedDevice-load effect so the manager is never created on mount.)
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
      if (dropTimerRef.current) { clearTimeout(dropTimerRef.current); dropTimerRef.current = null; }
      clearConnectionState(true);
      try { stateSubscriptionRef.current?.remove(); } catch { /* ignore */ }
      stateSubscriptionRef.current = null;
      try { bleManagerRef.current?.stopDeviceScan(); } catch { /* ignore */ }
      try { bleManagerRef.current?.destroy(); } catch { /* ignore */ }
      bleManagerRef.current = null;
    };
  }, [clearConnectionState]);

  // ── AppState: when returning to foreground, silently reconnect the saved
  // device IF the adapter is on and we're not already connected. The listener
  // itself never instantiates the manager; reconnectSaved only does so when a
  // savedDevice exists (so no surprise permission dialog).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      // Contract: reconnect only when a savedDevice exists, the adapter is
      // PoweredOn, and we're not already connected. Gating on savedDevice is
      // what guarantees reconnectSaved → ensureManager won't surprise-prompt.
      if (!savedDeviceRef.current) return;
      if (bleStatusRef.current === 'connected') return;
      if (bleAdapterStateRef.current !== 'PoweredOn') return;
      reconnectSavedRef.current?.();
    });
    return () => { sub.remove(); };
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

    // NOTE: heart-rate samples come ONLY from a real connected BLE monitor
    // (monitorCharacteristicForService) or explicit manual entry
    // (addManualSample, validated). Without either, the session records nothing
    // and stopSession returns null — we never fabricate and persist heart-rate
    // data as if it were a real reading.
  }, []);

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
        // NEW
        bleReason,
        bleAdapterState,
        discoveredDevices,
        startScan,
        stopScan,
        connectToDevice,
        savedDevice,
        reconnectSaved,
        forgetDevice,
        batteryLevel,
        signalRssi,
        lastConnectedAt,
      }}
    >
      {children}
    </HeartRateContext.Provider>
  );
}

export function useHeartRate() {
  return useContext(HeartRateContext);
}
