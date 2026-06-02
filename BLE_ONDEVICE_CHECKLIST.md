# BLE Connectivity — On-Device Manual Test Checklist

> BLE **cannot** be exercised on the iOS Simulator (no Bluetooth radio). Run this on a **physical iPhone**
> with a real heart-rate strap (e.g. Polar H10, Wahoo TICKR, Garmin HRM, or any standard `0x180D` monitor).
> Build: `npm run ios` (or `expo run:ios --device`). Each row maps to a requirement in
> `BLE_CONNECTIVITY_UX_PROMPT.md`. Mark ✅/❌ and note the device + strap used.

Tester: __________   iPhone model / iOS: __________   Strap: __________   Date: __________

## A. Permission & lazy-init (the load-bearing invariant)
- [ ] **Fresh install → no Bluetooth dialog at launch.** Delete the app, reinstall, open it, complete onboarding (incl. the "Bluetooth" card). **Expected:** iOS Bluetooth permission prompt does **NOT** appear yet. (Onboarding card is honest — it grants nothing.)
- [ ] **Dialog fires on first scan.** Settings → DEVICES → Manage Devices → **Scan for devices**. **Expected:** iOS shows the Bluetooth permission prompt now (first time only).
- [ ] **Allow → scanning starts.** Tap *Allow*. **Expected:** status shows `Scanning…` with a spinner.

## B. Device picker (no silent first-match)
- [ ] **Multiple straps listed.** With 2+ HR monitors nearby/awake, scan. **Expected:** **all** appear in "Nearby Monitors" with names + signal bars — you choose; it does not auto-grab the first.
- [ ] **Pick connects.** Tap one. **Expected:** `Connecting…` → `Connected — <name>`.
- [ ] **Signal bars reflect distance.** Walk away / closer. **Expected:** bars drop / rise within ~5 s (live RSSI poll).

## C. Live data + rich info
- [ ] **Live BPM streams.** **Expected:** BPM updates in the status card and on the Workout screen, ~1/sec, plausible value.
- [ ] **Battery %.** If the strap exposes Battery Service (`0x180F`): **Expected:** battery % shows. (If the strap omits it, the field is correctly hidden — not a failure.)
- [ ] **Last-connected timestamp.** **Expected:** "Last connected just now" appears, then ages ("x mins ago").

## D. Saved device + auto-reconnect (BLE_DEVICE_KEY now actually used)
- [ ] **Reconnect button.** Disconnect, then on the saved-device card tap **Reconnect**. **Expected:** reconnects without a fresh scan.
- [ ] **Auto-reconnect on relaunch.** Force-quit the app, reopen (strap on). **Expected:** silently reconnects to the saved monitor — no manual scan needed, no new permission prompt.
- [ ] **Auto-reconnect on foreground.** Background the app ~30 s, reopen. **Expected:** if it had dropped, it silently reconnects.

## E. Drop recovery (never a stale "connected")
- [ ] **Walk out of range.** Move ~20 m away / power off the strap. **Expected:** status changes to `Monitor disconnected` (not stuck on Connected); BPM clears.
- [ ] **Return in range.** Come back / power the strap on. **Expected:** it auto-reconnects (one backoff attempt) or Reconnect works.

## F. Honest error states (each must show the RIGHT message + fix)
- [ ] **Bluetooth off.** Turn iOS Bluetooth off, open the screen / scan. **Expected:** `Bluetooth is off` + "Turn on Bluetooth in Control Center". Turning it back on clears the message (and auto-reconnects if a device was saved).
- [ ] **Permission denied.** (Reset via Settings → Zenki → Bluetooth OFF, or a fresh install + *Don't Allow*.) **Expected:** `Permission needed` + an **"Allow Bluetooth in Settings"** button that opens iOS Settings.
- [ ] **No monitor found.** Scan with all straps off. **Expected:** after ~12 s, `No monitor found` + "Bring the strap closer / wet the contacts". (Does not scan forever.)

## G. Disconnect / Forget
- [ ] **Disconnect.** While connected, tap **Disconnect**. **Expected:** drops to `Not connected`; saved device is **kept** (Reconnect still offered).
- [ ] **Forget device.** Tap **Forget device** → confirm. **Expected:** saved device removed; relaunch does **not** auto-reconnect until you pick again.

## H. Cross-surface consistency
- [ ] **Settings status == Workout status.** Connect, open the Workout screen, then Settings → DEVICES. **Expected:** both show the same device + live BPM (single source of truth).
- [ ] **Scan stops on back-nav.** Start a scan, immediately tap back. **Expected:** the radio stops scanning right away (not 12 s later).
- [ ] **No fabricated BPM.** With no strap connected, start a workout. **Expected:** BPM shows `--` (never a fake number); on web it's labeled "Demo Mode".

---
**Sign-off:** all of A–H pass on a physical device → BLE UX is verified. Attach the device/strap used and any row that failed with notes.
