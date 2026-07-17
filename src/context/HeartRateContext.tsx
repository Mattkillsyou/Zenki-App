import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncedState } from '../hooks/useSyncedState';
import { safeParseJSON } from '../utils/safeStorage';
import { useAuth } from './AuthContext';
import { getCurrentUid } from '../services/firebaseAuth';
import { auth } from '../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  mergeById as mergeSyncById, reconcileDeletes, markSyncedUnchanged, snapshotForPush,
} from '../services/syncCore';
import {
  pushHrSession, flushHrSessions, migrateHrSessions, subscribeHrSessions,
  isSyncableHrSession, trimKeepingUnsynced, type SyncedHRSession,
} from '../services/healthSync';
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
// Per-uid run-once guard for the AsyncStorage → Firestore HR migration.
const HR_MIGRATED_KEY_PREFIX = '@zenki_hr_migrated_v1:';
// Newest-N kept ON DEVICE. Firestore holds the full archive; this only bounds
// the AsyncStorage cache (each session is ~24KB of downsampled samples, and the
// whole app shares Android's ~6MB AsyncStorage budget).
const HR_LOCAL_CAP = 200;
const BLE_DEVICE_KEY = '@zenki_ble_device';

// ── BLE GATT UUIDs (16-bit SIG UUIDs expanded to 128-bit base form)
const HR_SERVICE = '0000180D-0000-1000-8000-00805f9b34fb';
const HR_CHAR = '00002A37-0000-1000-8000-00805f9b34fb';
const BATTERY_SERVICE = '0000180F-0000-1000-8000-00805f9b34fb';
const BATTERY_CHAR = '00002A19-0000-1000-8000-00805f9b34fb';

/** How long a user-initiated scan runs before giving up (ms). */
const SCAN_TIMEOUT_MS = 12000;
/** Max wait for the adapter to leave 'Unknown'/'Resetting' before a scan or
 *  reconnect gives up on getting a settled state (ms). */
const ADAPTER_SETTLE_TIMEOUT_MS = 2000;
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

/** Order the picker list for the now-UNFILTERED scan so the user's strap floats
 *  to the top of a noisy nearby-device list: likely HR straps (advertising 0x180D)
 *  first, then named devices above "Unknown device" placeholders, then strongest
 *  signal first (unknown RSSI last). Pure; Array.sort is stable so equal ranks
 *  keep insertion order. */
function sortDiscovered(list: BLEDeviceInfo[]): BLEDeviceInfo[] {
  return [...list].sort((a, b) => {
    if (!!a.advertisesHrService !== !!b.advertisesHrService) {
      return a.advertisesHrService ? -1 : 1;
    }
    if (!!a.named !== !!b.named) {
      return a.named ? -1 : 1; // real names above "Unknown device" placeholders
    }
    const ar = a.rssi == null ? -Infinity : a.rssi;
    const br = b.rssi == null ? -Infinity : b.rssi;
    return br - ar; // stronger (less negative) RSSI first
  });
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

  // ───────── NEW: connected-but-no-HR guidance ─────────
  noHrDeviceName: string | null;             // name of the last device that connected but exposed no 0x180D/0x2A37 (drives WHOOP "Broadcast Heart Rate" tip); paired with bleReason 'noHrService'
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
  noHrDeviceName: null,
});

function randomId(): string {
  return generateId('hrsess');
}

export function HeartRateProvider({ children }: { children: React.ReactNode }) {
  // hydrateOk (NOT `loaded`): a failed/unreadable hydrate must not run the
  // migration — with an empty list it would mark the migration "done" and
  // permanently strand the very history it exists to rescue.
  const [sessions, setSessions, loaded, hydrateOk] = useSyncedState<SyncedHRSession[]>(STORAGE_KEY, [], {
    validate: Array.isArray,
  });
  const { user } = useAuth();
  const [authUid, setAuthUid] = useState<string | null>(getCurrentUid());
  // Sample the uid live: getCurrentUid() is null on cold start until Firebase
  // restores the session, which would skip the sync effect for that whole launch.
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
  }, []);
  const sessionsRef = useRef<SyncedHRSession[]>([]);
  sessionsRef.current = sessions;

  // ── Firestore sync (durability) ──────────────────────────────────────
  // Heart-rate sessions were AsyncStorage-only and died with the app. Now at
  // /nutrition/{uid}/hrSessions (purge-free via the existing step('nutrition')).
  // Owner-only unless the member turns on the tier-1 sharing switch.
  useEffect(() => {
    const memberId = user?.id;
    const uid = authUid;
    if (!hydrateOk || !uid || !memberId) return;

    let cancelled = false;
    let unsub: () => void = () => {};
    // Ids confirmed by the migration in THIS pass. setState hasn't rendered by
    // the time the flush below reads the ref, so without this the flush
    // re-uploads everything the migration just confirmed.
    const justMigrated = new Set<string>();
    const mine = (rows: SyncedHRSession[]) => rows.filter((r) => r.memberId === memberId);
    const newestFirst = (r: SyncedHRSession) => Date.parse(r.startedAt) || 0;

    (async () => {
      try {
        const flagKey = `${HR_MIGRATED_KEY_PREFIX}${uid}`;
        const already = await AsyncStorage.getItem(flagKey);
        if (!already) {
          // From disk, not state: independent of hydrate timing; idempotent by id.
          const raw = await AsyncStorage.getItem(STORAGE_KEY);
          const rows = mine(safeParseJSON<SyncedHRSession[]>(raw, [], Array.isArray));
          const ids = await migrateHrSessions(uid, rows);
          if (cancelled) return;
          ids.forEach((id) => justMigrated.add(id));
          setSessions((prev) => markSyncedUnchanged(prev, ids, snapshotForPush(prev)));
          // Count with the SAME predicate migrate uses, or one unsyncable row
          // pins the flag off forever and re-migrates the batch every launch.
          if (ids.size >= rows.filter(isSyncableHrSession).length) {
            await AsyncStorage.setItem(flagKey, '1');
          }
        }
      } catch { /* non-fatal — retries next launch */ }

      if (cancelled) return;
      try {
        const toPush = mine(sessionsRef.current).filter((r) => !justMigrated.has(r.id));
        const snap = snapshotForPush(toPush);
        const ok = await flushHrSessions(uid, toPush);
        if (!cancelled) setSessions((prev) => markSyncedUnchanged(prev, ok, snap));
      } catch { /* retried next launch */ }

      if (cancelled) return;
      unsub = subscribeHrSessions(uid, (d) => {
        if (cancelled) return;
        if (d.upserts.length || d.removedIds.length) {
          // Trim HERE, not only on save: the first snapshot reports every server
          // doc as `added`, so an un-capped merge inflates state to the whole
          // archive and useSyncedState stringifies all of it into one
          // AsyncStorage key — unbounded, and on Android that silently kills
          // every write to the key (taking the offline queue with it). The
          // server keeps the full history; the device keeps a bounded window.
          setSessions((prev) => trimKeepingUnsynced(
            mergeSyncById(prev, d.upserts.map((r) => ({ ...r, memberId: r.memberId || memberId })), d.removedIds),
            HR_LOCAL_CAP, newestFirst,
          ));
        }
        if (d.allIds) setSessions((prev) => reconcileDeletes(prev, d.allIds!, memberId));
      });
    })();

    return () => { cancelled = true; unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user?.id, authUid]);

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
  // Name of the last device that connected but exposed no HR service (e.g. a
  // WHOOP with Broadcast Heart Rate off). Drives the picker's guidance card;
  // set in finalizeConnection's no-HR branch, cleared on scan/success/disconnect.
  const [noHrDeviceName, setNoHrDeviceName] = useState<string | null>(null);

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
  // Timestamp (ms) of the last discoveredDevices flush. With allowDuplicates:true
  // the scan callback fires many times/sec across all nearby peripherals; this
  // throttles UI updates so high-frequency advertisements don't thrash render.
  const lastScanFlushRef = useRef(0);
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
        // Only fire the post-drop backoff reconnect if the adapter is actually
        // usable. If Bluetooth was turned off mid-session the adapter is still
        // PoweredOff ~2s later, so reconnectSaved would just waste an attempt and
        // flicker status from the honest 'Bluetooth is off' to 'Connecting…' and
        // back. Skip and leave status as-is; the onStateChange 'PoweredOn' handler
        // will drive the reconnect when Bluetooth comes back. (Gate lives HERE,
        // not in reconnectSaved — that path is invoked by onStateChange before
        // bleAdapterStateRef updates, so guarding it there would break power-on
        // reconnect.)
        if (bleAdapterStateRef.current !== 'PoweredOn') {
          dropReconnectingRef.current = false;
          return;
        }
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

  // ── Wait for the adapter state to settle. ble-plx delivers the current state
  // asynchronously (onStateChange(cb, true) emits on a later tick; a bare
  // manager.state() is not reliable pre-settle on iOS), so on the FIRST BLE
  // action after a cold launch bleAdapterStateRef is still 'Unknown' when a
  // gate reads it — and the ref can also be momentarily stale when the
  // PoweredOn handler invokes reconnectSaved (see handleDrop's gate comment).
  // Always subscribe fresh with emitCurrent=true and resolve with the first
  // settled state, or whatever was seen last after ADAPTER_SETTLE_TIMEOUT_MS
  // ('Unknown' if nothing ever arrived). Never rejects.
  const awaitSettledAdapterState = useCallback((manager: any): Promise<string> => {
    return new Promise((resolve) => {
      let sub: any = null;
      let done = false;
      let latest = bleAdapterStateRef.current;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (state: string) => {
        if (done) return;
        done = true;
        if (timer) { clearTimeout(timer); timer = null; }
        try { sub?.remove(); } catch { /* ignore */ }
        resolve(state);
      };
      timer = setTimeout(() => finish(latest), ADAPTER_SETTLE_TIMEOUT_MS);
      try {
        sub = manager.onStateChange((state: string) => {
          latest = state;
          if (state !== 'Unknown' && state !== 'Resetting') finish(state);
        }, true);
      } catch {
        finish(latest);
      }
      // If the emission ran synchronously (before `sub` was assigned), the
      // finish() above couldn't remove it — clean up now.
      if (done) { try { sub?.remove(); } catch { /* ignore */ } }
    });
  }, []);

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

    // Determine HR capability AFTER connecting (root-cause fix): a device is only
    // a usable monitor if it exposes the HR service 0x180D *and* the HR measurement
    // characteristic 0x2A37. Check now — before adopting it as the active device —
    // so a WHOOP with Broadcast Heart Rate OFF (or any non-HR peripheral the user
    // tapped) can't sit silently on "Connected — … · — bpm" forever.
    let hasHr = false;
    try {
      const chars = await device.characteristicsForService(HR_SERVICE);
      hasHr = Array.isArray(chars)
        && chars.some((c: any) => typeof c?.uuid === 'string' && c.uuid.toLowerCase() === HR_CHAR.toLowerCase());
    } catch {
      hasHr = false; // service absent / discovery race → treat as no HR
    }
    if (!hasHr) {
      // Connected at the GATT level, but NOT broadcasting standard heart rate.
      // Be honest: drop this link (don't hold a useless connection that also blocks
      // WHOOP's single consumer slot), surface guidance, do NOT persist as a saved
      // device, and never show a fake/0 "connected". The previous device (if any)
      // was already torn down at the connect-path entry, so just cancel THIS one.
      const nm = device.name || device.localName || 'This device';
      try { device.cancelConnection(); } catch { /* ignore */ }
      setConnectedDeviceName(null);
      setCurrentBpm(0);
      setBatteryLevel(null);
      setSignalRssi(null);
      setNoHrDeviceName(nm);
      setBleStatus('disconnected');
      setBleReason('noHrService');
      return false;
    }
    setNoHrDeviceName(null); // HR-capable → clear any prior no-HR guidance

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
    // On the first BLE action after a cold launch the adapter is still
    // 'Unknown' (ble-plx reports the real state asynchronously), so wait for
    // it to settle instead of gating on the stale ref — otherwise the first
    // tap was a silent no-op. Every non-PoweredOn branch sets an honest
    // status/reason; the gate can never bare-return.
    const state = await awaitSettledAdapterState(manager);
    // The settle wait yields — if a connect started meanwhile, don't stomp it.
    if (connectingRef.current) return;
    if (state !== 'PoweredOn') {
      if (state === 'PoweredOff') { setBleStatus('disconnected'); setBleReason('poweredOff'); }
      else if (state === 'Unauthorized') { setBleStatus('disconnected'); setBleReason('unauthorized'); }
      else if (state === 'Unsupported') { setBleStatus('unavailable'); setBleReason('unsupported'); }
      else {
        // 'Unknown'/'Resetting' after the timeout — adapter never settled.
        setBleStatus('disconnected');
        setBleReason('failed');
      }
      return;
    }

    // Reset accumulator + UI list.
    scanFoundRef.current = new Map();
    lastScanFlushRef.current = 0; // first discovered device flushes immediately
    setDiscoveredDevices([]);
    setNoHrDeviceName(null); // clear any stale "connected but no HR" guidance
    setBleStatus('scanning');
    setBleReason('none');

    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = setTimeout(() => {
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      scanTimeoutRef.current = null;
      // Final flush so the last (sub-throttle) burst of results is shown.
      setDiscoveredDevices(sortDiscovered(Array.from(scanFoundRef.current.values())));
      // Only revert status if we're still scanning (not mid-connect).
      setBleStatus((prev) => (prev === 'scanning' ? 'disconnected' : prev));
      if (scanFoundRef.current.size === 0) setBleReason('noDeviceFound');
    }, SCAN_TIMEOUT_MS);

    // UNFILTERED scan (root-cause fix): a service-UUID filter ([HR_SERVICE]) only
    // matches devices that advertise 0x180D in the *advertising packet*. A WHOOP —
    // and many straps that expose HR only in the scan response or GATT table —
    // never fire the callback under a filter, so they never appear. Scan with no
    // filter and decide HR capability AFTER connecting (see finalizeConnection).
    // allowDuplicates:true so a device that's nameless / RSSI-less in its first
    // advertisement gets its real name + live signal filled in from later packets
    // (the dedupe/merge below relies on this); UI flushes are throttled to ~3/sec.
    manager.startDeviceScan(null, { allowDuplicates: true }, (error: any, device: any) => {
      if (error) {
        if (scanTimeoutRef.current) { clearTimeout(scanTimeoutRef.current); scanTimeoutRef.current = null; }
        try { manager.stopDeviceScan(); } catch { /* ignore */ }
        setBleStatus('disconnected');
        setBleReason('failed');
        return;
      }
      if (!device) return;
      const advertised = device.name || device.localName || null;
      const advertisesHrService = Array.isArray(device.serviceUUIDs)
        && device.serviceUUIDs.some((u: any) => typeof u === 'string' && u.toLowerCase() === HR_SERVICE.toLowerCase());
      // Show every CONNECTABLE peripheral — drop ONLY beacons that explicitly
      // report they can't be connected. A WHOOP in Broadcast Heart Rate mode
      // advertises NEITHER 0x180D NOR (reliably) a name, so hiding unnamed devices
      // risked hiding the user's own strap entirely. Unnamed-but-connectable rows
      // render as "Unknown device (…)" and sort to the bottom (sortDiscovered),
      // and an accidental tap on a non-HR device is handled honestly post-connect.
      if (!advertised && !advertisesHrService && device.isConnectable === false) return;
      // Dedupe by id; merge so a later packet that drops the name/UUIDs can't blank
      // a good earlier one. Never auto-connect — the user picks from the list.
      const prev = scanFoundRef.current.get(device.id);
      const named = !!advertised || prev?.named || false;
      const info: BLEDeviceInfo = {
        id: device.id,
        // Distinguishable placeholder (last 4 of id) so two unnamed devices don't collide.
        name: advertised || prev?.name || `Unknown device (${String(device.id).slice(-4)})`,
        rssi: typeof device.rssi === 'number' ? device.rssi : (prev?.rssi ?? null),
        advertisesHrService: advertisesHrService || prev?.advertisesHrService || false,
        named,
      };
      scanFoundRef.current.set(device.id, info);
      // Throttle UI flushes (~3/sec): allowDuplicates:true means this callback can
      // fire dozens of times/sec across all nearby peripherals. The accumulator Map
      // always has the freshest data; the timeout handler does a final flush so the
      // last sub-throttle burst still renders.
      const now = Date.now();
      if (now - lastScanFlushRef.current >= 350) {
        lastScanFlushRef.current = now;
        setDiscoveredDevices(sortDiscovered(Array.from(scanFoundRef.current.values())));
      }
    });
  }, [ensureManager, awaitSettledAdapterState]);

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
    setNoHrDeviceName(null); // picking a (new) device clears any prior no-HR guidance
    // Tear down ANY existing connection BEFORE attempting the new one, so a
    // failed strap-switch can't leave the old device silently streaming BPM
    // (and recording ghost samples into an active session). Safe no-op when
    // there's no previous device. Every failure path below now ends honestly
    // disconnected because the old link is already gone.
    clearConnectionState(true);
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
  }, [ensureManager, stopScan, cancelPendingDropReconnect, finalizeConnection, clearConnectionState]);

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
    // Tear down ANY existing connection BEFORE the new attempt, so no failure
    // path can leave a previous device streaming. Safe no-op when there's no
    // previous device (so reconnect-after-drop is unaffected).
    clearConnectionState(true);
    try {
      // Pre-connect adapter gate (same cold-launch fix as startScan): wait for
      // the state to settle — the ref is 'Unknown' on the first BLE action of
      // a process, and stale when the PoweredOn handler invoked us — then bail
      // with the honest blocking reason instead of a doomed connect → generic
      // 'failed'. Inside the try so `finally` still frees connectingRef.
      const adapterState = await awaitSettledAdapterState(manager);
      if (adapterState !== 'PoweredOn') {
        setBleStatus('disconnected');
        setBleReason(
          adapterState === 'PoweredOff' ? 'poweredOff'
          : adapterState === 'Unauthorized' ? 'unauthorized'
          : adapterState === 'Unsupported' ? 'unsupported'
          : 'failed',
        );
        return false;
      }
      const device = await manager.connectToDevice(saved.id);
      return await finalizeConnection(device);
    } catch {
      // We optimistically set reason 'none' on entry, so the honest blocking
      // reason (Bluetooth off / permission / unsupported) is gone by now. The
      // failure usually IS the adapter being unusable (e.g. tapping the manual
      // Reconnect button while Bluetooth is off), so re-derive an honest reason
      // from the adapter state at catch time rather than leaving a misleading
      // 'Not connected' (honest-status invariant). Only fall back to 'failed'
      // when the adapter looks usable and the connect failed for another reason.
      setBleStatus('disconnected');
      const adapter = bleAdapterStateRef.current;
      setBleReason(
        adapter === 'PoweredOff' ? 'poweredOff'
        : adapter === 'Unauthorized' ? 'unauthorized'
        : adapter === 'Unsupported' ? 'unsupported'
        : 'failed',
      );
      return false;
    } finally {
      connectingRef.current = false;
    }
  }, [ensureManager, awaitSettledAdapterState, cancelPendingDropReconnect, finalizeConnection, clearConnectionState]);
  useEffect(() => { reconnectSavedRef.current = reconnectSaved; }, [reconnectSaved]);

  // ── BLE scan + connect (COMPAT — kept for BLE_CONTRACT.md back-compat).
  // Reconnect-first: silently reconnect a known saved strap (legitimate — not a
  // "first match"). Otherwise populate the picker via the UNFILTERED scan and let
  // the user choose. We NO LONGER auto-grab the first match: under an unfiltered
  // scan that would connect to a random nearby peripheral (AirPods, a TV…), and
  // picking the right strap is the whole point. Callers that want a connection
  // route the user to the picker (BluetoothDevicesScreen → connectToDevice).
  const scanAndConnect = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'web') {
      setBleStatus('unavailable');
      setBleReason('unsupported');
      return false;
    }
    // In-flight guard: at most one connect attempt ever runs at a time. Bail
    // BEFORE any state change so an in-flight auto-reconnect isn't disturbed.
    if (connectingRef.current) return false;
    // A new connect supersedes any pending post-drop reconnect — cancel its timer.
    cancelPendingDropReconnect();
    // Try the saved monitor first (silent, no dialog, no picker needed).
    if (savedDeviceRef.current) {
      const ok = await reconnectSaved();
      if (ok) return true;
    }
    // No saved device (or reconnect failed): populate the picker; the user picks.
    await startScan();
    return false;
  }, [cancelPendingDropReconnect, reconnectSaved, startScan]);

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
    // Null the ref SYNCHRONOUSLY (not just via setSavedDevice, which the
    // ref-sync effect mirrors only on the NEXT render). The onStateChange
    // 'PoweredOn' handler, the AppState-foreground listener, and reconnectSaved's
    // entry all read savedDeviceRef.current; if one fires in the window before
    // the ref syncs it would reconnect to — and re-persist — the just-forgotten
    // device. Setting the ref here closes that window.
    savedDeviceRef.current = null;
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

    // synced:false BEFORE the write — an offline write hangs, so a process death
    // must leave the session queued for the launch flush. trimKeepingUnsynced,
    // not slice(): the 200 cap exists to bound AsyncStorage, and evicting a row
    // that hasn't reached the server yet would destroy it permanently.
    const queued: SyncedHRSession = { ...session, synced: false };
    setSessions((prev) => trimKeepingUnsynced([queued, ...prev], HR_LOCAL_CAP, (r) => Date.parse(r.startedAt) || 0));
    setCurrentBpm(0);
    const uid = getCurrentUid();
    if (uid) pushHrSession(uid, queued)
      .then((ok) => { if (ok) setSessions((prev) => prev.map((s) => (s.id === queued.id ? { ...s, synced: true } : s))); })
      .catch(() => {});
    return queued;
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
        noHrDeviceName,
      }}
    >
      {children}
    </HeartRateContext.Provider>
  );
}

export function useHeartRate() {
  return useContext(HeartRateContext);
}
