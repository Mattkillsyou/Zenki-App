# Zenki-App — Launch Readiness Report

_Pre-launch diagnostic. Expo / React Native + TypeScript, Firebase Cloud Functions backend._
_Method: read → trace each suspect end-to-end → record evidence → prioritize. Findings verified by 3 parallel code-exploration passes + direct reads. "Looks like" = what the user perceives; "Actually" = what the code does._

## Summary

_Update: every non-Senpai finding has now been **fixed in code**. The detailed sections below describe each issue + the fix; the list here is the at-a-glance status._

| Severity | Count | Status |
|---|---|---|
| **P0 — launch blocker** | 1 | ✅ fixed |
| **P1 — should-fix before launch** | 6 | ✅ 5 fixed · 1 Senpai-owned (separate effort) |
| **P2 — post-launch** | 4 | ✅ 3 fixed · 1 was a non-issue (verified clean) |
| Verified clean | 9 areas | no action |

**Scope note:** Senpai (`functions/src/senpaiChat.ts` etc.) is owned by a **separate effort**, so the Senpai SYSTEM_PROMPT drift (P1-6) is **documented but NOT edited here**. Everything else is fixed.

### Fixes applied in this change
- **P0-1** HR demo fabrication removed — `HeartRateContext.tsx`.
- **P1-1** Store orders persist now — local receipt + best-effort Firestore (`orders` collection) + confirmation (`StoreScreen.tsx`, new `src/types/orders.ts` + `src/services/orderSync.ts` + `orders` rule). Also fixed a latent bug: checkout now charges the promo-discounted total it displays.
- **P1-2** WorkoutSession prompts to connect a monitor instead of a silent dead-end — `WorkoutSessionScreen.tsx`.
- **P1-3** Onboarding Bluetooth no longer reports 'granted' without asking — `PermissionsOnboardingScreen.tsx`.
- **P1-4** AI-extracted caveat banner on DEXA + Bloodwork — new `src/components/AiExtractedBanner.tsx` + both detail screens.
- **P1-5 / P2-1** Seed-account auto-create hard-disabled in production (`firebaseAuth.ts`); clear sign-in error when Firebase is unavailable (`SignInScreen.tsx`).
- **P2-2** Server-side invite allow-list — new `functions/src/validateInviteCode.ts` (+ export), `inviteCodes` rule, client validates via the function with a legacy-code fallback so nobody is locked out pre-deploy.
- **P2-3** Onboarding speech distinguishes 'unavailable' from 'denied' — `PermissionsOnboardingScreen.tsx`.
- **P2-4** Not a bug — hydration persists via `DrinkTrackerContext` (`@zenki_drink_tracker`); moved to Verified clean.

### ⚠️ Deployment required (these do nothing until deployed)
- **Firestore rules:** `firebase deploy --only firestore:rules` — activates the new `orders` + `inviteCodes` rules.
- **Cloud Function:** `cd functions && npm run build && firebase deploy --only functions:validateInviteCode`.
- **Invite codes:** until an admin adds docs to the `inviteCodes` collection, the gate accepts the legacy code (`dragon`); add real codes to tighten it. Until the function is deployed, the client falls back to the legacy local check (no lockout).
- **Seed / App-Review accounts** must now be **pre-provisioned** in the production Firebase project (auto-create is dev-only after the P1-5 fix).

---

## P0 — launch blockers

### P0-1 — Heart-rate "demo mode" saved fabricated data as real ✅ FIXED
- **File:** `src/context/HeartRateContext.tsx:243-251` (`startSession`)
- **Looks like:** Start a heart-rate workout without a chest strap → a live BPM ticks and, on stop, you get a session with duration, avg/max BPM, zones, **calories**, and **strain**.
- **Actually was:** When `bleStatus === 'unavailable'` (any device with no paired BLE monitor — the common case, and *always* on web), a `setInterval` fabricated `bpm = 120 + sin(t)·20 ± random` every second and pushed it into `samplesRef`. `stopSession` (`:254-300`) turned those into a real `HRSession` (zones/strain/calories computed from fake data) and persisted it (`setSessions` → AsyncStorage, kept up to 200). **No `__DEV__` gate.** Demo data was indistinguishable from real and polluted history/analytics.
- **Evidence:** the removed block ran unconditionally on `bleStatus === 'unavailable'`; `stopSession` consumed `samplesRef` regardless of origin and saved the session.
- **Fix applied:** removed the demo timer entirely (user decision: "disable entirely") and dropped the now-unused `bleStatus` dep. Heart-rate samples now come **only** from a real connected BLE monitor (`monitorCharacteristicForService` → push at `:193`) or explicit **manual entry** (`addManualSample` → push at `:227`, validated 0–250). With neither, a session records nothing → `stopSession` returns `null` (`samples.length < 2`) → **nothing fake is saved.**
- **Follow-up (P1, below):** the WorkoutSession UI should prompt "connect a monitor / enter manually" so a no-BLE session isn't a silent dead-end.

---

## P1 — should-fix before launch

### P1-1 — Store checkout records no order
- **File:** `src/screens/StoreScreen.tsx:336-350`
- **Looks like:** "Order Reserved … paid in full with Dojo Points" confirmation.
- **Actually:** points **are** deducted (`redeemPoints`) and the gear-purchase counter **is** incremented (`recordGearPurchase`), but **no order object is persisted anywhere** — no order id, items, total, timestamp, or fulfillment record (local or Firestore). The user has no receipt/history and the business has no record; if points were spent, that's real value with no audit trail.
- **Proposed fix:** write an order doc to Firestore (and/or local history) on checkout; show an order confirmation + history screen. Make the points deduction + order write atomic-ish (don't deduct if the order write fails).

### P1-2 — WorkoutSession no-monitor UX (follow-up to P0-1)
- **File:** `src/screens/WorkoutSessionScreen.tsx` (+ `HeartRateContext`)
- **Now that demo HR is removed:** starting a session with no BLE monitor records nothing and silently saves no session. Functionally correct, but a dead-end UX.
- **Proposed fix:** detect `bleStatus !== 'connected'` and prompt to connect a monitor or switch to manual entry before/at session start; show a clear "no monitor connected" state instead of a session that quietly produces nothing.

### P1-3 — Onboarding Bluetooth card reports a permission it never requested
- **File:** `src/screens/auth/PermissionsOnboardingScreen.tsx:106-114`
- **Looks like:** tapping "Allow" on the Bluetooth step shows it granted (green/connected).
- **Actually:** `request: async () => 'granted'` returns granted **without making any OS request** (iOS has no synchronous pre-scan BLE permission API; the real prompt fires later during a workout). The screen claims success for a permission the user never actually granted — a permission-screen hallucination.
- **Proposed fix:** don't report `granted` for an unrequested permission. Mark it `skipped`/deferred and label honestly ("we'll ask when you start a workout"); never render a connected/green state until the real grant happens. (Other cards are honest: Health calls `initHealthKit` and reports the real result; speech returns `denied` when the module is unavailable — though see P2-3.)

### P1-4 — DEXA & Bloodwork results shown as authoritative (no AI-extraction caveat) **[medical]**
- **Files:** `src/screens/DexaScanDetailScreen.tsx`, `src/screens/BloodworkReportDetailScreen.tsx`
- **Looks like:** body-fat %, lean mass, biomarkers with reference ranges and status pills ("Healthy", "Elevated", "out_of_range") — presented as direct measurements.
- **Actually:** these values are **AI-extracted** from an uploaded scan/report photo (server `extractDexa` / `parseBloodwork`). The extraction prompts say "never fabricate," but the **UI never labels the values as AI-parsed estimates**, so a user can treat OCR/parse output as lab-grade truth. Medical-liability risk.
- **Proposed fix:** add a visible caveat on both detail screens, e.g. "AI-extracted from your uploaded report — verify critical values with your provider/lab." Surface the per-field confidence where available.

### P1-5 — Seed test accounts can auto-create Firebase Auth users
- **Files:** `src/services/firebaseAuth.ts:109-145` (`firebaseSignInOrSeedAccount`), `src/data/members.ts:158-175`
- **Actually:** on first sign-in for a seed username (`matt.b`, `sensei.tim`, `apple`, …) with `auth/user-not-found`, the app calls `createUserWithEmailAndPassword` with whatever password was typed — auto-creating the account. In **production**, `CREDENTIALS` passwords are `__DEV__`-gated to empty strings (`members.ts:173`) and the empty-password guard in `handleSignIn` blocks the path, so this is dev-only **by gating**, not by removal.
- **Proposed fix:** confirm the release build actually strips `DEV_SEED_PASSWORDS` (verify a production bundle), ensure seed emails are never publicized, and ideally hard-disable the auto-seed path when `!__DEV__`. For an invite-gated launch, lock these accounts.

### P1-6 — Senpai SYSTEM_PROMPT app-map drift + stale stats **[Senpai workstream — documented, not edited here]**
- **File:** `functions/src/senpaiChat.ts`
- `:86` — the prompt lists a **"Workout" bottom tab**, but the real bottom tabs (`src/navigation/TabNavigator.tsx:85-93`) are **Home · Schedule · Book · Community · Hydration · Store · Profile** (+ **Tasks / Clock** for employees). "Workout" is reached from the Home → Training block, not a bottom tab. Senpai can give a wrong tap-path. The prompt's second app-map block (`:275-315`) describes the real structure — i.e. **two divergent blocks** in one prompt; unify on the correct one.
- `get_user_stats` (`~:571-605`, `:681`) returns the **client-passed `userContext`**, not server truth — so stats Senpai quotes (streak/level/flames) are only as fresh as the last client update.
- **Note:** points math in the prompt (`+10/session, +2/streak cap 30, 10pts=$1`) **matches** `GamificationContext` — no drift there.
- **Owner:** fix in the Senpai effort; left untouched here.

---

## P2 — post-launch

- **P2-1 — Silent backend no-ops when unconfigured.** `FIREBASE_CONFIGURED` (`src/config/firebase.ts:73`) gates many calls; if Firebase init fails / `SHEETS_PROXY_URL` is unset, some flows fail without surfacing an error (e.g. `handleSignIn` doesn't null-check `auth`). Add a null-`auth` guard + user-facing error; confirm the release build injects real config.
- **P2-2 — Invite gate is client-side only.** `INVITE_CODE = 'dragon'` (`SignInScreen.tsx:32`) + an AsyncStorage flag — discoverable and clearable, so it's UX friction, not access control. For real beta gating use a Firebase Auth email allow-list / server flag.
- **P2-3 — Speech permission "denied" vs "unavailable".** `PermissionsOnboardingScreen.tsx:46-55` returns `{granted:false}` when the speech module isn't installed, surfaced as `denied` → the later "re-enable in Settings" hint misleads (the feature is unavailable, not denied). Distinguish the two states.
- **P2-4 — Hydration persistence — ✅ RESOLVED (non-issue).** Re-verified: the Hydration tab is `DrinkScreen`, backed by `DrinkTrackerContext`, which **does** persist to AsyncStorage (`@zenki_drink_tracker`, including the `water` drink type). The original flag was a false positive from the `NutritionContext`-only sweep (hydration lives in a separate context). No change needed.

---

## Verified clean (no action)

- **Local persistence integrity:** food (`@zenki_macro_entries`), weight (`@zenki_weight_entries`), workouts (`@zenki_workout_logs`), PRs (`@zenki_personal_records`), nutrition profiles all write through on change and re-hydrate on launch — survive reload. (Local-only by design: no cross-device/server backup; lost on reinstall — expected per architecture.)
- **No committed secrets:** `AuthKey_*.p8` is **gitignored and untracked**; Firebase `apiKey` is a public client identifier (not a secret); no `sk-`/private-key literals in `src/` or `functions/src/`. Server keys (`ELEVENLABS_API_KEY`, etc.) use Functions Secret Manager.
- **Account-deletion cascade** (`functions/src/deleteAccount.ts`): verifies the ID token, then deletes `users/{uid}` + subcollections, posts, follows (both directions), attendance/waivers/support/push tokens/bloodwork/DEXA/rate-limit docs, redacts/removes DM messages, and clears `users/{uid}/` Storage. No orphans.
- **AI endpoints** (`senpaiChat`, `senpaiSpeak`, `aiVision`): require a verified Firebase **Bearer ID token** and enforce **per-UID rate limiting**. Keys are server-side.
- **Gamification cross-reference:** points math constants (`POINTS_PER_SESSION=10`, `POINTS_STREAK_BONUS=2`, streak cap 30, `$1` flame) are consistent app-wide and match Senpai's prompt.
- **Macro cross-reference:** Home "Today's Macros" and MacroTracker read the same `NutritionContext` (`totalsForDate`) — one source of truth.
- **Reviewer-seed gate** (`src/utils/seedReviewerData.ts`): hard `member.id === '5'` check + one-shot AsyncStorage marker — cannot trigger for a normal member.
- **Info.plist / entitlements** complete for every declared capability (location, camera, mic, speech, photos, calendar, Bluetooth, HealthKit, Apple Sign In, motion); typecheck (app + functions) is green.

---

## Manual device-only checklist (cannot be confirmed in CI / simulator)

- [ ] **BLE heart rate:** pair a real chest strap; start a session; confirm live BPM + a saved session with real zones/strain/calories (and that **no** session saves with no strap connected).
- [ ] **HealthKit:** on a physical device, grant from the onboarding Apple Health step; confirm reads (steps/HR/weight) return real data or a clean empty/denied state.
- [ ] **Mic / speech + TTS:** record to Senpai; confirm STT transcript and ElevenLabs playback.
- [ ] **Notifications:** confirm scheduled class/medication reminders actually fire on device.
- [ ] **GPS:** real-device GPS-tracked workout records a route (simulator GPS is web/sim-only).
- [ ] **Camera / barcode:** scan a food barcode and capture a food/progress photo.
- [ ] **OAuth on device:** "Continue with Apple" end-to-end; "Continue with Google" — note the open P1 (dedicated iOS OAuth client + reversed-client URL scheme) tracked separately.

---

## Build / verify status

- `npx tsc --noEmit` (app) — **pass** (0 errors)
- `cd functions && npx tsc --noEmit` — **pass** (0 errors)
- `npx expo run:ios` (iOS 26.5 simulator) — see commit verification
- Code change in this report: **P0-1 only** (`src/context/HeartRateContext.tsx`). All P1/P2 are proposals; Senpai items are owned by the separate Senpai effort.
