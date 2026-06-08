# SOCIAL_RECOVERY.md — what was built vs. what is wired

**Branch:** `fix/social-tab` (off `main` @ `eacc992`)
**Date:** 2026-06-05
**Question this answers:** the Social ("Dojo Feed") tab shows empty and "features we built seem
missing." Are social features stranded on un-merged branches, and is anything not wired into the tab?

## TL;DR

**Nothing to recover.** Every candidate branch is a **fully-merged ancestor of `main`** (0 commits
ahead), and every social screen/service exists on `main` and is wired into navigation. The empty feed
is **not** a missing-feature problem — it is a data/query problem (see `Phase 1` below and the PR).
The reported "gold ＋ create tab / employee-layout / no-Book" drift came from an **incorrect screenshot
(confirmed by the owner)** — `main`'s `TabNavigator.tsx` is the intended layout and is left unchanged.

## Branch reconciliation (evidence)

`git merge-base --is-ancestor <ref> origin/main` + `git rev-list --count origin/main..<ref>`:

| Branch | Relation to `main` | Commits ahead | Social paths changed vs main |
|---|---|---|---|
| `feature/social-upgrade` | ancestor (merged via PR #1) | 0 | — |
| `claude/modest-germain-68010e` | ancestor (merged) | 0 | — |
| `claude/unruffled-curran-d57596` | ancestor (= main) | 0 | — |
| `claude/sad-franklin-d48599` | = main (`eacc992`) | 0 | — |
| `fix/app-audit` | ancestor (merged) | 0 | — |
| `fix/owner-items` | ancestor (merged via PR #3) | 0 | — |
| `fix/reaudit-2` | ancestor (merged via PR #4) | 0 | — |

The social system was built on `feature/social-upgrade` and merged into `main` (PR #1). Representative
commits now on `main`: `e023216` feed B1 (cursor pagination, atomic likes, cascade delete, privacy +
filter), `6c74e9b` messaging B3 (denormalized participant profiles, killed inbox N+1), `21a859b` graph
B4 (denormalized counts, follow-request inbox, live privacy denorm), `2ed09a7` removed the proactive
content filter (adults-only members club), plus later audit fixes (`87ae20e`, `5f0b45b`, `4fe34ca`).

## Feature → branch → in main? → wired? → action

| Feature | Built on | In `main`? | Wired into tab/nav? | Action |
|---|---|---|---|---|
| Dojo Feed (cursor pagination, likes, cascade delete) | feature/social-upgrade | ✅ | ✅ `Community` tab → `CommunityScreen` (TabNavigator:88) | **none** — fix data, not wiring (Phase 1) |
| Create post (photo/video/text) | feature/social-upgrade | ✅ | ✅ `CreatePost` (RootNavigator:280, modal) + FAB on feed | none |
| Likes (atomic, idempotent transaction) | feature/social-upgrade | ✅ | ✅ inline in `PostCard` | none |
| Comments (+ report/block/mute) | feature/social-upgrade | ✅ | ✅ `Comments` (RootNavigator:281) | none |
| User profiles (follow/message/edit) | feature/social-upgrade | ✅ | ✅ `UserProfile` (RootNavigator:282) | none |
| Follow + follow-requests inbox | feature/social-upgrade | ✅ | ✅ `FollowRequests` (RootNavigator:241) | none |
| Direct messages (list + thread) | feature/social-upgrade | ✅ | ✅ `MessagesList`/`MessagesChat` (RootNavigator:290-291) | none |
| User search | feature/social-upgrade | ✅ | ✅ `UserSearch` (RootNavigator:292) | none |
| Notifications | feature/social-upgrade | ✅ | ✅ `Notifications` (RootNavigator:289) | none |
| Block / mute / report | feature/social-upgrade | ✅ | ✅ inline (`PostCard`, `CommentsScreen`, `MessagesChatScreen`, `ReportModal`) | none |
| Admin moderation queue | feature/social-upgrade | ✅ | ✅ `AdminReports` (RootNavigator:261, admin-gated) | none |
| EULA / Community-Guidelines accept (Apple 1.2, versioned) | feature/social-upgrade | ✅ | ✅ `OnboardingScreen.tsx` | none — verify only |
| Firestore rules (posts/likes/comments/follow/blocks/reports) | feature/social-upgrade | ✅ | ✅ `firestore.rules` | none — audit only |
| Feed composite indexes | feature/social-upgrade | ✅ (in repo) | n/a | **deploy** `firestore:indexes` (owner) |
| `backfillPostPrivacy` Cloud Function | feature/social-upgrade | ✅ (exported) | n/a | **deploy + run once** (owner) — extended in Phase 1 |
| `backfillFollowCounts` / `followerCounters` | feature/social-upgrade | ✅ | n/a | **deploy + run once** (owner) |

## Running-build / tab drift

The reported shipped layout (gold "＋" create tab, employee Tasks/Clock, no Book) does **not** exist in
any branch in git history. Per the owner the screenshot was **incorrect — ignore it**. For the record,
`main`'s `TabNavigator.tsx` maps the `Community` tab to the `add-circle` icon (an ⊕ that can read as a
create "＋"), and `Book` to the `people` icon; labels are hidden. This is the intended layout and is
**left unchanged** in this branch.

## Conclusion

No cherry-picks, re-wires, or rebuilds are required to "recover" social work — it is all on `main` and
reachable. The remaining work is the empty-feed root cause (Phase 1) and a scoped social audit (Phase 2),
plus the **owner-side deploys** (indexes + functions) and the one-time **backfill run**.
