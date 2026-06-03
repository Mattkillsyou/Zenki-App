# Re-audit (errors / hallucinations / demo content) — 2026-06-02

Second whole-app pass after PR #2 (44-bug audit) + PR #3 (owner-items). Ran a
6-finder multi-agent sweep → dedup → **adversarial verification of every
finding** (so the meta-audit itself didn't ship hallucinations). Then an
adversarial review of the fixes caught + fixed one regression they introduced.

**23 raw findings → 21 confirmed real (0 blocker · 3 major · 10 minor · 8 nit).**
2 were correctly rejected as not-real. No real hallucinations in the code — the
prior PRs held up; the only "hallucination" finding was a stale doc comment.

## Fixed

**Security / privacy**
- `firestore.rules` **attendance read** was `isSignedIn()` → every member could
  read everyone's check-in PII (name/date/time). Now `isAdmin() || owner`
  (AttendanceContext only subscribes for admins, so no UI regression). Create is
  now field-validated (memberName/date/checkInTime are strings) so a forged row
  can't inject arbitrary values.
- `validateInviteCode` brute-force throttle keyed on the **leftmost**
  X-Forwarded-For (client-spoofable → per-request bucket evasion). Now uses the
  rightmost (Cloud Run-appended) entry.
- `createPaymentIntent` forwarded a **client-supplied currency** to Stripe while
  all price math is USD — a zero-decimal currency (jpy) could decouple charged
  value from the validated amount. Pinned to `'usd'`.

**Cloud Functions**
- `stripeWebhook` wrote `payments/{id}` unconditionally → an out-of-order /
  retried `payment_failed` could clobber a recorded `succeeded`. Now a
  transaction never downgrades succeeded→failed and ignores older events.
- `notifyOnReport` ignored Expo's per-ticket errors (HTTP 200 with
  DeviceNotRegistered) → silent drops. Now parses tickets, logs errors, and
  prunes dead `pushTokens/{uid}`.
- `deleteAccount` deleted two collections the client never writes
  (`bloodworkReports`/`dexaScans` are local-only AsyncStorage). Removed the dead
  queries + corrected the docstring.

**GPS activity tracker**
- Live map polyline was driven by `currentPosition` deltas → in background mode
  each 2s drain advanced many fixes at once, so the polyline skipped interior
  points. Now driven by a context `liveRoute` (the authoritative route).
- Pause/Resume was **dead code** (no UI). Wired a Pause/Resume button into the
  tracker; the live duration timer now subtracts paused time (and the saved
  `durationSeconds` folds an in-progress pause when you end mid-pause — the one
  regression the fix-review caught).

**Client correctness**
- `DrinkTrackerContext.commitPending` and `TimeClockContext.clockOut` fired
  non-idempotent network writes (Sheets) **inside setState updaters** (must be
  pure). Moved the side-effects after setState so each fires exactly once.

**Demo content**
- Removed the placeholder **`apple` seed account** (id 3, an `isEmployee` $20/hr
  persona that auto-backfilled into the production roster + payroll list) from
  `members.ts` + its seed-credential maps.
- Softened a stale "Live (verified)" deployment claim in `src/config/api.ts`.

## Deferred / needs owner decision

- **`taskCompletions` / `employeeTasks` cross-user read** (firestore.rules) —
  any signed-in member can read others' chore-completion records / personal
  tasks. Real but low-sensitivity. **Not fixed here** because tightening the rule
  requires scoping the client listener too (EmployeeTaskContext subscribes to the
  whole collection for every member) — the same rule+listener co-change that
  regressed appointments in PR #2, so it deserves its own focused change +
  verification. Recipe: scope `taskCompletions` read to `isAdmin() || owner`,
  pass uid+isAdmin into `subscribeToCompletions`, and have non-admins query
  `where('firebaseUid','==',uid)` (admins keep the full listener).
- **Demo/seed data that may be real people** — `members.ts` seeds
  `sensei.tim` with round-number placeholder stats (5000 sessions, 52-week
  streak, since 1997); confirm he's a real member and reset to honest values (or
  remove). `ContactScreen.tsx` shows a fictitious `(323) 555-1997` phone — replace
  with the real dojo number or remove the row.
- **Kept intentionally:** the `admin` + `reviewer` seed accounts and
  `seedReviewerData.ts` (local-only demo data for the Apple reviewer) — required
  for App Review; remove only after the app clears review.
