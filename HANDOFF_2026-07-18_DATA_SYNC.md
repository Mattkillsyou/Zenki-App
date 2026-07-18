# Zenki Dojo — Handoff (2026-07-18) · "Everything Online" data-sync release (2.0.6)

Picking up on a new PC. This is the single source of truth for where things stand.

## TL;DR
- **2.0.6 = the "nothing lives only on-device" release.** All 12 previously device-local datasets now
  mirror to Firestore, so a member's data survives an app delete or a new phone.
- **iOS build 53 (v2.0.6) is FINISHED on EAS.** It has **NOT been device-tested** and has **NOT been
  submitted** to App Review.
- **All code is committed + pushed to `main`** (this handoff + the build-number bump are the final
  commit; everything else was already on origin).
- **Next steps, in order:** (1) smoke-test build 53 on a real device, (2) `eas submit`, (3) nudge users
  to update.

---

## New-PC setup
```
git clone https://github.com/Mattkillsyou/Zenki-App.git
cd Zenki-App
npm install            # clean install — see "D: drive warning" below
```
Accounts to re-auth on the new machine:
- **EAS / Expo:** `eas login` — account `mattbrowntheemail@gmail.com`, project `@mattbrowntheemail/zenki-dojo`.
- **Firebase:** `firebase login` — project `zenki-dojo` (needed for rules/functions/hosting deploys).
- **GitHub:** remote `https://github.com/Mattkillsyou/Zenki-App.git`, branch `main`.

---

## The build
- **Build 53, v2.0.6, status: finished.** Built 7/17 5:38 PM → 9:00 PM.
- `.ipa`: https://expo.dev/artifacts/eas/VA6MgugkGctpBoYjX99KjRLD-9nQIbZFdLPJgtVhTig.ipa
- Build page (has an install QR): https://expo.dev/accounts/mattbrowntheemail/projects/zenki-dojo/builds/095aed24-4c56-44a0-8315-a07c0366fac1
- Command used: `eas build --platform ios --profile production --non-interactive --no-wait`
- **Gotcha:** do NOT pipe `eas build` into `tail`/`head` — the SIGPIPE kills the upload after the
  credentials step (cost one wasted attempt). Let it write output directly.

## Submit (ONLY after the device smoke-test)
```
npx eas submit --platform ios --profile production --latest
```
- `--latest` picks build 53 automatically.
- **The `.p8` App Store Connect key is NOT in the repo** (gitignored). `eas.json` points at
  `./AuthKey_393722HSY5.p8`. The ASC API key is ALSO stored on EAS's credential service, so submit can
  use that (it may prompt to choose it). To be fully hands-off, drop `AuthKey_393722HSY5.p8` into the
  repo root first.
- ASC app id `6763685748`, Apple team `RPV54B2NK5`. This is the OWNER's step (Apple auth).

---

## What 2.0.6 actually contains — the 12 datasets
Every previously-AsyncStorage-only dataset now write-throughs to Firestore, migrates existing on-device
data once on first launch, and live-hydrates. Each got its own adversarial-review pass (~50 confirmed
bugs fixed across the effort, several data-loss bugs in the fixes themselves).

| Dataset | Firestore path | Notes |
|---|---|---|
| Workouts + PRs | `/training/{uid}/{logs,personalRecords}` | trainer-readable |
| Gamification | `/gamification/{uid}` | single blob, debounced 4s; balance client-authored |
| DEXA, bloodwork | `/nutrition/{uid}/{dexaScans,bloodworkReports}` | consent tier 1 |
| Medications + dose logs, cycle | `/nutrition/{uid}/{medications,medicationLogs,cycleEntries}` | consent tier 2 |
| HR sessions, GPS activities | `/nutrition/{uid}/{hrSessions,gpsActivities}` | consent tier 1 (GPS routes!) |
| Staff time clock | `/users/{uid}/timeEntries` | payroll; owner+admin read only |
| Drink tab | `/drinkTabs/{uid}/entries` | billing; owner+admin read only |

Plus: a **dormant** server-authored points ledger (`functions/src/pointsLedger.ts`) and **two member
consent switches** in Settings → Privacy & Safety (body/lab data vs medication/cycle), both default OFF.
Firestore rules + `functions/src/purgeUserData.ts` (GDPR erasure) cover every collection and are DEPLOYED.

## Trainer access
`isTrainer()` role is LIVE (rules + `/trainers/{uid}` doc, admin-granted from the web admin's Members
tab). Trainers read `/members`, `/attendance`, `/appointments`, `/orders`, `/training`, and any health
data a member has opted to share. They get NO admin powers.

---

## Architecture — where the sync code lives
- **`src/services/syncCore.ts`** — the durable-write foundation used by every dataset:
  `pushRecord` / `flushQueue` / `migrateRecords` / `mergeById` / `subscribeCollection` /
  `reconcileDeletes` / `markSyncedUnchanged` / `trimKeepingUnsynced`.
- Per-dataset services: `trainingSync.ts`, `gamificationSync.ts`, `healthSync.ts` (DEXA/bloodwork/meds/
  cycle + consent), `billingSync.ts` (drink tab + time clock), and the pre-existing `nutritionSync.ts`.
- Contexts wired: `WorkoutContext`, `GamificationContext`, `NutritionContext`, `MedicationTrackerContext`,
  `CycleTrackerContext`, `HeartRateContext`, `GpsActivityContext`, `TimeClockContext`, `DrinkTrackerContext`.

### The 9 hard-won sync rules (each cost a P0/P1 this session — obey in any new sync code)
1. **Queue BEFORE the write, clear only on server-confirmed success.** Offline Firestore writes HANG,
   they don't throw — there is no failure to catch (memory-only cache; no persistent cache in RN).
2. **Full-record writes use `merge:false`.** With merge:true a CLEARED field is just absent from the
   payload, so the server keeps it and the listener echoes it back — the delete un-does itself.
3. **Never read state via an identity setState updater** (`setX(prev=>{copy=prev;return prev})`) — React
   skips the eager pass when an update is pending. Read a committed ref.
4. **Client `isSyncable*` must never be STRICTER than the rule** — it silently strands records the server
   would accept.
5. **`allIds` for delete-reconcile must come from a SERVER snapshot** (`!metadata.fromCache` +
   `includeMetadataChanges`) — an offline cache snapshot else wipes the local cache.
6. **`markSyncedUnchanged` by REFERENCE, not content** (flush sanitizes) so a row edited mid-flush stays
   queued.
7. **Cap in the MERGE path, not just on save** — a listener's first snapshot delivers the whole server
   collection.
8. **Gate migrations on hydrate SUCCESS, not "hydrate finished"** — a failed read that arms persistence
   wipes the key, then the migration marks itself done over the empty list (`useSyncedState` returns a
   4th value `hydrateOk`; use it).
9. **Keep consent-toggle copy accurate to what the flag actually shares** (tier-1 grew to include GPS
   routes — the copy must say so).

---

## NOT DONE — the real gate
- **NONE of this has run on a device.** The build is the first time the sync layer executes. Before
  submitting, install build 53 and do one real pass:
  1. Log a workout → force-quit the app → reinstall → confirm it comes back.
  2. Toggle a health-sharing consent switch (Settings → Privacy & Safety).
  3. Clock in / clock out (time clock).
- Also worth a look on device: gamification points survive a reinstall; a DEXA/bloodwork entry restores.

## Deferred / known (built or flagged, not active)
- **Points anti-fraud ledger is DORMANT.** Balances are client-authored for now (owner's call — nothing's
  been purchased yet). Flip on `functions/src/pointsLedger.ts` + the immutable-balance rule (commented in
  `firestore.rules`) when the store goes live; needs a spin-wheel redesign + touching the purchase code.
- **HR+GPS AsyncStorage budget is tight** (~8.8MB at the intended caps vs Android's ~6MB app-wide). It now
  WARNS on persist failure instead of failing silently; real fix = paged history from Firestore or a
  smaller local window.
- **Staff `hourlyRate` leaks to trainers** via whole-document `/members` reads. Move it to an admin-only
  `/staffPay/{memberId}` doc (same pattern as `pushToken` → `/pushTokens`).
- **Drink store is device-global (no `memberId`)** — on a shared device, charges attach to whoever's
  signed in. Pre-existing; sync preserves today's behavior but it can bill the wrong person on a shared phone.

## D: drive warning (irrelevant on the new PC, but for the record)
`D:\Zenki\App\Zenki\node_modules` had at least one file corrupted to binary garbage
(`expo-camera/plugin/build/withCamera.js`), which broke every local `eas` command until it was restored
from the `C:\Users\mattb\Desktop\Zenki` copy. Looks like a D: disk issue. A fresh clone + `npm install`
on the new machine sidesteps it entirely — but don't trust the D: node_modules.

---

## State summary
- Branch `main` @ the commit that adds this file. GitHub: `Mattkillsyou/Zenki-App`.
- Firebase `zenki-dojo` — rules/indexes/functions/hosting all deployed current. Web admin live at
  https://zenki-dojo.web.app/admin.
- 2.0.5 (build 52) was the prior release; 2.0.6 (build 53) is this one, built and awaiting device test +
  submit.
