# Zenki — Bluetooth / WHOOP Fix — HANDOFF

_Last updated: 2026-06-08. Written for a fresh session or another dev to pick this up cold._

## TL;DR / current status
- **Goal:** make Zenki discover BLE heart-rate devices in-app and connect to one (a **WHOOP** is the test case) **without** pairing through iOS Settings.
- **Done & MERGED to `main`:** PR **#6** → merge commit **`97784e1`** (2026-06-08). Two commits:
  - `a59fdb8` — BLE: unfiltered scan + post-connect HR check (WHOOP-discoverable)
  - `50a37fb` — HealthKit: stop double-writing workout HR to Apple Health
- **Quality:** `npm run typecheck` green; two independent reviewers + `react-native-ble-plx` 3.5.1 API verification; concurrency guards + lazy init preserved.
- **⚠️ THE ONE OPEN ITEM — NOT device-verified.** BLE cannot run on the iOS Simulator. The acceptance test (a **live BPM stream from a real WHOOP that matches the WHOOP's own reading**) was **never run**. It was merged to main per owner decision before that test. **This is the #1 thing to do next.**

---

## What was broken (root cause)
Bluetooth "looked connected but never found a real monitor." Both scan paths used
`manager.startDeviceScan([HR_SERVICE], …)`. A **service-UUID scan filter only matches devices that
advertise `0x180D` in the advertising packet.** A WHOOP (and straps that expose HR only in the scan
response / GATT table) never fired the scan callback → never listed → never connected. Pairing the WHOOP
in iOS Settings does **not** hand it to a Core Bluetooth app, and a bonded WHOOP stops advertising.

## The fix
1. **Unfiltered scan** — `startDeviceScan(null, { allowDuplicates: true }, …)`. Build the list from
   `name`/`localName`/`serviceUUIDs`/`rssi`. Show **all connectable devices** (drop only
   `isConnectable === false` beacons) so a nameless WHOOP still appears as "Unknown device (…)".
   HR-advertisers + named devices sort first; UI flush throttled ~3/sec (`lastScanFlushRef`).
2. **HR capability AFTER connecting** — in `finalizeConnection`, after
   `discoverAllServicesAndCharacteristics()`, check `characteristicsForService(0x180D)` → `0x2A37`.
   If absent → drop the link, set honest `bleReason: 'noHrService'` + `noHrDeviceName`. **Never** a
   fake/stale "connected · — bpm".
3. **No first-match auto-connect** — `scanAndConnect` is reconnect-first, then opens the picker; the
   user picks. `WorkoutSessionScreen` now navigates to the `BluetoothDevices` screen.
4. **Picker UX** — WHOOP "Broadcast Heart Rate" guidance card; "Zenki connects directly — iOS Settings
   pairing isn't used" explainer; `HR` tag on straps; honest `noHrService` copy in Settings.
5. **Android** — added `BLUETOOTH_SCAN` permission (iOS strings already shipped).
6. **HealthKit dedupe** — HR was written to Apple Health twice during a recording (live `currentBpm`
   push + the full session-sample backfill, different timestamps → no dedupe). Live push is now gated
   on `!isRecording`; the per-session backfill owns recorded HR.

## Files changed (7)
| File | Change |
|---|---|
| `src/types/heartRate.ts` | `BLEReason 'noHrService'`; `BLEDeviceInfo.advertisesHrService?` + `named?` |
| `src/context/HeartRateContext.tsx` | unfiltered scan, `sortDiscovered`, throttle, `finalizeConnection` HR check, `scanAndConnect` rewrite, `noHrDeviceName` |
| `src/screens/BluetoothDevicesScreen.tsx` | picker rows (HR tag), WHOOP guidance card, iOS-pairing explainer, `noHrService` status |
| `src/screens/WorkoutSessionScreen.tsx` | navigates to the picker instead of auto-connecting |
| `src/screens/SettingsScreen.tsx` | `noHrService` DEVICES subtitle |
| `app.json` | Android `BLUETOOTH_SCAN` |
| `src/context/HealthKitContext.tsx` | gate live HR push on `!isRecording` |

---

## ✅ NEXT: verify on a physical device (the gate that's still open)
BLE needs a real iPhone + a real WHOOP. From a checkout of `main`:
```bash
npm install
npx expo run:ios --device      # or: eas build -p ios --profile development, then install
```
**WHOOP setup (critical):** WHOOP app → enable **Broadcast Heart Rate**; make sure the WHOOP isn't held
by its own app and **isn't bonded in iOS Settings → Bluetooth** (forget it there if so — it stops
advertising otherwise); keep the phone close.

**Positive path (must stream):** Zenki → Settings → DEVICES → Manage Devices → **Scan** (allow the BT
prompt) → WHOOP appears (ideally by name, maybe "Unknown device (…)") → tap it → **`Connected — … · NN
bpm`, NN matches the WHOOP, updates ~1/sec.** Battery/RSSI show if exposed.

**Negative paths (must be honest, no fake HR):** Broadcast OFF or WHOOP busy → either not listed, or it
connects then shows **"No heart-rate signal"** + the WHOOP guidance card. Bluetooth off → "Bluetooth is off".

**Also check:** Disconnect / Forget / force-quit→relaunch auto-reconnect; if a second strap (e.g. Polar
H10) is handy, confirm the fix is general, not WHOOP-specific.

## If on-device testing fails — revert
```bash
git revert -m 1 97784e1     # cleanly undoes the merge, keeps history
```
Then fix on a new branch and re-PR. Diagnose first: is the device **not appearing** (scan/advertising
issue — try `allowDuplicates` already true; check it's broadcasting & not bonded) vs **appearing but not
streaming** (HR characteristic / capability-check issue in `finalizeConnection`).

---

## Known caveats & design decisions (don't "fix" these blindly)
- **Lazy `BleManager` init is load-bearing** — it must NEVER be constructed on mount (it fires the iOS
  Bluetooth permission dialog → App Review sensitivity). Only from a user scan/connect or saved-device reconnect.
- **Concurrency guards are deliberate** — `connectingRef`, `handleDrop`, `cancelPendingDropReconnect`,
  `MAX_DROP_RETRIES`, RSSI watchdog, teardown-before-connect. Each fixed an audited race. Don't simplify away.
- **Unfiltered scan shows more devices** (phones, watches, TVs). Trade-off chosen so the WHOOP is never
  hidden. HR straps + named devices sort to the top; `HR` tag marks `0x180D` advertisers.
- **`allowDuplicates: true`** makes the dedupe/merge load-bearing (names/RSSI fill in across packets);
  throttled to ~3/sec. If the scan feels heavy in a dense BLE environment, that's the knob.
- **HR history is device-local** (`useSyncedState` → AsyncStorage). NOT Firestore, NOT cross-device, NOT
  social. (Apple Health is the only off-device copy, and only if the toggle is on.)
- **Apple Health is a real integration** (`react-native-health`): pushes sessions (as HKWorkouts) + HR
  samples + ambient live BPM; pulls daily totals/HR/weight. Gated by Settings toggle + permission + iOS +
  a dev build. Reads the SAME `HeartRateContext`, so real streamed HR flows there automatically; the
  "no fake BPM" rule means nothing fabricated reaches Health.

## Source-of-truth docs already in the repo
- `BLE_CONTRACT.md` — the `HeartRateContext` API contract.
- `BLE_ONDEVICE_CHECKLIST.md` — fuller A–H manual on-device test matrix.
- `BLUETOOTH_REDO_PROMPT.md` — the original spec this work followed.

## Audit summary (what was already checked)
Two independent reviewers + ble-plx 3.5.1 type verification. Verdict: the in-app discover→select→connect
flow works with no iOS-pairing dependency; concurrency invariants intact; `tsc` clean; no fabricated BPM.
The one MAJOR finding (a "hide all unnamed devices" rule that could have hidden the WHOOP) was fixed before
merge by showing all connectable devices.

---

## Kickoff prompt for a fresh Claude Code session
> Paste this into a new chat opened in the `Zenki-App` repo. (Also reproduced in the chat response.)

```
Read BLUETOOTH_WHOOP_HANDOFF.md, BLE_CONTRACT.md, and BLE_ONDEVICE_CHECKLIST.md first.

Context: the BLE/WHOOP fix is already MERGED to main (PR #6, merge commit 97784e1) but was NEVER
verified on a physical device — that's the open item. The fix changes the BLE scan to UNFILTERED and
determines HR capability AFTER connecting. Source of truth for the HeartRateContext API is
BLE_CONTRACT.md.

I want to verify it on my real iPhone + WHOOP and fix anything that's wrong. Plan mode first.

1. Help me build to my device from main: `npm install` then `npx expo run:ios --device` (BLE can't run
   on the Simulator). Walk me through WHOOP "Broadcast Heart Rate" setup.
2. I'll report what I see. The acceptance test is a LIVE BPM stream that matches the WHOOP — not a green
   checkmark. Negative paths must be honest (no fabricated BPM).
3. If the WHOOP doesn't appear or doesn't stream, diagnose root cause (advertising/scan vs. HR
   characteristic in finalizeConnection), fix on a NEW branch, keep the lazy BleManager init and all
   concurrency guards intact, run `npm run typecheck`, and open a PR. Don't merge until I confirm it
   streams on-device.

Honor these invariants: lazy BleManager init must never run on mount (App Review); never present fake
data as a live reading; preserve the documented concurrency guards in HeartRateContext.
```
