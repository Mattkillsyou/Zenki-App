# APP_AUDIT_2.0.5.md — Zenki Dojo pre-2.0.5 Full-App Audit

**Audit date:** 2026-07-10 · **Intended baseline:** `fix/senpai-voice` (main `f8a0375` + `0f00ad3`) · **Actual tree audited:** `feature/web-admin-hardening` @ `d7e2489` (see P0-1) · **Prior registers:** APP_AUDIT.md (2026-06-02, stale), SOCIAL_AUDIT_2026-07-07.md (F1–F12 + P3 cluster)

---

## 1. EXECUTIVE SUMMARY

**Regression-safety verdict for 2.0.5: NOT SHIP-READY from this tree.** Two P0s, one of which is live in production today.

1. **Wrong tree (P0, process).** The working tree is `feature/web-admin-hardening` (`d7e2489`), not `fix/senpai-voice`. Commit `0f00ad3` — the *entire* 2.0.5 Senpai voice fix — is absent from HEAD (`git branch --contains 0f00ad3` lists only `fix/senpai-voice`). Both silent-mute paths the release exists to close are still present in this tree (`src/hooks/useSenpaiChat.ts:617` persists `voiceEnabled='false'` on two strikes; `:649` still drops unsigned replies before TTS). A 2.0.5 build cut from HEAD ships the voice bug unfixed. All findings below hold on both branches (`d7e2489` touches only `hosting/admin/*` + `firebase.json`), except the web-admin slice which is against v3 code that is **not yet deployed** (live hosting serves v2).
2. **Account deletion is broken in production (P0, live).** `deleteAccount` always 500s because prod lacks COLLECTION_GROUP indexes on `comments.userId`/`likes.uid` (verified live via `firebase firestore:indexes`), and it fails *after* irreversibly destroying posts, the follow graph, follow requests, mutes and blocks. Apple 5.1.1(v)/GDPR surface, broken for every user, with partial data loss per attempt. **Server-side fixable today without a client build.**

**Dominant themes:**

- **Error-swallowing class (largest, systemic).** Fire-and-forget writes with no retry silently lose legal/financial records: signed waivers (`OnboardingScreen.tsx:340` + `waiverSync.ts:54`), EULA acceptance proof (`:325`), payroll shifts (`TimeClockContext.tsx:244`), Apple-Pay-paid orders (`StoreScreen.tsx:499`, `payments.ts:127`), attendance check-ins, all nutrition writes. Read-side, every sync-service `onSnapshot` error is `console.warn`-only (no error state, no resubscribe), and a dozen fetchers catch to `[]`/`0`, rendering false "empty/all-clear" states on moderation and admin surfaces.
- **Cold-start auth race (new P1 class).** AuthContext restores the local user before firebase v12's async session restore; effects that sample `getCurrentUid()` once then never resubscribe fail open for the whole session. Worst case: **BlocksContext** — block/mute/blockedBy filters silently empty all session (Apple 1.2 safety regression). Same race: inbox F5, UserSearch, profile Follow/Message gates, dead guest-attached listeners (announcements/schedule/customProducts).
- **UTC-vs-local day-key split.** The 2.0.3 local-day fix left readers/writers inconsistent: Home "Today's Macros" reads UTC while loggers write local (zeros every evening PT); Senpai `log_food`/`remove_food`, MacroSetup/Onboarding weigh-ins, cycle end-date, employee checklist reset, attendance "This Week", and **holiday double-pay** (money) all key UTC.
- **Carried-forward social register mostly still open.** F1–F5, F7–F11 present at HEAD (F4 partially fixed, F2 softened); F6 resolved by deploy state; F12 now documented in-code as an accepted tradeoff. See §2.
- **Web-admin v3 deploy blocker.** The branch's own new code writes announcement `createdAt` as a Firestore `Timestamp`, which throws inside every app client's announcements `onSnapshot` and freezes the pipeline (P1). Its stated CSP hardening is also unimplemented.

**What came back clean (explicitly not broken):**

- **Server price integrity:** all 9 `PRODUCT_PRICES` and 9 `DRINK_PRICES` mirrors match client catalogs exactly; custom products are server-priced from live `/customProducts`; `createPaymentIntent` is rate-limited (verification note, `functions/src/createPaymentIntent.ts:41`).
- **ff9c3d8 write-compatibility:** nothing in this tree writes a `member:` blob to `/users` (all writes projection-only: `firebaseAuth.ts:72/136/237/391`, `OnboardingScreen.tsx:317`, `firebaseFollow.ts:46`), and `employeeTaskSync` queries already satisfy the pending source-split rules — the pending rules deploy breaks nothing in this tree (see §4b for the full calculus).
- **Social Wave-1 deploy state:** rules + both composite indexes live since 2026-06-08; backfillPostPrivacy 19/19; no deploy-skew re-raise.
- **2.0.4 banner removal:** clean except one orphaned `setSenpaiEnabled` destructure (`HomeScreen.tsx:332`, P3).
- **No new blockers found in:** Senpai server prompt/tool pipeline beyond the voice items, Stripe amount validation, the 0f00ad3 delta itself (its two behavior changes are correct as designed — the problem is it isn't in the tree).

---

## 2. CARRIED-FORWARD STATUS TABLE (SOCIAL_AUDIT_2026-07-07)

| ID | Item | Status at HEAD | Evidence |
|---|---|---|---|
| F1 | `hasRequestedFollow` rule-denied for requester → "Requested" never persists | **STILL PRESENT** (both rulesets), CONFIRMED. New compound detail: re-tapping Follow `setDoc`s onto the existing request doc = rules UPDATE, denied (`firestore.rules:364-366`) → permanent silent no-op on private accounts with a pending request | `src/services/firebaseFollow.ts:147`, `firestore.rules:361`, `UserProfileScreen.tsx:119` |
| F2 | `removeAndBlock` writes `status:'actioned'` even when cascade delete failed | **STILL PRESENT, softened**, CONFIRMED — failure now surfaced once via "Action complete with warning" alert (`AdminReportsScreen.tsx:143-147`); content stays live, report never resurfaces, no retry/reopen path | `src/services/firebaseModeration.ts:409` |
| F3 | `item.displayName.charAt` unguarded crashes Comments list | **STILL PRESENT**, CONFIRMED (contained by `withErrorBoundary`, whole list dead) | `src/screens/CommentsScreen.tsx:140`, `firebasePosts.ts:542` |
| F4 | Listener/query errors swallowed to empty states; `permError` dead code | **PARTIALLY FIXED**, CONFIRMED — error callbacks added to inbox/thread subscriptions (spinners now clear) but errors still emit `onUpdate([])`; `listOpenReports` still catches to `[]` so `AdminReportsScreen.tsx:221` permError branch remains dead | `src/services/firebaseMessages.ts:205-242`, `firebaseModeration.ts:313-316` |
| F5 | Null-uid inbox mount → no-op subscribe, `[]` deps → permanent "Loading…" | **STILL PRESENT verbatim**, CONFIRMED | `src/screens/MessagesListScreen.tsx:30`, `firebaseMessages.ts:171-173` |
| F6 | Admin report actions contingent on CF deployment | **RESOLVED BY DEPLOY STATE** — banUser/deletePostCascade/redactDmMessages/notifyOnReport all live; residual client behavior audited as new findings (§3: banUser leaves report open; banUser comment-purge index gap) | — |
| F7 | No rate limit on report submission → report/push bomb | **STILL PRESENT**, CONFIRMED. Server-side fixable without client build | `functions/src/rateLimit.ts:14-17`, `firebaseModeration.ts:265` |
| F8 | Composer gates on `isBlocked` only, not `blockedByIds` | **STILL PRESENT** (UNVERIFIED-MINOR) — thread also renders false-empty "Say hi" via D3 read denial | `src/screens/MessagesChatScreen.tsx:44` |
| F9 | `listComments` lacks `coerceCreatedAt` → "Invalid Date" | **STILL PRESENT** (UNVERIFIED-MINOR) | `src/services/firebasePosts.ts:542`, `CommentsScreen.tsx:149` |
| F10 | Follower counts stick if `backfillFollowCounts` never ran | **STILL OPEN-CONTINGENT** — run status remains ❓ unverified; code still trusts any finite denormalized count | `src/services/firebaseFollow.ts:180` |
| F11 | ReportModal `targetId={conversationId \|\| 'unknown'}` → unactionable report | **STILL PRESENT** (UNVERIFIED-MINOR) | `src/screens/MessagesChatScreen.tsx:199` |
| F12 | Feed loads on mount only; new post invisible until pull-to-refresh | **STILL PRESENT — now documented in-code as deliberate read-cost tradeoff (P0-8)**. Recommend closing as accepted-with-rationale | `src/screens/CommunityScreen.tsx:120` |
| P3-a | `handleFollow` no try/catch | STILL PRESENT — now guaranteed-hit via F1 re-request denial | `UserProfileScreen.tsx:153` |
| P3-b | `route.params` unguarded | STILL PRESENT (latent; all 5 callers pass params; contained by boundary) | `UserProfileScreen.tsx:23` |
| P3-c | No cancelled-guard in `loadProfile` | STILL PRESENT (stale-response clobber on stacked profiles) | `UserProfileScreen.tsx:91` |
| P3-d | Posts stat/grid capped at `getUserPosts(max=30)` | STILL PRESENT (accepted-known per handoff §7 class) | `UserProfileScreen.tsx:239`, `firebasePosts.ts:357` |
| P3-e | NotificationsScreen dead unregistered screen | STILL PRESENT — only the `useHasUnreadNotifications` hook is live (`HomeScreen.tsx:57`); screen shadowed by NotificationsModal | `src/screens/NotificationsScreen.tsx:26` |
| P3-f | No typed ParamList; screens are `any` | STILL PRESENT — root cause behind the unguarded-params class (P3-b, ProductDetail) | `src/navigation/RootNavigator.tsx:85` |
| P3-g | Like-state N+1 getDocs vs SOCIAL_CONTRACT §5 B1 batched read | STILL PRESENT — **ACCEPTED, do not action** (correctness OK, read-cost only) | `src/services/firebasePosts.ts:221` |

§3 was-P0/P1 deploy-skew items remain **non-issues** (rules/indexes live since 2026-06-08); not re-raised.

---

## 3. FINDINGS TABLE

New/verified findings, P0→P3, grouped by subsystem within severity. Carried-forward items above are referenced, not repeated. Duplicated cross-slice reports are merged into single rows.

### P0

| Sev | Location | Finding | Repro | Verdict |
|---|---|---|---|---|
| P0 | `src/hooks/useSenpaiChat.ts:617` | **Wrong tree:** HEAD is `feature/web-admin-hardening` @ `d7e2489`, not `fix/senpai-voice`; `0f00ad3` absent — both silent-mute paths still present (`:617` persists auto-disable; `:649` skips unsigned TTS). Web-admin slice findings are against v3 (`d7e2489`); live hosting still serves v2 | `git branch --show-current` → `feature/web-admin-hardening`; building 2.0.5 from HEAD ships the voice bug | CONFIRMED |
| P0 | `functions/src/deleteAccount.ts:202` | deleteAccount always 500s in prod: comments collection-group query needs a COLLECTION_GROUP index on `comments.userId` that prod lacks (verified live: `fieldOverrides: []`); cascade aborts AFTER posts/follow graph/followRequests/mutes/blocks are destroyed — Auth account, users/members/nutrition/conversations/waivers all survive | Settings → Delete Account → CF throws FAILED_PRECONDITION at step 6 → 500 → "server could not complete the deletion"; account loginable with half its social data gone; every retry identical | CONFIRMED |

### P1

| Sev | Location | Finding | Repro | Verdict |
|---|---|---|---|---|
| P1 | `src/context/BlocksContext.tsx:94-97` | Cold-start auth race: effect samples `getCurrentUid()` while null (AuthContext restores local user before firebase v12's async session restore, `AuthContext.tsx:87-90`), falls to one-shot `refresh()` (guaranteed-empty sets on null uid), never attaches the three `onSnapshot` listeners, deps never change → **blockedIds/mutedIds/blockedByIds empty for the entire session**; every client block/mute filter inert (posts/comments have NO server-side block gate). Apple 1.2 safety regression, cold-start only | User with blocks force-quits, relaunches → blocked user's posts/comments/DM/search presence all reappear for the whole session | CONFIRMED |
| P1 | `src/services/firebaseMessages.ts:65` | First-ever DM creation impossible under BOTH rulesets: `getOrCreateConversation` `getDoc`s the missing doc, but the read rule (`firestore.rules:236-237`) dereferences `resource.data.participants` → permission-denied on missing docs (behavior the codebase itself documents in `memberSync.ts`); the create branch is unreachable. Existing threads mask it | Tap Message on any member with no prior thread → perpetual "Retry" banner (`MessagesChatScreen.tsx:88-101`) / "Couldn't start conversation" | CONFIRMED |
| P1 | `src/context/AppointmentContext.tsx:106` | Booking 1-hour reminders dead on native: legacy `{ seconds }` trigger throws TypeError in expo-notifications 55 (needs `type`/`channelId` — `medicationNotifications.ts:97-100` was migrated, this call site missed); bare catch at `:109` swallows it | Admin confirms booking → `scheduleNotificationAsync` throws → caught → no reminder ever, nothing logged | CONFIRMED |
| P1 | `src/screens/HomeScreen.tsx:505` | "Today's Macros" card + dashboard macrosPct query with UTC day key while all loggers stamp LOCAL day (BarcodeScanner/PhotoFood/MacroTracker) — zeros every evening from local 5pm PT | Log meals all day, open Home 5:01pm PDT → all four bars 0/goal | CONFIRMED |
| P1 | `src/hooks/useSenpaiChat.ts:731` | Senpai `log_food` stamps UTC day (`todayISO` at `:180`) violating the local-day meal convention (`utils/dates.ts:54-58`); evening logs land on tomorrow; `remove_food` (`:383`) searches UTC day so it can't find tracker-logged meals | 7pm PT "log a chicken bowl" → confirmed but absent from Today; "remove the bowl from lunch" → `not_found` | CONFIRMED |
| P1 | `src/components/SenpaiMascot.tsx:1683` | Long-press → X hides the mascot with the walkie-talkie mic armed: `setHidden(true)` never calls `stopListening()`/`stopSenpaiAudio()` — invisible open microphone keeps transcribing and auto-sending to the AI, TTS keeps playing, zero indicator; only escape is Settings → Senpai Mode off | Talk mode → arm mic → long-press → X → speech in the room silently transcribed/sent | CONFIRMED |
| P1 | `src/services/firebaseAuth.ts:237` | Admin "add member with initial password" always fails post-Auth-creation: `/users/{newUid}` seed write denied (create rule is `isOwner(uid)` only, both rulesets) → throw aborts before `firebaseUid` stamp; retry hits `email-already-in-use`; credentials alert never shows | Members → Add Member with password → "Auth account not created", member doc saved without firebaseUid | CONFIRMED |
| P1 | `src/navigation/RootNavigator.tsx:237` | `withErrorBoundary()` called inline in JSX for ~50 stack screens while RootNavigator subscribes to `useAuth()` — every auth value change (incl. every `/members` onSnapshot delivery) mints new component identities → React unmounts/remounts every mounted wrapped screen: drafts wiped, lists reset, listeners resubscribe | Type a DM draft; any write lands on your /members doc → whole stack remounts, draft gone | CONFIRMED |
| P1 | `src/screens/auth/OnboardingScreen.tsx:340` + `src/services/waiverSync.ts:54` | Signed liability waiver silently lost, two mechanisms: (a) push is fire-and-forget with no local copy/retry (fails in the documented fresh-signup token race or offline); (b) blank phone → `phone: undefined` spread into `addDoc` (no `stripUndefined`, no `ignoreUndefinedProperties`) → guaranteed local throw → **permanent loss of the legal record** | Sign up without a phone number → waiver never reaches `/waivers`, console.warn only, nothing retries | CONFIRMED |
| P1 | `src/context/TimeClockContext.tsx:244` | Employee clock-out payroll push failure is silent and permanent: `pushTimeEntry` false → entry stays `synced:false` (grep: nothing reads the flag, no flush loop), no user feedback; SHEETS_PROXY_URL is configured so this is live | Clock out on dead Wi-Fi → shift never reaches the payroll sheet; employee and admin see nothing wrong | CONFIRMED |
| P1 | `src/screens/StoreScreen.tsx:499` | Checkout (incl. Apple-Pay-**paid** orders) promises "We'll set your items aside" while the Firestore order write is fire-and-forget (console.warn, no retry queue; same at `ProductDetailScreen.tsx:132`, `orderSync.ts:112`) — money captured, order exists only on-device | Pay with Apple Pay while the write is rejected/offline → dojo never sees the paid order | CONFIRMED |
| P1 | `hosting/admin/app.js:589` | **Web-admin v3 deploy blocker:** new announcements written with `createdAt: Timestamp.now()` but the app contract is ISO string — `announcementSync.ts:37`'s `localeCompare` sort throws inside every client's onSnapshot → `cb(items)` never runs, announcements pipeline freezes app-wide (v2, currently deployed, wrote ISO) | Deploy v3 + create one announcement → every member's announcements freeze; possible fatal unhandled exception in RN release | CONFIRMED |
| P1 | `src/screens/SettingsScreen.tsx:253` | "Sound Effects" toggle is a complete no-op: writes `@zenki_sound_enabled` but SoundContext hydrates `prefs.enabled` from `@zenki_sound_prefs`; no UI calls `useSound().setEnabled` — no working way to mute app sounds | Toggle OFF → all sounds still play; after restart the switch renders OFF while sounds continue | CONFIRMED |

### P2

| Sev | Location | Finding | Repro | Verdict |
|---|---|---|---|---|
| **Auth / onboarding** | | | | |
| P2 | `src/context/AuthContext.tsx:214` | First-time OAuth users who force-quit mid-onboarding land in Main forever with EULA, waiver, and permissions bypassed — `auth.signIn` persists before Onboarding starts (`SignInScreen.tsx:128-136`), `initialRouteName={user ? 'Main' : 'SignIn'}`, and `acceptedTermsAt` has no reader anywhere | OAuth sign-up → force-quit on any onboarding step → relaunch → Main; can post UGC with no guidelines acceptance on file | CONFIRMED |
| P2 | `src/screens/auth/OnboardingScreen.tsx:991` | "Enter the Dojo" has no disabled/loading state and `handleFinish` no re-entrancy guard; double-tap mints two member ids (`id = 'user_'+Date.now()` at `:262`) → duplicate `/members` docs, duplicate waivers, `setUser` twice | Double-tap on slow connection; 2nd call's `email-already-in-use` fallback signs in and continues | CONFIRMED |
| P2 | `src/screens/auth/OnboardingScreen.tsx:325` | EULA/guidelines acceptance write (`acceptedTermsAt` — Apple 1.2 durable proof) swallowed into console.warn in the fresh-signup token-race window; no retry ever | Accept EULA while token unattached → proof-of-acceptance never exists for the account | CONFIRMED |
| P2 | `src/services/memberSync.ts:84` | Signup `/members` push throws client-side whenever any optional field is blank (explicit-`undefined` keys, no `stripUndefined`, no `ignoreUndefinedProperties`) → spurious "Profile sync not synced" alert to brand-new users; member missing from admin list until next launch | Sign up leaving fun-fact/photo/phone blank → both signup-time /members writes fail | CONFIRMED |
| **Social feed** | | | | |
| P2 | `src/components/PostCard.tsx:42` | No way to delete/edit your OWN post (or comment) anywhere: three-dot menu skipped on own posts, `CommentsScreen.tsx:106` early-returns for own comments — backend fully supports owner delete (`firebaseModeration.ts:48`, `firestore.rules:207-208`); UI never wired | Member regrets a post → only recourse is asking an admin or deleting the account | CONFIRMED |
| P2 | `src/screens/AdminPostsScreen.tsx:167` | Moderation browse swallows load errors into false "No posts" empty state (`listAllPostsForAdmin` catch → `[]`, `firebasePosts.ts:498-501`; `countAllPosts` catch → 0); no error/retry state | Admin offline or missing `/admins` doc → "The community feed is empty" while posts exist | CONFIRMED |
| **Booking / schedule** | | | | |
| P2 | `firestore.rules:511` | Guests silently see the stale hardcoded seed schedule (a must-work 5.1.1(v) surface): `/schedule` read requires sign-in, guest listener permission-denied swallowed (`scheduleSync.ts:58`); applies to BOTH rulesets. `/config/scheduling` was made public for guests; `/schedule` was not | Admin moves a class → guest's Schedule tab shows the seed time; guest shows up wrong | CONFIRMED |
| P2 | `src/components/ClassCard.tsx:70` | Calendar quick-add always creates the event for TODAY: `toTodayAt()` ignores the selected weekday/week (ScheduleScreen never passes a date); also discards private sessions' real `startsAt` | Select Thursday, tap calendar on a class → Monday event written, "Added to calendar" success | CONFIRMED |
| P2 | `src/services/calendarAvailability.ts:12` | No slot-conflict detection anywhere: busy-interval guard hard-disabled (empty URL), appointments never consulted, and after a request the slot stays selected/enabled (goBack no-ops on the tab) → same-member double-submit in two taps and cross-member double-booking | Two members (or one member twice) book the same 2:00 PM → both pending, no conflict warning | CONFIRMED |
| P2 | `src/screens/BookScreen.tsx:322` | Book Private is a dead end every evening: today-only booking, last slot 6:00 PM → after 6pm all slots "UNAVAILABLE" (indistinguishable from fully-booked), CTA locked, no explanation | Open Book Private at 6:01 PM → nothing bookable, no "come back tomorrow" | CONFIRMED |
| **Store / payments** | | | | |
| P2 | `src/context/ProductContext.tsx:111` | customProducts onSnapshot subscribes once keyed on a constant; rules require sign-in → any listen while signed out permission-denies, listener terminates permanently, never resubscribes on sign-in (also dies on mid-session sign-out) → admin products missing until app restart; compounding admin duplicate re-adds | Guest boot → sign in → Store shows only 9 built-ins until force-quit | CONFIRMED |
| P2 | `src/screens/StoreScreen.tsx:373` | Checkout TouchableOpacity: async onPress, no disabled/in-flight guard → double-tap runs full checkout twice (duplicate orders, double points redemption, two PaymentIntents — no idempotency key per code's own comment). Same on `DrinkScreen.tsx:248` Settle Tab | Double-tap "RESERVE - PAY $X" → two orders, points redeemed twice, two receipts | CONFIRMED |
| P2 | `src/services/orderSync.ts:35` | Nothing in the repo reads `/orders` (grep: `orderSync.ts:36` is the only reference across src/functions/web-admin) yet checkout promises pickup — reserve orders leave no trail anyone monitors (Apple-Pay orders at least appear in Stripe dashboard) | Reserve a gi → member arrives, nothing set aside, staff have no in-product view | CONFIRMED |
| **Training / fitness** | | | | |
| P2 | `src/context/GpsActivityContext.tsx:305` | `startTracking` has no cancellation guard after awaits: End during first-fix acquisition lets the in-flight start switch on OS background location + timers for a dead session — background GPS records indefinitely (`metaRef=null`, `stopTracking` never re-runs) | Start → End while fix resolving → blue indicator stays on, bg task runs until next session/process death | CONFIRMED |
| P2 | `src/context/GamificationContext.tsx:253` | Pre-hydrate updates discarded by the hydrate's wholesale setState: `recordAppOpen()` (HomeScreen:334, fires once per mount) always loses the streak tick on cold launch → login/quote-streak achievements unearnable for signed-in users | Cold launch daily → loginStreak never advances | CONFIRMED |
| P2 | `src/screens/TimerScreen.tsx:284` | Round/HIIT timers can't run hands-free: no keep-awake anywhere in the app; iOS auto-lock backgrounds → AppState guard silently pauses mid-round | Start 5-Round Fight, set phone down → frozen at 0:47 behind the lock screen, no round-end beep | CONFIRMED |
| P2 | `src/screens/TimerScreen.tsx:612` | Stopwatch/Countdown increment state per interval tick with no timestamp math or AppState handling → time in background/locked silently lost (meditation timer in the same file does it correctly) | Lock phone 2 min mid-stopwatch → only foreground seconds counted | CONFIRMED |
| P2 | `src/screens/TimerScreen.tsx:772` | Meditation copy promises a bowl tone/bell; on native `playSingingBowl` only vibrates (Web Audio is web-only), and locked-screen JS suspension delays even that past session end | 21-min preset, eyes closed → no tone ever; completion fires only on unlock | CONFIRMED |
| **Nutrition** | | | | |
| P2 | `src/screens/MacroSetupScreen.tsx:138` | Setup weigh-in stamped with UTC `todayDateString()` instead of local `todayIso()` (convention explicitly assigned in `dates.ts:54-58`); duplicates same-day weigh-ins, future-dated rows; identical bug `OnboardingScreen.tsx:372-380` | Weigh in 6pm PT then finish Macro Setup 7pm → second weigh-in dated tomorrow | CONFIRMED |
| P2 | `src/screens/MacroTrackerScreen.tsx:269` | Client accepts macro/goal values live `/nutrition` rules reject (cal ≥20000 etc.) — no upper clamp on manual entry/servings/goals; denied write swallowed (`NutritionContext.tsx:431/517` ignore returns) → entry exists locally, silently never syncs; second device/Senpai never see it | Fat-finger CAL 25000 → local only, permanent silent divergence | CONFIRMED |
| P2 | `src/services/nutritionSync.ts:197` | One rule-violating legacy row poisons an entire 450-write migration batch atomically → returns false, migrated flag never set → migration re-runs and re-fails every launch forever; everything in/after the poisoned chunk never syncs (memberSync's backfill has a per-doc fallback; this has none) | Legacy 25000-cal typo entry → whole history never reaches Firestore, warn every launch | CONFIRMED |
| P2 | `src/screens/DexaUploadScreen.tsx:245` | `setField` round-trips every keystroke through `parseFloat` — typed decimal point eaten in all 8 numeric review fields, which are the documented AI-misread correction path | Try to type "2.5" body fat → get "25"; fractional values untypeable | CONFIRMED |
| **Senpai** | | | | |
| P2 | `src/components/SenpaiMascot.tsx:232` | After any failed talk-mode send, mic never re-arms but `listening` stays true — pulsing glow + "● listening — tap to stop" while STT is dead; only re-arm trigger is a settled assistant message an errored turn never produces | Speak offline / rate-limited → error bubble 8s → glow keeps claiming she hears you; must toggle her off/on | CONFIRMED |
| P2 | `src/components/SenpaiMascot.tsx:992` | `activateListening`/`handleTap` have no `ttsPlaying` guard and don't stop the clip → arming the mic mid-TTS transcribes her own voice and auto-sends it as a user turn (the exact loop the after-reply re-arm defers to avoid) — burns a rate-limited turn | Arm mic while she's mid-sentence → her speech fills the transcript and auto-sends | CONFIRMED |
| P2 | `src/components/SenpaiMascot.tsx:1176` | Guests can enable Senpai and chat, but every send 401s (`senpaiChat.ts:454` requires Bearer token) with misleading recovery copy "sign in expired senpai — open the app fresh 💕" — permanent dead end, never suggests signing in; both mic and text paths | Guest → Settings → Senpai on → "hi" → 401 forever; reopening never helps | CONFIRMED |
| **Admin (in-app)** | | | | |
| P2 | `src/screens/AdminEmployeeTasksScreen.tsx:40` | "Assign to" picker filters the STATIC seed MEMBERS array for `isEmployee` (none set) → only "All employees" chip ever renders; Firestore-marked employees never appear; legacy assigned tasks render "Unknown" (`:264`) | Mark member Employee → open Employee Tasks → can't assign to them | CONFIRMED |
| **Web admin (v3, undeployed)** | | | | |
| P2 | `hosting/admin/app.js:598` | "Pin to top of Home" checkbox (and v3 comment `:518` claiming app parity) promises behavior the app lacks: no app code orders by `pinned`; Home renders newest-3 only → pinned notice older than 3 newer ones vanishes from every Home | Pin a notice, post 3 newer → pinned notice invisible app-wide | CONFIRMED |
| **Cloud Functions** | | | | |
| P2 | `functions/src/deleteAccount.ts:180` | Likes cleanup `.catch(() => null)` + same missing CG index → deleted user's like docs survive and every liked post's `likes` counter stays inflated, reported as success, zero log; step-4 outgoing-followRequests loop (`:161`) swallows identically | Delete account (post-P0-fix) → likes CG query fails → `deleted.likes: 0` "success" | CONFIRMED |
| P2 | `functions/src/banUser.ts:96` | Comment purge uses `collectionGroup('comments')` → FAILED_PRECONDITION in prod (no CG index; verified live), warn-swallowed → banned offender's comments on others' posts stay publicly visible while response reports `ok:true, purged.comments:0`; code comment `:81-82` claiming auto-maintained CG indexes is factually wrong | Ban an offender who commented on others' posts → abusive comments remain live | CONFIRMED |
| P2 | `functions/src/deleteAccount.ts:261` | `/senpaiUsage` never purged: senpaiChat + senpaiSpeak write uid-keyed per-turn docs (ts, model, mood, toolCalled, characters) that survive erasure indefinitely — GDPR coverage gap | Delete account → query senpaiUsage by uid → full interaction trail persists | CONFIRMED |
| **Rules vs traffic / deploy state** | | | | |
| P2 | `firestore.rules:426` | **ff9c3d8 pending delta is larger than briefed:** also includes (a) `/config/scheduling` public-read and (b) `/followRequests` blockedBetween guard. Consequence of (a): **in prod today the guest Book-Private pricing fix (1-P2.4) is NOT live** — signed-out `SchedulingConfigContext` listener is denied, guests stuck on hardcoded DEFAULT_CONFIG, and the dead listener never re-attaches after sign-in. The pending deploy carries a live guest-facing FIX, not just hardening | Guest opens Book Private in prod → default session types/prices, stale even after sign-in until restart | CONFIRMED |
| P2 | `src/context/AnnouncementContext.tsx:51` | Announcements + Schedule listeners attach once at provider mount (`[]` deps) with no auth dependency; both collections require `isSignedIn` → guest-boot or sign-out kills the listener permanently, no resubscribe on sign-in (identical pattern `ScheduleContext.tsx:85-92`) → frozen at cache/seed until restart | Browse as Guest → sign in → Home schedule = seed, announcements never appear, until force-quit | CONFIRMED |
| **Navigation** | | | | |
| P2 | `src/navigation/TabNavigator.tsx:85` | None of the 9 tab screens nor the 5 auth screens are wrapped in `withErrorBoundary` → any render crash escalates to the App Root boundary, replacing the ENTIRE app (nav state lost) instead of one screen | F3-class legacy-doc crash in a tab → full-screen "SOMETHING WENT WRONG / APP ROOT" | CONFIRMED |
| **Error-swallowing (systemic)** | | | | |
| P2 | `src/services/employeeTaskSync.ts:76` | Systemic: every sync-service `onSnapshot` error callback only console.warns — no consumer callback, no error state, no resubscribe → dead listener freezes the screen on cached/stale data for the session (`employeeTaskSync.ts:76/88/98/167`, `memberSync.ts:266/291`, `scheduleSync.ts:58`, `announcementSync.ts:40`, `appointmentSync.ts:69`, `nutritionSync.ts:242-271`, `attendanceSync.ts:150/176`, `SchedulingConfigContext.tsx:106`). Deploy-calculus note: post-ff9c3d8, any employeeTasks query/rule mismatch lands exactly here — silently | Admin with missing `/admins` doc → "No pending appointments", empty Who's Here, seed member list — all rendered as truth | CONFIRMED |
| P2 | `src/context/NutritionContext.tsx:231` | Hydrate-catch-then-persist wipe: batched getItem throws → empty catch → `loaded=true` → persist effects write `[]` over stored data — **permanently destroys local-only DEXA/bloodwork**; same pattern `GamificationContext.tsx:254`, `MedicationTrackerContext.tsx:174`, `CycleTrackerContext.tsx:76`, `WorkoutContext.tsx:76` | One transient storage read failure at mount → DEXA/bloodwork history gone | CONFIRMED |
| P2 | `src/context/AttendanceContext.tsx:186` | Member check-in push fire-and-forget and `alreadyVisited` (local) blocks any same-day retry → failed push means admin's live roster silently never shows the member | Flaky connectivity at the door → visit device-only for the rest of the day | CONFIRMED |
| P2 | `src/services/nutritionSync.ts:76` | All nutrition Firestore writes return false on failure (warn-only) and every NutritionContext call site ignores the result — no alert (contrast `syncOrAlert`), no retry post-migration → cloud copy (other devices + server-side Senpai) permanently missing entries, never heals | Log a weigh-in offline → local OK, cloud missing forever, no signal | CONFIRMED |
| P2 | `src/services/payments.ts:127` | Apple Pay drink charge that fails receipt persistence returns `ok:true` (`appendLocalOrder` throws before cloud sync ever runs, `orderSync.ts:110`) → money captured with NO record anywhere, tab cleared as paid | Storage write throws during settle → Stripe has the money, no receipt exists | CONFIRMED |
| **Home / settings / time clock** | | | | |
| P2 | `src/context/TimeClockContext.tsx:179` | Holiday double-pay keyed to the entry's UTC date (dojo is LA): shifts starting ≥5pm PDT on a holiday lose 2×; ≥5pm the day before wrongly earn 2×; the UI banner uses local date so it contradicts the pay math | Clock in July 4, 6pm PDT → `date='2026-07-05'` → paid 1.0× under a "Double pay (2×)" banner | CONFIRMED |
| P2 | `src/screens/ContactSupportScreen.tsx:142` | "Contact IT" is a write-only black hole: promises "instant alert" + 24h response, but `supportMessages` is `allow read: if false`, no CF trigger fires on create, and no admin surface (app or web) queries it — visible only in the Firebase console | Submit "Urgent" → nobody is notified, nothing lists it | CONFIRMED |
| P2 | `src/screens/SettingsScreen.tsx:665` | "Export All Data" is a shipped placeholder: alert literally says "In production, this would download as a JSON file" — no file, no share sheet (GDPR/data-portability optics) | Settings → Export All Data → nothing produced | CONFIRMED |
| P2 | `src/screens/SettingsScreen.tsx:676` | "Clear Workout History"/"Clear Nutrition Data" don't clear: raw `removeItem` while contexts keep arrays in state and re-persist the FULL array on next change; Firestore-synced nutrition re-hydrates regardless; "Cleared" alert false | Clear → logs still listed; log one item → entire "deleted" history re-persisted | CONFIRMED |
| P2 | `src/screens/SettingsScreen.tsx:249` | "Units" (mi/km) toggle controls nothing: `@zenki_units_pref` read/written only by SettingsScreen; every formatter defaults miles (`utils/gps.ts:77`) | Switch to km → all distances still miles | CONFIRMED |

### P3

| Sev | Location | Finding | Verdict |
|---|---|---|---|
| **Auth / onboarding** | | | |
| P3 | `src/screens/auth/SignInScreen.tsx:121` | Google sign-in `error` responses (and success without `id_token`) silently swallowed — button reads as "does nothing" | UNVERIFIED-MINOR |
| P3 | `src/screens/auth/ForgotPasswordScreen.tsx:66` | Non-email input (bare username) shows false "Check Your Email — we sent a reset link to mbrown" success; no @-format check (zero enumeration signal in adding one) | UNVERIFIED-MINOR |
| P3 | `src/navigation/RootNavigator.tsx:225` | ContactScreen (pre-auth prospect funnel + deployed submitContactInquiry client) registered but zero `navigate('Contact')` callsites — unreachable; apparently superseded by 'ContactSupport' | UNVERIFIED-MINOR |
| P3 | `src/context/AuthContext.tsx:239` | `email-already-in-use` fallback signs into the existing account but persists a freshly-minted member id → duplicate `/members` doc with same firebaseUid; `/users.memberId` still points at the original → admin dupes + storage-loss restore reverts profile | UNVERIFIED-MINOR |
| P3 | `src/context/AuthContext.tsx:340` | `signOut` never deletes/invalidates `pushTokens/{uid}` → shared device keeps receiving the signed-out account's pushes, incl. admin notifyOnReport alerts | UNVERIFIED-MINOR |
| P3 | `src/screens/auth/OnboardingScreen.tsx:910` | Email validity/availability only surfaces at step 9; only path back to the email field is 8× Back with no field highlight | UNVERIFIED-MINOR |
| **Social feed** | | | |
| P3 | `src/screens/CreatePostScreen.tsx:107` | `friendlyError` misses its own upload codes (`empty-blob` iCloud-optimized-photo path, `xhr-load-failed`) → permanent per-asset failure gets generic "try again" guidance | UNVERIFIED-MINOR |
| P3 | `src/screens/CommentsScreen.tsx:181` | Comments load failure → "Be the first to comment." (violates the codebase's own CommunityScreen.tsx:42 standard; feed got the fix in 2.0.3, comments didn't) | UNVERIFIED-MINOR |
| P3 | `src/screens/CreatePostScreen.tsx:26` | 280-char text cap bypassed via shared caption state from photo mode (maxLength 500); no truncate, no rules size constraint — posts at "500/280" red counter | UNVERIFIED-MINOR |
| P3 | `src/screens/CreatePostScreen.tsx:40` | 60s video cap applies only to camera capture; library picks + storage rules impose no length/size limit → multi-hundred-MB videos into the feed | UNVERIFIED-MINOR |
| P3 | `src/services/firebasePosts.ts:31` | `createPost` uploads media before the doc with no cleanup on addDoc failure; retries re-upload fresh filenames → orphaned Storage objects accumulate forever | UNVERIFIED-MINOR |
| P3 | `src/screens/CommunityScreen.tsx:101` | loadMore catch is console-only (end-of-feed indistinguishable from failure); failed pull-to-refresh keeps stale list with zero feedback | UNVERIFIED-MINOR |
| P3 | `src/screens/CommentsScreen.tsx:45` | `reload` is dead code and there is no pull-to-refresh — only back-out/re-enter refreshes comments | UNVERIFIED-MINOR |
| P3 | `src/services/firebasePosts.ts:368` | `getUserPosts` spreads raw doc data (no coerceCreatedAt/coerceDisplayName) — the exact legacy-shape classes getFeed/listAllPostsForAdmin were hardened against | UNVERIFIED-MINOR |
| P3 | `src/screens/CreatePostScreen.tsx:141` | Close (X) enabled during upload: neither cancels nor warns; detached promise completes/fails invisibly → duplicate reposts | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminPostsScreen.tsx:163` | In-app admin list silently capped at newest 200 with a header that reads as a total (web admin's identical cap is accepted because labeled) | UNVERIFIED-MINOR |
| **Social graph / DM** | | | |
| P3 | `src/screens/UserProfileScreen.tsx:77` | Blocking never revokes the blocked party's approved-follower edge (`/followers/{me}/followers/{them}`); posts read rule has no block gate → blocked ex-follower retains rules-level read of private posts + still counts as follower; one-line fix (rules:352 already permits the delete) | UNVERIFIED-MINOR |
| P3 | `src/screens/UserSearchScreen.tsx:39` | Member-list fetch swallows all failures to `[]` (`firebaseUsers.ts:33-35`) → "No members yet" on offline/auth-race denial (same cold-start race as F5) | UNVERIFIED-MINOR |
| P3 | `src/services/firebaseUsers.ts:18` | `orderBy('displayName')` excludes `/users` docs lacking the field — invisible in member search / New Message; the mapper's own `\|\| 'Member'` default expects docs the query can never return | UNVERIFIED-MINOR |
| P3 | `src/screens/UserProfileScreen.tsx:170` | Neither `updateProfile` call site catches (toggle `:170`, Save `:404`); privacy flip is non-atomic — users doc commits, posts `authorIsPrivate` fan-out can fail mid-batch → account marked private while old posts stay in the public feed | UNVERIFIED-MINOR |
| P3 | `src/screens/FollowRequestsScreen.tsx:77` | `withBusy` catches Accept/Decline failures to console.warn — button re-enables silently, user never knows the accept didn't happen | UNVERIFIED-MINOR |
| P3 | `src/screens/UserProfileScreen.tsx:142` | Follow/Message gates use `requireAuth(getCurrentUid())` (Firebase session) not the app user → signed-in members get the guest "Create a free account" prompt during the cold-start restore window | UNVERIFIED-MINOR |
| P3 | `src/services/firebaseFollow.ts:203` | Dead code: `getAllUsers` and `firebaseMessages.unreadCount` (`:262`) defined, never imported | UNVERIFIED-MINOR |
| **Booking / schedule** | | | |
| P3 | `src/context/AppointmentContext.tsx:236` | Member sees "Inquiry Sent" before the write settles (syncOrAlert fire-and-forget); rejection follow-up is admin-jargon ("your /admins entry may be missing") contradicting the success alert; phantom pending card persists | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminAppointmentsScreen.tsx:24` | Admin "Confirmed — they'll see it in their app" fires unconditionally pre-settle → success alert, then "not synced" alert, silent revert on next snapshot | UNVERIFIED-MINOR |
| P3 | `src/context/AppointmentContext.tsx:244` | `confirmAppointment` reads state via a no-op setState updater checked synchronously — relies on React's eager-updater optimization; a queued snapshot update defers it → silent no-op behind a "Confirmed" alert | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminScheduleScreen.tsx:131` | `parseInt(spots) \|\| 10` converts 0 (and non-numeric) to 10 spots — full class advertises "10 left" | UNVERIFIED-MINOR |
| P3 | `src/screens/BookScreen.tsx:53` | Slot labels interpreted in the DEVICE timezone, not the dojo's — remote member's "2:00 PM" arrives as a different dojo-local time, neither side warned | UNVERIFIED-MINOR |
| P3 | `src/services/appointmentSync.ts:59` | Contingent: legacy pre-2.0.3 appointments without `firebaseUid` invisible to owners; hinges on `backfillAppointmentOwners`, run status still ❓ (see §5) | UNVERIFIED-MINOR |
| P3 | `src/screens/ScheduleScreen.tsx:255` | Class list React keys use name+time despite stable `cls.id` — duplicate admin adds → duplicate keys, reconciliation glitches | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminAppointmentsScreen.tsx:109` | "Mark Complete" instant, no confirm, no undo (Cancel has a confirm; Complete doesn't) — mis-tap removes a session from the member's upcoming list and cancels their reminder | UNVERIFIED-MINOR |
| P3 | `src/screens/BookScreen.tsx:126` | Post-booking "Add to calendar" ignores the result: no-writable-calendar failure gives zero feedback; success confirms nothing before a no-op goBack | UNVERIFIED-MINOR |
| **Store / payments** | | | |
| P3 | `src/screens/DrinkScreen.tsx:261` | Price-change poisons the tab forever: entries snapshot price, server recomputes from current DRINK_PRICES and 400s on >1¢ mismatch; in-person "Mark settled" fallback unreachable from the Apple Pay branch → tab can never be cleared | UNVERIFIED-MINOR |
| P3 | `src/screens/StoreScreen.tsx:424` | Cart persists whole Product objects indefinitely → price edit/product deletion while carted = permanent `amount-mismatch`/`unknown-item` 400 with no remove-and-re-add hint | UNVERIFIED-MINOR |
| P3 | `src/screens/StoreScreen.tsx:417` | Points cap allows residual totals of $0.01–0.49 → `payWithApplePay` floor rejects, points refunded, "Payment failed" loop with no unchecking hint | UNVERIFIED-MINOR |
| P3 | `src/screens/OrderHistoryScreen.tsx:32` | Order history is a device-global key with no memberId filter → cross-account receipt leak on shared devices (Senpai history was made per-account in 2.0.3; this wasn't) | UNVERIFIED-MINOR |
| P3 | `firestore.rules:416` | `/customProducts` read requires sign-in but store browsing is deliberately guest-open (5.1.1(v)) → guests see a partial catalog; the `/config/scheduling` public-read pattern (rules:427) solves this exact case and wasn't applied | UNVERIFIED-MINOR |
| **Training / fitness** | | | |
| P3 | `src/screens/TimerScreen.tsx:545` | "Save as Preset" silent no-op on Android: `Alert.prompt` exists but its body is iOS-gated in RN → truthy check always picks the dead branch | UNVERIFIED-MINOR |
| P3 | `src/screens/PRDetailScreen.tsx:102` | Free-text DATE saved verbatim → "Invalid Date" in history/trend, breaks localeCompare chronological sort (value/reps get validation; date doesn't) | UNVERIFIED-MINOR |
| P3 | `src/context/GamificationContext.tsx:160` | Streaks keyed to the UTC day boundary — consecutive local-day training can reset the streak (carried-known; documented follow-up in `utils/dates.ts:48-53`) | UNVERIFIED-MINOR |
| P3 | `src/screens/WorkoutScreen.tsx:40` | Stats-tab volume heatmap/chart permanently dead: reads `@zenki_structured_logs`, a key nothing ever writes (grep-verified) | UNVERIFIED-MINOR |
| P3 | `src/screens/BluetoothDevicesScreen.tsx:93` | Failed BLE connect gives no feedback: `bleReason 'failed'` has no status-line branch and is excluded from `showErrorBlock` — every other reason has honest copy | UNVERIFIED-MINOR |
| P3 | `src/screens/WorkoutSessionScreen.tsx:82` | Live duration/kcal/strain are screen-local refs reset on remount mid-recording (modal swipe-dismiss bypasses the guarded back button) → End-Session shows "0:43 · 12 kcal" for a 20-min workout (persisted HRSession stays correct) | UNVERIFIED-MINOR |
| P3 | `src/screens/TimerScreen.tsx:245` | Timer history written with `memberId ''` to a device-global key, rendered unfiltered → shared-device privacy leak (workouts/PRs/HR/GPS all filter by memberId) | UNVERIFIED-MINOR |
| P3 | `src/screens/ActivityTrackerScreen.tsx:45` | Radio tab: Spotify tile renders the SoundCloud brand logo; SoundCloud gets a generic cloud — competitor's mark on the Spotify link | UNVERIFIED-MINOR |
| P3 | `src/context/GamificationContext.tsx:273` | Persistence effect calls `AsyncStorage.setItem` raw with no catch (every sibling uses `safeStorageSet`) → failed write = unhandled rejection, earned XP/Diamonds lost on next kill | UNVERIFIED-MINOR |
| **Nutrition** | | | |
| P3 | `src/context/NutritionContext.tsx:517` | `updateGoals`/`saveProfile` capture merged state from inside a setState updater then check it synchronously — deferred updater (queued snapshot) → Firestore mirror write silently skipped; same in saveProfile `:543-583` | UNVERIFIED-MINOR |
| P3 | `src/components/FoodSearchModal.tsx:102` | All provider failures → `[]` (`foodSearch.ts:41-42`) → "No matches. Try a different term." for offline/outage; with no USDA key + OFF down, search reads as an empty database (same class: `drugSearch.ts:138/177`) | UNVERIFIED-MINOR |
| P3 | `src/screens/BarcodeScannerScreen.tsx:59` | Network/timeout and genuinely-missing product both render "Product not in database" — offline scans misdiagnosed | UNVERIFIED-MINOR |
| P3 | `src/screens/WeightTrackerScreen.tsx:363` | Week calendar visibly selects a day consumed by nothing — form always stamps today; looks like a working backfill date picker | UNVERIFIED-MINOR |
| P3 | `src/screens/WeightTrackerScreen.tsx:424` | Hero renders "Today's scale {latest.weight}" from the most recent weigh-in regardless of date — days-old reading attributed to today | UNVERIFIED-MINOR |
| P3 | `src/screens/WeightTrackerScreen.tsx:745` | Goal target date free-text, unvalidated → persisted "Target Invalid Date · NaNd left" footer | UNVERIFIED-MINOR |
| P3 | `src/context/NutritionContext.tsx:224` | Storage-hydrate and Firestore-subscribe effects race on the same `[user?.id]` change — slower storage read wholesale-replaces state, dropping server-only rows until the next docChanges | UNVERIFIED-MINOR |
| P3 | `src/context/NutritionContext.tsx:430` | Mutators sample `getCurrentUid()` at call time (not the `authUid` state built for this race) — entries logged pre-session-restore are local-only forever (prior-launch migration flag blocks later upload) | UNVERIFIED-MINOR |
| P3 | `src/screens/PhotoFoodScreen.tsx:152` | Barcode/Photo entries logged with no mealType (bucketed Snacks) and always local-today, ignoring the selected date — backfills land on today→Snacks | UNVERIFIED-MINOR |
| P3 | `src/screens/MacroTrackerScreen.tsx:255` | `saveGoals` rejects only negatives while claiming "must be positive"; 0-cal goal makes the week-strip dot always green and hero read "N over goal" | UNVERIFIED-MINOR |
| P3 | `src/screens/MacroTrackerScreen.tsx:747` | Entries section hard-labeled "TODAY · DRAG TO REORDER" / "No entries yet today" even when a past date is selected | UNVERIFIED-MINOR |
| P3 | `src/utils/nutrition.ts:266` | UTC offset >+12 (NZDT etc.): noon→toISOString round-trip shifts every day key −1 → adaptive TDEE permanently "Log intake on more days"; `computeTrendWeight`/`trendChange` share the shift | UNVERIFIED-MINOR |
| P3 | `src/context/NutritionContext.tsx:653` | `weightByDateKg` claims "keep the latest" but iterates merge order — same-day duplicate can resolve to the OLDER weigh-in, skewing TDEE endpoints | UNVERIFIED-MINOR |
| P3 | `src/screens/PhotoFoodScreen.tsx:50` | Permission-denied alerts say "Enable it in Settings" with no Open Settings action (BarcodeScanner and DEXA/Bloodwork pickers deep-link) | UNVERIFIED-MINOR |
| **Senpai** | | | |
| P3 | `src/components/SenpaiMascot.tsx:297` | Transient STT error schedules start() at +400ms; the paired iOS 'end' schedules another at +250ms — no shared pending flag → double-start resets the session, dropping speech begun in the gap | UNVERIFIED-MINOR |
| P3 | `src/hooks/useSenpaiChat.ts:667` | TTS pipeline has no cancellation epoch: tap-to-stop/voice-off during the fetch window only stops the current clip — in-flight fetch plays anyway; interrupted clip A's onEnded flips `ttsPlaying` false while clip B is audible → mic re-arms over her speech | UNVERIFIED-MINOR |
| P3 | `src/hooks/useSenpaiChat.ts:238` | (Applies once 0f00ad3 is merged) The session-only fix doesn't heal users already persisted-muted by 2.0.4 — stored 'false' is indistinguishable from manual off; needs a release-notes/one-time-migration decision | UNVERIFIED-MINOR |
| P3 | `src/hooks/useSenpaiChat.ts:206` | Three comment blocks (also `SenpaiMascot.tsx:189-195`, `SettingsScreen.tsx:483-486`) still document "auto-disables ... and persists false" — post-merge these contradict 0f00ad3 and invite reintroducing the persistent-mute bug | UNVERIFIED-MINOR |
| **Admin (in-app)** | | | |
| P3 | `src/screens/AdminReportsScreen.tsx:174` | "Ban user" leaves the report status 'open' — resurfaces forever, dashboard badge stays inflated unless the admin also Dismisses | UNVERIFIED-MINOR |
| P3 | `src/services/pushNotifications.ts:111` | `fetchAllPushTokens` swallows read failures to `[]` → broadcast shows SUCCESS "Broadcast sent" blaming members for missing tokens; 0-recipient history row saved for an attempt that never happened | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminMembersScreen.tsx:432` | Avatar renders `member.firstName[0]`/`lastName[0]` unguarded on uncoerced raw docs — one partial `/members` doc crashes the whole Members screen (same class as F3) | UNVERIFIED-MINOR |
| P3 | `src/screens/AttendanceHistoryScreen.tsx:23` | "This Week" cutoff computed with UTC `toISOString` against local-day visit dates → drops the oldest day for US timezones in the evening | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminScreen.tsx:63` | Dashboard badges load once per mount, no focus refetch (stale after actioning); counts swallow errors to 0; Employee Tasks badge counts all members' personal tasks, inflated vs the screen | UNVERIFIED-MINOR |
| P3 | `src/screens/AdminMembersScreen.tsx:318` | Editing a member's email never changes their Auth login email; reset-email to the new address returns anti-enumeration 200 → "Reset sent" while the member stays locked out | UNVERIFIED-MINOR |
| **Web admin (v3, undeployed)** | | | |
| P3 | `hosting/admin/app.js:497` | `el()`'s new DANGEROUS_ATTRS blocklist includes 'style' but memberRow's own edit form passes `style:` three times — spacing silently dropped + 3 console warnings per Edit | UNVERIFIED-MINOR |
| P3 | `hosting/admin/app.js:4` | The refactor's stated CSP purpose is unimplemented: firebase.json defines no Content-Security-Policy header and index.html has no meta CSP — zero of the claimed benefit | UNVERIFIED-MINOR |
| P3 | `hosting/admin/app.js:121` | Popup-blocked fallback uses `signInWithRedirect` across `web.app` vs `firebaseapp.com` authDomain — partitioned-storage browsers bounce back signed out with no error | UNVERIFIED-MINOR |
| P3 | `hosting/admin/app.js:295` | `reasonLabel` bare prototype-chain lookup — crafted `reason:'constructor'` renders function source in the badge (textContent, no XSS; cosmetic) | UNVERIFIED-MINOR |
| **Cloud Functions** | | | |
| P3 | `functions/src/deleteAccount.ts:252` | `/orders` never purged: named purchase history (firebaseUid, memberName, line items) survives erasure; if retention is deliberate it contradicts the function's own header and is undocumented | UNVERIFIED-MINOR |
| P3 | `functions/src/deleteAccount.ts:177` | Only the own-side block graph removed: inbound `blocks/{other}/blocked/{deletedUid}` and the deleted user's `blockedBy` mirror orphaned; `participantProfiles.{uid}` (name + avatar URL) survives in conversations | UNVERIFIED-MINOR |
| P3 | `functions/src/adminActionReport.ts:75` | Deployed CF is dead code (no fetch targets it from app or web admin) yet stays publicly invokable, carrying the F2-class flaw internally | UNVERIFIED-MINOR |
| P3 | `functions/src/index.ts:231` | Every HTTP endpoint except senpaiChat awaits `enforceRateLimit` unguarded (8 sites) → transaction failure = body-less 500 off the JSON error contract; on sendPasswordReset it breaks the always-200 anti-enumeration guarantee | UNVERIFIED-MINOR |
| P3 | `src/services/aiVision.ts:121` | Client aborts all vision calls at 35s vs 90s server timeouts on extractDexa/parseBloodwork — slow legit parses killed client-side while the scarce daily rate-limit hit is consumed | UNVERIFIED-MINOR |
| **Rules / deploy** | | | |
| P3 | `firestore.rules:364` | followRequests blockedBetween guard is repo-only: live prod still accepts blocked-pair requests; post-deploy, `followUser`'s setDoc will start rejecting into the un-caught `handleFollow` (P3-a) — pair the try/catch fix with the deploy | UNVERIFIED-MINOR |
| **Navigation / guest** | | | |
| P3 | `src/screens/ProductDetailScreen.tsx:33` | `route.params` destructured unguarded (same class as P3-b, not in the register); single caller passes productId — hardening | UNVERIFIED-MINOR |
| P3 | `src/screens/EmployeeChecklistScreen.tsx:68` | `goBack()` from tab-mounted screens resolves via tab `backBehavior:'firstRoute'` → jumps to Home (employee Tasks back chevron; BookScreen post-booking dismissal from Schedule) | UNVERIFIED-MINOR |
| P3 | `App.tsx:137` | No push tap routing anywhere (no response listener, no `linking` prop) — tapping any push merely foregrounds the last screen | UNVERIFIED-MINOR |
| P3 | `src/services/announcementSync.ts:40` | Guests never see announcements (rules) and the denial is silent; conversely a previous member's stale device-global `@zenki_announcements` cache DOES show to guests | UNVERIFIED-MINOR |
| P3 | `src/screens/CommunityScreen.tsx:238` | "My profile" icon is a silent no-op for guests (null uid, handler does nothing) while the adjacent DM icon correctly prompts | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:811` | Guest Home greets "Welcome back, Member" — first screen App Review sees in guest mode; no sign-in CTA on guest Home | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:738` | Guest Home layout edits (reorder/hide) silently never persist (null storage keys) — full edit affordances, all lost on relaunch | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:781` | Guests can spin the daily wheel and win redeemable real-goods vouchers (device-local context, no auth gate) — account-less freebies at the counter | UNVERIFIED-MINOR |
| P3 | `src/screens/ContactSupportScreen.tsx:57` | Guest can compose the full Contact IT form; requireAuth fires only at Send; tapping Sign In discards the draft | UNVERIFIED-MINOR |
| **Error-swallowing (additional P3s)** | | | |
| P3 | `src/context/SchedulingConfigContext.tsx:105` | Config subscribe error warn-only → silently stays DEFAULT_CONFIG (pricing hidden), indistinguishable from "never configured" | UNVERIFIED-MINOR |
| P3 | `src/context/ScheduleContext.tsx:141` | `resetToSeed` swallows `clearScheduleDay` failures → reset silently reverts on next snapshot (writeDay correctly uses syncOrAlert) | UNVERIFIED-MINOR |
| P3 | `src/context/DrinkTrackerContext.tsx:65` | Hydrate promise has no `.catch` (same `AttendanceContext.tsx:79`) → one getItem rejection leaves `loaded` false forever, session's drink charges vanish on relaunch | UNVERIFIED-MINOR |
| P3 | `src/context/MedicationTrackerContext.tsx:263` | Notification scheduling failure on add is warn-only — med saves looking configured, reminders never fire | UNVERIFIED-MINOR |
| P3 | `src/context/AuthContext.tsx:167` | Push-token save `.catch(() => {})` — chronic rules failure = member silently unreachable by reminders/broadcasts (mitigated: re-runs each open) | UNVERIFIED-MINOR |
| P3 | `src/services/calendarAvailability.ts:58` | Busy-interval fetch fails OPEN (`[]`) — moot while URL is empty; becomes a double-booking inverter the day it's configured | UNVERIFIED-MINOR |
| **Home / misc** | | | |
| P3 | `src/context/EmployeeTaskContext.tsx:166` | Carried-known UTC-day convention concretely bites staff: checklist un-checks at 5pm PDT mid-shift; post-5pm check-ins land on tomorrow's attendance date (`AttendanceContext.tsx:171`) | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:540` | "This Week/Month" Macros Hit divides TODAY's calories by goal×daysInRange — perfect week reads ~14% | UNVERIFIED-MINOR |
| P3 | `src/context/CycleTrackerContext.tsx:104` | `logPeriodStart` has no ongoing guard, button never disables → double-tap creates multiple endDate-less entries; End closes one, phantom "(ongoing)" pins "Currently menstruating" forever | UNVERIFIED-MINOR |
| P3 | `src/screens/CycleTrackerScreen.tsx:70` | "End Current Period" silently stamps the UTC date with no visible/editable field — post-5pm PT ends recorded tomorrow | UNVERIFIED-MINOR |
| P3 | `src/components/NotificationsModal.tsx:78` | Announcement rows fall back to "Tap to read more" with no onAction — misleading copy on a silent no-op | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:374` | `dismissedIds` never reset on uid change → user A's dismissals leak into user B's session and get written under B's key | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:158` | EmployeeChecklistCard (and voucher cards `:892/:910`) tap targets not gated on editMode — drag attempts toggle real task completions / open the redeem modal | UNVERIFIED-MINOR |
| P3 | `src/screens/HomeScreen.tsx:332` | Orphaned `setSenpaiEnabled` destructure from the 2337fdb banner removal — no remaining call sites | UNVERIFIED-MINOR |
| P3 | `src/context/TimeClockContext.tsx:260` | `markLunchTaken`/`markBreakTaken` have no UI callers → every payroll row reports lunch/break 'No' while 30-min deductions ARE applied — CA meal-break compliance record permanently wrong | UNVERIFIED-MINOR |
| P3 | `src/context/TimeClockContext.tsx:209` | `clockOut` reads `completed` assigned inside the setState updater on the next line — eager-updater dependent; a pending 1s-tick update defers it → Sheets push silently skipped (`synced:false`, no retry) | UNVERIFIED-MINOR |
| P3 | `src/screens/HelpScreen.tsx:13` | "App version 1.0.0" hardcoded; `supportMessages.ts:27` stamps the same onto every ticket despite "attached automatically" copy | UNVERIFIED-MINOR |
| P3 | `src/screens/SettingsScreen.tsx:911` | Change Password modal still says 'Default admin password is "password"' — stale temp-password-era copy (backdoor removed 2.0.3), credential-hinting | UNVERIFIED-MINOR |
| P3 | `src/screens/SettingsScreen.tsx:397` | Theme grid filters out system/clean-light/clean-dark → no way back to default themes from Settings (escape hatch only on Profile); dead soundTheme state/styles | UNVERIFIED-MINOR |

**Verification results (non-defects, recorded for the register):**
- `src/services/firebaseAuth.ts:391` — the auth slice writes nothing the pending ff9c3d8 `/users` guard would deny, on either ruleset (all writes projection-only; acceptedTermsAt merge leaves any legacy `member` field byte-identical).
- `functions/src/createPaymentIntent.ts:41` — zero price drift across all 9 product + 9 drink mirrors; custom products server-priced; rate limiting covers the endpoint; "card checkout" doesn't exist by design (Apple Pay or reserve only).

---

## 4. REPAIR PLAN

### (a) Client fixes for 2.0.5, ordered by user impact

**Precondition 0 — fix the tree.** Merge `0f00ad3` (`fix/senpai-voice`) into the 2.0.5 build branch, or rebase `feature/web-admin-hardening` onto it. Then update the three stale comment blocks (`useSenpaiChat.ts:204-207`, `SenpaiMascot.tsx:189-195`, `SettingsScreen.tsx:483-486`) and decide the 2.0.4-muted-users healing question (`useSenpaiChat.ts:238`).

1. **Auth-race workstream (one pattern, many fixes).** Key BlocksContext's subscribe effect on Firebase auth state (`onAuthStateChanged`-fed `authUid`, the pattern AppointmentContext/NutritionContext/EmployeeTaskContext already use) — fixes the P1 safety regression. Apply the same to: `MessagesListScreen`/`subscribeToInbox` (F5), `UserSearchScreen`/`getAllMembers`, `UserProfileScreen` requireAuth gates (`:142`), and NutritionContext mutators (`:430` use `authUid` not `getCurrentUid()`).
2. **Listener lifecycle workstream.** Shared `onSnapshot` error handling: invoke the consumer with an error state and resubscribe on auth change. Fixes AnnouncementContext/ScheduleContext/ProductContext guest-boot dead listeners (P2×2), the `employeeTaskSync.ts:76` systemic class, and pre-empts the ff9c3d8 employeeTasks deploy risk.
3. **Durable-writes workstream (error-swallowing, write side).** One outbox/retry mechanism (supportMessages already has queue+flush to copy) applied to: waiver (`waiverSync` + `stripUndefined`), acceptedTermsAt, signup `/members` push (`stripUndefined` in memberSync — or set `ignoreUndefinedProperties` globally), payroll `pushTimeEntry` (+ surface `synced:false`), paid orders (`orderSync`), attendance check-in, nutrition writes (or at minimum `syncOrAlert`). Fix `payments.ts:127` to not throw-mask receipt persistence on a captured charge.
4. **Honest-empty-states workstream (error-swallowing, read side).** Shared load-error + retry state for: AdminPostsScreen, AdminReportsScreen (revive the dead permError branch), CommentsScreen, UserSearchScreen, inbox/thread (`onUpdate` with error flag), broadcast token fetch, FoodSearch/Barcode offline copy.
5. **Local-day convention sweep (single utility, one pass).** Fix readers/writers still on UTC: `HomeScreen.tsx:505`, `useSenpaiChat.ts:180/383`, `MacroSetupScreen.tsx:138` + `OnboardingScreen.tsx:372`, `TimeClockContext.tsx:179` (holiday pay — money), `AttendanceHistoryScreen.tsx:23`, `CycleTrackerScreen.tsx:70`. (Streaks/employee-task UTC keying stays deferred — needs data migration, see (c).)
6. **Senpai voice/UX safety.** `setHidden` must stop mic + audio (`:1683`); `ttsPlaying` guard in `activateListening` (`:992`); re-arm (or honestly drop `listening`) after failed sends (`:232`); guest "sign in to chat" state (`:1176`); TTS cancellation epoch (`useSenpaiChat.ts:667`); shared re-arm pending flag (`:297`).
7. **DM creation (P1).** Restructure `getOrCreateConversation` to tolerate the missing-doc denial (treat permission-denied on the initial get as "create it"), or split the read rule so a get on a missing doc is allowed — same fix class the codebase already documents for `/members`.
8. **Booking reminders** — one-line `SchedulableTriggerInputTypes.TIME_INTERVAL` fix (`AppointmentContext.tsx:106`); remove the bare catch's silence.
9. **Double-tap/idempotency guards.** `busy` guard (pattern at `PermissionsOnboardingScreen.tsx:209`) on: Onboarding finish (`:991`), Store checkout (`:373`), DrinkScreen settle (`:248`), CycleTracker log (`:104`), plus slot re-submit clearing on BookScreen.
10. **Onboarding integrity.** Gate Main on `acceptedTermsAt` (route resume-onboarding when missing) — closes the OAuth force-quit bypass (`AuthContext.tsx:214`).
11. **Own-content delete** (`PostCard.tsx:42`) — wire the existing backend to a three-dot menu on own posts/comments.
12. **Navigation stability.** Memoize `withErrorBoundary` wrappers at module scope (`RootNavigator.tsx:237`); wrap tab + auth screens (`TabNavigator.tsx:85`).
13. **Carried-forward social fixes.** F1 (rules: allow requester read of own request doc, or store requested state client-readably; plus try/catch in `handleFollow`), F3+F9 (coerce in `listComments`; guard `charAt`), F8 (`blockedByIds` composer gate + honest copy), F11 (disable report when conversation create failed). Block flow: also delete the approved-follower edge (`UserProfileScreen.tsx:77`, one line, rules already permit).
14. **Timers.** `expo-keep-awake` during active timers; timestamp-math for stopwatch/countdown; honest meditation copy or real audio via expo-av.
15. **Dead/false controls (trust).** Sound Effects, Units, Export All Data, Clear Workout/Nutrition — fix or remove before review scrutiny (`SettingsScreen.tsx:249/253/665/676`); admin add-member flow (`firebaseAuth.ts:237` — needs a rules branch or a CF, see (b)); AdminEmployeeTasks live member source (`:40`).
16. **Lower-priority P3 batch** as capacity allows, prioritizing: DexaUpload decimal input (`:245` — blocks the correction path, arguably P2-adjacent), nutrition migration per-doc fallback (`nutritionSync.ts:197`), hydrate-wipe guards (5 contexts), ForgotPassword @-check, stale-cart/tab recovery copy.

### (b) Deploy-side actions (no client build required unless noted), with gating conditions

1. **NOW — indexes (fixes both P0-2 and banUser purge).** Add `fieldOverrides` with COLLECTION_GROUP scope for `comments.userId` and `likes.uid` to `firestore.indexes.json`; deploy. Gate: confirm index build reaches READY, then e2e-test `deleteAccount` on a throwaway account before considering the P0 closed. Also remove the `.catch(() => null)` swallows in deleteAccount and the wrong comment in banUser while touching the files.
2. **NOW — F7 report throttle.** Add `reports` to the `rateLimit.ts` Endpoint union and enforce in `notifyOnReport` (or a rules-side per-uid throttle). Server-side only.
3. **ff9c3d8 rules deploy — CALCULUS VERDICT: SAFE for this tree, and now carries a live guest-facing FIX (guest Book-Private pricing via `/config/scheduling` public-read).** Verified: no code writes a `member:` field to `/users`; employeeTaskSync queries already satisfy the new source-split rules. Remaining gate is unchanged: old ≤2.0.2 installs (build-48+ dominance) — verify the dominance metric, then deploy. Pair with: (i) the `handleFollow` try/catch client fix (the delta's blockedBetween guard will otherwise surface as unhandled rejections — `firestore.rules:364`), and (ii) a smoke test that staff checklists still load (mismatches would be silently swallowed per the systemic listener finding).
4. **Web-admin v3 (`feature/web-admin-hardening`) — DO NOT DEPLOY until:** announcements `createdAt` reverted to ISO string (P1 `app.js:589`); pinned-checkbox behavior reconciled with the app (`:598`); the claimed CSP headers actually added to `firebase.json` (`:4`); style-attr blocklist vs memberRow fixed (`:497`). Live hosting stays on v2 meanwhile (v2 is compatible).
5. **Guest read rules (product decision, then one rules deploy):** `/schedule` public-read (fixes the 5.1.1(v) stale-seed P2 — strongly recommended), `/customProducts` public-read (guest catalog), `/announcements` (optional). Pattern already established at `firestore.rules:427`.
6. **deleteAccount coverage:** add `/senpaiUsage` purge (P2); decide + document `/orders` retention; sweep inbound block edges and `participantProfiles`. Remove or gate the dead `adminActionReport` CF.
7. **Still open from 2.0.4 deferrals:** broadcastPush rate limit; Expo-receipt delivery accounting.
8. **0f00ad3's own deploy-side verify items:** `SENPAI_TTS_SIGNING_SECRET` bound on senpaiChat; senpaiSpeak logs clean of ElevenLabs 401/quota (see §5).

### (c) Deferred with rationale

- **F12 feed focus-refetch** — accepted read-cost tradeoff, now documented in-code; close as accepted-with-rationale in the register.
- **Like-state N+1** (`firebasePosts.ts:221`) — accepted; correctness OK, read-cost only.
- **UTC streak/task-day keying** (`GamificationContext.tsx:160`, `EmployeeTaskContext.tsx:166`) — documented follow-up requiring stored-data migration; defer, but note the *money* instance (holiday pay) is NOT deferred (in (a)5).
- **validateInviteCode undeployed / client gate bypass** — by design; **stripeWebhook inert** — known, secret unset.
- **Dead-code batch** (NotificationsScreen, ContactScreen, `getAllUsers`/`unreadCount`, WorkoutScreen heatmap plumbing, soundTheme remnants, `setSenpaiEnabled`) — single cleanup ticket, no user impact.
- **BookScreen dojo-timezone semantics** (`:53`) and **multi-day booking / date picker** (`:322` partially) — needs a product decision on dojo-TZ anchoring; the evening dead-end copy fix should still ship ("come back tomorrow").
- **Typed ParamList** (P3-f) — right fix for the unguarded-params class but a broad refactor; defer past 2.0.5, add param guards piecemeal.
- **Push deep-linking** (`App.tsx:137`) — feature work, not a regression.
- **calendarAvailability fail-open** — moot until the URL is configured; add a guard when the integration is turned on.

---

## 5. WHAT NEEDS LIVE VERIFICATION

Static audit could not confirm the following; each needs prod/device checks before or at 2.0.5 ship:

**Prod Firebase state**
1. `backfillFollowCounts` run status (gates whether F10 is live or moot) and `backfillAppointmentOwners` (gates `appointmentSync.ts:59`) — both still ❓ per handoff §7.
2. Post-deploy: COLLECTION_GROUP index build state for `comments.userId` / `likes.uid`, then a live `deleteAccount` e2e on a throwaway account (verify full cascade + Auth deletion + sign-out path).
3. Confirm live ruleset really equals repo-minus-ff9c3d8 (the audit assumed this per brief (c)); re-check after any interim deploys.
4. Build-48+ install dominance metric — the ff9c3d8 deploy gate.
5. `SENPAI_TTS_SIGNING_SECRET` bound on senpaiChat; `SENPAI_TTS_REQUIRE_SIGNATURE` value; senpaiSpeak logs clean of ElevenLabs 401/quota errors (0f00ad3's own verify list).
6. Live hosting: confirm zenki-dojo.web.app/admin still serves v2 (v3 must not go out until §4b-4); after any v3 deploy, verify CSP headers actually present on responses.
7. Firestore console sweep: `/orders` contents (any unfulfilled reserve orders sitting unseen), `supportMessages` backlog (black-hole finding), `senpaiUsage` volume (GDPR purge scoping).
8. Rate-limit behavior of `enforceRateLimit` under transaction contention (the bare-500 contract finding) — needs a live probe or log inspection.

**On-device (cannot be verified statically)**
9. `expo-notifications` trigger TypeError repro: confirm booking-reminder scheduling fails on a real device pre-fix and succeeds post-fix; same for medication scheduling failure path.
10. Senpai audio pipeline: hot-mic-after-hide, STT self-transcription of TTS, double re-arm thrash, TTS-after-cancel — all need physical-device walk-throughs (iOS single-shot STT behavior is OS-version dependent).
11. Cold-start auth-race timing: confirm the AsyncStorage-wins-race window on real hardware (BlocksContext/F5/UserSearch) and that the auth-keyed fix closes it.
12. Timers under real auto-lock (keep-awake fix), meditation completion behind lock screen, stopwatch drift.
13. BLE failed-connect UX, GPS start/End race (background location indicator persisting), HealthKit stream behavior.
14. Apple Pay device paths: double-tap double-charge, $0.01–0.49 residual loop, drink-tab amount-mismatch after a price change, receipt-persistence failure path (`payments.ts:127`).
15. Shared-device walk: sign-out push-token persistence (does the old account's push actually arrive?), order-history/timer-history leaks, dismissedIds bleed.
16. Whether any real 2.0.4 users carry persisted `voiceEnabled='false'` (drives the upgrade-healing decision, `useSenpaiChat.ts:238`) — check senpaiSpeak usage drop-off or add telemetry.
17. **Full App-Review-style guest walk** (5.1.1(v)): Browse as Guest → Home copy ("Welcome back, Member"), Schedule (stale seed?), Store (partial catalog?), Community gates, Senpai 401 copy, spin-wheel voucher, Contact IT draft loss — end-to-end on device against live rules.
18. React eager-updater races (`TimeClockContext.tsx:209`, `AppointmentContext.tsx:244`, `NutritionContext.tsx:517`) — timing-dependent; verify with instrumentation or restructure defensively regardless (recommended).
19. Web admin in real browsers post-fix: popup-blocked → redirect sign-in under Chrome/Safari partitioned storage (`app.js:121`).
---

## 6. METHOD & BASELINE (appendix)

- **Baseline gate:** `npx tsc --noEmit` clean (exit 0) and `functions` build clean at audit start — no compile-level regressions; everything above is runtime/rules/UX-level.
- **Method:** 16 parallel subsystem auditors (regression + usability-persona sweeps per slice: auth/onboarding, social feed, social graph/DMs, booking, store/payments, training/fitness, nutrition, Senpai, in-app admin, web admin, Cloud Functions, rules-vs-traffic, navigation, guest mode, error-swallowing, Home/misc), grounded in the prior-audit registers so accepted-with-rationale items were not re-flagged. Every P0/P1 was adversarially verified by 2 independent agents (correctness + reproduction lenses), P2 by 1; P3s are unverified-minor. 231 raw findings → 227 deduped → 226 kept / 1 refuted.
- **Live checks performed:** `firebase firestore:indexes --project zenki-dojo` (confirmed 6 indexes, 0 collection-group — P0-2), git ancestry of `0f00ad3` (P0-1). Everything in §5 remains unverified statically.
- **Scope note:** the web-admin slice audited the v3 code on this branch (`hosting/admin/index.html` + `app.js`), which is **not yet deployed** — live hosting serves v2.
