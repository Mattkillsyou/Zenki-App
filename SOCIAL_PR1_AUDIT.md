# SOCIAL_PR1_AUDIT.md — pre-merge adversarial re-audit of PR #1

> 4 independent passes × 3 lenses (correctness / security / integrity+hallucination), each new finding verified by a separate skeptic. 33 confirmed → **~13 distinct real issues** after dedupe. Passes 1–2 caught the headline blockers; passes 3–4 kept surfacing real *minor* issues (the 4× depth earned its keep). Most blockers/majors are **regressions introduced by this PR's own privacy/member-guard changes** — exactly what a pre-merge audit should catch.
> Pass deltas (raised/new/confirmed): P1 9/9/8 · P2 7/7/7 · P3 9/7/7 · P4 11/11/11.

## BLOCKERS (2)

### B1 — Viewing a private account you don't follow breaks the profile screen (and fails OPEN)
`src/screens/UserProfileScreen.tsx:93-106` + `src/services/firebasePosts.ts:224-234` — **regression from P0-3**.
This PR's `/posts` read rule (firestore.rules:113-118) denies a private author's posts to non-approved-followers. But `getUserPosts(userId)` queries `where('userId','==',userId)` with **no** `authorIsPrivate` filter and **no try/catch**, and `loadProfile` awaits it inside a bare `Promise.all` (no `.catch`). For a private account you don't follow, Firestore **throws permission-denied** → the whole `Promise.all` rejects → `setProfile` never runs → `profile` stays `null`. The `withErrorBoundary` wrapper doesn't catch async rejections, and with `profile===null` the gate `canSeePosts = isOwnProfile || !profile?.isPrivate || following` evaluates `!undefined === true`, so it renders a **blank, anonymous *public* profile** ("?" avatar, 0/0/0, "No posts yet") instead of "This Account is Private". On `main` this worked (posts were world-readable). Common path: tapping a private user from search/feed/DM.
**Fix:** wrap `getUserPosts` in try/catch → `[]` on denial (mirror `listComments`), and drive the private-state UI from `profile.isPrivate` (fetched fine from `/users`), not from whether posts loaded. Ideally only fetch posts when `canSeePosts`.

### B2 — Private-post privacy is bypassable: self-create the follower edge
`firestore.rules:216-219` (`/followers` create) — **defeats P0-3 entirely**.
The posts read rule trusts `isApprovedFollowerOf(author) = exists(/followers/{author}/followers/{me})`. But the `/followers` create rule's public branch is `allow create: if isOwner(followerUid)` with **no check that the target is public**. A malicious user E can directly `setDoc(/followers/{V}/followers/{E})` for **any** target V — including a private account — because E owns the `followerUid` slot. That one write makes `isApprovedFollowerOf(V)` true for E, who can then read **all** of V's private posts. The client politely routes private follows through `followRequests`, but the rules don't enforce that.
**Fix:** gate the public self-create branch on the target being public: `allow create: if (isOwner(followerUid) && get(/users/$(followedUid)).data.get('isPrivate', false) != true) || (isOwner(followedUid) && exists(/followRequests/$(followedUid)/requests/$(followerUid)))`. Same for `/following`. (Private targets then only get an edge via accept, which is already request-gated.)

## MAJORS (4)

### M1 — Denormalized follower/following counts are never initialized → permanently wrong counts
`functions/src/followerCounters.ts:26` — **regression / data integrity**.
`bump()` does `update({ field: increment(±1) })`. `increment` on an **absent** field initializes it to ±1, not `current±1`. Existing users have real `following/{uid}/follows/*` edges (those writes succeeded on main) but no `followingCount` field. The first follow/unfollow after deploy sets the count to ±1 (a user following 3 people who follows a 4th shows **1**, not 4), and `getFollowingCount` prefers the denormalized field → wrong forever.
**Fix:** one-shot admin backfill (like `backfillPostPrivacy`) seeding `followerCount`/`followingCount` from `getCountFromServer` for all users, run once after deploy.

### M2 — `memberWriteNotElevating()` blocks ALL self-edits by employees/admins
`firestore.rules:37-41, 90-98` — **regression from P1-7**.
The guard rejects any `/members` write whose **post-merge** doc has `isEmployee==true` or contains `hourlyRate`. Since `request.resource.data` on an update is the merged result, any member whose stored doc already has those fields (seed employees) fails **every** self-update — even changing an avatar/bio (`pushMemberToFirestore({...user, profilePhoto})` merge-writes the whole object). Breaks photo/bio edits and the recurring `AuthContext` member backfill for employees.
**Fix:** compare against the existing doc — only block when the write actually *adds/raises* a privileged field vs `resource.data`, e.g. `(!('hourlyRate' in request.resource.data) || request.resource.data.hourlyRate == resource.data.get('hourlyRate', ...))`.

### M3 — Posts read fails OPEN on missing `authorIsPrivate` (privacy window until backfill)
`firestore.rules:116`.
The rule resolves privacy via `resource.data.get('authorIsPrivate', false) != true` — a post **lacking** the field defaults to public. Every post created before this field existed has no field, so a currently-private user's historical posts are world-readable to any signed-in member **until `backfillPostPrivacy` runs**. Closure depends on an out-of-band manual deploy step.
**Fix (accepted-with-mitigation):** run `backfillPostPrivacy` *as part of* the deploy (before/with the rules), not after. (Making the rule fail-closed would hide every legacy post until backfill — worse.) Document this ordering as mandatory.

### M4 — Reported DMs can't be removed, and the docstring/policy falsely claim they can
`src/services/firebaseModeration.ts:356`, `src/screens/AdminReportsScreen.tsx` docstring.
A DM report is filed as `targetType='message', targetId=conversationId, parentId=undefined`. The client `adminActionReport` no-ops on `'message'` (block + status only); the CF that *would* redact is never called. So abusive DM content is never removed. Meanwhile `AdminReportsScreen`'s docstring claims "Both paths call the `adminActionReport` Cloud Function so the destructive operation runs with the Admin SDK" — **false** (it calls the client path). This is the Wave-1 "thread-level report" limitation, but the **false claim** must be corrected (honesty), and ideally message redaction wired (report a `messageId`+`conversationId` → CF redaction).

## MINORS (~7 distinct)
- **postMedia is signed-in-readable** (`storage.rules`) — a *private* account's post images/videos are readable by any signed-in member even though the post doc is access-gated. (Privacy leak for private-account media; the post text is hidden but the media isn't.)
- **`deleteAccount` doesn't decrement `likes` counters** on others' posts when removing a departing user's like-docs → permanent like-count inflation. (`functions/src/deleteAccount.ts`)
- **Feed cursor uses a non-unique `createdAt` value** → can skip or dead-end posts at a page boundary, and a fully-filtered page can dead-end pagination. (`firebasePosts.ts`)
- **`participantProfiles` go stale on rename** — `updateProfile` fans out to posts (authorIsPrivate) but not conversations, so the chat header name/avatar can lag. (`firebaseFollow.ts`)
- **Pending follow request can't be cancelled** by the requester (no "Requested → tap to cancel" path). (`UserProfileScreen.tsx`)
- **Conversation update allowlist** lets a participant overwrite the *other* participant's `participantProfiles`/`unreadFor` entry. (`firestore.rules` — low risk in a 2-person thread.)
- **Optimistic like count doesn't reconcile** when the like/unlike is an idempotent no-op (double-tap). (`CommunityScreen.tsx`)

## Verdict
PR #1 is structurally sound and faithful to the contract, **but it introduced 2 blockers + 2 regressions** (private-profile viewing breaks and is bypassable; member self-edits break; counts mis-initialize). **Recommend fixing the 2 blockers + 4 majors before merge**; the minors are safe to land as a fast follow-up. None of this reopens the *original* 12 P0s — these are new edges in the fixes themselves.

---

## Resolution (all fixed on `feature/social-upgrade`)

**Blockers**
- **B1** — `getUserPosts` now try/catch → `[]` on denial; `loadProfile` loads the profile first and fetches posts only when allowed; `canSeePosts` fails **closed** when `profile` is null. (`firebasePosts.ts`, `UserProfileScreen.tsx`)
- **B2** — `/followers` and `/following` public self-create branches now require `isPublicAccount(target)`; private accounts are followable only via the request-gated branch. New `isPublicAccount()` helper. (`firestore.rules`)

**Majors**
- **M1** — new `backfillFollowCounts` CF seeds `followerCount`/`followingCount` from real counts so the increment triggers start from a correct base. (`functions/`)
- **M2** — new `memberUpdateNotElevating()` compares privileged fields to the *existing* doc, so employees/admins can edit avatar/bio. (`firestore.rules`)
- **M3** — mitigated by deploy ordering: run `backfillPostPrivacy` **with** the rules deploy (see deploy steps), so the fail-open window doesn't exist in practice. (Making the rule fail-closed would hide every legacy post until backfill — worse.)
- **M4** — new `redactDmMessages` CF redacts the offender's messages in a reported conversation; client `adminActionReport` now calls it for `message` targets; `AdminReportsScreen` docstring corrected. (`functions/`, `firebaseModeration.ts`, `AdminReportsScreen.tsx`)

**Minors fixed:** `deleteAccount` now decrements liked posts' counters (no resurrection); `updateProfile` fans out display-name/avatar to `participantProfiles` on conversations; `cancelFollowRequest`/`hasRequestedFollow` + a "Requested → tap to cancel" button; feed infinite-scroll no longer dead-ends on an all-hidden page; optimistic like is guarded against double-count + clamped ≥ 0.

**Minors accepted with rationale (not changed):**
- **postMedia is signed-in-readable** — a non-follower can't obtain a private post's media URL anyway (the post doc that holds the URL is rule-gated for private accounts), so this is defense-in-depth, not a live leak. A full fix needs signed URLs / a media-proxy CF — disproportionate for a small members-only club. Flagged for a future hardening pass.
- **Conversation update allowlist** lets a participant write the other's `unreadFor`/`participantProfiles` entry — but the send path *legitimately* writes the recipient's unread, so restricting it would break messaging; in a 2-person thread the spoof impact is trivial. The important guard (immutable `participants`) holds.
- **Feed cursor uses a `createdAt` value** — a millisecond-collision at a page boundary could skip a post. Negligible for this scale, and the followed-feed merges multiple batch queries so a single snapshot cursor isn't applicable. Id-dedup prevents double-render. Documented; revisit if volume grows.
