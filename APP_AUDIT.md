# APP_AUDIT.md — Whole-App Multi-Agent Audit (full detail)

> 6 blockers · 20 majors · 18 minors · 12 hallucinations. Social excluded (already audited). Blockers adversarially verified.


## BLOCKERS (6)


### F03 [admin·admin-ops] 🪄HALLUCINATION Time clock hard-codes employeeName='Apple' and hourlyRate=20 for every employee — payroll pay figures and synced timesheet rows are wrong
`src/context/TimeClockContext.tsx:55-56` · confirmed · verifier: confirmed

**Detail:** APPEARS: each employee clocks in/out on the Clock tab and sees 'THIS PERIOD' hours + pay, and entries sync to the dojo's master Google Sheet labeled with their name and rate. ACTUALLY: TimeClockProvider is mounted in App.tsx:249 with NO props (`<TimeClockProvider>`), so it always uses the parameter defaults `hourlyRate = 20, employeeName = 'Apple'` (TimeClockContext.tsx:55-56) — these were hardcoded to match the single seed demo employee 'Apple' (members.ts id '3'). Evidence: (1) `getPeriodTotals(state.currentPeriod, hourlyRate)` at TimeClockContext.tsx:222 feeds the default 20 into the pay math; TimeClock.tsx:124 renders `formatCurrency(periodSummary.totalPay)` as the employee's pay. (2) `pushTimeEntry(completed, employeeName, hourlyRate, …)` at TimeClockContext.tsx:166 writes the row to Sheets with employeeName='Apple' and hourlyRate=20 (googleSheets.ts builds `employeeName`/`hourlyRate`/`totalPay` from these). (3) `Member.hourlyRate` exists (members.ts:40) and is set per-member (id '3' = 20) but is NEVER read into the provider — grep shows the only producers are the provider default and the seed. USER IMPACT: any real employee whose name isn't 'Apple' or rate isn't $20/hr sees an incorrect pay total in-app AND every payroll row in the owner's timesheet is mislabeled 'Apple' at $20/hr — a money/payroll-integrity bug and a displayed-data hallucination. Also, all entries persist under one global AsyncStorage key `@zenki_timeclock_state` (no per-uid scoping, no Firestore), so two employees on one device merge hours.

**Fix:** Wire the real signed-in employee into the provider: in App.tsx read `useAuth().user` and pass `employeeName={`${user.firstName} ${user.lastName}`.trim()}` and `hourlyRate={user.hourlyRate ?? <dojo default>}` to TimeClockProvider (move it inside a child of AuthProvider that can read user, or have the provider itself consume useAuth). Persist time-clock state per Firebase uid (and ideally to a Firestore `timeEntries` collection) so it can't merge across employees and survives reinstalls.


### F04 [admin·admin-ops] Signed liability waivers are silently rejected by Firestore rules (memberId is internal id, rule requires auth uid) — no waiver ever persists
`src/services/waiverSync.ts:42-55` · confirmed · verifier: confirmed

**Detail:** APPEARS: at the end of onboarding the user signs the liability waiver and it is recorded to Firestore (`pushWaiverToFirestore(signature)` at OnboardingScreen.tsx:341) for the dojo's legal records. ACTUALLY: `pushWaiverToFirestore` does `addDoc(collection(db,'waivers'), signature)` where `signature.memberId` is the app's INTERNAL member id (OnboardingScreen.tsx:331 sets `memberId: id`, where `id` is a seed id like '1'..'5' or `Date.now().toString()`), but the Firestore rule (firestore.rules:313-314) requires `request.resource.data.memberId == request.auth.uid`. The internal id never equals the 28-char Firebase Auth uid, so EVERY waiver create is rejected by the rule and falls to default-deny. The failure is swallowed (waiverSync.ts:50-53 logs `console.warn` and returns false; it's fire-and-forget at the call site). There is no Cloud Function that ingests waivers (only deleteAccount.ts references the collection). USER/BUSINESS IMPACT: the dojo believes it has durable, queryable proof that each member signed the release-of-liability — it has none. This is a legal/compliance data-loss bug. (Related: deleteAccount.ts:227 also deletes waivers via `where('memberId','==',uid)`, so the GDPR cleanup likewise wouldn't match real waiver docs — same id/uid confusion.)

**Fix:** Stamp the Firebase Auth uid on the waiver and align the rule + queries to it. In waiverSync.ts add `firebaseUid: auth?.currentUser?.uid` to the doc (mirroring attendanceSync/appointmentSync), change firestore.rules waivers create to `request.resource.data.firebaseUid == request.auth.uid`, and change deleteAccount.ts:227 to query `where('firebaseUid','==',uid)`. Keep the internal `memberId` as a non-authorizing field. Surface failure to the user (await + alert) since this is legally required.


### F01 [auth·auth-account] Account deletion wipes all server data BEFORE Auth delete — requires-recent-login leaves a re-loginable account with zero data
`src/screens/SettingsScreen.tsx:144-176` · confirmed · verifier: confirmed

**Detail:** confirmDeleteAccount() calls the server `deleteAccount` Cloud Function UNCONDITIONALLY first (line 150), which cascade-deletes the user's Firestore docs + Storage (posts, members, conversations, attendance, waivers, bloodwork, etc.). Only AFTER that does it call firebaseDeleteCurrentUser() (line 165). Firebase requires a recent login to delete an Auth user; if the session token is older than ~5 minutes, user.delete() throws `auth/requires-recent-login`. The handler catches that, shows 'Sign in again', and `return`s (lines 167-173) — but the server has ALREADY erased everything. Result: the Firebase Auth credential still exists (user can sign back in with the same email/password) while every piece of their data is gone, AND the app told them deletion didn't complete. This is a data-loss bug and an Apple 5.1.1(v) compliance failure: deletion is neither atomic nor reliably complete, and a 'deleted' account remains authenticable. A reviewer testing delete on a session that's been open a few minutes will hit exactly this.

**Fix:** Reorder + reauthenticate: attempt firebaseDeleteCurrentUser() (or an explicit reauthenticateWithCredential / Apple-Google reauth) BEFORE calling the server cascade. If it throws requires-recent-login, prompt to reauth and abort WITHOUT touching server data. Only invoke the server deleteAccount once the Auth user has been (or is guaranteed to be) deletable. Alternatively, have the deleteAccount Cloud Function itself delete the Auth user via admin.auth().deleteUser(uid) as its final step (Admin SDK has no recent-login requirement), and drop the fragile client-side delete entirely.


### F05 [LEAD·cloud-functions] diagPostsCount is a live, unauthenticated endpoint that leaks every user's post data
`functions/src/diagPostsCount.ts:15-38` · confirmed · verifier: confirmed

**Detail:** APPEARS to be a harmless debug helper (file comment says 'DEBUG ONLY ... remove after the post pipeline is confirmed'). ACTUALLY: it is still exported from index.ts:71 and present in the freshly-built lib/ (lib/diagPostsCount.js, mtime 17:13), so it is deployed/deployable. It has NO auth check at all — onRequest({ cors:true, region:'us-central1' }) with no Bearer verification — and returns the 20 most recent /posts docs including userId, mediaType, and a 60-char slice of each caption to ANY anonymous caller who hits https://us-central1-zenki-dojo.cloudfunctions.net/diagPostsCount. This is a private, invite-gated app where posts are meant to be visible only to authenticated members; this endpoint exposes member UIDs + post content to the open internet, which is both a privacy hole and an Apple-review/data-exposure risk. Confirmed: read the file; confirmed no client calls it (grep of src/ is empty), so it is pure dead debug surface; confirmed not mentioned in SOCIAL_AUDIT.md/SOCIAL_PR1_AUDIT.md so it wasn't an accepted item.

**Fix:** Delete functions/src/diagPostsCount.ts and remove the `export { diagPostsCount } from './diagPostsCount';` line in index.ts (line 71), rebuild, and redeploy (a redeploy that no longer exports it will delete the deployed function — or run `firebase functions:delete diagPostsCount`). If a triage endpoint is genuinely still needed, gate it behind the same admin verifyAdmin() pattern used by adminActionReport.ts.


### F02 [health·health-sensors] Medication reminders never fire at scheduled time — malformed notification trigger for installed Expo SDK 55
`src/services/medicationNotifications.ts:93-103` · confirmed · verifier: confirmed

**Detail:** scheduleDaily/scheduleWeekly pass `trigger: { hour, minute, repeats: true, channelId }` (and weekly adds `weekday`). The inline comment claims 'expo-notifications SDK 52'. The project actually has expo-notifications 55.0.21 (package.json + node_modules/expo-notifications/package.json), where triggers are strictly typed and REQUIRE a `type` field. I traced the installed parser: node_modules/expo-notifications/build/scheduleNotificationAsync.js parseTrigger() runs hasValidTriggerObject() (passes only because `channelId` key is present, even when its value is undefined on iOS), then every parse*Trigger() requires `'type' in trigger` — parseDailyTrigger/parseWeeklyTrigger (lines 162-198) all bail. Execution falls through to line 109 Platform.select: on iOS it returns `null` (a null trigger means DELIVER IMMEDIATELY), on Android it returns `{ type:'channel', channelId:'medications' }` (no time component). NET: when a user adds a med with reminders ON, the reminder fires once instantly at save time and then NEVER at the intended dose times (e.g. 08:00/20:00). The MedicationTracker UI (MedicationTrackerScreen.tsx:1054) explicitly promises 'Local push notifications at each scheduled time' and defaults the toggle ON (line 537), so this is a silent failure of a core feature of the medication/peptide adherence tracker. No crash — the throw path isn't even hit (channelId key keeps hasValidTriggerObject happy); it just schedules a useless immediate/typeless notification. By contrast AppointmentContext.tsx:79 has the same untyped-trigger smell, confirming the SDK-version mismatch is a pattern, but the daily/weekly med case is the one that fully breaks repeating reminders.

**Fix:** Use the typed trigger shapes for expo-notifications 55. Daily: `trigger: { type: SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: Platform.OS==='android' ? 'medications' : undefined }`. Weekly: `{ type: SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute, channelId }`. Import `SchedulableTriggerInputTypes` from 'expo-notifications'. Drop the now-meaningless `repeats: true`. Verify on a device that a med added now produces a reminder tomorrow at the set time, not an instant one.


### F06 [LEAD·rules-security] 🪄HALLUCINATION Liability-waiver writes are 100% rejected — no signed waiver ever persists anywhere (legal/compliance data loss)
`firestore.rules:311-316 (rule) + src/services/waiverSync.ts:42-55 + src/screens/auth/OnboardingScreen.tsx:330-341` · confirmed · verifier: confirmed

**Detail:** APPEARS: onboarding shows the user signing the liability waiver and 'submitting' it; pushWaiverToFirestore(signature) is fired (OnboardingScreen:341) and the flow proceeds as if recorded. ACTUALLY: the waivers create rule requires `request.resource.data.memberId == request.auth.uid` (firestore.rules:314). The WaiverSignature.memberId is the app's internal id `'user_'+Date.now().toString(36)` (OnboardingScreen:262, also reused for OAuth members), NEVER the Firebase Auth uid — and the write sends `signature` verbatim with no `firebaseUid` field (waiverSync.ts:49). So the equality can never hold and every write is permission-denied. The call is fire-and-forget (return value ignored), so the failure is silent. EVIDENCE: I confirmed there is exactly one WaiverSignature construction site (OnboardingScreen:330) and one Firestore write (waiverSync.ts:49); neither stamps firebaseUid, unlike attendance/appointments/orders/employeeTasks which all stamp `firebaseUid` for exactly this reason. The Google-Sheets fallback is also dead (WAIVER_SHEET_URL='' → logs locally only, waiverSync.ts:10,28-31). IMPACT: a dojo legally requires a signed waiver before training; the app behaves as if the waiver was captured but the /waivers collection stays empty and there is NO durable server-side record of any signed waiver. This is a legal/compliance data-loss bug and a hallucinated 'saved' state.

**Fix:** Stamp the auth uid on the waiver write exactly like the other sync services: in waiverSync.ts add `const firebaseUid = auth?.currentUser?.uid` and write `{ ...signature, firebaseUid }`, then change the rule to `request.resource.data.firebaseUid == request.auth.uid` (mirroring attendance/appointments). Keep `memberId` as a reference field. (signedAt confirms the user was signed in by then — createAccount runs first at OnboardingScreen:299-301 — so auth.uid is available.) Optionally have the call site await/log the boolean so a future rejection isn't silent.


## MAJORS (20)


### F07 [auth·auth-account] First-time OAuth (Apple/Google) session is lost on reload if onboarding is abandoned, and the member is never persisted
`src/context/AuthContext.tsx:128-136` · confirmed · 

**Detail:** On first-time Apple/Google sign-in, SignInScreen calls `auth.signIn(member)` (SignInScreen.tsx:121 & 195) BEFORE routing into Onboarding. signIn() persists ONLY STORAGE_KEY = member.id (AuthContext.tsx:130); it never writes CUSTOM_MEMBER_KEY. The OAuth member's id is a freshly generated `mem_...` (firebaseAuth.ts buildMemberFromOAuth → generateId('mem')) that is NOT in the seed MEMBERS array. The session-restore path (AuthContext.tsx:50-73) resolves the user by MEMBERS.find(id) first, then CUSTOM_MEMBER_KEY; for an OAuth id both miss → base is null → returns signed-out. CUSTOM_MEMBER_KEY (and the /members Firestore push) is only written at the END of onboarding inside createAccount() (line 208 & 228). So if a first-time OAuth user force-quits during the 9-step onboarding, on next launch they are logged out (despite a live Firebase Auth session) and their member record was never saved locally or pushed to Firestore — they restart from scratch and never appear in the admin members list. Even completing onboarding, the user is in a fragile 'authenticated but not locally persisted' state for the entire wizard.

**Fix:** In AuthContext.signIn(), also persist the full member to CUSTOM_MEMBER_KEY when the id is not a seed member (or always), so restore can rehydrate OAuth users. Better: have the OAuth path call createAccount(member) (no password) immediately on first sign-in to persist + push, then let Onboarding UPDATE that member. Also add a restore fallback that rehydrates from Firestore (/users/{uid}.member) when the local id isn't found but a Firebase Auth session exists.


### F08 [auth·auth-account] Invite gate falls back to hardcoded 'dragon' whenever validateInviteCode is unreachable (and it is not deployed in prod)
`src/screens/auth/SignInScreen.tsx:280-291` · confirmed · 

**Detail:** handleVerifyInvite() POSTs to validateInviteCode, but ANY non-definitive failure (network error, 404 function-not-deployed, 5xx) drops into the catch and accepts the legacy client constant INVITE_CODE='dragon' (lines 280-291). Per the project memory note (project_apple_review_invite_login.md), validateInviteCode is NOT deployed to prod (returns 404), so in production EVERY invite check throws and the gate is effectively the hardcoded 'dragon' string shipped in the JS bundle — trivially extractable and shareable, defeating the 'Members Only' gate. Compounding this: once passed, the result is cached in AsyncStorage (@zenki_invite_verified='true', line 270/286) and NEVER re-validated on subsequent launches (useEffect at line 50 only reads the flag), and signOut/deleteAccount never clear it — so a revoked invite code still lets that device in forever. The gate is also purely a UI Modal over SignInScreen with no server enforcement on signup itself.

**Fix:** Deploy validateInviteCode and remove the client-side 'dragon' fallback (or restrict it to __DEV__). On a 5xx, fail closed (block) rather than accepting the legacy code. Re-validate the cached invite flag periodically/server-side, and clear @zenki_invite_verified on signOut and account deletion. Enforce invite validity server-side at account-creation time, not just in the pre-login UI.


### F09 [auth·auth-account] Password reset is undeliverable for username-only accounts (synthesized @zenkidojo.app email nobody controls)
`src/services/firebaseAuth.ts:24-29` · confirmed · 

**Detail:** Members who sign in with a username (no real email) get a synthesized Firebase Auth email `${username}@zenkidojo.app` (emailForMember, lines 24-29) — and admin-created members frequently have no email. When such a user taps 'Forgot password?', ForgotPasswordScreen passes whatever they typed into the email box to firebaseSendPasswordReset. They have no inbox at @zenkidojo.app, so the Admin SDK mints a reset link and Resend sends it into the void; the UI still shows the anti-enumeration 'Check your email' success state (ForgotPasswordScreen.tsx:37). The user can NEVER reset their password and gets no signal that it's impossible — they're permanently locked out after a forgotten password. SetPasswordScreen and createAccount happily provision these unreachable-email accounts, so this is a reachable real-world state, not theoretical.

**Fix:** Detect synthesized/@zenkidojo.app (and otherwise emailless) accounts and route password recovery through an admin/support path instead of the email flow, with honest copy ('Your account has no email on file — contact the dojo to reset'). Encourage/require a real email at signup for any account that will use email/password. Consider letting username-only users reset only via an admin action.


### F22 [LEAD·cloud-functions] createPaymentIntent trusts client-supplied amount for non-drink orders (charge-amount tampering)
`functions/src/createPaymentIntent.ts:93-114` · confirmed · 

**Detail:** APPEARS to validate the charge amount server-side. ACTUALLY only the kind:'drinks' path is server-authoritative (recomputed from DRINK_PRICES). For kind:'order' (the clothing/gear store), chargeCents is set to the client-sent amountCents and the ONLY check is `if (items.length>0 && subtotalCents>0 && amountCents > subtotalCents+1)`. So a client that sends an empty/absent `items` array, or items with unitPrice:0, bypasses the guard entirely and can set ANY amount from 50 cents up to the $1000 ceiling — including undercharging a real $200 order down to $0.50. The product prices and points/promo discounts live entirely on the client, so the server cannot detect undercharge. The file's own HARDENING TODO (lines 7-9) and the inline comment acknowledge this, and there is no Stripe webhook to reconcile fulfillment, so a tampered-low charge would still flow through to order fulfillment. This is a money/integrity bug, mitigated only by the small trusted userbase and the $1000 ceiling. Confirmed in code; the documented-gap status keeps it at major rather than blocker.

**Fix:** Move product prices to a server-side catalog (mirror of src/data/products.ts) and recompute the order subtotal server-side like the drinks path; validate points/promo discounts server-side (look up the user's real point balance and the promo table) instead of trusting the client total. Until then, at minimum reject orders where items is empty or any unitPrice<=0 so the subtotal guard can't be skipped, and add the payment_intent.succeeded webhook before enabling fulfillment.


### F23 [LEAD·cloud-functions] sendPasswordReset has no rate limiting or App Check — email-bomb / Resend-quota abuse vector
`functions/src/sendPasswordReset.ts:47-119` · confirmed · 

**Detail:** APPEARS to be a safe branded-reset wrapper (it correctly avoids account enumeration by always returning 200). ACTUALLY it is a fully public endpoint (client calls it pre-auth) with NO per-IP/per-email throttle, no App Check, and no rate limiting (confirmed: grep for rateLimit/appCheck in the file is empty). An attacker can POST a victim's email in a tight loop; each call mints a real password-reset link via admin.auth().generatePasswordResetLink and sends an email through Resend. Impact: (1) email-bombing any known user's inbox with reset emails, and (2) burning the Resend monthly send quota / triggering Resend abuse flags, which would take down legitimate password resets for everyone. Pre-auth endpoints can't use the UID-based enforceRateLimit, so this one is genuinely unprotected.

**Fix:** Enable Firebase App Check on sendPasswordReset (enforceAppCheck) so only the real app can call it, and/or add a coarse IP+email Firestore rate limit (e.g. max 3 resets per email per hour, max N per IP per hour) before minting/sending. The same treatment applies to validateInviteCode.


### F24 [LEAD·cloud-functions] validateInviteCode is public, unthrottled, and writes on unauthenticated input — brute-forceable invite gate
`functions/src/validateInviteCode.ts:19-69` · confirmed · 

**Detail:** APPEARS to be a safe pre-auth gate. ACTUALLY it is public (invoker:'public') with no rate limiting or App Check, and on every request it does a Firestore read (inviteCodes/{code}) plus, on a hit, an unauthenticated WRITE (usedCount increment + lastUsedAt). Two real problems: (1) the entire app's sign-up gate can be brute-forced — an attacker can script POSTs cycling candidate codes with zero throttle until one returns {ok:true}; for a tiny known code space (the memory note shows the launch gate is effectively the single word 'dragon') this is trivially defeated. (2) the unauthenticated increment lets anyone inflate usedCount on any code and hammer Firestore writes. The legacy-fallback branch (accept 'dragon' while the collection is empty) means in the current prod state the gate is one guessable word with unlimited attempts. Confirmed in code; severity is major because the invite gate is the app's front door for Apple's closed-beta posture.

**Fix:** Add App Check and/or an IP-based rate limit (e.g. 10 attempts/IP/hour, exponential backoff) so the code can't be brute-forced; move the usage increment behind a successful-auth signal or drop it; ensure real codes are seeded so the 'dragon' legacy fallback is disabled in prod.


### F26 [crosscut·cross-cutting] 🪄HALLUCINATION "Google Calendar synced / bookings sync automatically" is fabricated — nothing is ever written to the user's calendar
`src/screens/BookScreen.tsx:120-130,132-155,157-202` · confirmed · 

**Detail:** APPEARS TO DO: The Book Private screen has a Google-calendar "Sync" button. linkGoogleCalendar() runs a real Google OAuth flow (GOOGLE_CLIENT_ID is configured in app.json:175, so the consent screen actually appears and succeeds), then on success sets calendarLinked=true, flips the header chip to a checkmark + "Synced" (line 228), and alerts "Google Calendar linked. Bookings will sync automatically." (line 125). ACTUALLY DOES: No booking is ever pushed to Google Calendar. (1) The OAuth result's access token is discarded — only result.type==='success' is checked; the token is never captured or stored. (2) addToGoogleCalendar() (line 132, the URL builder) is dead code — I grepped the whole file and it is defined but never invoked. (3) handleBooking() (line 157) writes the appointment to Firestore via requestAppointment() and awards gamification, but never calls addEventToCalendar, expo-calendar, or any Calendar API (grep for addEventToCalendar|expo-calendar|createEvent|accessToken in BookScreen.tsx returns nothing). EVIDENCE: src/services/calendarIntegration.ts (a real, working addEventToCalendar helper) exists but BookScreen never imports it. USER IMPACT: A member connects their Google Calendar, sees "Synced" and an explicit promise of automatic sync, books a private session — and the event silently never appears on their calendar. They miss the session believing it was on their calendar.

**Fix:** Either (a) make it real: in handleBooking, after requestAppointment succeeds, call addEventToCalendar({ title: `Zenki Dojo · ${sessionType.label} with ${instructor.name}`, startsAt: slotDate, durationMinutes, location: 'Zenki Dojo, 1714 Hillhurst Ave, LA 90027', notes }) from src/services/calendarIntegration.ts (it already handles native Apple/Google calendar + web fallback and is platform-correct); or (b) stop claiming sync: remove the linkGoogleCalendar OAuth button, the calendarLinked/"Synced" chip, and change the alert copy so it does not promise automatic calendar sync. Delete the dead addToGoogleCalendar() either way.


### F16 [health·health-sensors] 🪄HALLUCINATION Body Lab 'HEALTH SCORE /100' shows a fabricated baseline of 50 for users with zero health data
`src/screens/BodyLabScreen.tsx:25-61` · confirmed · 

**Detail:** healthScore is a useMemo that starts at `let score = 50` and only adjusts when real inputs exist (DEXA body-fat, bloodwork flagged ratio, a logged weight). It returns null ONLY when `!user` (line 26). For a signed-in user who has uploaded NOTHING, `factors===0` and the function returns exactly 50. The dashboard renders this prominently as '{healthScore ?? '--'}' inside a '/100' ring whose color is set to warning/error (lines 143-148) — so a brand-new user sees a concrete '50/100' HEALTH SCORE with a yellow/red ring that was never derived from any of their data. The adjacent quick-stat tiles correctly show '--' when empty (lines 165-181), which makes the invented 50 stand out as the one number not backed by reality. Even with partial data the metric is largely arbitrary (fixed +5/+15/-5 magic numbers, an extra `factors*3` fudge on line 60, and a body-fat 'optimal' band of 10-25% applied to everyone regardless of sex on line 36). Per the product owner's priority #2 this is exactly a screen showing data that is not real.

**Fix:** Return null from healthScore when `factors === 0` (no DEXA, no bloodwork, no weight) so the ring renders '--' and the description's 'Upload scans and blood panels to improve your score' is the only message. Optionally gate the entire score card behind `dexaScans.length || bloodwork.length`. Separately, make the body-fat optimal band sex-aware (the profile has sex available) so the score isn't skewed for female users.


### F17 [health·health-sensors] GPS activity tracking is foreground-only — locking the phone mid-run silently stops recording the route
`src/context/GpsActivityContext.tsx:109-217` · suspected · 

**Detail:** startTracking requests only `Location.requestForegroundPermissionsAsync()` (line 110) and records via `Location.watchPositionAsync` (line 155) with no background-location task. app.json declares only `locationWhenInUsePermission`/`NSLocationWhenInUseUsageDescription` and `UIBackgroundModes: ['fetch']` (no `location`). On iOS, a When-In-Use foreground watch is suspended when the app is backgrounded or the screen locks, so route points stop accumulating until the user reopens the app. For a run/ride tracker (the screen advertises route, distance, pace), a user who locks their phone during a run gets a truncated route and undercounted distance/calories with no warning. The watch-fail path is handled correctly (native failure bails and returns false, lines 191-208) — the gap is specifically backgrounding, which is the normal way people carry a phone on a run. This may be a deliberate scope decision, but as shipped the feature under-records real activity.

**Fix:** Either (a) document/accept foreground-only and surface a 'keep the app open' hint when tracking starts, or (b) implement true background tracking: add `expo-location` background task (Location.startLocationUpdatesAsync with a TaskManager task), request `requestBackgroundPermissionsAsync`, and add `UIBackgroundModes: ['location']` + `NSLocationAlwaysAndWhenInUseUsageDescription` to app.json. Needs on-device verification of behavior on lock/background.


### F14 [nutrition·nutrition-vision] USDA food database is dead — API key never configured, USDA search silently returns nothing
`src/config/env.ts:19` · confirmed · 

**Detail:** APPEARS: FoodSearchModal advertises a unified USDA + Open Food Facts search; result rows even render a green 'USDA' source badge (FoodSearchModal.tsx:171-174), implying USDA results are returned. ACTUALLY: USDA_API_KEY resolves to '' — it is NOT in app.json `extra` (only GOOGLE_CLIENT_ID/STRIPE_* are present, app.json:171-178), NOT in eas.json env (only EXPO_PUBLIC_ENV), and there are no .env files in the repo. foodSearch.ts:64 builds `/foods/search?api_key=&query=...`; USDA FoodData Central rejects a blank/invalid key with HTTP 403, and searchUSDA() does `if (!res.ok) return []` (foodSearch.ts:66) while searchFoods wraps it in `.catch(() => [])` (foodSearch.ts:27). EVIDENCE: confirmed key absence via grep across app.json/eas.json and confirmed no .env*. IMPACT: every food search (and the search-modal path that feeds Macro logging) silently relies entirely on Open Food Facts. USDA Foundation/SR-Legacy whole-food entries — the higher-quality, US-centric half of the catalog — never appear. Users searching common whole foods (e.g. 'chicken breast', 'white rice') get only OFF's crowd-sourced packaged-goods data or nothing, with no error shown. The 'USDA' badge can therefore never appear in production, so the UI implies a data source that is fully offline.

**Fix:** Add EXPO_PUBLIC_USDA_API_KEY to eas.json build env (or USDA_API_KEY to app.json `extra`) with a real FoodData Central key. As a stopgap, USDA grants a public 'DEMO_KEY' — wire it as the fallback in env.ts so search degrades gracefully instead of going dark. Optionally have searchUSDA log/surface a 403 so a missing key is detectable in QA rather than silently swallowed.


### F15 [nutrition·nutrition-vision] 🪄HALLUCINATION GPS activity calories are computed from a hardcoded 80 kg body weight, ignoring the user's tracked weight
`src/context/GpsActivityContext.tsx:219` · confirmed · 

**Detail:** APPEARS: The GPS tracker (ActivityTrackerScreen) shows a personalized 'Calories' figure per activity and an all-time 'Calories' total (ActivityTrackerScreen.tsx:362, 427), and stores `calories` on every GpsActivity. ACTUALLY: ActivityTrackerScreen.handleStop calls `stopTracking()` with NO argument (ActivityTrackerScreen.tsx:113). stopTracking defaults `weightKg: number = 80` (GpsActivityContext.tsx:219) and computes `estimateCaloriesMET(met, weightKg, durationSeconds) = met * 80 * hours` (gps.ts:147-148). The user's real weight is fully available — NutritionContext.latestWeight(memberId) tracks it and the seed reviewer even weighs 161.5 lb — but it is never passed in (grep confirms ActivityTrackerScreen has zero weight references). EVIDENCE: read both files + grep'd all stopTracking callers; the only app caller passes nothing. IMPACT: kcal is wrong for everyone whose bodyweight isn't ~176 lb (80 kg): a 60 kg runner's burn is overstated ~33%, a 100 kg runner's understated ~20%. The number is presented as the user's personal expenditure but is a fixed-bodyweight constant, and it propagates into persisted history and StatsPanel all-time totals.

**Fix:** Pass the user's current weight in kg into stopTracking from ActivityTrackerScreen.handleStop, e.g. derive from useNutrition().latestWeight(user.id) (convert lb→kg) with the 80 kg default only as a final fallback when no weigh-in exists. The plumbing already exists (stopTracking accepts an optional weightKg); just supply it at the call site.


### F18 [payments·payments-store] Order charge amount is fully client-trusted — buyer can pay any amount ≥ $0.50 for any order
`functions/src/createPaymentIntent.ts:93-114` · confirmed · 

**Detail:** APPEARS to validate the order charge server-side; ACTUALLY only guards against charging MORE than the client-sent subtotal, and that subtotal is itself computed from client-supplied unitPrice/quantity (lines 99-107). There is no trusted product-price source for kind:'order' (unlike kind:'drinks', which recomputes from DRINK_PRICES). So a tampered client can POST amountCents:50 with matching low unitPrice values and the server happily creates a PaymentIntent for $0.50 against a $200 Gi. The only real bounds are amountCents>=50 and the $1,000 ceiling. The CF does not read products/customProducts from Firestore at all. Impact: revenue loss for the dojo on any in-app card/Apple Pay order; the metadata audit trail also reflects the spoofed line items. NOTE: this is explicitly documented as a known limitation (HARDENING TODO at top of file + APPLE_PAY_SETUP.md 'Orders — bounded + audited, not fully validated yet'), and the entire Apple Pay path is gated behind STRIPE_CONFIGURED, which is currently false in prod (no publishable key; per project memory the functions aren't deployed). So no live money flows today — but the moment Stripe is configured this is an open underpayment hole.

**Fix:** Make order amounts server-authoritative before enabling Stripe: sync the built-in product catalog (src/data/products.ts) + customProducts to Firestore, look up each item's memberPrice by productId in the CF to recompute the true subtotal, and move the points/promo discount logic server-side (or pass a signed discount token) so the final charge can be recomputed and a floor enforced, instead of only checking amountCents <= clientSubtotal.


### F19 [payments·payments-store] No Stripe webhook / fulfillment reconciliation — a successful charge can leave zero order record
`functions/src/createPaymentIntent.ts:116-129` · confirmed · 

**Detail:** createPaymentIntent creates the PaymentIntent and returns; there is NO payment_intent.succeeded webhook (confirmed: only createPaymentIntent is exported in functions/src/index.ts; no webhook/refund function exists anywhere under functions/src). Fulfillment depends entirely on the client: StoreScreen.tsx:367-424 confirms the Apple Pay sheet, then writes the order locally (appendLocalOrder) and best-effort to Firestore. If the app is backgrounded/killed or loses network in the window AFTER confirmPlatformPayPayment succeeds but BEFORE appendLocalOrder runs, the customer is charged with no receipt locally AND no orders doc in Firestore — the dojo never learns the order exists. There is also no admin refund path. Documented as a follow-up in APPLE_PAY_SETUP.md but not implemented. Impact: charged-but-unfulfilled orders, money taken with no server record, no way to refund in-app.

**Fix:** Add a Stripe webhook function handling payment_intent.succeeded that writes/upserts the canonical order doc (keyed by paymentIntentId) server-side, so fulfillment never depends on the client surviving the confirm. Add an admin refund action (stripe.refunds.create) gated by isAdmin().


### F20 [payments·payments-store] 🪄HALLUCINATION Apple Pay drink-tab charge persists no durable record (no paymentIntentId, no Firestore write)
`src/screens/DrinkScreen.tsx:246-263` · confirmed · 

**Detail:** On a successful Apple Pay drink charge the handler calls payAllUnpaid(memberName) and shows 'Tab paid', but it (a) discards pay.paymentIntentId entirely and (b) writes nothing to Firestore — unlike the clothing store, DrinkScreen never calls saveOrderToFirestore or any cloud persist. payAllUnpaid (DrinkTrackerContext.tsx:152-169) only flips local AsyncStorage entries to paid:true and calls markDrinksPaid, which is a no-op (see next finding). So a real card charge occurs while the only evidence is a local 'paid' flag on the device. After a reinstall or on any other device/admin view there is zero record that money changed hands or which Stripe payment it maps to. Impact: unreconcilable drink revenue, disputes impossible to resolve, no admin visibility. Flagged isHallucination because the UI asserts 'Paid $X with Apple Pay' with no persisted backing.

**Fix:** On Apple Pay success, persist a drink order/receipt to Firestore (mirroring saveOrderToFirestore) including paymentIntentId, amount, drink breakdown, and firebaseUid, before/alongside payAllUnpaid; surface it in OrderHistory or an admin tab.


### F21 [payments·payments-store] 🪄HALLUCINATION Drink charges/payments never reach any backend — sync URL hardcoded empty, returns fake success
`src/services/drinkSheets.ts:6` · confirmed · 

**Detail:** DRINKS_SHEET_URL = '' is hardcoded. Both pushDrinkEntry (commit a drink) and markDrinksPaid (settle the tab) short-circuit on the empty URL to a console.log and return true — i.e. they report success while sending nothing anywhere. The entire drink tab (today's order, monthly history at DrinkScreen.tsx:177-216, unpaid balance, and 'mark settled' clears) lives only in this device's AsyncStorage (DrinkTrackerContext STORAGE_KEY). The dojo/admin has no way to see who owes for drinks or who has paid; nothing persists across reinstall or to other devices. This is the dominant active drink flow because Apple Pay is gated off. Impact: a 'drink tab' the gym can bill against effectively does not exist server-side; the 'Settle Tab' in-person flow clears a balance no one but the member can see. Marked isHallucination: the sync helpers return true (success) for a write that goes nowhere.

**Fix:** Either point DRINKS_SHEET_URL at the real Apps Script (or write drink charges/settlements to a Firestore collection with rules) and have the helpers return the real network result; or, if drinks are intentionally local-only, stop returning true to imply a successful remote sync and update the UI copy to reflect device-local tracking.


### F25 [LEAD·rules-security] Every signed-in member's device downloads ALL appointments of ALL members (cross-member PII leak)
`firestore.rules:385 (rule) + src/context/AppointmentContext.tsx:116-123,207` · confirmed · 

**Detail:** APPEARS: a member only sees their own bookings (HomeScreen/ScheduleScreen filter `a.memberId === user?.id`). ACTUALLY: the appointments read rule is `allow read: if isSignedIn()` (firestore.rules:385) and AppointmentProvider runs `subscribeToAppointments(collection(db,'appointments'))` with NO admin/owner gate (AppointmentContext.tsx:117-122), mounted app-wide for every authenticated user (App.tsx:235). So each member's client streams the ENTIRE collection over the wire — every other member's memberName, instructor, sessionType, startsAt, durationMinutes, price and status (Appointment fields, AppointmentContext.tsx:16-28). The screen-level filter only hides it in the UI; the raw data is fully present client-side and trivially readable via the SDK/devtools. EVIDENCE: confirmed `myAppointments: appointments` is the unfiltered collection (line 207) and the only filtering is downstream in screens. CONTRAST: AttendanceContext correctly gates its Firestore reads on isAdmin (AttendanceContext.tsx:69-70); appointments has no such gate. IMPACT: any member can enumerate who is training privately with whom, when, and at what price — a real privacy breach for a fitness app. (Secondary: the create rule (386-388) only checks `firebaseUid==auth.uid` and does not validate memberId/price, so a member could file a request impersonating another memberName or with price:0; low impact since admin confirms requests.)

**Fix:** Tighten the read rule to owner-or-admin: `allow read: if isAdmin() || (isSignedIn() && resource.data.firebaseUid == request.auth.uid)`. Because that makes the unfiltered collection listener fail for non-admins, also change the client: non-admins should query `where('firebaseUid','==',uid)` (add the firebaseUid stamp is already present), while admins keep the full-collection subscribe. Add a composite index if combining with orderBy.


### F10 [workouts·workouts-gamification] 🪄HALLUCINATION Logging a workout double-awards Dojo Points; "+25 Diamonds" alert under-reports the real grant
`src/context/WorkoutContext.tsx:105-118` · confirmed · 

**Detail:** APPEARS: WorkoutScreen.handleSave shows "Nice work — +25 Diamonds earned" after logging a workout (WorkoutScreen.tsx:183), implying a flat 25-point award. ACTUALLY: logWorkout calls BOTH awardPoints(POINTS_PER_WORKOUT=25) AND recordSession(). recordSession() (GamificationContext.tsx:361-410) ALSO grants its own Diamonds: dojoPoints += POINTS_PER_SESSION(10) + min(streak,30)*POINTS_STREAK_BONUS(2). So a single log actually credits 35 Diamonds on a 1-day streak, up to 95 on a long streak — not the 25 the user is told. Dojo Points are redeemable real money in the store at 10 pts = $1 (StoreScreen.tsx:42, :418 redeemPoints on checkout), so this is an economy over-credit AND a UI hallucination (shown 25, granted 35+). The XP/streak side-effects of recordSession are arguably intended (a logged workout = a session), but the explicit awardPoints(25) is redundant double-counting on top of recordSession's own point grant.

**Fix:** Pick one source of truth for workout-log Diamonds. Either (a) drop the standalone awardPoints(POINTS_PER_WORKOUT) call in logWorkout and let recordSession be the sole grantor (then fix the alert to show the actual 10+streakBonus), or (b) keep awardPoints(25) but have logWorkout NOT call recordSession's point/XP grant (e.g. split recordSession into a counter-only variant). Make the WorkoutScreen alert string reflect the real amount.


### F11 [workouts·workouts-gamification] GPS activities and HR sessions don't increment totalSessions/streak, contradicting in-code claim
`src/data/achievements.ts:48` · confirmed · 

**Detail:** APPEARS: achievements.ts:48 states "GPS activities are tracked via sessions_total (they call recordSession)", and the session/streak achievements (first_blood, centurion, streak_3..streak_100) are described as earnable through training. ACTUALLY: recordSession() is called ONLY from WorkoutContext.logWorkout (grep confirms it is the single caller). GPS ActivityTrackerScreen.handleStop calls stopTracking() with no recordSession (ActivityTrackerScreen.tsx:113), and the HR WorkoutSessionScreen.handleStop calls only recordHRSession() (WorkoutSessionScreen.tsx:165), never recordSession. Result: a user who only does GPS runs or HR-tracked sessions never increments totalSessions, never advances the daily/weekly training streak, and never unlocks the session_total or streak_days achievements — even though those are the app's headline 'training' achievements and the home Day-Streak tile (WorkoutScreen StatsTab) stays at 0. The comment is false.

**Fix:** Call recordSession() from the GPS stopTracking success path (ActivityTrackerScreen, when activity != null) and from WorkoutSessionScreen.handleStop success path, OR change the achievement model so first_blood/streak_* derive from a unified activity count (workout logs + HR sessions + GPS activities). At minimum fix the achievements.ts:48 comment to match reality.


### F12 [workouts·workouts-gamification] PR add/delete farms unlimited Dojo Points (add awards 50, delete never refunds)
`src/context/WorkoutContext.tsx:158-174` · confirmed · 

**Detail:** APPEARS: Adding a PR grants +50 Diamonds (PRDetailScreen.tsx:110 alert, addPR awardPoints(POINTS_PER_PR=50)). ACTUALLY: addPR awards 50 every time with no dedup/once-per-exercise guard, and removePR (WorkoutContext.tsx:172-174) deletes the record without refunding the 50. Since Diamonds = real store currency (10 pts = $1 discount at checkout, StoreScreen.tsx:418), a user can repeatedly add a PR (+50) and delete it (no deduction) to farm unlimited store credit. Same one-directional grant exists for workout logs (removeLog at :120-122 deletes without removing the points logWorkout granted). PRDetailScreen exposes a trash button on every history row (PRDetailScreen.tsx:311), making this trivial to exploit in-app.

**Fix:** Deduct the awarded points/XP on removePR/removeLog (track points-per-entry or decrement POINTS_PER_PR/POINTS_PER_WORKOUT, clamped at 0), or only award points for a PR that is an actual improvement over currentBest and award workout points at most once per memberId+date. Server-side validation is the robust fix, but at minimum make the grant reversible on delete.


### F13 [workouts·workouts-gamification] 🪄HALLUCINATION week_warrior / month_warrior achievements use counters that are never reset, so 'this week/month' is actually lifetime
`src/context/GamificationContext.tsx:101-102` · confirmed · 

**Detail:** APPEARS: week_warrior = '5+ sessions in a week', month_warrior = '20+ sessions in a month' (types/gamification.ts:31-32; achievement def absent but getCurrentValue maps week_warrior→sessionsThisWeek, month_warrior→sessionsThisMonth at gamification.ts:141-142). The WorkoutScreen StatsTab 'This Week'/'This Month' tiles are computed separately from real log dates, but the gamification counters drive achievements. ACTUALLY: sessionsThisWeek and sessionsThisMonth are only ever incremented in recordSession (GamificationContext.tsx:372-373) and NEVER reset at a week/month boundary (grep shows no reset logic; updateStreak resets weekStreak via lastActiveWeek but not sessionsThisWeek). So after ~5 lifetime logged workouts these counters cross the threshold permanently and the achievement unlocks regardless of whether they happened in one week. The stored value is a lifetime running total mislabeled as weekly/monthly — any UI binding it as 'sessions this week' would be fabricated.

**Fix:** Reset sessionsThisWeek to 0 when lastActiveWeek rolls over (inside the weekly branch of updateStreak), and track a lastSessionMonth string to zero sessionsThisMonth on month change, before the increment in recordSession. Alternatively derive these on read from WorkoutContext.logs filtered by current ISO week/month instead of persisting drifting counters.


## MINORS (18)


### F32 [admin·admin-ops] 🪄HALLUCINATION Broadcast 'RECENT BROADCASTS' history is stored only in the sending device's AsyncStorage — not a real cross-admin audit
`src/screens/AdminBroadcastScreen.tsx:14-60` · confirmed · 

**Detail:** APPEARS: the Broadcast screen shows a 'RECENT BROADCASTS' log with each push's title, body, and recipient count — looks like a dojo-wide record of what was sent. ACTUALLY: history is read from and written to the local-only AsyncStorage key `@zenki_broadcast_history` (AdminBroadcastScreen.tsx:14, 49-60); it is never written to Firestore. The actual push is sent client-side straight to the Expo API (pushNotifications.ts:broadcastPushNotification). IMPACT: a second admin (or the same admin on another device / after reinstall) sees an empty history even though broadcasts were sent, and the recipientCount shown is whatever that one device computed. Low severity (the send itself works), but the history pane misrepresents itself as a shared record.

**Fix:** Persist each sent broadcast to a Firestore `broadcasts` collection (admin read, admin/server create) and render the history from there, so all admins see a consistent audit trail. Or relabel the section to make clear it is a local device log.


### F33 [admin·admin-ops] `myAppointments` is the entire unfiltered appointments collection (misnomer / latent privacy footgun)
`src/context/AppointmentContext.tsx:207` · confirmed · 

**Detail:** APPEARS (by name): `myAppointments` is the signed-in member's own appointments. ACTUALLY: the context returns `myAppointments: appointments` (AppointmentContext.tsx:207) — the full collection. `subscribeToAppointments` pulls every doc in `/appointments` (appointmentSync.ts:39-57) and the read rule allows any signed-in user to read all of them (firestore.rules:385). Every current consumer (HomeScreen.tsx:445, ScheduleScreen.tsx:95, NotificationsScreen.tsx:41, NotificationsModal.tsx:54) re-filters with `a.memberId === user?.id`, so today there is NO visible leak of other members' bookings — but the name invites a future consumer to render `myAppointments` directly, which would expose every member's instructor/session/time. Also a minor cost issue: each client streams the whole collection.

**Fix:** Make the context actually scope it: `const myAppointments = useMemo(() => appointments.filter(a => a.memberId === currentUserId), [appointments, currentUserId])` (pass the signed-in member id into the provider), so the name matches the data and a careless consumer can't leak. Longer term, query `/appointments` with `where('firebaseUid','==',uid)` for the member view instead of subscribing to the entire collection.


### F27 [auth·auth-account] 🪄HALLUCINATION Dead ContactScreen fakes a 'Message Sent' confirmation but persists nothing (superseded by ContactSupportScreen)
`src/screens/auth/ContactScreen.tsx:25-35` · confirmed · 

**Detail:** auth/ContactScreen.tsx handleSubmit() runs a 1.5s setTimeout then flips to a 'Message Sent — our team will reach out to you shortly' success state (lines 31-35, 90+) with NO fetch, Firestore write, email, or queue — the message is silently discarded. It IS registered in the navigator as the 'Contact' route (RootNavigator.tsx:227) but nothing navigates there: Help and Profile both navigate to the SEPARATE, correctly-persisting ContactSupportScreen ('ContactSupport' route, which calls submitSupportMessage). So this screen is effectively dead code today; the hallucination is real but currently unreachable. Risk is that a future entry point wires up the wrong screen. (Same pattern as auth/SignUpScreen.tsx, which is also unreferenced and uses a setTimeout fake submit.)

**Fix:** Delete auth/ContactScreen.tsx and auth/SignUpScreen.tsx (both unreferenced and stubbed), or, if kept, make them call the real submitSupportMessage / account-request backend so the success state reflects a real persisted action.


### F39 [LEAD·cloud-functions] enforceRateLimit is a non-atomic read-modify-write — concurrent calls can exceed the cap
`functions/src/rateLimit.ts:29-52` · confirmed · 

**Detail:** APPEARS to enforce a hard per-UID daily cap. ACTUALLY it does get() → filter → push → set() with no transaction, so N requests from one UID firing concurrently can each read the same pre-increment `hits` array, all see recent.length < limit, and all proceed — then the last set() wins, undercounting. Worst case a user fires many parallel senpaiChat/recognizeFood/createPaymentIntent calls and slips past the limit, modestly overspending Anthropic/ElevenLabs/Stripe credits. Low real-world impact for a dozen-user app and bounded by client concurrency, but it does mean the cap is best-effort, not hard. Confirmed in code.

**Fix:** Wrap the read+write in a Firestore transaction (db.runTransaction) so concurrent calls serialize on the per-endpoint doc, or use a sharded/atomic counter. Keep the 24h window filter inside the transaction.


### F40 [LEAD·cloud-functions] deleteAccount reads the entire `requests` collectionGroup unfiltered (latent scaling/cost bug)
`functions/src/deleteAccount.ts:149-151` · confirmed · 

**Detail:** APPEARS to clean up the user's outgoing follow requests. ACTUALLY `db.collectionGroup('requests').get()` runs with NO where-clause and NO limit, pulling EVERY follow-request doc across ALL users into function memory, then filtering client-side by `d.id === uid && path.startsWith('followRequests/')`. Every other cross-user query in this file is properly indexed (where('uid','==',uid) / where('userId','==',uid)), so this one is the outlier. Harmless at a dozen users, but it scales linearly with total app-wide follow requests and will eventually blow memory/timeout and cost on the deleteAccount path. Confirmed in code.

**Fix:** Store outgoing requests under a queryable field (e.g. requesterId) and use db.collectionGroup('requests').where('requesterId','==',uid), or iterate the user's own followRequests subcollection directly instead of scanning the whole collection group.


### F43 [crosscut·cross-cutting] Unauthenticated Google Apps Script payroll-write URL shipped in the client bundle
`src/config/api.ts:48-49 (used by src/services/googleSheets.ts:64-69)` · confirmed · 

**Detail:** APPEARS TO DO: SHEETS_PROXY_URL is a live Google Apps Script `/macros/s/AKfycbz.../exec` endpoint that proxies employee timeclock entries into the dojo's master payroll Google Sheet. ACTUALLY DOES: googleSheets.ts:pushTimeEntry POSTs a JSON payload (employeeName, hours, hourlyRate, regular/OT/DT/holiday pay, totalPay) to that URL with only `Content-Type: application/json` and NO auth header, token, or shared secret (lines 64-69). The full URL is a string constant compiled into the JS bundle. EVIDENCE: api.ts:48-49 hardcodes the exec URL; googleSheets.ts:25-69 shows the unauthenticated POST with a fully attacker-controllable payload. USER IMPACT: Anyone who extracts the app's JS bundle (trivial for a shipped RN app) can POST arbitrary rows into the payroll sheet — spoofed employee names, inflated hours, fake pay totals — corrupting payroll/data-integrity. Low real-world likelihood for a small single-dojo app and the endpoint is obscure, hence minor, but it is an unauthenticated write into financial data.

**Fix:** Add a shared-secret check in the Apps Script (e.g. require a `token` field that the script validates against a Script Property) and send it from pushTimeEntry, OR move the timesheet write behind an authenticated Firebase Cloud Function (same pattern already used for createPaymentIntent / AI endpoints) so the Apps Script is only reachable server-to-server. Rotate the current deployment URL after locking it down.


### F44 [crosscut·cross-cutting] Unbounded getDocs() full-collection scans (no limit) on /users and /pushTokens
`src/services/firebaseFollow.ts:203-207 and src/services/pushNotifications.ts:97-114` · confirmed · 

**Detail:** APPEARS TO DO: getAllUsers() (firebaseFollow.ts:205) does getDocs(collection(db,'users')) and fetchAllPushTokens() (pushNotifications.ts:101) does getDocs(collection(db,'pushTokens')) — both with no query limit. ACTUALLY DOES: each reads the ENTIRE collection in one shot and maps every doc. getAllUsers feeds the member-search/people screens; fetchAllPushTokens feeds the admin broadcast. EVIDENCE: both call sites have no limit()/pagination, unlike firebaseUsers.ts:1 and firebasePosts.ts which do import/use limit. USER IMPACT: Firestore read cost and client memory grow linearly with the member base; at a few hundred members it's fine (this is a single-dojo app), but a search that re-runs getAllUsers per keystroke or a large roster will burn reads and can jank the UI. Not a correctness bug. fetchAllPushTokens is admin-only (rule-gated) so its blast radius is small.

**Fix:** For getAllUsers, prefer the existing server-side user search with a limit (e.g. limit(50) + a prefix query) instead of pulling all users client-side, or cache the result. For fetchAllPushTokens, page through with limit() batches (the broadcast already chunks sends into 100s, so it can consume a paged cursor). Neither needs to load the whole collection into memory at once.


### F30 [health·health-sensors] extractDexa passes the model's JSON straight through with no shape-guard or numeric clamp
`functions/src/index.ts:257-273` · confirmed · 

**Detail:** recognizeFood (lines 219-229) and parseBloodwork (lines 302-306) both validate the array shape and clamp numbers before responding. extractDexa does neither: after safeParseJson it does `res.json(parsed)` for any non-null object (line 266-268). The prompt forbids fabrication ('Never fabricate. If unsure, leave the field out') and the client lets the user review/edit every value before saving (DexaUploadScreen review phase, lines 316-329), so this is not a hallucination in practice. But a malformed/garbage model response (e.g. body-fat as a string, or negative kg) would flow into setEditing → save → AsyncStorage unvalidated, and into the Body Lab health-score math. Low impact because of the manual review gate, but it's an inconsistency with the sibling endpoints' defense-in-depth.

**Fix:** Mirror the other two endpoints: whitelist the known keys, coerce numerics with Number()/Math.max(0,...), drop/round out-of-range values, and validate `regional` sub-objects before `res.json`. Keep omitting absent keys (don't backfill nulls) to preserve the 'unknown' semantics.


### F31 [payments·payments-store] Checkout ignores redeemPoints() failure return; points deduction not verified
`src/screens/StoreScreen.tsx:417-419` · confirmed · 

**Detail:** redeemPoints(pointsUsed) (GamificationContext.tsx:522-530) returns false and makes NO state change when dojoPoints < amount, but the checkout discards the return value. The order is still recorded as paid/discounted with pointsUsed > 0 even if the deduction silently no-ops. In practice pointsUsed is bounded by Math.min(dojoPoints/POINTS_PER_DOLLAR, cartTotal) (line 354) and floored, so the requested amount can't normally exceed the balance — making this an edge/race concern (e.g. balance changed between render and tap) rather than a routine bug. Impact: a rare order that claims a points discount the user never actually paid in points.

**Fix:** Capture const ok = redeemPoints(pointsUsed) and, if false, abort the checkout (or recompute the discount against the live balance) instead of recording an order with an unbacked points discount.


### F41 [LEAD·rules-security] All employeeTasks + taskCompletions are streamed to every signed-in user (including gym customers), not just staff
`firestore.rules:396,419 (rules) + src/context/EmployeeTaskContext.tsx:87-100 + App.tsx:237` · confirmed · 

**Detail:** APPEARS: employee task lists / completion records are staff-ops data seen only by employees and admins. ACTUALLY: both reads are `allow read: if isSignedIn()` (firestore.rules:396 and 419) and EmployeeTaskProvider subscribes to BOTH whole collections (`subscribeToTasks`, `subscribeToCompletions`, EmployeeTaskContext.tsx:88-95) with no employee/admin gate, mounted app-wide for everyone (App.tsx:237). So every regular member (a paying gym customer) continuously downloads every employee's task assignments and per-day completion records. EVIDENCE: the subscriptions are unconditional in the effect (no isEmployee/isAdmin check), unlike AttendanceContext which gates on isAdmin. IMPACT: internal staff data (who is assigned what, who completed/skipped tasks each day) leaks to all customers, plus an unnecessary realtime read cost on every client. Lower severity than appointments because the data is less personally sensitive and not surfaced in customer UI — but it is still cross-tenant data exposure by rule.

**Fix:** Restrict reads to staff: e.g. `allow read: if isAdmin() || (isSignedIn() && (request.auth.token.employee == true || resource.data.firebaseUid == request.auth.uid))`, or gate the client subscriptions on `user?.isEmployee || user?.isAdmin` so non-staff never subscribe. (Note staff role isn't a custom claim today, so an employee-claim or an /employees doc check would be needed for a pure-rule fix.)


### F42 [LEAD·rules-security] attendance read is open to any signed-in user (defense-in-depth gap; client doesn't surface it)
`firestore.rules:286 (attendance read)` · confirmed · 

**Detail:** APPEARS: attendance check-in history is admin-only (the subscribe/fetch helpers are documented 'admin-only' and AttendanceContext gates its reads on isAdmin, AttendanceContext.tsx:69-70). ACTUALLY: the rule is `allow read: if isSignedIn()` (firestore.rules:286), so any signed-in member can read the full attendance collection directly via the SDK — every member's memberName + check-in date/time. The app never surfaces this to non-admins, so there is no UI leak today, but the rule is more permissive than the feature requires. EVIDENCE: rule line 286 vs. the isAdmin gate in AttendanceContext. IMPACT: a curious/malicious member could scrape who attended and when. Listed as minor because it's a latent over-grant, not an actively-exploited UI path.

**Fix:** Mirror the appointments fix: `allow read: if isAdmin() || (isSignedIn() && resource.data.firebaseUid == request.auth.uid)`. Writes already stamp firebaseUid (attendanceSync.ts:79-83), and the admin read path is unaffected.


### F34 [senpai·senpai-ai] 🪄HALLUCINATION Memory-log stat badges render literal escape text (♡) instead of icons
`src/screens/SenpaiMemoryScreen.tsx:164` · confirmed · 

**Detail:** The three StatBadge headers at lines 164-166 pass their icon as a JSX double-quoted attribute: icon="♡", icon="🎊", icon="✦". In JSX, a double-quoted attribute value is a LITERAL string — backslash escapes are NOT processed (unlike a real JS string literal). StatBadge renders {icon} directly inside a <Text> (line 61). So instead of the heart / confetti / sparkle glyphs the badges literally display the six-character strings ♡, 🎊, ✦ on screen. Proof of the appears-vs-actual gap: in the SAME file, MOOD_EMOJI (lines 17-25) uses the identical escapes but as JS object string-literal VALUES ('🎉'), which ARE decoded, and those render correctly at line 113 — only the JSX-attribute form is broken. User impact: the 'Total / Celebrating / Impressed' summary row on Senpai's Memory/Diary screen shows garbage escape codes next to the counts. (The numeric values are correct/real; only the icons are wrong.)

**Fix:** Use a JS expression so the escape is decoded: icon={'♡'}, icon={'🎊'}, icon={'✦'} (or paste the literal emoji/glyph characters directly, matching how the empty-state '☽' is handled via {'☽'} elsewhere).


### F35 [senpai·senpai-ai] AI rate limiter is non-atomic (read-then-write) — concurrent requests can exceed the daily cap
`functions/src/rateLimit.ts:35` · confirmed · 

**Detail:** enforceRateLimit does ref.get() (line 35), filters timestamps, checks recent.length >= limit, then recent.push(now) and ref.set(..., {merge:true}) (line 49) — with no transaction. Two requests that arrive while the stored count is at limit-1 both read the same array, both pass the check, and both write, so a user can push past senpaiChat=50 / senpaiSpeak=60 under burst (e.g. rapid hold-to-talk or replayed requests). The stated purpose of this file (header comment: 'Prevents a single user from burning all AI credits in one afternoon') is the exact threat this race weakens. For a ~12-person friends app the blast radius is tiny, so this is minor, but it is a real bypass of the documented guard.

**Fix:** Wrap the read-modify-write in admin.firestore().runTransaction() (read the doc, compute recent, throw/return blocked if over, t.set the new array) so the check and the increment are atomic. Same change covers all six endpoints since they share this helper.


### F36 [senpai·senpai-ai] senpaiSpeak is an unrestricted TTS proxy — any member can synthesize arbitrary text, no language/content gate
`functions/src/senpaiSpeak.ts:130` · confirmed · 

**Detail:** The endpoint only enforces auth + a 1500-char length cap (lines 98-105) before forwarding `text` verbatim to ElevenLabs. The CLIENT only ever sends Japanese speakText, but the SERVER never checks that, so any authenticated member can POST any text (any language, up to 1500 chars) and get back MP3 audio — effectively a free ElevenLabs TTS API on the dojo's paid quota. At the rate cap (senpaiSpeak=60/day) that's 60*1500 = 90K chars/user/day; the file's own cost note (lines 22-24) says Creator plan = 100K chars/MONTH, so a single member can drain the entire monthly TTS budget in one day. Low likelihood given the tiny trusted userbase, but it is a real money/abuse surface with no content restriction.

**Fix:** Optionally reject text whose majority is not Japanese script server-side (mirror the client's /\p{Script=Hiragana}|Katakana|Han/u check) so the endpoint only does what the feature needs, and/or lower MAX_TEXT_CHARS toward the real reply size (~120). Keep the per-day cap but consider a tighter senpaiSpeak limit.


### F37 [senpai·senpai-ai] senpaiUsage analytics docs are not deleted on account deletion and have no TTL
`functions/src/deleteAccount.ts:231` · confirmed · 

**Detail:** Both senpaiChat.ts (line ~919) and senpaiSpeak.ts (line ~170) write per-request docs to the senpaiUsage collection tagged with the user's uid. deleteAccount cascades aiRateLimits/{uid} (line 231) but does NOT touch senpaiUsage, and there's no TTL configured (no ttl in firebase.json/firestore.indexes.json, confirmed by grep). Result: after a user deletes their account (the Settings copy promises the delete 'CASCADES, they can't take it back'), their uid-tagged chat/TTS usage rows persist indefinitely. Minor privacy/data-retention gap and unbounded collection growth; plausibly intentional for billing history, but it contradicts the cascade promise.

**Fix:** Either add deleteColledctionByField(senpaiUsage, 'uid', uid) to the deleteAccount cascade, or set a Firestore TTL policy on senpaiUsage.ts so rows auto-expire (e.g. 90 days) and document that usage logs are retained for billing.


### F38 [senpai·senpai-ai] chatEnabled / setChatEnabled are dead code — chat gating moved to the mascot pill
`src/context/SenpaiContext.tsx:230` · confirmed · 

**Detail:** SenpaiContext defines a chatEnabled flag (default false, line 82), persists it under @zenki_senpai_chat_enabled, and exposes setChatEnabled (lines 230-233). Grep shows it is never READ anywhere — the only references are its own definition/default/setter in SenpaiContext.tsx. SettingsScreen.tsx (lines 866-867) explicitly says 'Chat is now always-on via hold-to-talk on the mascot herself — no toggle needed', and SenpaiMascot opens the chat modal purely off state.enabled (Senpai Mode) + the '💬 chat' pill. So the SECRET-LAB chat toggle the system prompt describes ('Senpai Chat lives behind SECRET LAB... if someone is talking to you right now, they have the toggle', prompts persona lines 124/318) no longer exists. Not a functional bug (chat works), but the state field is misleading dead code and the persona prompt now mis-describes how chat is gated.

**Fix:** Remove chatEnabled/setChatEnabled + CHAT_ENABLED_KEY from SenpaiContext (and its load/persist), and update the SYSTEM_PROMPT app-knowledge lines that reference a chat toggle to match the actual 'Senpai Mode on → tap the chibi' gating.


### F28 [workouts·workouts-gamification] All gamification progress (points, streaks, achievements, flames) is AsyncStorage-only and diverges across devices
`src/context/GamificationContext.tsx:25-27` · confirmed · 

**Detail:** APPEARS: Dojo Points, Flames, XP/level, streaks, and achievement unlocks are core member progression and a redeemable currency. ACTUALLY: GamificationState persists only to a per-user AsyncStorage key (@zenki_gamification_<uid>, GamificationContext.tsx:25-27, :248) with no Firestore sync (the file imports only AsyncStorage; useSyncedState doc at hooks/useSyncedState.ts:21-23 confirms Firestore-backed contexts use a services/<thing>Sync.ts subscribe pattern, which this context does not). WorkoutContext logs/PRs (WorkoutContext.tsx:11-12) and SpinWheel state (SpinWheelContext.tsx:7) and GPS activities are likewise local-only. Consequence: a member who reinstalls, switches phones, or uses the web build sees zero points/streak/achievements and a fresh spin wheel — and could re-earn the daily-spin jackpot and farmable PR points on each device. For a currency redeemable for real store value this is a data-integrity / abuse concern, not just cosmetic.

**Fix:** Mirror GamificationState (at least dojoPoints/flames/lifetime + achievement unlocks) and workout logs/PRs to Firestore under the user doc, reconciling on login the way the social/nutrition sync services do. If staying local-only is intended for now, gate store redemption and document the cross-device limitation.


### F29 [workouts·workouts-gamification] Home dashboard 'Workouts' stat counts only free-form logs, ignoring HR + GPS sessions
`src/screens/HomeScreen.tsx:529-531` · confirmed · 

**Detail:** APPEARS: The Home Today/Week/Month dashboard 'Workouts' tile (DashboardPager) should reflect the member's training volume. ACTUALLY: computeStats (HomeScreen.tsx:494-527) sets workouts = myLogs(user.id).filter(dateMatch).length — i.e. only WorkoutContext free-form logs. HR sessions (hrSessions) and GPS activities (memberActivities) are pulled in the same function and used for caloriesBurned/miles, but are NOT counted toward the 'Workouts' number. A user who did an HR-tracked session or a GPS run today (and saw calories/miles populate) still sees 'Workouts: 0', under-reporting their activity. The progress bar width also uses workouts*100% (line 250) so a single log fills the whole bar, which is a separate cosmetic oddity.

**Fix:** Count distinct training events: workouts = logs.length + hrInRange.length + gpsInRange.length (or a deduped union by date) so the headline tile matches the calories/miles already shown from those sources.

