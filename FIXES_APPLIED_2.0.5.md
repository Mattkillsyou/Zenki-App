# FIXES_APPLIED_2.0.5.md — audit repair run, 2026-07-10 22:00

**Branch:** `fix/audit-2.0.5-p1s` (off main @ `cef3d81`) · 3 commits · both gates clean (`tsc --noEmit` exit 0, functions build exit 0).
Source: `APP_AUDIT_2.0.5.md` §3/§4. Scope: all client P1s + the data-loss error-swallow class + the web-admin announcements P1. Every finding was re-verified present at main HEAD before fixing.

## Fixed — all 13 P1s

| Finding (report ref) | Fix | Where |
|---|---|---|
| BlocksContext cold-start auth race (block/mute filters inert all session) | New `useFirebaseUid()` hook — listeners keyed to the LIVE session, attach on restore, re-attach on account switch | `src/hooks/useFirebaseUid.ts` (new), `src/context/BlocksContext.tsx` |
| F5 — inbox wedged on "Loading…" (null-uid mount, `[]` deps) | Subscription keyed on `useFirebaseUid()` | `src/screens/MessagesListScreen.tsx` |
| First-ever DM creation impossible (missing-doc read is rule-denied) | Treat permission-denied getDoc as "doesn't exist" (safe via deterministic 2-party id) → create proceeds | `src/services/firebaseMessages.ts` |
| Booking 1-hour reminders dead (legacy `{seconds}` trigger throws) | SDK-55 typed TIME_INTERVAL trigger + failures logged | `src/context/AppointmentContext.tsx` |
| "Today's Macros" zeros every evening (UTC key vs local writes) | `todayIso()` local-day key | `src/screens/HomeScreen.tsx` |
| Senpai `log_food`/`remove_food` UTC day (evening logs land tomorrow) | local-day `todayISO` | `src/hooks/useSenpaiChat.ts` |
| Hot mic — hiding mascot leaves walkie-talkie mic + TTS live | X now stops listening + audio before hiding | `src/components/SenpaiMascot.tsx` |
| Admin "add member with password" always fails post-Auth (`/users` seed rule-denied) | Seed via the sibling session (owner rule passes) + non-fatal | `src/services/firebaseAuth.ts` |
| Remount storm — inline `withErrorBoundary` ~50 screens × every auth change | Memoized per (component, screenName) — one-place fix | `src/navigation/RootNavigator.tsx` |
| Signed waiver silently lost (undefined `phone` throw + fire-and-forget) | `stripUndefined` + durable AsyncStorage queue, uid-stamped; flushed on session (App.tsx) | `src/services/waiverSync.ts`, `src/screens/auth/OnboardingScreen.tsx`, `App.tsx` |
| Payroll clock-out push silent/permanent loss | Failure alert + `flushUnsynced` retry on launch & next clock-in | `src/context/TimeClockContext.tsx` |
| Paid order exists only on-device (fire-and-forget cloud sync) | Unsynced-order queue inside `saveOrderToFirestore` + flush on session | `src/services/orderSync.ts`, `App.tsx` |
| Web-admin announcements `Timestamp` freezes every app client | ISO-string write + app-side read coercion (legacy Timestamp docs can't throw) | `hosting/admin/app.js`, `src/services/announcementSync.ts` |
| Sound Effects toggle no-op | Wired to SoundContext's real `enabled` pref | `src/screens/SettingsScreen.tsx` |

## Fixed — scoped P2 data-loss items
- **EULA acceptance proof** (Apple 1.2): 3-attempt retry w/ token re-prime, then durable queue (`OnboardingScreen.tsx`).
- **Holiday double-pay UTC key** (money): local-day key in `TimeClockContext.clockIn`.
- **Apple Pay drink receipt honesty**: `receiptSaved` flag on `payWithApplePay` + honest "keep this payment ref" alert in `DrinkScreen` when the captured charge's receipt couldn't persist.

## Remains open (deliberately untouched this run)
- The P2 tail from §3 (booking UX, guest-mode listeners, timers/keep-awake, nutrition sync divergence, hydrate-wipe class, Settings placeholders, `supportMessages` black hole, GDPR export, etc.) and all P3 polish.
- Carried-forward social P2s: F1 (hasRequestedFollow), F2 (removeAndBlock, app-side), F3 (Comments displayName crash), F4 residual (errors still render as `[]`), F7 (report rate limit — server-side), F8–F12.
- Deploy-side items from §4(b) (nothing deployed this run, per instructions).

## Needs on-device / live verification
- Auth-race fixes: cold-launch with blocks + DM inbox on real hardware (timing-dependent).
- Booking reminder actually fires on a physical device (expo-notifications).
- Waiver/order/payroll queues: airplane-mode signup → relaunch → confirm flush lands in Firestore/Sheets.
- Senpai mic: hide-while-armed no longer transcribes; voice fix behaviors unchanged.
- Web admin: create an announcement after deploying hosting; confirm app clients render it (and legacy Timestamp docs) without freezing.

---

## Residuals pass — branch `fix/audit-2.0.5-residuals` (2026-07-10, after merge + hosting deploy)

**Carried-forward social register:** F1 fixed (requester read in repo rules — rides the pending deploy — + uid-scoped local marker for the live ruleset); F2 fixed (report stays open when the content delete fails; app now matches the web admin); F3+F9 fixed (listComments coerces displayName/createdAt at the source); F4 residual fixed (listOpenReports + listAllPostsForAdmin return null on failure; Reports + AdminPosts screens show real error states — permError branch is live); F7 partially fixed (30s client cooldown on submitReport; server-side limiting deferred); F8 fixed (composer gates on blockedByIds); F11 fixed (Report only offered once the conversation exists). F10 still needs the live backfill check; F12 remains a documented read-cost tradeoff.

**Also fixed:** guest/sign-in dead-listener class (Announcement/Schedule/Product/SchedulingConfig keyed on live uid); Onboarding + Store checkout + Drink Settle double-tap guards (dup accounts / double charges); NutritionContext hydrate-wipe protection (DEXA/bloodwork can't be clobbered by one bad read).

**Still open after this pass:** booking UX cluster (slot conflicts, evening dead-end, calendar quick-add date, device-TZ labels), timers (keep-awake, background time, meditation tone), nutrition sync divergence + migration poisoning, Settings placeholders (Export Data, Clear History, Units), supportMessages black hole, GPS start/End race, gamification pre-hydrate loss, EmployeeTasks assign picker, deleteAccount likes/senpaiUsage gaps + banUser CG index (functions deploys), guest /schedule rule (pending rules deploy), and the P3 tail.

---

## UX pass — branch `fix/2.0.5-ux-pass`, merged to main `4e1fb77` (2026-07-10 evening)

**Quick items:** calendar quick-add now writes the SELECTED day (+ real startsAt for private sessions); Contact IT black hole closed (new admin-gated `listSupportMessages` CF + web-admin Support tab with mark-handled — both DEPLOYED and verified: unauth 401, tab live); Settings honesty (dead Units toggle and placebo DATA section removed).

**Booking cluster:** own pending/confirmed sessions block overlapping slots ("YOUR SESSION"); selection clears on submit (no double-submit); past slots read "PASSED" and an explicit "no more bookable times today" banner replaces the evening wall of UNAVAILABLE; AdminSchedule spots=0 honored; Mark Complete confirms. Cross-member conflicts remain admin-side (rules scope appointments to owners).

**Timers:** `useKeepAwake()` on the Timer screen (auto-lock no longer freezes rounds/meditation); stopwatch + countdown compute from wall-clock anchors (locked time counts); meditation plays real generated singing-bowl WAVs via expo-audio on native (assets bundled; expo-keep-awake pinned as direct dep).

**Nutrition sync:** rule-bound clamps at the write boundary AND the addMacroEntry mutator (local + cloud agree; no more silent divergence); migration de-poisoned (per-doc fallback, skip-and-log); MacroSetup/Onboarding weigh-ins stamp LOCAL day; DEXA review fields keep raw text (decimals typeable).

**Note:** the merge to main also carried the parallel Senpai enhancement work (Phase A animations + dialogue/bond) committed to the same branch; both gates ran clean over the combined tree.
