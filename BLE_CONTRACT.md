# BLE_CONTRACT.md — HeartRateContext public API (single source of truth)

> Authored by the lead before parallel implementation. **Agent CORE** implements this exact
> interface in `src/context/HeartRateContext.tsx` + `src/types/heartRate.ts`. **Agent UI**
> consumes ONLY what is listed here. If something is ambiguous, the contract wins — do not
> invent fields. Scope: **iOS only** (existing `Platform.OS === 'web' → 'unavailable'` guards
> stay; do NOT add Android runtime-permission code; do NOT touch `app.json`).

## Invariants (the review agent checks these)

1. **Single source of truth.** Exactly one `BleManager` instance, owned by `HeartRateContext`. No new BLE stack.
2. **Lazy init preserved — NO manager on mount.** `new BleManager()` is created only from a
   user-initiated action (`startScan` / `connectToDevice` / `scanAndConnect`) **or** a silent
   `reconnectSaved()` that runs *only when a `savedDevice` already exists* (which implies the iOS
   dialog was already granted on a prior connect). Never instantiate the manager on mount, in
   onboarding, or for a user who has never connected. `onStateChange` is subscribed the moment the
   manager is first created — never before.
3. **Backward compatible.** Every existing field/function below keeps its current signature and
   behavior. Consumers `WorkoutSessionScreen`, `HealthKitContext`, `HomeScreen`, `ProfileScreen`,
   `SessionHistoryScreen` must compile and behave unchanged. New fields are purely additive.
4. **Honest status.** No fabricated/simulated BPM (current code already refuses to — keep it).
   `bleStatus`/`bleReason` always reflect reality.
5. **No leaks.** On unmount and on `disconnect()`, tear down: HR characteristic subscription,
   `onStateChange` subscription, `onDisconnected` subscription, RSSI poll interval, scan timeout,
   cancel the connection, and (unmount only) `manager.destroy()`.

## Types — `src/types/heartRate.ts`

```ts
// KEEP as-is (do not change — consumers switch on these literals):
export type BLEStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'unavailable';

// ADD:
/** WHY we are in the current status — drives actionable UI copy. */
export type BLEReason =
  | 'none'           // nominal: connected, or idle before first use
  | 'poweredOff'     // adapter off            → "Turn on Bluetooth"
  | 'unauthorized'   // BLE permission denied  → "Allow Bluetooth in Settings"
  | 'unsupported'    // no BLE (web/simulator) → "Bluetooth isn't available on this device"
  | 'noDeviceFound'  // scan timed out empty   → "No monitor found. Bring the strap closer / wet the contacts"
  | 'dropped'        // unexpected disconnect  → "Monitor disconnected"
  | 'failed';        // connect attempt failed → "Couldn't connect. Try again."

/** A nearby HR monitor seen during a scan. */
export interface BLEDeviceInfo {
  id: string;
  name: string;        // device.name || device.localName || 'HR Monitor'
  rssi: number | null; // dBm; null if unknown
}

/** The last-used monitor, persisted across launches. */
export interface SavedBLEDevice {
  id: string;
  name: string | null;
  lastConnectedAt: number | null; // Date.now()
}
```

## Context value — `HeartRateContextValue`

```ts
interface HeartRateContextValue {
  // ───────── EXISTING — unchanged signatures/behavior ─────────
  bleStatus: BLEStatus;
  connectedDeviceName: string | null;
  scanAndConnect: () => Promise<boolean>;   // see "Behavior" — now reconnect-first
  disconnect: () => void;                    // user-initiated disconnect
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
  bleAdapterState: string;                   // raw ble-plx State name: 'PoweredOn' | 'PoweredOff' | 'Unauthorized' | 'Unsupported' | 'Resetting' | 'Unknown'

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
```

### Default context object (no-op) must include every new field
`bleReason: 'none'`, `bleAdapterState: 'Unknown'`, `discoveredDevices: []`, `startScan: async () => {}`,
`stopScan: () => {}`, `connectToDevice: async () => false`, `savedDevice: null`,
`reconnectSaved: async () => false`, `forgetDevice: async () => {}`, `batteryLevel: null`,
`signalRssi: null`, `lastConnectedAt: null`.

## Behavior spec (CORE)

**Constants:** `SCAN_TIMEOUT_MS = 12000`. UUIDs: HR service `0000180D-…`, HR char `00002A37-…`,
Battery service `0000180F-…`, Battery char `00002A19-…`.

- **`ensureManager()`** (private): if `bleManagerRef` empty, `require('react-native-ble-plx')` →
  `new BleManager()`; immediately subscribe `manager.onStateChange(handler, true)` and store the
  subscription for teardown. Return manager (or null → set `'unavailable'`/`'unsupported'`). Web → null.
- **onStateChange handler:** set `bleAdapterState` to the raw state. Map:
  `PoweredOff`→ if connected treat as drop; `bleReason='poweredOff'`, status `'disconnected'`.
  `Unauthorized`→ `bleReason='unauthorized'`. `Unsupported`→ status `'unavailable'`, `bleReason='unsupported'`.
  `PoweredOn`→ clear blocking reason to `'none'`; if `savedDevice` exists and not connected, may `reconnectSaved()`.
- **`startScan()`**: `ensureManager`; if adapter not `PoweredOn`, set the matching reason and return
  (no scan). Else `bleStatus='scanning'`, clear `discoveredDevices`, `startDeviceScan([HR_SERVICE], …)`,
  accumulate into a **deduped-by-id** list with latest `rssi`; **do not connect**. After `SCAN_TIMEOUT_MS`:
  `stopDeviceScan()`, `bleStatus='disconnected'`, and if list empty `bleReason='noDeviceFound'`.
- **`stopScan()`**: clear timeout + `stopDeviceScan()`; status back to `'disconnected'` (or `'connected'` if a device is live).
- **`connectToDevice(id)`**: `ensureManager`; `bleStatus='connecting'`; connect by id → discover →
  `finalizeConnection(device)`; return boolean. On error → `bleStatus='disconnected'`, `bleReason='failed'`.
- **`finalizeConnection(device)`** (private, shared by all connect paths): store device ref + name;
  subscribe HR characteristic (reuse existing base64/flags BPM parser **verbatim**); register
  `device.onDisconnected(…)`; read battery once (try/catch); start RSSI poll (~5s, `readRSSI()`);
  persist saved device as JSON `{id, name, lastConnectedAt: Date.now()}`; set `savedDevice`,
  `lastConnectedAt`, `connectedDeviceName`, `bleStatus='connected'`, `bleReason='none'`.
- **`reconnectSaved()`**: if no `savedDevice` → false. `ensureManager`; `bleStatus='connecting'`;
  `manager.connectToDevice(savedDevice.id)` → discover → `finalizeConnection`. false on failure (leave status `'disconnected'`).
- **`scanAndConnect()`** (compat — keep WorkoutSessionScreen working): try `reconnectSaved()` first;
  if true return true; else run the existing first-match scan but route the found device through
  `finalizeConnection`. Same return contract (`Promise<boolean>`).
- **`onDisconnected` drop recovery:** clear HR subscription + refs, `setCurrentBpm(0)`,
  `bleStatus='disconnected'`, `bleReason='dropped'`, `signalRssi=null`, `batteryLevel=null`. Optionally
  one backoff `reconnectSaved()` after ~2s, guarded by a flag to prevent loops. Never leave a stale `'connected'`.
- **AppState foreground:** on `'active'`, if `savedDevice` exists, adapter is `PoweredOn`, and not
  connected → `reconnectSaved()`. (Only instantiates the manager when a savedDevice exists → no surprise dialog.)
- **`savedDevice` load on mount:** `AsyncStorage.getItem(BLE_DEVICE_KEY)`; **migration** — value may be
  legacy bare string `device.id` OR new JSON. Parse: if JSON.parse fails, treat as `{id: raw, name: null, lastConnectedAt: null}`.
- **`forgetDevice()`**: `disconnect()`, `AsyncStorage.removeItem(BLE_DEVICE_KEY)`, `savedDevice=null`.
- **Battery:** `readCharacteristicForService(BATTERY_SERVICE, BATTERY_CHAR)` → first byte = percent. try/catch (many straps omit it → leave `null`).
- **RSSI bars helper** lives in the UI; CORE just exposes raw `signalRssi`/`rssi`.

## AsyncStorage schema

`BLE_DEVICE_KEY = '@zenki_ble_device'` now stores `JSON.stringify({id, name, lastConnectedAt})`.
Reader tolerates the legacy bare-string form. `STORAGE_KEY='@zenki_hr_sessions'` unchanged.

## UI status copy (shared mapping — Settings subtitle AND BluetoothDevicesScreen use this)

| condition | line |
|---|---|
| `bleStatus==='connected'` | `Connected — {connectedDeviceName} · {currentBpm>0 ? currentBpm+' bpm' : '— bpm'}` |
| `bleStatus==='scanning'` | `Scanning…` |
| `bleStatus==='connecting'` | `Connecting…` |
| `reason==='poweredOff'` | `Bluetooth is off` |
| `reason==='unauthorized'` | `Permission needed` |
| `reason==='unsupported'` / `bleStatus==='unavailable'` | `Not available on this device` |
| `reason==='noDeviceFound'` | `No monitor found` |
| `reason==='dropped'` | `Monitor disconnected` |
| else (`disconnected`,`none`) | `Not connected` |

Action copy for error states (BluetoothDevicesScreen): poweredOff→"Turn on Bluetooth";
unauthorized→"Allow Bluetooth in Settings" (+ button `Linking.openSettings()`);
noDeviceFound→"Bring the strap closer / wet the contacts".

## File ownership (NO file edited by two agents)

- **Lead:** `BLE_CONTRACT.md`, integration, typecheck/build, commit.
- **CORE:** `src/context/HeartRateContext.tsx`, `src/types/heartRate.ts` — nothing else.
- **UI:** `src/screens/BluetoothDevicesScreen.tsx` (new), `src/screens/SettingsScreen.tsx`,
  `src/navigation/RootNavigator.tsx` — nothing else. Do NOT edit `WorkoutSessionScreen.tsx` or `app.json`.
