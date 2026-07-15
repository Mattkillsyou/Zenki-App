# Execution brief — Zenki 2.0.6 fix plan

**How to use this file:** open a fresh Claude Code session in `C:\Users\mattb\Desktop\Zenki` and say
*"read FIX_PLAN_2.0.6_PROMPT.md and do Phase 0"* (or Phase 1, or a numbered item). This file is
self-contained — it assumes you know nothing about the project. Work one phase at a time. Do not
start a phase without reading **Rules of engagement** below.

Generated 2026-07-14 from a verified audit of shipping 2.0.5. Every defect was confirmed against
source, then re-attacked by an adversarial reviewer for missed work (rules, indexes, migrations, App
Store calendar time). Where the reviewer moved an estimate, the reviewer's number is used.

---

## The project

**Zenki Dojo** — a React Native / Expo (~55, RN 0.83) iOS app in TypeScript for a private martial
arts + CrossFit dojo in Los Angeles. Firebase backend (project `zenki-dojo`): Auth, Firestore,
Storage, Hosting, ~30 Cloud Functions. Live on the App Store at v2.0.5. Real members, real Apple Pay
money. Web admin at `hosting/admin/` served at https://zenki-dojo.web.app/admin.

~83k lines: `src/` (58 screens, 24 contexts, 38 services), `functions/src/`, `hosting/`.

---

## Rules of engagement — read before touching anything

1. **Gym #1 is live with real members and real money.** Nothing may regress it. When in doubt, keep the
   existing behaviour as the fallback default.
2. **There are ZERO automated tests.** `package.json` has only `typecheck`. Every change is
   hand-verified. Run `npx tsc --noEmit` (or `npm run typecheck`) after every change. Never claim
   something works because it compiles.
3. **Apple is the bottleneck, not the code.** Rules, Cloud Functions and the web admin deploy
   independently and reach members *today*. Anything touching the binary needs an App Store build +
   review — 2–4 days of calendar time per round-trip. **Batch binary changes into as few submissions
   as possible.** This is why the phases are ordered the way they are.
4. **Renaming a persisted field is a data migration, not a rename.** Existing members already have
   data in the old shape.
5. **Money paths need server-side authority.** A client-side "fix" to a money path is not a fix.
6. **Ask before deciding anything marked OWNER DECISION.** Those are business calls, not engineering
   calls.
7. **Commit means push** — when the owner says commit, also push to origin.
8. `functions/.env` (gitignored) must exist with `SENPAI_TTS_REQUIRE_SIGNATURE=false` or
   `firebase deploy` fails non-interactively.

---

## State of play — verify this first

`66cdf22` (2026-07-14 20:39) landed the 2.0.6 foundation and **it is not finished**:

| Thing | State |
|---|---|
| `src/services/syncCore.ts` (200 lines) | Written. Queue-before-write, `flushQueue`, `migrateRecords`, `mergeById`. |
| `src/services/trainingSync.ts` (228 lines) | Written. `/training/{uid}/logs`, `/training/{uid}/personalRecords`, sanitizers. |
| `/training` block in `firestore.rules:556` | Written. **NOT DEPLOYED** — rules last changed by `66cdf22`, which is after the 2026-07-10 full deploy. |
| `src/context/WorkoutContext.tsx` | **Imports none of it.** Still pure AsyncStorage (lines 64–97). The sync layer is dead code. |

Confirm with:
```
git log --oneline -3
grep -rn "trainingSync\|syncCore" src/ --include=*.ts --include=*.tsx -l
```
If `trainingSync.ts` is still only referenced by itself, the state above still holds.

**Three traps that will cost you a day each if you miss them:**

- **Deploy the `/training` rules BEFORE wiring the context.** Default-deny rejects every write, and
  `syncCore`'s own docblock notes those denials **hang rather than throw** while offline. Miserable to
  debug.
- **`useSyncedState` is NOT a cloud sync hook.** It is AsyncStorage-only; its docblock explicitly says
  Firestore-backed contexts should not use it. The cloud pattern is `syncCore.ts` + a per-domain sync
  service, consumed the way `NutritionContext.tsx:276-323` does it: per-uid run-once migration guard
  (`@zenki_nutrition_migrated_v1:{uid}`) → `migrate*` → `subscribe*` + `mergeById` → write-through on
  each mutator via `getCurrentUid()`.
- **`/training` rules are owner-only BY DESIGN** (`firestore.rules:545-547`: *"Trainers/admins do NOT
  read it here; if that's wanted later it should be a deliberate, disclosed decision."*). Finishing the
  sync fixes the **reinstall loss**. It does **not** give staff visibility into training logs. Granting
  that is a separate privacy decision — **OWNER DECISION**, do not smuggle it into a durability fix.

---

# PHASE 0 — Ship now. No App Store review. ~1 day.

Rules, Cloud Functions and web admin only. Every item reaches members or closes real exposure today.
**If you do nothing else, do this phase.**

## 0.1 — Deploy the `/training` rules · zero code
On `main`, undeployed. Blocks all of Phase 2.
```
firebase deploy --only firestore:rules --project zenki-dojo
```

## 0.2 — Cap the points discount server-side · hours · MONEY HOLE OPEN NOW
`functions/src/createPaymentIntent.ts:135-139` confesses it in a comment: *"points/promo discounts
still live client-side, so the amount may legitimately sit anywhere between $0.50 and the trusted
subtotal."* Extreme discounts are **warn-logged, not rejected** (`:215-218`). A tampered client pays
$0.50 for a $200 item.

Reject when `amountCents < subtotalCents - MAX_POINTS_DISCOUNT_CENTS` instead of warn-logging. This
does **not** fix the trust model (that's 2.4) — it **bounds the loss** today, for hours, with no binary.

## 0.3 — Waiver read-back · half-day · LEGAL EXPOSURE
`firestore.rules:470-478` is `allow read: if false` with the comment "admin reads server-side" — **and
no server-side reader exists.** If a member is injured you cannot produce the release they signed; it
lives only in the raw Firebase console, which is not a records system you can hand an insurer.

Clone `functions/src/listSupportMessages.ts` → `functions/src/listWaivers.ts`: same
`onRequest({cors:true, invoker:'public'})` shell, same `Bearer` / `verifyIdToken` +
`decoded.admin === true || admins/{uid}` gate, reading `/waivers` `orderBy('signedAt','desc').limit(100)`.
Export from `functions/src/index.ts`. Add a Waivers tab to `hosting/admin/app.js` beside Support
(follow `renderMemberDetail:758`) rendering memberName, signedName, signedAt, waiverVersion and
`renderWaiverText(signedName)`.

- **No composite index needed** — single-field `orderBy` is auto-indexed.
- **No rules change needed** — the Admin SDK bypasses rules, so `allow read: if false` stays. That is
  correct; do not weaken it.
- **Risk is medium, not low.** Net-new PII surface (legal names, emails, phones, signed releases)
  behind a hand-written auth gate with no tests. **Verify the gate with a non-admin token before
  deploying.** An inverted gate publishes members' legal names to any signed-in user.
- Waivers signed since the 2.0.5 firebaseUid fix (`waiverSync.ts:143-146`) are in Firestore and appear
  the moment a reader exists. Pre-fix waivers were rejected and are gone.

## 0.4 — Harden the payroll Apps Script token · hours
`src/config/api.ts:49` hardcodes the payroll Apps Script URL. Today one of two things is true and
neither is acceptable: employees' hours are not reaching payroll while the app reports success, or
anyone who extracts the URL from the bundle can write to the timesheet. Verify + harden the token
check in the Apps Script itself. Server-side, no release.

> Do **not** "fix" this by moving the URL into `app.json` extra. `app.json` is static JSON, ships in
> the bundle, and there is no `app.config.js` — that re-hardcodes the same secret in a new place.

## 0.5 — Resolve user IDs to names in the report queue · hours
`hosting/admin/app.js:347` and `:437` show raw Firebase uids for reporter and offender. Staff cannot
tell who is involved without the Firebase console — while looking at a button that bans a paying
member and cascades their content. `/users/{uid}` is already `allow read: if isSignedIn()`
(`firestore.rules:122`) and carries `displayName`, so no rules change. Add
`getUserNamesByIds(uids: string[])` and resolve at read time. The in-app admin has the same defect
(`AdminReportsScreen.tsx`) but that needs a binary — do the web half now, fold the app half into Phase 1.

---

# PHASE 1 — One honesty release. ONE binary submission. ~1 week.

These are cheap individually and expensive to ship separately. **Bundle all of them into a single
App Store submission.**

**The theme: delete the false claim, don't build the feature.** In every case below the honest fix is
hours and the "real" fix is week-plus.

## 1.1 — Flames · hours · P0
`src/screens/HelpScreen.tsx:44` says verbatim: *"Flames are weekly bonus currency. Redeem both in the
store when checking out."* **"Both" means points and flames.** The app tells members in plain English
they can spend flames. They cannot: `redeemFlames` (`GamificationContext.tsx:622`) has **zero call
sites**; `FLAME_VALUE_USD = 1` (`:38`) is imported nowhere; `StoreScreen.tsx` only ever calls
`redeemPoints` (`:384-397`).

**Fix:** delete `FLAME_VALUE_USD` (`:38`), delete `redeemFlames` (`:72`, `:149`, `:622-628`, `:660`),
rewrite `HelpScreen.tsx:44` to describe flames as a lifetime achievement score.

> **Do NOT build flame redemption.** Week-plus / high risk, and because gamification is
> AsyncStorage-only it would ship a **cash-equivalent balance on device-local storage** — a reinstall
> would destroy money the app promised. That is a worse defect than the one being fixed. Only sane
> after 2.3, and only if the owner wants it.

## 1.2 — `useKeepAwake()` in the workout session · hours · ACTIVE DATA LOSS
`src/screens/WorkoutSessionScreen.tsx` has no `useKeepAwake()`; `TimerScreen.tsx:52` does.
`expo-keep-awake` is already a dependency (`package.json:38`). The phone auto-locks mid-session and
heart-rate recording silently stops. Two lines.

## 1.3 — Stop fabricating body metrics · half-day
`WorkoutSessionScreen.tsx:52-56` defaults `age = profile?.ageYears || 30`, `weightKg` fallback `80`,
`isMale = profile?.sex !== 'female'`. A new member's calories and zones are invented from a stranger's
body. Gate the calorie/strain display on a real profile and prompt to complete it rather than rendering
a fabricated number.

## 1.4 — Delete the HealthKit read direction · days
`src/screens/SettingsScreen.tsx:576-580` claims under "READS FROM HEALTH" that the app reads *Steps ·
Active Energy · Heart Rate · Body Mass*. **Nothing in the app displays any of it.**

Strip the `read.push(...)` lines from `buildPermissions` in `src/services/healthKit.ts` (keep every
`write.push` — writes need no read scope), delete the Settings copy, **and fix `app.json:64` and
`app.json:107`** — otherwise the false claim survives in the iOS permission prompt, which Apple reviews.
`app.json` is in scope; do not skip it.

## 1.5 — Stop the Google integrations reporting success · half-day
Three endpoint constants are empty strings — `calendarAvailability.ts:12`, `attendanceSync.ts:21`,
`waiverSync.ts:101` — and **two of the three return `true` anyway**. Nothing is ever sent; no booking
slot is ever blocked.

Note `OnboardingScreen.tsx:369` calls `pushWaiverToSheets(signature)` **fire-and-forget and discards
the return value**, so flipping `true`→`false` alone changes nothing observable. Either delete the
integrations, or delete the "Email me a copy" toggle (`OnboardingScreen.tsx:877-900`) and the
`emailCopy` field — members tick it and receive nothing, ever.

**OWNER DECISION:** wiring these needs the owner to deploy Apps Scripts bound to their Google account.
Do not wait on it — do the honesty half now.

## 1.6 — Remove "automatically" from check-in · hours
Geofenced check-in only fires with the app **open in the foreground** (30s polling, stops on
background) — phone-in-pocket, the entire premise, logs nothing. Real background check-in is week-plus
/ high risk. Delete the word "automatically" from `app.json:19` and `:97` so the WhenInUse prompt
describes the poll that actually exists.

## 1.7 — Attendance UTC day boundary · days · HIGH RISK
Check-ins are stamped in UTC, so the live Who's Here roster (`attendanceSync.ts:144`) and the Today
count never show members who train after ~5pm local, and evening visitors can be double-logged.

Add `localDateString()` to `src/utils/dates.ts` and swap the re-export at `src/utils/location.ts:44`.
Consumers are `AttendanceContext` / `attendanceSync` / `AttendanceHistoryScreen`.

> **The AsyncStorage migration MUST land in the same release as the re-export swap** — otherwise the
> fix locks evening members out of check-in for a day. Ship the client fix and **skip the Firestore
> backfill**: new check-ins are correct from the release; history stays as-is.

## 1.8 — Delete the seven unearnable badges · ~2 hours
White Belt, Blue Belt, Black Belt, Hello Dojo (first post), Storyteller (10 posts), Recognized (first
follower), Joined the Dojo render a progress bar frozen at 0% with a "how to earn" instruction that is
a lie — no code path increments the counters they read. A member with a blue belt physically around
their waist reads "Blue Belt 0/2 — 0%".

Delete the seven definitions from `src/data/achievements.ts` (`:33-35`, `:76-79`). `hydrateState`
(`GamificationContext.tsx:196-208`) reconciles persisted unlock flags, so removing definitions is safe.

> Deriving them properly is week-plus and pointless before 2.3 — AsyncStorage means a reinstall
> re-zeroes them anyway.

## 1.9 — Delete the dead volume charts · hours
`src/screens/WorkoutScreen.tsx` renders a "Volume by Muscle Group" heat map and a 12-week volume bar
chart reading `@zenki_structured_logs` (`STRUCTURED_LOGS_KEY:40`) — **which no code in the app ever
writes.** No member is misled (they never render), but it is ~90 lines of live-looking dead code.
Remove the `structuredLogs` state + effect (`:459-465`), the key (`:40`), and the volume /
weeklyVolume computation in the `stats` useMemo (`:488-512`) plus those fields from the returned object.

## 1.10 — Wire the Contact form · half-day · LEAD CAPTURE
The prospect enquiry form is fully built, server-side, deployed, and **nothing navigates to it** —
`RootNavigator.tsx:289` is the only reference in the entire repo. Guests browsing the app (the App
Review 5.1.1 accommodation, `SignInScreen.tsx:613`) have no way to ask the gym a question.

Add a second `SoundPressable` to `SignInScreen.tsx`'s `createAccountRow` footer (`:603-609`) — *"Not a
member? Contact us"* → `navigate('Contact')`. One call unlocks a path already being paid for.

## 1.11 — Error boundaries on the auth screens · hours
Sign-in, sign-up, forgot-password, contact and permissions are **not** individually wrapped, so a
render error there has no boundary between it and the app root — it unmounts the whole tree to the root
recovery UI at the front door. Five lines in `RootNavigator.tsx`:
`component={withErrorBoundary(SignInScreen, 'Sign In')}` and the same for `ForgotPasswordScreen`,
`ContactScreen`, `OnboardingScreen`, `PermissionsOnboardingScreen`. Onboarding's `initialParams` are
safe — `withErrorBoundary` passes props through.

> Real crash reporting (`src/services/crashReporter.ts` is a stub that only writes to the dev console)
> is **out of scope**. Sentry's native init wants a full TestFlight cycle. One gym, one support email —
> accept it for now.

## 1.12 — Booking date strip · half-day
`src/screens/BookScreen.tsx` offers **today's slots only**. By late afternoon every slot is struck
through and the screen reads "No more bookable times today · Check back tomorrow morning" (`:350`) —
the member cannot book tomorrow, ever, from the app.

Add `bookingHorizonDays` (default 14) to `SchedulingConfig`, extend `sanitizeConfig` with a
fallback guard, and add a date strip. **Leave `INSTRUCTORS` and `TIME_SLOTS` hardcoded** — the date
strip is 80% of the value. `config/scheduling` is a live doc every client subscribes to, so a bad
admin save reaches everyone in seconds; the sanitize-with-fallback guard is load-bearing.

## 1.13 — Report queue names, in-app half · hours
The app-side counterpart to 0.5 — `AdminReportsScreen.tsx`. Same `getUserNamesByIds` resolve-at-read.
Folded here because it needs a binary.

## Deliberately NOT in this release

- **Wishlist** — `StoreScreen.tsx` saves a heart to device storage that persists across launches, so the
  app actively signals it remembers — and no screen, tab or filter ever lists them.
  **Delete it** (heart `:170-182`, state + both effects `:63-104`, `WISHLIST_KEY`, `EmptyState.Wishlist`,
  `WishlistItem`). Wiring it as a filter is half-day if the owner would rather — **OWNER DECISION**, but
  deleting is now the cheaper option, not an equal one.
- **Invite-code gate** — **LEAVE EXACTLY AS IS.** Quarantined behind one honest, well-commented
  `INVITE_GATE_ENABLED = false` (`SignInScreen.tsx:38`), costs nothing at runtime, misleads nobody.
  Enabling is days (needs an admin seeding UI) and reverses a deliberate business decision.
- **Offline banner** — **IT WORKS. DO NOT DELETE IT.** An earlier audit called it dead code; that
  finding was stale and wrong. Verify once by hand (airplane mode, app foregrounded, expect the
  "You're offline" pill) and close it.
- **Structured exercise library** — `src/data/exercises.ts` holds a second, unused catalog of ~108
  exercises with muscle groups, equipment and search helpers, plus `WorkoutTemplate` /
  `StructuredWorkoutLog` types. Finishing it is week-plus. Deleting it is NOT 2 hours —
  `WorkoutScreen.tsx:28-30` actively imports the muscle-group constants. **OWNER DECISION**: this is the
  only path to real set-by-set logging, so decide whether it's a roadmap item before deleting it.

---

# PHASE 2 — "Everything online" (the real 2.0.6). ~3 weeks.

The one members actually feel: today a new phone or a reinstall wipes their entire progression and
training history.

**Three of these are ONE JOB wearing three hats.** 2.1 and 2.2 and 2.3 are all *"move an AsyncStorage
dataset to `/{collection}/{uid}` using `syncCore` + the `NutritionContext` wiring recipe"* — same
pattern, same run-once guard, same merge-by-id, repeated per dataset. **Estimating them as independent
projects triples the number.** Do 2.1 first: it proves the template on the highest-value dataset and is
already 70% written.

## 2.1 — Finish training sync (logs + PRs) · days · ALREADY 70% BUILT
Requires 0.1 (rules deployed) first.

Wire `src/context/WorkoutContext.tsx` to `src/services/trainingSync.ts` exactly as
`NutritionContext.tsx:276-323` does:
`useFirebaseUid()` → run-once guard `@zenki_training_migrated_v1:{uid}` → `migrateLogsAndPRs` →
`subscribeTraining` + `mergeById` → write-through in `logWorkout` / `addPR` / `removeLog` / `removePR`.
Add `synced?: boolean` to the stored record. `flushQueue` on reconnect via `useNetworkStatus`.

> **Do not regress `WorkoutContext.tsx:78-86`**, which deliberately disables persistence on hydrate
> failure to protect existing history. That is intentional, documented, and easy to destroy by accident.

## 2.2 — Heart-rate session sync · days
New dataset, same template. Extend `trainingSync.ts` with `/training/{uid}/hrSessions` + matching
sanitizers + a new rules block; wire `HeartRateContext.tsx` (`@zenki_hr_sessions`, `:24`). Sessions are
already downsampled to ~600 samples and capped at 200 sessions, so payload size is bounded.

## 2.3 — Gamification sync · days · HIGH RISK
XP, levels, streaks and achievements → `/gamification/{uid}` via a new `src/services/gamificationSync.ts`
built on the **singleton** half of the nutrition pattern (fixed doc id `current`, like
`GOALS_SUB`/`PROFILE_SUB`). Reuse the existing `hydrateState()` (`GamificationContext.tsx:195`) as the
server-merge function.

Three traps:
- `GamificationContext` keys on `user.id` (internal member id) via `storageKeyFor:25`. The Firestore
  path must key on **Firebase uid** via `useFirebaseUid()`.
- **Carve `dojoPoints` / `pointsLifetime` OUT** — they belong to the ledger (2.4). Sync them here and
  you migrate the field twice.
- Migration is **two-stage**: preserve the existing legacy-global → per-user AsyncStorage migration
  (`:253-264`) and chain the Firestore one after it.

> **Cheaper alternative, recommended:** sync it as a read-mostly **backup** doc — write on change,
> restore only when the local per-user key is absent. Kills the reinstall loss without the
> last-write-wins merge hazard (`syncCore` has no vector clock and says so — a blob under LWW loses
> counter increments across two devices). **Half the effort, most of the value.**

## 2.4 — Points ledger · week-plus · HIGH RISK
**Not a sync job — an authority job.** Mirroring `dojoPoints` to Firestore fixes nothing: a
client-authored balance is untrusted whether it lives on the phone or in a doc the phone can write.

Append-only `/pointsLedger/{uid}/entries/{entryId}`; rules `allow read: isOwner(uid); write: false`
(Admin SDK only); balance = server fold. New CF `redeemPoints` issues a signed single-use redemption
token; `createPaymentIntent` validates the claimed discount against it, making `chargeCents`
authoritative for orders as it already is for drinks (`:124`). Every client `awardPoints` call site
becomes a CF award or a server-verified event. Migration: fold each existing `dojoPoints` into an
opening-balance entry, once, server-side.

Gated by 2.3. Phase 0.2 bounds the loss until this lands.

## Out of scope for Phase 2

- **Drink tab sync** — deliberately deferred at the owner's instruction. Do not build it. (For the
  record, so it isn't rediscovered as a surprise: `DrinkTrackerContext.tsx:10` uses a device-wide key
  not tied to any account, there is no staff view, and `src/services/drinkSheets.ts` is a decoy —
  `DRINKS_SHEET_URL = ''` so `pushDrinkEntry` **logs and returns `true`** (`:23-26`) while every caller
  believes drinks synced.)
- **Staff visibility into training logs** — see the third trap in State of play. OWNER DECISION.

## Indexes

Mostly a non-issue: `nutritionSync.ts:276` notes per-uid subcollection listeners carry no
`orderBy`/`where`, so no composite index is needed — sort in memory, the per-user set is bounded. That
holds for training, HR sessions and gamification. (The one place it *would* have bitten is a
cross-member collection-group query, which only the deferred drink staff view needed.)

---

# PHASE 3 — White-label. Only if gym #2 signs.

**Do not build this speculatively.** Order matters: 3.1 defines `tenant.ts`'s shape, and getting it
wrong means redoing every consumer.

| # | Item | Effort | Notes |
|---|---|---|---|
| 3.1 | **Firebase config → env** — `src/config/firebase.ts:64-71` is a literal object, projectId `zenki-dojo`. Also `src/config/api.ts:31` (functions base URL — every AI call) and `:54-55` (privacy/support URLs). | days | Use the existing `extra.X \|\| process.env.EXPO_PUBLIC_X \|\| '<zenki literal>'` pattern in `src/config/env.ts`. **Keep zenki values as fallback defaults** so gym #1 is byte-identical. Do **not** make the env values required. |
| 3.2 | **Gym coords → `tenant.ts`** — `DOJO_COORDS` hardcoded in `src/utils/location.ts` | hours | The right first proof of the tenant pattern. Gym #2's members literally cannot check in without it. Do **not** make the radius admin-writable — that adds an attack surface for nothing. |
| 3.3 | **Tokenize the AI prompt** — `functions/src/senpaiChat.ts:80, 173, 175, 186` | days | `{OWNER_NAME}`, `{GYM_NAME}`, `{USERBASE_DESCRIPTION}`, `{POINTS_NAME}`, `{PROGRESSION_SENTENCE}`. **Functions-only — no App Store release.** Today it tells members the app was built "by a guy named Matt for himself and a tiny circle of his friends", offers gym #1's promo codes, and explains a belt system. Cheap first ship: tokenize only line 80, the ~20 Matt references, `:173` promo codes and `:186` belts; leave the few-shots. |
| 3.4 | **Class types → config-driven** — hardcoded TS union `'jiu-jitsu' \| 'muay-thai' \| 'pilates' \| 'open-mat'` duplicated across `src/data/schedule.ts:4`, `ClassCard.tsx:15,49-59`, `AdminScheduleScreen.tsx:21-32`, `HomeScreen.tsx:67-70` | week-plus | Cheaper interim: Firestore-editable label/icon/color over the four **fixed** slot ids. Ships zero new collections. Today an admin cannot add "Spin" without a code change and an App Store release. |
| 3.5 | **Belt → rank** — `BeltLevel` union on the core Member type, `BeltDisplay.tsx`, `belt_promotion` achievements, surfaced in onboarding/admin/profile | week-plus | **Keep the six string ids as the storage encoding.** Rename exports to `RANK_ORDER`/`RANK_LABELS`/`RANK_COLORS`, tenant-source the labels (`:169`), colors (`:160`) and the noun "Belt". **No migration, no achievement churn.** Ripping the field out costs a migration and touches achievements, onboarding, admin, profile and the AI prompt — don't. |
| 3.6 | **`tenant.ts` extraction** | week-plus | Two layers: **build-time** (mascot + product assets — `require()` is Metro-resolved at build time, so these cannot be runtime) and **runtime** (`/tenant/{id}`: address, coords, contact, waiver text, class types, progression vocabulary, currency name). |

**The decision that moves this estimate more than everything else combined:** does gym #2 take the
existing mascot as-is, or want their own? As-is, 3.3 is a day. Their own means commissioned art,
regenerated 24-frame sprite strips, and rewriting ~2,000 lines of persona across
`src/data/senpaiDialogue.ts` (850 lines) and the system prompt.

Also note: the legal waiver (`src/data/waiver.ts:20-30`) names the dojo in five clauses plus the street
address. **Gym #2's own counsel must supply their waiver** — do not adapt this one. Bumping
`WAIVER_VERSION` forces every member to re-sign, which is correct but must be planned.

---

## Bottom line

| Phase | Effort | Needs Apple? | When |
|---|---|---|---|
| **0** — rules, CFs, web admin | ~1 day | **No** | Now. Closes a live money hole and a legal-retrieval gap today. |
| **1** — one honesty release | ~1 week | Yes — **one** submission | Next release. Deletes every false claim in the app. |
| **2** — everything online | ~3 weeks | Yes — batch them | This is 2.0.6. Start at 2.1, it's 70% written. |
| **3** — white-label | ~2–4 weeks | Mixed (3.3 is functions-only) | Only when gym #2 signs. |

**Start with Phase 0.** One day, no App Store review, and every item in it is either money leaving the
building or a document that cannot be produced in a lawsuit.

## Owner decisions outstanding

1. **Staff visibility into training logs** — durability fix does not grant it; granting it is a separate,
   disclosed privacy call (`firestore.rules:545-547`).
2. **Google Apps Script endpoints (1.5)** — needs the owner to deploy scripts bound to their Google
   account, or the integrations get deleted.
3. **Wishlist** — delete (cheaper) or wire as a filter (half-day).
4. **Structured exercise library** — roadmap item, or delete? It is the only path to real set-by-set
   logging.
5. **Flame redemption** — confirmed dead and being deleted. If it should exist instead, it is week-plus
   and only after 2.3.
