# ZENKI DOJO — WHOLE-APP HANDOFF

_Last updated: 2026-06-08. Self-contained orientation for a fresh session or a new dev. Pairs with the
per-feature handoffs (`BLUETOOTH_WHOOP_HANDOFF.md`, `SENPAI_AI_CHAT_HANDOFF.md`, the `HANDOFF_*.md` files)
and the long-term memory under `~/.claude/projects/-Users-mbrown-Desktop-Zenki-App/memory/`._

> **How to use:** Read §1 (snapshot) + §7 (outstanding actions) first — that's 90% of "where are we."
> Deploy status is reconciled against memory, but **I cannot read prod**, so anything marked ❓ must be
> verified against the live Firebase project before relying on it.

---

## 1. Snapshot
- **What it is:** "Zenki Dojo" — a martial-arts gym app that's also a full personal-fitness + community
  platform. Members get social feed/DMs, workouts + BLE heart-rate + strain, nutrition/macros, GPS
  activity, gamification, an AI mascot ("Senpai"), a Stripe store + drink tab, health tracking
  (cycle/meds/bloodwork/DEXA), and Apple Health sync. Staff/admins get attendance, scheduling,
  appointments, time clock/payroll, moderation, and broadcast tools.
- **Platforms:** iOS (primary, App Store) + Android; Expo managed workflow with native modules (needs dev/EAS builds, not Expo Go).
- **Release:** `app.json` version **2.0.1**, iOS **buildNumber 39**, bundle `com.zenkidojo.app`. EAS project `5ece9429-…`. Firebase project **zenki-dojo** (functions at `us-central1-zenki-dojo.cloudfunctions.net`).
- **Scale:** small/early userbase (dozens). Several security gaps are knowingly accepted at this scale (see §7).
- **Repo:** GitHub `Mattkillsyou/Zenki-App`. Work happens on feature branches → PR → merge to `main` (PRs #1–#6 so far).

## 2. Tech stack
- **Client:** React Native **0.83.6**, React **19.2**, Expo SDK **~55**, TypeScript. Navigation: React Navigation v7 (native-stack + bottom-tabs).
- **Backend:** Firebase — **Firestore** (default-deny rules), **Auth**, **Cloud Functions** (Node/TS), **Storage**, **Hosting** (privacy/support pages). Firebase JS SDK **12**.
- **Native integrations:** `react-native-ble-plx` (HR straps), `react-native-health` (Apple Health), `@stripe/stripe-react-native` (Apple Pay + cards, **live** keys in app.json), `expo-location` + `expo-task-manager` (GPS background), `expo-notifications`, `expo-camera`, `expo-calendar`, `expo-apple-authentication`, `expo-maps`/`leaflet`, `expo-speech-recognition`, `expo-audio/video`.
- **AI:** Cloud Functions call **Anthropic Claude** (Sonnet 4.5 for vision: food/DEXA/bloodwork; Haiku 4.5 for Senpai chat) + **ElevenLabs** TTS (Senpai voice).
- **Side integrations:** **Google Sheets** (Apps Script webhooks) for drink/time/attendance mirroring; **Resend** (password-reset email); **USDA/food + drug** search APIs.
- Verify clean build with `npm run typecheck` (root) and `npm --prefix functions run build` (functions). No test suite; verification is typecheck + on-device.

## 3. Architecture
**Data pattern — three flavors (know which a context is before touching it):**
1. **Local-only** (`useSyncedState` hook → AsyncStorage, or inline multi-key): device-local, offline-first, no cloud copy. e.g. Workout, Nutrition, HeartRate, GPS, Gamification, DrinkTracker, TimeClock, Cycle, Medication, Cart, Privacy, Sound, SpinWheel, Theme.
2. **Firestore-backed** (a `src/services/*Sync.ts` with an `onSnapshot` subscription; AsyncStorage is just a cold-boot cache): source of truth is the cloud, multi-device/multi-user. e.g. Schedule, Announcement, Appointment, EmployeeTask, Product (custom), Attendance (admin views), Blocks.
3. **External-system** (HealthKit, Google Sheets, Stripe): push/pull to a 3rd-party system.
- `src/hooks/useSyncedState.ts` is the canonical local hook. The `*Sync.ts` subscribe pattern is the cloud one. **Don't double-manage** a Firestore-backed context with `useSyncedState`.

**~25 contexts** in `src/context/` (the backbone). Key ones: `AuthContext` (identity; hybrid — FirebaseAuth + member doc in AsyncStorage/Firestore + live role subscription), `HeartRateContext` (BLE + sessions), `HealthKitContext` (Apple Health push/pull), `GamificationContext` (XP/streak/strain/points), `NutritionContext` (7 keys: weights/macros/goals/profiles/foods/DEXA/bloodwork), `BlocksContext`/`PrivacyContext` (moderation gates), `SenpaiContext` (mascot).

**~30+ services** in `src/services/`: `firebase{Auth,Users,Posts,Messages,Follow,Moderation,Storage}.ts`, the `*Sync.ts` family (member/schedule/attendance/announcement/appointment/employeeTask/order/waiver), `healthKit.ts`, `payments.ts`, `senpai{Chat,Speak,Audio}.ts`, `pushNotifications.ts`, `googleSheets.ts`/`drinkSheets.ts`, `aiVision.ts`, `foodSearch.ts`/`drugSearch.ts`, `calendarIntegration.ts`.

**Navigation:** `src/navigation/RootNavigator.tsx` (auth-gated root stack, ~60 screens) + `TabNavigator.tsx` (member vs employee tab sets; tint turns hot-pink when Senpai is on).

## 4. Feature map (≈20 areas, ≈63 screens)
| Area | Key screens | Contexts / services |
|---|---|---|
| Auth + invite gate + onboarding | `auth/SignIn,Onboarding,PermissionsOnboarding,SetPassword,ForgotPassword,Contact` | AuthContext; firebaseAuth, memberSync |
| Social (feed/comments/likes) | `Community,CreatePost,Comments,UserProfile,UserSearch,FollowRequests,BlockedUsers,Notifications` | Blocks/Privacy; firebasePosts/Follow/Moderation |
| Direct messaging | `MessagesList,MessagesChat` | firebaseMessages; Blocks/Privacy |
| Workouts + HR/BLE + strain | `Workout,WorkoutSession,SessionHistory,BluetoothDevices` | Workout/HeartRate/Gamification |
| Apple Health sync | (Settings toggle) | HealthKit; healthKit.ts (`react-native-health`) |
| Nutrition / macros | `MacroTracker,MacroSetup,PhotoFood,WeightTracker` | Nutrition; foodSearch, aiVision |
| Gamification | `Achievements,AchievementDetail,Home` | Gamification |
| Senpai mascot/AI | `SenpaiMemory` (+ floating mascot) | Senpai; senpaiChat/Speak/Audio |
| GPS activity | `ActivityTracker` | GpsActivity (expo-task-manager background) |
| Store / payments | `Store,ProductDetail,OrderHistory` | Cart/Product; payments.ts (Stripe), orderSync |
| Admin / moderation | `Admin,AdminMembers,AdminReports,AdminSchedule,AdminAppointments,AdminProducts,AdminBroadcast,AdminEmployeeTasks,AdminAnnouncements` | Announcement; firebaseModeration |
| Scheduling + appointments | `Schedule` | Schedule/Appointment; scheduleSync/appointmentSync/calendarIntegration |
| Time clock / payroll | `TimeClock` | TimeClock; googleSheets |
| Attendance (geofence) | `AttendanceHistory` | Attendance; attendanceSync |
| Cycle tracker | `CycleTracker` | CycleTracker |
| Medication tracker | `MedicationTracker` | MedicationTracker; medicationNotifications, drugSearch |
| Drink tab | `Drink` | DrinkTracker; drinkSheets |
| Biomarkers (bloodwork/DEXA) | `Bloodwork*,Dexa*,BodyLab` | aiVision (parseBloodwork/extractDexa CFs) |
| Profile / settings / theme | `Profile,Settings,Notifications,Help` | Theme/Privacy/Sound |
| Misc | `Home,Timer,BarcodeScanner,Training*,Book,SpinWheel,PRDetail` | — |

## 5. Backend (Firebase, `functions/src/`)
**Cloud Functions (~21).** AI (callable, rate-limited): `recognizeFood`, `extractDexa`, `parseBloodwork`, `senpaiChat`, `senpaiSpeak`. Auth/account: `deleteAccount` (GDPR cascade, App Store 5.1.1(v)), `sendPasswordReset` (Resend; **unthrottled** — known gap), `validateInviteCode` (pre-auth gate; **see §7**). Payments: `createPaymentIntent` (server-recomputes drink amounts; **trusts client amount for clothing orders** — known gap), `stripeWebhook` (records `payments/{id}`; **needs `STRIPE_WEBHOOK_SECRET`**). Moderation: `adminActionReport`, `banUser`, `notifyOnReport` (Firestore trigger), `redactDmMessages`. Graph/content: `deletePostCascade`, follower-count triggers (`onFollowerEdgeCreated/Deleted`), block-mirror triggers (`onBlockCreated/Deleted` → `/blockedBy`). Backfills (admin, run-once): `backfillPostPrivacy`, `backfillFollowCounts`, `backfillBlockedBy`, `backfillAppointmentOwners`. Utility: `submitContactInquiry` (public, IP-rate-limited → `supportMessages`).
- **Firestore rules** (`firestore.rules`, ~550 lines): default-deny; `isSignedIn/isOwner/isAdmin` (admin = token claim OR `/admins/{uid}` doc); asymmetric `blockedBetween` DM gate; `/payments` admin-read only; `/inviteCodes` used-count increments.
- **Indexes** (`firestore.indexes.json`): posts feed (3 incl. `authorIsPrivate,createdAt`), reports triage, conversations list, attendance.
- **Hosting:** `/privacy` + `/support` static pages (App Store requirement).

## 6. Release & deploy
- **Config:** `app.json` (v2.0.1 / build 39, HealthKit + Apple-Pay + Sign-in-with-Apple entitlements, location background mode, BLE perms incl. `BLUETOOTH_SCAN`, live Stripe `pk_live_…`), `eas.json` (dev/preview/production profiles; production autoIncrements buildNumber; submit creds → ASC app 6763685748, team RPV54B2NK5), `firebase.json`.
- **🪤 DEPLOY GOTCHA (bit us 2026-06-08):** `firebase.json` has **NO predeploy build hook**. Before `firebase deploy --only functions` you **must** `git pull` (local `main` drifted **13 commits** behind GitHub) **and** `npm --prefix functions run build` — otherwise deploy ships stale/compiled code or says "no changes detected."
- **Build for device:** `npm install` → `npx expo run:ios --device` (BLE/HealthKit can't run on Simulator), or `eas build -p ios --profile production` → submit.

## 7. ⚠️ OUTSTANDING OWNER / DEPLOY ACTIONS (the actionable section)
> Status reconciled with memory. ✅ = believed done (per a recorded prod deploy). ⚠️ = still pending. ❓ = uncertain, **verify against prod**. The newest reference point is the **2026-06-08 prod deploy** (Empty-Feed PR #5).

**✅ Believed DONE (prod, 2026-06-08 deploy):** `firestore:rules` + `firestore:indexes` + `functions` deployed (incl. block-mirror triggers + `backfillBlockedBy` created); **`backfillPostPrivacy` ran → healed 19/19 legacy posts** (feed now populated); `backfillBlockedBy` ran (0 blocks). Reviewer Auth account live in prod.

**⚠️ STILL PENDING (these are the real blockers):**
1. **Invite gate is OPEN.** `validateInviteCode` is **not deployed** (prod 404). The client gate is **bypassed** (`INVITE_GATE_ENABLED = false` in `auth/SignInScreen.tsx`); the only historical code is the `__DEV__`/legacy `'dragon'`. To re-secure: deploy `validateInviteCode` → **seed `inviteCodes` collection FIRST** (else it locks out everyone incl. the Apple reviewer) → flip `INVITE_GATE_ENABLED = true` → update `APP_REVIEWER.md` with a real code → smoke-test.
2. **Stripe webhook inert.** Set `STRIPE_WEBHOOK_SECRET` (`firebase functions:secrets:set`) → deploy `stripeWebhook` → register the endpoint in the Stripe dashboard (events `payment_intent.succeeded`/`payment_intent.payment_failed`) → smoke-test. Until then, payments aren't reconciled to `payments/{id}`.
3. **GPS background needs a native rebuild** + device test (`app.json` now declares the iOS background-location mode + Android foreground-service perms; binary must be rebuilt to pick it up). Also an owner **decision** on whether to keep background location (App-Review sensitivity).
4. **BLE/WHOOP not device-verified** (PR #6, today). See `BLUETOOTH_WHOOP_HANDOFF.md` — needs a real iPhone + WHOOP to confirm discovery + live BPM. Revert `97784e1` if it fails.

**❓ VERIFY against prod (memory doesn't confirm these ran):**
- `backfillFollowCounts` (seeds follower/following counts) and `backfillAppointmentOwners` (re-stamps appointment owners) — were flagged "run once" by PRs #1–#3 but **not confirmed** in the 2026-06-08 deploy note. Run them if counts/appointment ownership look wrong.
- Confirm the **latest functions** (reaudit PR #4 set: `submitContactInquiry`, messaging guards, etc.) are actually live — PR #4's owner deploy was "pending/unverified" before PR #5's deploy; PR #5 deployed "functions" from latest main, which *should* include them, but verify.
- Confirm an **EAS build** carrying the latest client (GPS background, BLE) was built/submitted — buildNumber is 39; the BLE change (PR #6) is **not** in a tested build yet.

**Known, accepted gaps (low priority at this scale):** clothing-order amounts trust the client (no server price lookup) in `createPaymentIntent`; `sendPasswordReset` has no throttle/App Check; `enforceRateLimit` is non-transactional (concurrent slip-through); admin bootstrap is manual (`/admins/{uid}` doc — see `ADMIN_SETUP.md`). Details in `APP_AUDIT.md` (F19/F20/F22/F24/F25).

## 8. Invariants & gotchas — do NOT break these
- **BLE lazy init (App Review):** `BleManager` must **never** be constructed on mount — only from a user scan/connect or saved-device reconnect. Constructing it fires the iOS Bluetooth dialog → review risk. Likewise lazy-load HealthKit.
- **Concurrency guards in `HeartRateContext`** (connecting/drop/RSSI-watchdog guards) each fixed an audited race — don't "simplify" them. `BLE_CONTRACT.md` is the API source of truth.
- **No fabricated data as real readings** (HR, calories, etc.). This is a hard rule across the app — honest empty states, never fake numbers.
- **Post-privacy backfill is rule-safe-critical:** the feed query filters `authorIsPrivate == false`; field-less legacy docs are excluded by the query (even though rules tolerate them) → the fix is the **backfill**, not a tolerant query. (Healed 19/19 already.)
- **Functions deploy:** always `npm --prefix functions run build` first (no predeploy hook); `git pull` first (local main drifts behind GitHub merges).
- **Senpai WebP assets** have a known black-box/ghosting bug — if you touch `senpai_*.webp`, run `scripts/fix-senpai-webp.sh` and bump `@senpai_asset_cache_v` in `SenpaiMascot.tsx` (see memory).
- **Local-vs-cloud:** don't add `useSyncedState` to a Firestore-backed context (double-management). Don't move HR/workout/nutrition off local without a sync service — they're intentionally device-local (privacy).

## 9. Docs index (repo root, ~34 `.md`)
- **Start here:** `OWNER_ACTIONS.md` (the 3 launch tasks), `ADMIN_SETUP.md`, `LAUNCH_READINESS_REPORT.md`.
- **Audits:** `APP_AUDIT.md`, `REAUDIT.md`, `REAUDIT2.md`, `SOCIAL_AUDIT.md`, `SOCIAL_PR1_AUDIT.md`, `AUDIT_PLAN.md`.
- **Contracts (API/behavior source of truth):** `BLE_CONTRACT.md`, `SOCIAL_CONTRACT.md`, `APP_FIX_CONTRACT.md`.
- **App Store:** `APP_STORE_CONNECT.md`, `APP_REVIEWER.md`, `APP_REVIEW_REPLIES.md`, `PRIVACY_POLICY.md`, `SUPPORT.md`.
- **Payments:** `APPLE_PAY_SETUP.md`.
- **Feature/handoff:** `BLUETOOTH_WHOOP_HANDOFF.md`, `BLE_ONDEVICE_CHECKLIST.md`, `SENPAI_AI_CHAT_PROMPT.md`/`HANDOFF`, the `HANDOFF_*.md` session notes, plus design prompts (`CYCLE_TRACKER`, `WORKOUT_SHARING`, `THEME_*`, `PIPBOY`, `FULL_APP_EXPANSION`, `Zenki_Master_Prompt`).
- **Long-term memory:** `~/.claude/projects/-Users-mbrown-Desktop-Zenki-App/memory/` (`MEMORY.md` index + per-project files) is the most *current* state — newer than some docs.

## 10. Open work threads
- **BLE/WHOOP device verification** (PR #6 merged, untested on hardware) — top priority.
- **Invite gate re-secure** + **Stripe webhook** + **GPS background rebuild** — the launch blockers in §7.
- Verify the ❓ backfills + that latest functions/build are live.

## 11. Kickoff prompts
**General "continue on Zenki" (paste into a fresh chat in the repo):**
```
Read ZENKI_APP_HANDOFF.md first, then check the long-term memory under
~/.claude/projects/-Users-mbrown-Desktop-Zenki-App/memory/ (MEMORY.md index) — memory is the most
current state. Confirm what's actually deployed before assuming the docs are current; I can't read prod
from the docs alone.

Honor the invariants in the handoff §8: BLE/HealthKit lazy init (never on mount — App Review), the
HeartRateContext concurrency guards, never present fabricated data as real readings, and always
`npm --prefix functions run build` + `git pull` before any `firebase deploy --only functions`.

Here's what I want to work on: <DESCRIBE TASK>. Use plan mode first for anything non-trivial; work on a
feature branch → PR; run `npm run typecheck` (and `npm --prefix functions run build` for functions)
before committing; don't merge to main until I confirm.
```

**Targeted — finish the launch blockers (§7):**
```
Read ZENKI_APP_HANDOFF.md §7 and OWNER_ACTIONS.md. Help me close the remaining launch blockers in order:
(1) re-secure the invite gate (deploy validateInviteCode, seed inviteCodes FIRST, flip
INVITE_GATE_ENABLED=true, update APP_REVIEWER.md), (2) Stripe webhook (set STRIPE_WEBHOOK_SECRET, deploy,
register endpoint, smoke-test), (3) GPS background rebuild + device test. For each: show me the exact
commands, the order, and how to verify. Remember the deploy gotcha: git pull + npm --prefix functions run
build before firebase deploy. Don't run irreversible prod commands without showing me first.
```

**Targeted — BLE/WHOOP device test (the open PR #6 item):**
```
Read BLUETOOTH_WHOOP_HANDOFF.md. The BLE/WHOOP fix is merged to main (97784e1) but NOT device-verified.
Help me build to my iPhone and confirm a real WHOOP appears and streams live BPM; fix anything that's
wrong on a new branch. The acceptance test is a live BPM stream that matches the WHOOP, not a green
checkmark. Keep the lazy BleManager init + concurrency guards intact.
```
