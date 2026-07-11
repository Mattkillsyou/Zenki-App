# SOCIAL SECTION AUDIT — 2026-07-07 (Windows workspace, main @ 871edaa)

Method: 8-dimension parallel static audit (feed, comments, DMs, follow graph, moderation,
rules-vs-client, navigation, runtime-crosscut) + adversarial verification (2 skeptics per P0/P1),
then a human deploy-state reconciliation against git history + ZENKI_APP_HANDOFF.md. 47 raw findings
→ 31 verified. TypeScript `tsc --noEmit` is clean (no broken imports / type errors).

---

## 0. HEADLINE — the audit's leading hypothesis is STALE; correct it before acting

The automated audit concluded "the whole social section is broken by production deployment skew —
prod runs an old ruleset with no `/followers`, `/mutes`, `/followRequests`, so follow/DM/mute are 100%
dead." **That is measured against the wrong baseline and is almost certainly not the current prod state.**

Git + the repo's own deploy record:

| Commit | Date | Rules content |
|--------|------|---------------|
| `8d19c47` | 2026-05-30 | pre-social (has `/blocks`, **no** `/mutes`/`/followers`/`/followRequests`/`/conversations`) — the audit's assumed baseline |
| `3745c0b` | 2026-06-02 | **adds all social rules** (private posts, likes ±1, `/members` lock, `/followers`, `/followRequests`, `/mutes`, `/conversations`) + the composite indexes |
| `ff9c3d8` | 2026-07-06 | latest: `/users` `member:` guard + `/employeeTasks` source-split — **no social changes** |

`ZENKI_APP_HANDOFF.md:83`: **"✅ Believed DONE (prod, 2026-06-08 deploy): `firestore:rules` +
`firestore:indexes` + `functions` deployed … `backfillPostPrivacy` ran → healed 19/19 legacy posts."**

The 2026-06-08 deploy postdates `3745c0b` (2026-06-02) by six days, so **the social rules and both
social composite indexes have been live for ~a month.** The only *undeployed* ruleset is `ff9c3d8`
(yesterday), and the session's own pending-deploy note gates it on exactly the two `ff9c3d8` denials
(`member:` on `/users`, unfiltered `/employeeTasks`) — neither is a social path.

**Consequence:** every finding the audit ranked P0/P1 *purely* on the missing-rule / missing-index
premise is a non-issue in current prod (already remediated by the 06-08 deploy). They are listed in
§3 as "was-P0/P1, now conditional" so nothing is lost if the 06-08 deploy turns out not to have
happened. The **real, deploy-independent defects** are in §2 — those are what to fix.

> Why the audit missed this: a bug in the audit harness dropped the history brief into the synthesis
> agent (`[object Promise]`), so it never saw the "2026-06-08 deployed" line and over-trusted the
> stale premise. Corrected here by reading git + the handoff directly.

---

## 1. THE ONE FACT THAT FLIPS THE DIAGNOSIS — verify against live prod

Everything above rests on the 06-08 deploy having actually happened. The handoff is explicitly hedged
("I cannot read prod … verify against the live Firebase project"). **Confirm these three before trusting
§0**, because if 06-08 did *not* ship, the §3 "conditional" P0/P1s become live P0/P1s:

1. **Live ruleset actually contains the social matches.** Firebase console → Firestore → Rules (or diff
   the published ruleset). Look for `match /followers`, `match /mutes`, `match /followRequests`.
2. **Both social composite indexes are Enabled** (not "Building"): `reports (status ASC, createdAt DESC)`
   and `conversations (participants ARRAY_CONTAINS, lastMessageAt DESC)`. Firebase console → Firestore →
   Indexes.
3. **Which Cloud Functions are actually deployed.** The handoff ❓-flags this (`ZENKI_APP_HANDOFF.md:93`).
   Specifically confirm `banUser`, `deletePostCascade`, `redactDmMessages`, `notifyOnReport` are live —
   if not, admin ban / remove-content / DM-redaction fail (see §2 F6).

Fastest empirical check: run the app signed in as a normal member, open the JS console, and exercise
follow / open DMs / mute. A `permission-denied` or `failed-precondition` in the log settles (1)/(2)
instantly; clean logs confirm the rules/indexes are live and point you at §2.

---

## 2. REAL DEFECTS — present regardless of deploy state (the actionable audit)

These do **not** depend on any rules/index deploy; they are in the client/functions code as written and
were each confirmed against the source. Ordered by impact.

### F1 — Private-account "Requested" never persists — `firebaseFollow.ts:147` (P2, confirmed)
`hasRequestedFollow(targetId)` does `getDoc(followRequests/{targetId}/requests/{uid})` **as the
requester**, but the live rule (`firestore.rules:361`) grants read only to the target
(`allow read: if isOwner(targetUid)`). The requester is always permission-denied; the caller
(`UserProfileScreen.tsx:119`) swallows it via `.catch(() => false)`. After any remount the button reverts
from "Requested" to "Follow", the user re-taps, and the withdraw UI is unreachable.
**Fix:** mirror the outbound request under a requester-owned path the requester can read (e.g.
`following/{uid}/requestsOut/{targetId}`), or add a rule granting the requester read of their own request.

### F2 — `Remove & Block` closes a report even when the delete failed — `firebaseModeration.ts:409` (P2, confirmed)
In `adminActionReport('removeAndBlock')`, a failed post-cascade / comment delete / DM redaction only sets
`deleteWarning` and continues; the code then unconditionally writes `status:'actioned'` (lines 409–413)
and returns `{ok:true}`. `AdminReportsScreen` drops the row and shows a one-time alert. `listOpenReports`
filters `status=='open'`, so the report never resurfaces — **offending content stays live and is never
re-reviewed** while the reporter is told it was handled. Apple 1.2 moderation-integrity issue.
**Fix:** only set `actioned` when the removal actually succeeded; on failure keep `open` and surface the error.

### F3 — One malformed comment crashes the entire comments list — `CommentsScreen.tsx:140` (P2, confirmed)
`item.displayName.charAt(0).toUpperCase()` with no guard; `listComments` (`firebasePosts.ts:500`) returns
`{id, ...data()}` with no defaults. A comment doc missing `displayName` → `undefined.charAt` → the whole
FlatList throws into the ErrorBoundary. `PostCard.tsx:156` already has the `safeName` guard this screen
lacks. New comments are safe (`addComment` writes a default), so this fires only on legacy/partial docs.
**Fix:** add the same `safeName` guard; also coerce `createdAt` (see F9).

### F4 — Errors are masked as benign empty states across DMs + reports — `firebaseMessages.ts:205`, `firebaseModeration.ts:313` (P2, confirmed)
Both swallow *any* listener/query error into `onUpdate([])` / `return []`. Combined with the null-uid
early return (`firebaseMessages.ts:173`), a not-ready auth session or a transient failure renders as an
empty/stuck inbox or an "All clear" report queue — **indistinguishable from genuinely empty**. The
`permError` diagnostic branch in `AdminReportsScreen` is dead code (`setPermError(true)` is never called).
This is *why* social failures are hard to diagnose and why the audit itself couldn't tell "empty" from
"denied." **Fix:** distinguish empty from failed; show a retry/diagnostic; wire or remove `permError`.

### F5 — Inbox can hang on the spinner if auth isn't ready at mount — `MessagesListScreen.tsx:30` (P3, confirmed)
`subscribeToInbox` returns a no-op when `getCurrentUid()` is null (`firebaseMessages.ts:173`); it never
calls `onUpdate`, so `loading` never clears, and the effect's `[]` deps never re-subscribe once auth
resolves. On any mount where the Firebase session lags, DMs are stuck on "Loading…" forever. A plausible
literal cause of "messages are broken." **Fix:** re-subscribe when the uid becomes available (depend on it).

### F6 — Admin ban/remove depends on functions that may not be deployed — `AdminReportsScreen.tsx:168` (P1 if undeployed; verify)
`banUserViaFunction` → POST `…/banUser`; `Remove & Block` → `deletePostCascade`; DM redaction →
`redactDmMessages`. All are new Wave-1 functions; the handoff ❓-flags whether the latest function set is
live (`ZENKI_APP_HANDOFF.md:93`). There is **no rules fallback** (`SOCIAL_CONTRACT.md §10` deliberately
omits a per-write `banned` guard). If they 404, ban/remove/redaction silently fail — an Apple 1.2 "eject
offending users" gap. **Action:** verify deployment (§1.3); deploy if missing.

### F7 — No rate limit on report submission → report/push bomb — `functions/src/rateLimit.ts:14` (P2, confirmed)
The `Endpoint` union covers only AI/payment/invite/contact/password; `submitReport` is a bare client
`addDoc` with no throttle, and every create fires `notifyOnReport` → a push to **every** admin. A signed-in
user can loop reports to flood the queue and spam every admin device. **Fix:** rate-limit the report path
(CF or a per-user cooldown doc); ships server-side without a client build.

### F8 — `blockedByIds` not consulted in the chat composer — `MessagesChatScreen.tsx:44` (P3, confirmed)
Composer gates only on `isBlocked` (I blocked them), not `blockedByIds` (they blocked me). When the other
party blocks you, the composer stays live and every send fails the `blockedBetween` rule with a generic
"Message not sent." **Fix:** also gate on `blockedByIds`, mirroring `MessagesListScreen`.

### F9 — Legacy comment timestamps render "Invalid Date" — `CommentsScreen.tsx:149` (P3, confirmed)
`listComments` returns `createdAt` verbatim with no `coerceCreatedAt` (contrast `getFeed`). A comment
stored with a Firestore `Timestamp` → `new Date(obj)` → Invalid Date. **Fix:** coerce in `listComments`.

### F10 — Follower/following counts can stick at 1 — `firebaseFollow.ts:180` (P3, contingent on ❓ backfill)
`getFollowerCount`/`getFollowingCount` prefer the denormalized `users.follower/followingCount`. The
`followerCounters` trigger uses `increment(±1)`, which seeds an **absent** field to ±1 (not `true±1`). If
`backfillFollowCounts` never ran (handoff ❓, `ZENKI_APP_HANDOFF.md:92`), a pre-existing user's first
post-deploy follow sets the count to 1 and it sticks. **Action:** run `backfillFollowCounts` once; verify.

### F11 — Report modal can file `targetId:'unknown'` — `MessagesChatScreen.tsx:199` (P3, confirmed)
`targetId={conversationId || 'unknown'}`; reporting a not-yet-created conversation files a report the
redaction path can never act on (`redactDmMessages` queries `conversations/unknown/messages` → 0). **Fix:**
disable "Report conversation" until the conversation exists.

### F12 — Just-created post not visible until manual pull-to-refresh — `CommunityScreen.tsx:120` (P3, confirmed)
Feed loads only on mount + user-id change; no `useFocusEffect`. After posting and `goBack()`, the new post
isn't shown → reads as "my post didn't save." **Fix:** refetch (or prepend the new post) on focus.

### Lower-value confirmed items (P3)
- `UserProfileScreen.tsx:153` — `handleFollow` has no try/catch; a rejected write is an unhandled rejection
  with no user feedback (a safety net that would have surfaced any real permission error).
- `UserProfileScreen.tsx:239` — Posts stat shows `posts.length` capped at `getUserPosts(max=30)`; >30-post
  members always read "30".
- `UserProfileScreen.tsx:23` — `const { userId } = route.params` unguarded (all current callers pass it;
  latent crash on any param-less entry / deep link).
- `UserProfileScreen.tsx:91` — `loadProfile` sets state after awaits with no cancelled-guard (unmount warning
  + last-writer race on fast userId change).
- `NotificationsScreen.tsx:26` — full screen component that is not exported, not registered, never navigated
  → dead code; any `navigate('Notifications')` no-ops.
- `RootNavigator.tsx:84` — no `RootStackParamList` / typed navigator generics; every screen is
  `{navigation,route}:any`, so route-name/param typos are invisible to typecheck (the reason wiring bugs
  slip the build gate).
- `firebasePosts.ts:206/220` — like-state hydrated with N per-post `getDoc`s instead of the single batched
  `documentId() in […]` read `SOCIAL_CONTRACT §5 B1` mandates (N+1 read cost per feed page; correctness OK).

### Compliance (by design, not a regression)
- `contentFilter.ts` does not exist and `assertCleanText`/`screenText` are never called — proactive UGC
  filtering was **intentionally removed** (`SOCIAL_CONTRACT §8`; small adults-only club; safety rests on
  Report + Block + Mute + ≤24h admin review + EULA). Fine as designed **provided** those pillars work —
  which makes F2/F4/F6 (moderation integrity) compliance-relevant, not just bugs. Re-addable if App Review
  demands proactive filtering.

---

## 3. WAS-P0/P1 — conditional on the 06-08 deploy NOT having happened

If §1 verification shows the live ruleset/indexes are the pre-06-08 baseline, these become live blockers.
Otherwise they are already remediated. Listed for completeness (audit ids in parentheses).

- **Follow/unfollow/accept batch** (`firebaseFollow.ts:98`) — atomic batch to `/followers` + `/followRequests`.
  Denied only if those matches aren't live. Live rule exists at `firestore.rules:343/360`. → deploy `firestore.rules`.
- **Mute** (`CommentsScreen.tsx:114` + `firestore.rules:371`) — denied only if `/mutes` match isn't live.
- **DM inbox index** (`firebaseMessages.ts:179` + `firestore.indexes.json:44`) — empty only if the
  `conversations` composite index isn't live.
- **Admin report queue index** (`firebaseModeration.ts:309` + `firestore.indexes.json:36`) — "All clear"
  only if the `reports` composite index isn't live.
- **Legacy posts excluded from feed** (`firebasePosts.ts:299`) — `authorIsPrivate=='false'` skips field-less
  docs; **already healed 19/19 by `backfillPostPrivacy`** per handoff. Only re-fires for any un-backfilled data.

---

## 4. REPAIR PLAN

**Step 0 — verify prod state (§1).** Do this first; it decides whether §3 is empty or urgent. No code needed.

**Deploy-side (no client build; safe once verified):**
- If §3 is live (06-08 didn't ship): `firebase deploy --only firestore` (rules + indexes together), then run
  `backfillPostPrivacy`. **Caution:** deploying `firestore.rules` also ships `ff9c3d8`'s `member:`/`employeeTasks`
  denials — per the session gate, only safe once build 48 dominates. If you must fix social rules before 48 is
  live and 48 isn't dominant, deploy a rules revision WITHOUT the `ff9c3d8` deltas.
- Run `backfillFollowCounts` once (F10) before relying on counts; confirm it hasn't already run.
- Verify/deploy `banUser`, `deletePostCascade`, `redactDmMessages`, `notifyOnReport` (F6). Remember: no
  predeploy hook — `git pull` + `npm --prefix functions run build` first.
- Rate-limit the report path server-side (F7).

**Client fixes (next build, 2.0.4 — bump app.json + Info.plist, not just buildNumber):**
- F1 requester-readable follow-request mirror; F2 gate `actioned` on real delete success; F3 `safeName`
  + F9 `createdAt` coercion in comments; F4 stop masking errors + wire/remove `permError`; F5 re-subscribe
  inbox on auth-ready; F8 `blockedByIds` composer gate; F11 disable report until conversation exists;
  F12 focus-refetch feed; plus the P3 cluster (profile guards, follow try/catch, nav ParamList typing,
  post-count query, dead `NotificationsScreen`, batched like-read).

**Recommended order:** §1 verify → (deploy-side only if §3 live) → F2/F4/F6/F7 moderation-integrity (compliance)
→ F1/F3/F5/F8 core UX → P3 polish.

---

## 5. WHAT I COULD NOT VERIFY (needs live Firebase)
- The actually-published ruleset + index build state (§1.1/§1.2).
- The live Cloud Function list (§1.3 / F6).
- Whether `backfillFollowCounts` ran (F10) and whether any un-backfilled posts/comments exist (F3).
- The concrete user-reported "broken" behavior — no repro was provided; with rules/indexes live, no single
  confirmed defect is a clean "entire section down for everyone," so a repro + console log is the fastest
  path to the specific failure.
