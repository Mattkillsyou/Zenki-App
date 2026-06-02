# SOCIAL_CONTRACT.md — Wave 1 (P0s + Apple UGC)

> Source of truth for the `feature/social-upgrade` Wave 1 build. Every collection, field, counter, index, service signature, Cloud Function, and **file-ownership boundary** is pinned here. Build agents code against this exactly. The lead owns all shared files and implements them **first**, so the shared APIs below are real on disk before B1–B4 run.
> Scope = the 12 audit P0s + Apple UGC additions (content filter, report-comments, mute, EULA, admin ban, ≤24h). Enhancements (ranked feed, reactions, hashtags, group chats, leaderboards, notifications parity, multi-image, drafts) are **Wave 2 — out of scope here.**

## 0. File-ownership map (STRICT — no two agents edit the same file)

**Lead (implemented first, before fan-out):**
- `firestore.rules`, `firestore.indexes.json`, `storage.rules`
- `functions/src/*` — rewrite `deleteAccount.ts`, fix `adminActionReport.ts`, NEW `deletePostCascade.ts`, NEW `banUser.ts`, NEW `notifyOnReport.ts`, wire `index.ts`
- Shared client services/utils: NEW `src/services/contentFilter.ts`; `src/services/firebaseModeration.ts` (mute, ban wrapper, report `parentId`); `src/services/firebaseStorage.ts` (postMedia path); `src/services/pushNotifications.ts` (token relocation)
- Shared context/components: `src/context/BlocksContext.tsx` (mute + `filterHidden`); `src/components/ReportModal.tsx` (optional `parentId` prop)
- Auth/admin/settings screens: `src/screens/auth/OnboardingScreen.tsx` (EULA gate); `src/screens/AdminReportsScreen.tsx` (ban + comment/message handling); `src/screens/BlockedUsersScreen.tsx` (muted list); `src/context/AuthContext.tsx` (token field removal, surgical)

**B1 — Feed & posting:** `src/services/firebasePosts.ts`, `src/screens/CommunityScreen.tsx`, `src/screens/CreatePostScreen.tsx`, `src/components/PostCard.tsx`
**B2 — Engagement (comments):** `src/screens/CommentsScreen.tsx`
**B3 — Messaging:** `src/services/firebaseMessages.ts`, `src/screens/MessagesListScreen.tsx`, `src/screens/MessagesChatScreen.tsx`
**B4 — Graph & profiles:** `src/services/firebaseFollow.ts`, `src/screens/UserProfileScreen.tsx`, `src/screens/UserSearchScreen.tsx`, NEW `src/screens/FollowRequestsScreen.tsx`

Build agents **import** lead-owned shared APIs but never edit lead-owned files. If an agent believes a shared file needs a change, it returns a diff request to the lead (does not edit).

> Note on worktrees: the prompt asks for one worktree per agent. The harness equivalent that achieves the same guarantee — zero edit collisions — is **strict disjoint file ownership in the integration worktree**. Agents do NOT run `git`, `typecheck`, or `expo`; the lead does all verification at integration so concurrent edits never race the build.

## 1. Collections — new & changed

### Changed
- **`posts/{id}`** — unchanged shape `{ userId, displayName, avatar, mediaUrl?, mediaType?, caption, likes, createdAt }`. `likes` counter now mutated **only** by ±1 (rule-enforced). Deletion now cascades via Cloud Function (subcollections + Storage). No `commentCount` in Wave 1 (Wave 2).
- **`posts/{id}/comments/{id}`** — unchanged shape. Reads now filtered client-side through block∪mute.
- **`conversations/{id}`** — ADD denormalized field **`participantProfiles: Record<uid, { displayName: string; avatar: string | null }>`** written at create + refreshed on send, so the inbox needs no per-snapshot profile fetch. Existing fields unchanged: `{ participants[], lastMessage, lastSenderId, lastMessageAt, unreadFor{}, createdAt }`.
- **`members/{id}`** — read **locked down** (owner-by-firebaseUid or admin). `pushToken` field **removed** (relocated, see below). Privileged fields (`isAdmin`, `hourlyRate`, `isEmployee`) no longer client-settable on create/update.
- **`reports/{id}`** — ADD optional field **`parentId?: string`** (the postId for a `comment` target, so admins can delete `posts/{parentId}/comments/{targetId}`). Existing required fields unchanged.
- **`users/{uid}`** — ADD **`acceptedTermsAt?: string`**, **`acceptedTermsVersion?: string`**, **`banned?: boolean`**, and denormalized **`followerCount?: number`**, **`followingCount?: number`** (maintained by follow/unfollow). Public display fields unchanged.

### New
- **`followers/{uid}/followers/{followerUid}`** → `{ at: ISO }` — the follower edge mirror (already written by client; now has a rule).
- **`followRequests/{uid}/requests/{requesterUid}`** → `{ at: ISO }` — pending follow request to a private account (now has a rule + an inbox screen).
- **`mutes/{uid}/muted/{mutedUid}`** → `{ mutedAt: ISO }` — soft-hide (feed/comments) without blocking; owner-only.
- **`pushTokens/{uid}`** → `{ uid, token: string, platform?: string, updatedAt: ISO }` — push token relocated off the world-ish `members` doc; admin/owner read only. (Matches what `deleteAccount` already expects.)

## 2. Counters & their invariants
- **`posts.likes`** — mutated only by `increment(±1)` inside a `runTransaction` that also writes/deletes the caller's `likes/{uid}` like-doc; transaction is idempotent (no double count on retry/double-tap) and clamps `>= 0`. Rule additionally constrains a non-owner update to exactly `oldLikes ± 1`.
- **`users.followerCount` / `users.followingCount`** — maintained **server-side** by the `followerCounters` CF triggers on `/followers/{u}/followers/{f}` create/delete (a client can't write another user's `/users` doc, and ±1-by-anyone would be spoofable like the old likes hole). B4 writes ONLY the edges (via `writeBatch`); it must NOT touch the count fields. Read path prefers the denormalized field and falls back to `getCountFromServer(subcollection)` when the field is absent (un-initialized users). Counts update ~1–2s after the edge (CF latency) — the UI may optimistically show ±1.
- **`conversations.unreadFor[uid]`** — recipient `increment(1)` on send; reader set to `0` on open (unchanged for Wave 1; the blind-zero refinement is deferred).

## 3. Indexes (firestore.indexes.json — lead adds)
1. `reports`: `status` ASC, `createdAt` DESC (for `listOpenReports`).
2. `conversations`: `participants` ARRAY_CONTAINS, `lastMessageAt` DESC (for inbox `orderBy+limit`).
3. Keep existing `posts` `userId`+`createdAt`, `attendance`. `followRequests` inbox read is a single-collection `getDocs` (auto-indexed).

## 4. Shared service signatures (lead implements; agents call)

```ts
// src/services/contentFilter.ts  (NEW — lead)
export interface FilterResult { ok: boolean; reason?: string; matched?: string }
/** Synchronous client-side objectionable-content gate. Returns ok:false with a
 *  user-facing reason when text hits the banned-term list. Used at every UGC
 *  create site (post, comment, message, bio). */
export function screenText(text: string): FilterResult;
/** Throwing variant for service layers: throws Error('content-blocked: <reason>') */
export function assertCleanText(text: string): void;

// src/services/firebaseModeration.ts  (lead adds)
export async function muteUser(mutedUid: string): Promise<boolean>;
export async function unmuteUser(mutedUid: string): Promise<boolean>;
export async function getMutedUserIds(): Promise<Set<string>>;
export async function isUserMuted(mutedUid: string): Promise<boolean>;
// submitReport gains optional parentId:
export interface ReportInput { targetType; targetId; targetUserId; reason; context?; parentId?: string }
// adminActionReport stays the client entry but now calls the CF for cascade/ban (see §6).
export async function banUserViaFunction(targetUid: string): Promise<{ ok: boolean; error?: string }>;

// src/context/BlocksContext.tsx  (lead extends; agents consume via useBlocks())
useBlocks(): {
  // existing: blockedIds, isBlocked, blockUser, unblockUser, filterBlocked, refresh
  mutedIds: Set<string>;
  isMuted: (uid: string) => boolean;
  muteUser: (uid: string) => Promise<void>;
  unmuteUser: (uid: string) => Promise<void>;
  /** Filter items by author field, excluding BOTH blocked and muted authors.
   *  Use this for feed + comments display. */
  filterHidden: <T>(items: T[], userIdField: keyof T) => T[];
}

// src/services/firebaseStorage.ts  (lead) — signature UNCHANGED, path changes internally:
export async function uploadMedia(uri: string, type: 'photo'|'video'): Promise<string>;
// now uploads to postMedia/{uid}/... (publicly readable to signed-in users)

// src/components/ReportModal.tsx  (lead) — add optional prop:
interface Props { ...; parentId?: string }   // pass comment's postId
```

## 5. Service signatures the build agents change (their own files)

```ts
// B1 — src/services/firebasePosts.ts
export async function getFeed(opts?: { cursor?: QueryDocumentSnapshot | null; pageSize?: number; scope?: 'following'|'global' })
  : Promise<{ posts: Post[]; cursor: QueryDocumentSnapshot | null; hasMore: boolean }>;
//   ^ cursor pagination (startAfter). Keep a back-compat default page size (15). Like-state fetched
//     in ONE batched read per page (documentId() in [...]) instead of N getDocs.
export async function likePost(postId: string): Promise<void>;   // now runTransaction, idempotent, clamp>=0
export async function unlikePost(postId: string): Promise<void>; // now runTransaction, idempotent, clamp>=0
export async function deletePost(postId: string): Promise<void>; // now calls deletePostCascade CF
export async function getUserPosts(userId: string, max?: number): Promise<Post[]>; // add limit (default 30)
// createPost/createTextPost/addComment: call assertCleanText(caption/text) before writing.

// B3 — src/services/firebaseMessages.ts
// getOrCreateConversation + sendMessage write/refresh participantProfiles. sendMessage calls assertCleanText.
// subscribeToInbox returns conversations already carrying otherUserName/otherUserAvatar from participantProfiles
//   (NO per-snapshot fetchUserProfile). Inbox query adds orderBy('lastMessageAt','desc'), limit(50).

// B4 — src/services/firebaseFollow.ts
export async function followUser(targetId): Promise<'followed'|'requested'|''>; // writeBatch both edges + increment counts
export async function unfollowUser(targetId): Promise<void>;                    // writeBatch both edges + decrement
export async function acceptFollowRequest(requesterId): Promise<void>;          // writeBatch: del request + both edges + counts
export async function listFollowRequests(): Promise<{ requesterId: string; at: string }[]>; // NEW — for the inbox screen
export async function getFollowerCount(userId): Promise<number>;  // read users.followerCount, fallback getCountFromServer
export async function getFollowingCount(userId): Promise<number>; // read users.followingCount, fallback getCountFromServer
```

## 6. Cloud Functions (lead) — client-vs-CF decisions

| Function | Type | Why CF (not client) |
|---|---|---|
| `deletePostCascade` (NEW) | onRequest, Bearer auth, owner-or-admin | Recursively deletes `posts/{id}` + `likes`/`comments` subcollections (other users' docs — client can't) + Storage media. Atomicity & cross-user authority require Admin SDK. |
| `deleteAccount` (REWRITE) | onRequest, Bearer auth, self | Cross-collection cascade incl. other users' docs (followers mirror, conversations) + Storage; must hit the **real** schema (`following`/`followers`/`followRequests`/`conversations`/`members`/`pushTokens`). |
| `adminActionReport` (FIX) | onRequest, admin | Comment delete now uses `posts/{parentId}/comments/{targetId}`; message redaction targets `conversations`. |
| `banUser` (NEW) | onRequest, admin | `admin.auth().updateUser(uid,{disabled:true})` + `users/{uid}.banned=true`. Only Admin SDK can disable an auth account. |
| `notifyOnReport` (NEW) | Firestore `onDocumentCreated('reports/{id}')` | Server-side ≤24h SLA backstop: pushes to admins on new report so the queue is actually serviced. |

**Stays client-side (justified):** feed reads + cursor pagination (simple reads); like transaction (hot path, latency-sensitive, rule-bounded to ±1); follow batch + denormalized counts (low-frequency, owner-authorized, batch is atomic); content `screenText` (synchronous UX feedback, zero cost/latency — server re-check is a Wave 2 hardening); mute (owner-only, trivial). 

## 7. Security rules (lead) — summary of changes
- ADD `match /conversations/{id}` (participant read/update with key-allowlist; create requires self in participants) + nested `messages` (participant-gated via `get()`, `senderId == uid`).
- ADD `match /followers/{uid}/followers/{followerUid}` (read signed-in; the follower owns their mirror edge — `isOwner(followerUid)` create/delete).
- ADD `match /followRequests/{uid}/requests/{requesterUid}` (requester creates/deletes own; target reads/deletes to accept-decline).
- ADD `match /mutes/{uid}/muted/{mutedUid}` (owner read/write only).
- ADD `match /pushTokens/{uid}` (owner write; owner-or-admin read).
- TIGHTEN `/members` read → `isAdmin() || own-doc(firebaseUid or first-time email-claim)`. Forbid client-set `isAdmin`/`hourlyRate`/`isEmployee` on create/update.
- TIGHTEN `/posts` update `likes` escape-hatch → non-owner may change `likes` only by exactly ±1.
- TIGHTEN `/posts` read & `/users` read for privacy: a private author's posts/profile readable only by the author, an approved follower (`exists(/followers/$(authorId)/followers/$(uid))`), or an admin. (`isPrivate` read from `get(/users/$(authorId))`.)
- EXTEND `/reports` create validation to allow optional `parentId is string`.
- ADD `banned` deny: signed-in content creates (`posts`, `comments`, `conversations/messages`, `followers`) require `!isBanned()` where `isBanned()` = `get(/users/$(uid)).data.banned == true` (guarded for missing doc).
- Keep default-deny terminal. Remove the dead `/follows` legacy block only if nothing references it (leave if uncertain — additive-safe).

## 8. Apple UGC additions (Wave 1)
- **Content filter:** ~~`screenText` at every create site~~ **REMOVED** at the product owner's direction — Zenki is a small, adults-only, members-only club, so proactive pre-publish text screening isn't warranted. UGC safety rests on **Report + Block + Mute + ≤24h admin review + the zero-tolerance EULA**. (Easily re-addable as a `contentFilter` util if a future App Review asks for proactive filtering.)
- **Report comments:** CommentsScreen long-press/menu → `ReportModal targetType="comment" parentId={postId}`; admin can now delete via the fixed CF.
- **Mute:** reachable from PostCard ••• and UserProfile; managed in BlockedUsersScreen.
- **EULA:** OnboardingScreen create-account step gains a required "I agree to the Community Guidelines (zero tolerance for objectionable content & abusive users)" checkbox + link; persists `acceptedTermsAt`/`Version` to `/users`; account creation blocked until checked.
- **Admin ban:** AdminReportsScreen "Ban user" → `banUser` CF.
- **≤24h workflow:** `notifyOnReport` push to admins on new report + a stated SLA in SUPPORT/terms.

## 10. Implementation refinements (decided during lead build — binding)

These resolve real Firestore-rules constraints discovered while writing the rules. They override any looser reading of §7.

**Private-account enforcement (P0-3) — final design.** Firestore evaluates a *list* read rule against the query, not per returned doc; `get()/exists()` keyed on a *varying* `resource.data.userId` makes a multi-author query unverifiable and Firestore rejects it. So:
- `/users/{uid}` **stays readable** to any signed-in user (standard: you can see a private account's name/avatar + "private" badge). Privacy hides **posts**, not the basic profile.
- Posts carry a denormalized **`authorIsPrivate: boolean`** (B1 writes it in `createPost`/`createTextPost` from `users/{uid}.isPrivate`).
- `/posts` read rule (4 branches, OR): `author == me` · `isAdmin()` · `resource.data.authorIsPrivate != true` · `exists(/followers/$(resource.data.userId)/followers/$(request.auth.uid))`.
- **Both feed paths** (`getFeed` global *and* followed) add `where('authorIsPrivate','==', false)` so they're satisfied by the public branch and never need per-doc `exists()`. Consequence (documented tradeoff): a private author's posts are visible to an approved follower **on that author's profile** (`getUserPosts` is a single-author query → the `exists()` branch is constant and evaluable), but **not surfaced in the home feed**. Surfacing approved-private posts in-feed needs a fan-out feed = Wave 2.
- `getUserPosts(userId)` stays `where('userId','==',userId) + orderBy('createdAt','desc') + limit`. Single-author → rule enforces live privacy via the author/exists branches.
- **Existing posts:** the `backfillPostPrivacy` admin Cloud Function (run ONCE after deploy) stamps `authorIsPrivate` on every pre-existing post (from each author's current `users/{uid}.isPrivate`), so the `== false` feed query doesn't drop legacy posts. Without this, posts created before the flag existed would vanish from the feed. Idempotent.
- **Staleness note:** `authorIsPrivate` is snapshotted at post time. The live `getUserPosts` profile path is always correct; privacy TOGGLES are applied live by `updateProfile` (batch-updates the user's own posts). New posts carry the live flag. Acceptable for Wave 1.

**Ban enforcement (P0 Apple eject) — final design.** `banUser` CF calls `admin.auth().updateUser(uid,{disabled:true})` (real enforcement — disabled accounts can't mint/refresh tokens, can't sign in) **and** sets `users/{uid}.banned = true` (for display/audit). We do **not** add a per-create `get(banned)` guard to the rules (avoids a read on every post/comment/message write; auth-disable is strictly stronger). 

**Indexes added for the privacy filter:** `posts` (`authorIsPrivate` ASC, `createdAt` DESC) for the global feed; `posts` (`userId` ASC, `authorIsPrivate` ASC, `createdAt` DESC) for the followed feed. (Replaces relying on the bare `userId`+`createdAt` index for the followed path.)

## 9. Verification gate (lead, at integration)
`npm run typecheck` clean · `cd functions && npm run build` clean · `expo` bundles · rules reasoned (emulator if available) for allow/deny on the new collections · counts reconcile · blocked+muted+private invisibility check · fresh-context adversarial review vs SOCIAL_AUDIT.md + this contract · Apple UGC checklist · per-agent commits · PR linking the audit. No push to main.
