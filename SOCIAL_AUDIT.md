# SOCIAL_AUDIT.md — Zenki-App Social Section Audit (Phase A)

> **Status:** Phase A complete (read-only). No code changed. This document is the source of truth for Phase B.
> **Method:** 5 parallel read-only subagents, one per track (A1 functionality+hallucinations, A2 security/rules, A3 Apple UGC, A4 perf/cost, A5 data integrity). Every finding cites a real `file:line`. The lead (this session) independently re-verified the cross-cutting linchpins by direct grep before promoting them to P0.
> **Branch audited:** `claude/modest-germain-68010e` (worktree). **Date:** 2026-06-02.

## Wave 1 outcome (build status)

All **12 P0s** plus the Apple UGC additions (content filter, report-comments, mute, EULA, admin ban, ≤24h notify) were implemented on `feature/social-upgrade` and code-reviewed by a fresh-context adversarial agent (4 findings raised, all fixed). `npm run typecheck` and the functions build pass; the content filter has a runtime test. New data model + decisions are in [SOCIAL_CONTRACT.md](SOCIAL_CONTRACT.md); the PR carries the per-subsystem change summary, the Apple UGC checklist, and the device-only manual checklist. **Wave 2** (ranked feed, reactions, hashtags, group chats, leaderboards, notifications parity, multi-image/drafts, the remaining P1/P2s) is deferred per the approved plan. Two deploy steps are required: run the `backfillPostPrivacy` function once, and deploy `firestore.rules` + `firestore.indexes.json` + functions.

## Honesty caveats (read first)

1. **"Broken in production" vs "broken in repo."** Several P0s say a feature is silently denied because the client writes to a collection that `firestore.rules` doesn't cover. These are **confirmed in the repo**: the client uses `conversations`/`followers`/`followRequests`, and `firestore.rules` has no match block for them (verified by grep — see below). `firebase.json:16` confirms the committed `firestore.rules` is the deploy source, so the committed file is authoritative **unless someone hand-edited the Firebase console**. The single remaining uncertainty — does the *deployed* ruleset match the repo? — is resolvable with one check (emulator or a two-account smoke test). Items needing that confirmation are tagged **[confirm: deployed-rules]**.
2. **Two findings are genuinely runtime-only** and tagged **[confirm: runtime]**: post-media cross-user readability (download-token behavior) and `unreadFor` accuracy under concurrent send/open.
3. Findings tagged **Confirmed** were observed directly in code. **Suspected** means the static evidence is real but the user-facing outcome needs the named test.

### Lead re-verification (grep evidence for the linchpins)
```
firestore.rules match blocks present: /members(47) /posts(77) /threads(110) /follows(133)
  /following/.../follows(146) /blocks(205) /reports(214)
  → NO /conversations, NO /followers, NO /followRequests
firestore.rules:48   match /members → allow read: if isSignedIn()   (world-readable)
firebaseMessages.ts:55,81,92,104,115,130,157 → collection/doc(db,'conversations',…)
firebaseFollow.ts:36,57 → 'followRequests';  :41,50,59 → 'followers';  :40,58 → 'following'
firebaseStorage.ts:60 → `users/${uid}/posts/${Date.now()}.${ext}` (owner-only path)
deleteAccount.ts:107,110 → 'follows';  :130 → 'pushTokens';  :151 → 'threads'  (all dead schema)
firebase.json:16 → "rules": "firestore.rules"  (committed file is the deploy source)
```

---

## 1. Synthesis — five root-cause themes

The 22 P0/P1 findings collapse into five themes. Fixing the theme fixes the cluster.

**THEME 1 — Schema drift: client ↔ rules ↔ Cloud Functions disagree on collection names.** The single highest-impact root cause. The live client reads/writes `conversations`, `followers/{uid}/followers`, and `followRequests/{uid}/requests`. `firestore.rules` covers none of them (→ default-deny). The `deleteAccount` and `adminActionReport` Cloud Functions operate on the *old* `follows`/`threads`/`pushTokens` schema. This one mismatch silently breaks **DMs, follower counts, follow requests, private-account approval, account-deletion cascade, DM redaction-on-delete, and message-report removal**. Found independently by A1, A2, A4, and A5.

**THEME 2 — Security rules too permissive / privacy enforced only client-side.** `/members` (full PII + Expo push tokens) is world-readable to any signed-in user. Private accounts aren't enforced at the rules layer (anyone can read a private user's posts/profile/graph). The `likes` counter is writable to an arbitrary value by anyone. Blocking is a client-side array filter with no server enforcement. Write paths don't validate document shape.

**THEME 3 — Apple UGC (Guideline 1.2) gaps.** No proactive content filtering (text or image). No objectionable-content EULA accepted at sign-up. Comments are un-reportable *and* reported comments can't be deleted (wrong path). No admin ability to globally eject/ban a user. These are direct rejection triggers.

**THEME 4 — Performance & cost: unbounded/O(n)/N+1 on hot paths.** Feed: no cursor pagination + a per-post like-read N+1 + refetch on every tab focus (~100 reads/open). Profile: follower/following counts read the *entire* subcollection (O(n) reads per view). Inbox: N+1 profile fetch on *every* snapshot delivery. No media compression. ~5,400 reads/active-user/day, dominated by profile fan-out.

**THEME 5 — Data integrity: orphans, drift, and non-atomic writes.** `deleteAccount` orphans nearly all user data (wrong schema). `deletePost` orphans likes/comments subcollections + Storage media. Like/unlike and follow/unfollow are non-atomic with no below-zero floor → counters drift. Dead gamification counters (`followersCount` always 0) are a false second source of truth.

---

## 2. Master prioritized findings (deduplicated, cross-track)

### P0 — must fix (12 unique)

| # | Title | Root cause / evidence | Tracks | Confidence | Phase-B owner |
|---|-------|-----------------------|--------|-----------|---------------|
| **P0-1** | **Schema drift breaks DMs, follower counts & follow requests** | Client uses `conversations`/`followers/**`/`followRequests/**`; `firestore.rules` covers none → default-deny. `firebaseMessages.ts:55+`, `firebaseFollow.ts:36,41,57,59`, `firestore.rules` (absent) | A1,A2,A4,A5 | Confirmed (repo) **[confirm: deployed-rules]** | Lead (rules) + B3 (msg client) + B4 (follow client) |
| **P0-2** | **`/members` world-readable → mass PII + push-token leak** | `firestore.rules:48 allow read: if isSignedIn()`; member doc holds email/phone/pushToken/hourlyRate/injuries (`data/members.ts:22-53`); `fetchAllPushTokens` already scrapes it (`pushNotifications.ts:88`) | A2 | Confirmed | Lead (rules) + B5 (token relocation) |
| **P0-3** | **Private accounts not enforced at rules layer** | `posts`/`users`/`following` reads are `if isSignedIn()`; no rule references `isPrivate` or `followRequests`. `getUserPosts` is an unconditional `where userId==` (`firebasePosts.ts:182`) | A2,A1 | Confirmed | Lead (rules) + B4 |
| **P0-4** | **Post `likes` counter tamperable to any value** | `firestore.rules:85` allows any signer to update a post if only `likes` changes — no delta/value check; `updateDoc(post,{likes:9999999})` succeeds | A2 | Confirmed | Lead (rules) |
| **P0-5** | **Post media uploaded to owner-only Storage path** | `firebaseStorage.ts:60` → `users/{uid}/posts/…`; `storage.rules:13` read only if `auth.uid==uid`. Cross-user feed media survives only via the `getDownloadURL` token | A1,A2,A4 | Suspected **[confirm: runtime]** | Lead (storage.rules) + B1 (upload path) |
| **P0-6** | **No content filtering (text + image/video)** — Apple 1.2 | `createPost`/`createTextPost`/`addComment`/`sendMessage` write raw text; no profanity list, no image moderation anywhere | A3 | Confirmed | Lead/B6 (CF hook) + B1/B2/B3 (call sites) |
| **P0-7** | **No objectionable-content EULA accepted at sign-up** — Apple 1.2 | Real signup path `OnboardingScreen.tsx` has only a liability waiver; the ToS checkbox lives in an unrouted stub `SignUpScreen.tsx:36,129` with dead links | A3 | Confirmed | B6/Lead (+ auth screen owner) |
| **P0-8** | **Feed: no pagination + per-post like N+1 + refetch on every focus** | `firebasePosts.getFeed` `limit(50)` one-shot, `safeIsLiked` per post (`:137,172`), `CommunityScreen.tsx:54,60` loads on mount *and* focus; `startAfter` never imported | A4,A1 | Confirmed | B1 |
| **P0-9** | **Inbox listener does N+1 profile fetch on every snapshot** | `MessagesListScreen.tsx:29-39` `Promise.all(map(fetchUserProfile))` re-runs per `onSnapshot`; inbox query has no `limit` (`firebaseMessages.ts:130`) | A4 | Confirmed | B3 |
| **P0-10** | **`deleteAccount` wrong schema → orphans follow graph, DMs, push token, member doc** — Apple 5.1.1(v)+GDPR | `deleteAccount.ts:107,110,130,151` target `follows`/`pushTokens`/`threads`; never touches `following`/`followers`/`conversations`/`members` | A5,A2 | Confirmed | Lead (CF) |
| **P0-11** | **`deletePost` orphans likes/comments subcollections + Storage media** | `firebasePosts.ts:219` shallow `deleteDoc`; Firestore doesn't cascade subcollections; no `deleteObject` | A5 | Confirmed | Lead/B6 (CF) |
| **P0-12** | **Block doesn't hide blocked user's comments (or likes)** | `CommentsScreen` maps `listComments` with no block filter; `filterBlocked` only covers posts+conversations (`BlocksContext.tsx:74`). Server side has no block enforcement | A5,A2,A3 | Confirmed | B2 (comments) + Lead (rules) |

### P1 — should fix (21 unique)

| # | Title | Evidence | Tracks | Owner |
|---|-------|----------|--------|-------|
| P1-1 | Like/unlike non-atomic + no below-zero floor → counter drift | `firebasePosts.ts:197-207` two awaits, `increment(-1)` unclamped | A1,A5 | B1 |
| P1-2 | `getFollowerCount`/`getFollowingCount` read entire subcollection (O(n)/view) | `firebaseFollow.ts:72,78` `getDocs`→`.size`; `getCountFromServer` used nowhere | A4 | B4 |
| P1-3 | `getUserPosts` unbounded (no `limit`) + un-virtualized grid | `firebasePosts.ts:182`; `UserProfileScreen.tsx:341` `.map` in ScrollView | A4 | B4 |
| P1-4 | User search downloads 100 docs, client-filters, silently breaks past #100 | `firebaseUsers.ts:14-44`, `UserSearchScreen.tsx:25-37` | A4 | B4 |
| P1-5 | `listOpenReports` unbounded + **missing composite index** (`status`+`createdAt`) | `firebaseModeration.ts:165-178`; `firestore.indexes.json` lacks it | A4 | Lead (index) + B6 |
| P1-6 | Media uploaded with no compression/transcode (bandwidth/$) | `firebaseStorage.ts:48-69`; only picker `quality:0.85` | A4 | B1 |
| P1-7 | `/members` create/update lets user self-claim `isAdmin`/`hourlyRate` + email-claim | `firestore.rules:49,63` no shape guard | A2 | Lead (rules) |
| P1-8 | Blocking enforced only client-side (blocked user can still read/DM blocker) | `BlocksContext.tsx:74`; no rule references blocks for reads/messages | A2 | Lead (rules) + B6 |
| P1-9 | `posts`/`comments` create rules don't validate shape (spoof `displayName`/`createdAt`) | `firestore.rules:79,102`; `createdAt` is client ISO string | A2 | Lead (rules) |
| P1-10 | Reported comments can't be removed (admin targets flat `comments/{id}`) | `adminActionReport.ts:131-137` vs real `posts/{id}/comments/{id}` | A3,A5 | Lead/B6 + B2 |
| P1-11 | No report path on comments (whole UGC surface unreportable) | `CommentsScreen.tsx:70-87` no menu/ReportModal | A3 | B2 |
| P1-12 | No admin ability to eject/ban a user globally | `adminActionReport.ts:170` blocks only for the one reporter; no disable/ban | A3 | Lead/B6 |
| P1-13 | NotificationsScreen has **zero** social notifications | `NotificationsScreen.tsx:34-103` only appts/announcements/celebration/streak | A1 | B5 |
| P1-14 | `unreadFor` blind-zero reset can mask genuinely-unread messages | `MessagesChatScreen.tsx:94`→`markConversationRead` sets 0; non-atomic send | A5 | B3 **[confirm: runtime]** |
| P1-15 | Gamification `followersCount`/`likesReceived` dead (always 0; false 2nd source) | `GamificationContext.tsx:345,465` defined, never called | A5 | B4 |
| P1-16 | `PrivacyContext` unmounted dead code (no feed-visibility/DM-opt-out enforced) | not in `App.tsx` provider tree; zero consumers | A1 | B4/Lead (decide: wire or delete) |
| P1-17 | `unreadCount` helper unused → no global unread badge | `firebaseMessages.ts:194` no importers | A1 | B3 |
| P1-18 | Legacy `/follows` rules + `deleteAccount` follow-cleanup target dead collection | `firestore.rules:133`; `deleteAccount.ts:106-111` | A2,A5 | Lead |
| P1-19 | `conversations` message rules absent → latent spoof risk on the fix (participants/unreadFor) | `firestore.rules:118` only under dead `threads` | A2 | Lead (rules) |
| P1-20 | DM redaction & message-report removal target dead `threads` → never touch real data | `deleteAccount.ts:151`, `adminActionReport.ts:146` | A2,A5 | Lead |
| P1-21 | Policy docs lack a zero-tolerance objectionable-content clause | `PRIVACY_POLICY.md:39-40`; `SUPPORT.md` mechanics only | A3 | B6/docs |

### P2 — nice to have / hygiene (14)

global non-realtime feed (A1) · no `commentCount` surfaced + stale docstring (A1) · `/users` enumerable + full-directory scraping (A2) · `if false` paths are intentional, not broken — inventory (A2) · **stray `firestore.rules` in "Simulator Screenshot" folder: NOT FOUND in this worktree** (A2) · no dedicated public post/chat media Storage path (A2) · `listComments` capped 100, no pagination (A4) · `getFeed` followed-path over-fetches then slices (A4) · no stated ≤24h SLA / new-report alerting (A3) · no mute (A3) · non-atomic follow edges (A5) · broken comment moderation + no `commentCount` (A5) · Senpai `get_user_stats` has **no** social fields — divergence hypothesis closed (A5) · **positive: block/report/comment-add/post-create all persist correctly** (A1).

---

## 3. Per-track detailed findings

### A1 — Functionality & Hallucinations

**Scope:** all 7 social services, 9 social screens, `BlocksContext`, `PrivacyContext`, `PostCard`, `ReportModal`, `App.tsx`, rules, storage.rules.

- **[P0] DMs write `/conversations` but rules only define `/threads` → messaging fully denied.** `firebaseMessages.ts:55,92` vs `firestore.rules:110`. `sendMessage` rejects (draft restored); `subscribeToInbox` `onSnapshot` errors with no error callback → inbox stuck "Loading…". Fix: add a `conversations` rule block mirroring `threads`. *Confirmed (repo).*
- **[P0] Follower graph/counts write `/followers/**` (no rule) → counts read 0 and can blank the profile.** `firebaseFollow.ts:41,72`. `getFollowerCount` read is unguarded inside `loadProfile`'s `Promise.all` (`UserProfileScreen.tsx:77`) → a denied read rejects the whole profile load. Optimistic `setFollowers(p=>p+1)` (`:106`) never reconciles. Fix: add `followers` rule + try/catch the counts. *Confirmed.*
- **[P0] Follow-requests write `/followRequests/**` (no rule) + `acceptFollowRequest` has no caller.** `firebaseFollow.ts:36,53`; zero approval UI exists. "Request Sent — Waiting for approval" is a lie. Fix: add rule + build a follow-request inbox calling `acceptFollowRequest`. *Confirmed.*
- **[P0] Post media uploaded to owner-only Storage path.** `firebaseStorage.ts:60`, `storage.rules:13`. Cross-user feed media works only if the stored `getDownloadURL` token survives. Fix: dedicated public `postMedia/{uid}` namespace. *Suspected — test: sign in as B, open A's photo post.*
- **[P1] Like count is a denormalized field never reconciled.** `firebasePosts.ts:197-207`, count shown is `post.likes` (`PostCard.tsx:223`). Drifts on partial failure/concurrent like. Fix: transaction + idempotency.
- **[P1] `PrivacyContext` is dead code** — not mounted in `App.tsx`, zero consumers; `messagingEnabled`/`isVisibleInFeed` never enforced. Fix: wire + enforce, or delete.
- **[P1] `unreadCount` helper unused** (`firebaseMessages.ts:194`) → no app-wide unread badge.
- **[P1] NotificationsScreen shows zero social notifications** (`:34-103`). No likes/comments/follows/DMs surfaced; no persisted notifications collection.
- **[P2]** Feed is global, non-paginated, non-realtime; `startAfter` not even imported (`:130`).
- **[P2]** No `commentCount` shown; "View all comments" in the docstring doesn't exist (`PostCard.tsx:226`).
- **[P2] Positive confirmation:** block, report, comment-add, and post-create (with `getDocFromServer` server-confirm, `firebasePosts.ts:46`) all persist correctly and survive reload.

**A1 summary:** 4 P0, 4 P1, 3 P2. Biggest risk = the three rules collection-mismatches (DMs, follower counts, follow requests are silently non-functional and the UI shows confirmations the backend rejects).

### A2 — Security & Privacy

**Scope:** all 315 lines of `firestore.rules`, `storage.rules`, `firestore.indexes.json`, the social services, `functions/index.ts`/`deleteAccount.ts`/`adminActionReport.ts`, `members.ts`.

- **[P0] `/members` world-readable → PII + push-token leak.** `firestore.rules:48`. One `getDocs(collection(db,'members'))` exfiltrates every member's email, phone, Expo push token (→ send arbitrary push via public Expo API), `hourlyRate`, biological sex, injuries. Fix: restrict read to owner+admin; serve public fields from `/users`; move push tokens to an admin-only `pushTokens/{uid}`. *Confirmed.*
- **[P0] DM `conversations` vs `threads` mismatch** (see P0-1). Also: when the fix is written, a naive `conversations` update rule would let a participant overwrite `participants` or the other side's `unreadFor` — must use a key allowlist. *Confirmed.*
- **[P0] Private accounts unenforced at rules layer.** `firestore.rules:31,78,147` all `if isSignedIn()`; no rule references `isPrivate`/`followRequests`/`followers`. Non-follower reads private posts via `getUserPosts`. Fix: gate post reads on poster-privacy + approved-follower membership. *Confirmed.*
- **[P0] Anyone can set any post's `likes` to an arbitrary value.** `firestore.rules:85` checks *which* key changes, not the value/delta. Fix: constrain `likes == resource.data.likes ± 1` or move to CF. *Confirmed.*
- **[P1] `/members` create/update** lets a user self-provision `isAdmin:true`/`hourlyRate`, or claim any un-stamped doc by email match. `firestore.rules:49,63`. Fix: forbid client-set privileged fields; immutable `firebaseUid`.
- **[P1] Blocking enforced only client-side** (`BlocksContext.tsx:74`); blocked user can still read the blocker's posts/profile and (post-fix) DM them. Fix: a rules-readable `blockedBy/{target}/by/{blocker}` mirror; deny message create when blocked.
- **[P1]** `conversations` message rules absent (latent spoof on fix); `threads` message `update/delete` undefined; redaction targets dead `threads`.
- **[P1]** Legacy `/follows` + `deleteAccount` follow-cleanup target a dead collection → orphaned edges on deletion.
- **[P1]** `posts`/`comments` create rules don't validate shape → spoofed `displayName`/`avatar`/back-dated `createdAt` (feed ranks by `createdAt`).
- **[P2]** `/users` `if isSignedIn()` enumerable + `getAllUsers`/`getAllMembers` enable full-directory scraping.
- **[P2]** `if false` paths (`aiRateLimits`, `waivers`, `supportMessages`, `attendance`, `taskCompletions`, `orders`) are **intentional** (server/admin path exists) — not the broken ones; the broken ones are the *missing* rules.
- **[P2] Stray `firestore.rules` in a "Simulator Screenshot" folder: searched `git ls-files`, `rev-list --all`, `find -ipath` — NOT present on this branch.** May exist on another branch/machine.
- **[P2]** Storage rules sound but no public post-media / participant chat-media path (compounds P0-5).

**A2 summary:** 4 P0, 6 P1, 4 P2. Most dangerous = `/members` world-read PII+token leak. Full rules inventory in Appendix A.

### A3 — Safety & Apple UGC Compliance

**Scope:** moderation service, `ReportModal`/`PostCard`, all report/block surfaces, auth/onboarding screens, `adminActionReport`/`deleteAccount`, `PRIVACY_POLICY.md`, `SUPPORT.md`.

- **[P0] No content filtering at create time (text or image/video).** `firebasePosts.ts:25,59,251`, `sendMessage`. No profanity list, no image moderation (grep nsfw/vision/rekognition/safesearch = none). The single most common 1.2 rejection trigger. Fix: client banned-word filter for caption/text/comment/DM/bio + a Cloud Function with a blocklist and an image-moderation API on upload. *Confirmed.*
- **[P0] No objectionable-content EULA accepted on the real sign-up path.** `OnboardingScreen.tsx` has only a liability waiver; the only ToS checkbox is in the unrouted stub `SignUpScreen.tsx:36,129` with dead links. Fix: enforced EULA acceptance (zero-tolerance clause) at onboarding and/or before first post; persist `acceptedTermsAt`. *Confirmed.*
- **[P1] Reported comments can't be removed** — `adminActionReport.ts:129-137` deletes flat `comments/{id}`; real comments are `posts/{postId}/comments/{id}`. Fix: include `postId` in the report payload.
- **[P1] No report path on comments** — `CommentsScreen.tsx:70-87` has no menu/ReportModal though `targetType:'comment'` exists.
- **[P1] No admin ability to eject/ban a user** — `removeAndBlock` blocks only for the one reporter (`adminActionReport.ts:170`); `deleteAccount` is self-service only. Fix: admin "Ban" CF (disable Auth user / `banned` claim) enforced in rules.
- **[P1] Policy docs lack a zero-tolerance clause** (`PRIVACY_POLICY.md:39-40`).
- **[P2]** No stated ≤24h SLA or new-report alerting (queue is manual-poll).
- **[P2]** No mute (grep returns only theme `textMuted` + media `.muted`).

**What's solid:** report (posts/users/DMs), block (reachable from post/profile/DM in ≤2 taps, hides feed/profile/messages), routed admin triage queue with Dismiss / Remove & Block, rules gate reports to admins and blocks to owner-or-admin.

**A3 summary:** 2 P0, 5 P1, 2 P2. Top rejection risk = zero content filtering + no EULA. Full Apple checklist in Appendix D.

### A4 — Performance & Cost

**Scope:** all social services + screens, `firestore.indexes.json`, `firestore.rules`.

- **[P0] Feed: non-paginated `limit(50)` + per-post like N+1, refetched on every focus.** `firebasePosts.ts:130-179`, `CommunityScreen.tsx:54,60`. ~101 reads per feed open (1 + 50 posts + 50 like-docs), re-fired on every tab revisit; no infinite scroll; `startAfter` never imported. Followed-path over-fetches `limit(50)` per 30-id batch then slices. Fix: cursor pagination, batched/lazy like-state, refresh on pull-only.
- **[P0] Messaging targets `conversations/*` but rules only define `threads/*`** → every op default-denied (see P0-1).
- **[P0] Inbox `onSnapshot` does N+1 profile fetch on every snapshot delivery.** `MessagesListScreen.tsx:29-39`, uncapped query (`firebaseMessages.ts:130`). C profile reads per event. Fix: memoize/denormalize `otherUserName/Avatar` onto the conversation doc; `orderBy(lastMessageAt)+limit`.
- **[P1] `getFollowerCount`/`getFollowingCount` read the entire subcollection** (`firebaseFollow.ts:72,78`) — O(followers+following) reads per profile view; a 5k-follower profile = 5k reads/visit. Fix: `getCountFromServer` or denormalized `increment()` counters.
- **[P1] `getUserPosts` unbounded** (`firebasePosts.ts:182`) + un-virtualized grid. Fix: `limit(30)` + FlatList paginate (the `userId`+`createdAt` index already exists).
- **[P1] User search reads 100 user docs/open, client-filters, breaks past #100** (`firebaseUsers.ts:14-44`). Fix: server prefix search on a normalized lowercase field.
- **[P1] `listOpenReports` unbounded + missing composite index** `status`+`createdAt` (`firebaseModeration.ts:168`). Throws `failed-precondition` until the index is added.
- **[P1] No image/video compression/transcode** (`firebaseStorage.ts:48-69`) — biggest $ lever (4K 60s video uploaded full-size, downloaded by every viewer).
- **[P2]** `listComments` capped 100, no pagination; `getFeed` over-fetch-then-slice.

**Read/write estimate** (Appendix C): ~5,400 reads + ~75 writes per active user/day, dominated by profile follower-count fan-out and the feed like N+1.

**A4 summary:** 4 P0, 5 P1, 2 P2. Worst offender = follower/following counters reading whole subcollections, tied with the feed like-state N+1 on the hottest path. `startAfter` and `getCountFromServer` are used nowhere in the codebase.

### A5 — Data Integrity

**Scope:** all social services, `deleteAccount`/`adminActionReport`/`senpaiChat` CFs, `senpaiChat`/`useSenpaiChat` clients, profile/feed/comments/messages screens, `GamificationContext`, `gamification.ts`, rules.

- **[P0] `deleteAccount` operates on the wrong schema → orphans nearly all user data.** `deleteAccount.ts:101-186`: deletes flat `follows` (real data is `following`/`followers` subcollections), `threads` (real is `conversations`), flat `pushTokens` (real is a `pushToken` field on `members`), and **never deletes the `members/{uid}` doc**. A deleted user keeps their follow graph, sent DMs (visible in others' inboxes), push token, and a world-readable member profile. Apple 5.1.1(v) + GDPR failure, returned as `{ok:true}`. Fix: rewrite against real schema as a CF with `recursiveDelete`. *Confirmed.*
- **[P0] `deletePost` orphans likes/comments subcollections + Storage media.** `firebasePosts.ts:219` shallow delete; both admin paths call it. Fix: CF `recursiveDelete` + `bucket.file().delete()`.
- **[P0] Block doesn't hide blocked user's comments or likes.** `CommentsScreen` has no block filter; `filterBlocked` covers only posts+conversations. Blocked user's comments stay visible; their likes still inflate counts. Fix: filter `listComments` through `filterBlocked`; server-side block enforcement.
- **[P0] `followers`/`followRequests`/`conversations` writes denied by rules** → follower count diverges (Following right, Followers stuck at 0 because the mirror write is rejected while the `following` write succeeds — non-atomic two-await `followUser`). (See P0-1.) *Suspected [confirm: deployed-rules] — two-account follow+DM smoke test.*
- **[P1] Like/unlike non-atomic + no below-zero floor.** `firebasePosts.ts:193-207`. Double-tap double-increments; unlike-twice drives `likes` negative (hidden by `>0` render but stored corrupt). Fix: `runTransaction` gated on like-doc existence; clamp `Math.max(0,…)`.
- **[P1] `unreadFor` blind-reset to 0 on every snapshot** can mask unread; non-atomic send (`addDoc` then conversation update). `MessagesChatScreen.tsx:94`, `firebaseMessages.ts:103-118`. *Suspected [confirm: runtime] — concurrent send/open test.*
- **[P1] Gamification `followersCount`/`likesReceived` are dead state (always 0).** `GamificationContext.tsx:345,465` defined but never called; AsyncStorage-only, per-device. The "followers" achievement can never unlock; any UI bound to it shows 0 vs the profile's real count. Fix: wire to follow/like sites + hydrate, or delete.
- **[P2]** Non-atomic follow edges (`firebaseFollow.ts:40-60`, no `writeBatch`).
- **[P2]** Broken comment moderation (wrong path) + no `commentCount`.
- **[P2]** Senpai `get_user_stats` has **no** social fields (`senpaiChat.ts:550-567`) — the "12 followers here vs there" divergence does **not** exist via Senpai; hypothesis closed. (Don't add followers to `get_user_stats` later without reading the same `getFollowerCount` source.)

**Cascade matrix** in Appendix B.

**A5 summary:** 4 P0, 3 P1, 2 P2. Worst hole = `deleteAccount` schema mismatch (silent, plausible-looking, Apple + GDPR exposure).

---

## 4. Appendices

### Appendix A — Firestore rules inventory (current)
`/users/{uid}` read `isSignedIn`; write `isOwner`. · `/members/{id}` **read `isSignedIn` (LEAK)**; create/update admin-or-self(+email-claim); delete admin. · `/posts/{id}` read `isSignedIn`; create self; **update owner OR any signer changing only `likes` (unvalidated delta)**; delete owner/admin. · `/posts/{id}/likes/{uid}` read `isSignedIn`; write owner. · `/posts/{id}/comments/{id}` read `isSignedIn`; create self; update/delete author. · `/threads/**` participant-gated **(DEAD — client uses `conversations`)**. · `/follows/{id}` **(legacy/unused)**. · `/following/{u}/follows/{f}` read `isSignedIn`; write owner. · **`/followers/**` — NO RULE (default-deny)**. · **`/followRequests/**` — NO RULE**. · **`/conversations/**` — NO RULE**. · `/blocks/{uid}/blocked/{id}` owner/admin (target can't see who blocked them → no server block enforcement). · `/reports/{id}` read admin; create self **with shape validation**; update admin; delete false. · `/admins/{uid}` admin/owner read; admin write. · plus schedule/announcements/appointments/employeeTasks/taskCompletions/orders/waivers/supportMessages/aiRateLimits/inviteCodes (mostly admin-gated or intentional `if false`). · `/{document=**}` default-deny.

### Appendix B — Cascade matrix
| Operation | Removed | Orphaned / left behind | Atomic? |
|---|---|---|---|
| Post delete | `posts/{id}` only | `likes/*`, `comments/*`, Storage media | N |
| Block | adds `blocks/{me}/blocked/{them}` | follow edges, pending requests, blocked user's **comments visible**, their likes still counted | partial |
| Account delete | `users/{uid}`, shallow `posts where userId==uid`, aiRateLimits, attendance/waivers/support/bloodwork/dexa, Storage `users/{uid}/**` | **follow edges (wrong schema), DMs (wrong schema, un-redacted), push token (field on members), `members/{uid}` doc, likes/comments on others' posts** | partial/best-effort |
| Unfollow / accept | `following/{me}/follows/{t}` (+ intended mirror) | `followers` mirror denied by rules → dangles; counts diverge | N (2-3 awaits) |

### Appendix C — Read/write volume estimate (per action)
| Action | reads | writes | notes |
|---|---|---|---|
| Open feed (1 page) | ~101 | 0 | 1 follow-set + 50 posts + 50 like-docs; re-fires on every tab focus |
| View a profile | ~391 | 0 | 1 profile + 40 posts + 1 isFollowing + 200 followers + 150 following (O(F)) |
| Open a chat thread | ≤200 +1 | 1 | `subscribeToThread limit(200)`; `markConversationRead` |
| Send a message | ~1 | 2 | message + conversation summary; recipient inbox then re-reads C profiles |
| Like a post | 0 | 2 | like-doc + `increment` |
| Open inbox | C + C profiles, **re-paid per snapshot** | 0 | uncapped |

≈ **5,400 reads + ~75 writes / active user / day** (assumptions in A4). Heavy-follower profiles alone can be thousands of reads per view.

### Appendix D — Apple UGC compliance checklist (current state)
| Requirement | Status | Where | Needed |
|---|---|---|---|
| Content filtering (text) | **Missing** | `firebasePosts.ts:25,59,251` | Profanity/banned-word filter at publish (client + CF) |
| Content filtering (image/video) | **Missing** | `firebaseStorage.ts:30` | Image moderation API on upload |
| Report posts | **Done** | `PostCard.tsx:44`→`ReportModal`→`submitReport` | — |
| Report comments | **Missing** | `CommentsScreen.tsx:70` | Per-comment report (+ parent postId) |
| Report DMs | **Partial** | `MessagesChatScreen.tsx:74` | Reports whole thread; per-message stronger |
| Report/flag users | **Done** | `UserProfileScreen.tsx:244` | — |
| Block users | **Done** | reachable from post/profile/DM | — |
| Mute users | **Missing** | — | Optional; Apple-expected in mature social |
| EULA/terms acceptance | **Missing** | unrouted `SignUpScreen.tsx:129` | Enforced EULA at onboarding/first post |
| Admin remove content | **Partial** | `adminActionReport.ts` | Posts ok; **comments can't be deleted** (wrong path) |
| Admin eject users | **Missing** | `adminActionReport.ts:170` | Global ban CF (block only applies to reporter) |
| ≤24h review workflow | **Partial** | `AdminReportsScreen` routed + badge | No SLA, no new-report alert |

### Appendix E — Missing composite indexes
1. **`reports`: `status` ASC + `createdAt` DESC** — required by `listOpenReports`; absent → query throws.
2. (On fixing the inbox) **`conversations`: `participants` array-contains + `lastMessageAt` DESC** — needed once inbox adds `orderBy+limit`.
(Already present & sufficient: `posts` `userId`+`createdAt`. Single-field orders auto-index.)

---

*End of Phase A. Phase B build plan follows in the session message; it is also mirrored below once approved into `SOCIAL_CONTRACT.md`.*
