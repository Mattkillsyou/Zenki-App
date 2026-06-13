# Zenki Social Network — Full Multi-Agent Bug Audit (run in a separate worktree)

> Paste everything below into a fresh Claude Code session opened in the `Zenki-App`
> repo. It sets up an isolated git worktree, runs a full multi-agent audit of the
> social network, root-causes the bugs, fixes them in the worktree, and hands back a
> ready-to-merge branch — without touching your main checkout.

---

## 0. Set up an isolated worktree FIRST (all work happens here)

```bash
# fresh worktree off the latest main, on its own branch
git worktree add /Users/mbrown/Desktop/zenki-social-audit -b audit/social-bugs main
# worktrees don't get node_modules (gitignored) — symlink the main one so tsc resolves
ln -sfn /Users/mbrown/Desktop/Zenki-App/node_modules /Users/mbrown/Desktop/zenki-social-audit/node_modules
```

Do ALL reading and fixing under `/Users/mbrown/Desktop/zenki-social-audit`. Typecheck with:

```bash
/Users/mbrown/Desktop/Zenki-App/node_modules/.bin/tsc --noEmit -p /Users/mbrown/Desktop/zenki-social-audit/tsconfig.json
```
(no `cd`; use absolute paths). Commit fixes to `audit/social-bugs`. Do **not** merge.

## 1. Mission

Run a **full multi-agent audit** (use the Workflow tool: parallel investigators →
adversarial verification of every root cause → synthesis → fix) to find and fix the
bugs breaking the social network. Both symptoms are real and confirmed on-device
(TestFlight build 40); they may share a cause or be separate.

## 2. Confirmed symptoms (from the owner, on-device)

1. **"Can't post anything"** — occurs **right after signing in** (same session). The
   Firebase Auth session IS live, so `getCurrentUid()` is **valid** — this is **NOT**
   a dead-session / null-uid issue. The failure is somewhere in the post path *after*
   the uid gate, or in the composer UI.
2. **"A lot of options missing"** — **actual buttons/controls are gone from the UI**,
   **NOT** an empty feed. A UI-rendering / conditional-gating bug.

## 3. Already ruled out / already done — do NOT re-derive these

- `/posts` create rule is permissive (`userId == auth.uid`); Storage rules for
  `postMedia/{uid}` are fine. Not a rules rejection.
- `CommunityScreen` renders the compose FAB and search **unconditionally** (no
  role/flag/membership gate) — so those specific controls are not the missing ones.
- `createPost`/`createTextPost` gate on `getCurrentUid()`, then `addDoc`, then a
  `getDocFromServer` verify that **threw false "couldn't post"** on a saved post —
  **already softened to non-fatal** in this worktree (commit `5115c51`).
- An `onAuthStateChanged` reconciliation (zombie-session safety) was **already added**
  (`AuthContext` + `subscribeToAuthState` in `firebaseAuth`) — keep it, but note it is
  NOT the cause of the in-session symptom above.
- The first audit wrongly assumed "options missing = empty feed." It is not. Treat the
  missing controls as a **real UI bug** to find.

## 4. The strongest open leads (start here, but verify independently)

- **The post submit path in-session:** `CreatePostScreen.handlePost` →
  `createPost`/`createTextPost` → `uploadMedia` (Storage) / `addDoc`. With a valid uid,
  what *actually* fails, and what error does the user see (the `friendlyError` map shows
  `not-signed-in` / `permission-denied` / generic)? Reproduce the exact throw.
- **Missing UI controls:** enumerate the controls each social screen SHOULD render vs.
  what it does — `CommunityScreen`, `CreatePostScreen`, `PostCard`, `UserProfileScreen`,
  `CommentsScreen`, `MessagesListScreen`, `NotificationsScreen`, `FollowRequestsScreen`,
  `BlockedUsersScreen`. Look for conditional gates (`user?.isAdmin/isEmployee`,
  membership, feature flags), thrown errors in subcomponents (error boundary swallowing
  UI), and **missing navigation entry points** (how does the user even reach DMs /
  Notifications / Followers? `CommunityScreen`'s top bar has only search + a FAB).
- **`PostCard`** (`src/components/PostCard.tsx`) — the first audit never inspected it.
  Check the per-post controls (like / comment / menu) for an ownership/role gate.

## 5. Audit angles (one investigator each, in parallel)

1. Post submit path (in-session failure) — exact throw + fix.
2. UI controls inventory — expected vs rendered, across every social screen.
3. `PostCard` internals — per-post control gating.
4. Navigation / entry points — reachability of DMs, Notifications, Followers, Profile actions.
5. Social Firestore rules vs client reads/writes — any rejected legitimate op.
6. Recent-change regression — `git log`/`git show` on the social files.

Each investigator returns structured findings (file:line, root cause, evidence, exact
fix, confidence). Adversarially verify every blocker/major before it drives a fix.

## 6. Invariants (don't break)

- Never present fabricated data as real (HR, etc.). Lazy native init (BLE/HealthKit).
- Don't add `useSyncedState` to a Firestore-backed context.
- Don't touch `firestore.rules` `/members` `email_verified` — it was deliberately
  reverted (the app never sends verification emails).

## 7. Deliverable

Root-cause BOTH symptoms (they may be separate), fix them in the worktree, get a clean
typecheck, commit to `audit/social-bugs`, and report a ready-to-merge branch with a
short per-bug writeup (symptom → root cause → fix). The acceptance test is the owner
posting successfully and seeing the controls on a real device — not a green typecheck.
