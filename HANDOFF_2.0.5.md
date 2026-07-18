# Zenki Dojo — Handoff (PC switch, 2026-07-10)

Current-state handoff for resuming on a different machine. Everything below is on `main` and pushed to `origin`.

## Repo / project facts
- GitHub: `Mattkillsyou/Zenki-App` · default branch `main`
- Firebase project: `zenki-dojo` · Web admin live: https://zenki-dojo.web.app/admin
- iOS bundle: `com.zenkidojo.app` · Apple Team `RPV54B2NK5` · ASC app id `6763685748` · EAS projectId `5ece9429-9575-4d43-9417-dba1d8313855`
- Reviewer demo login (for reasoning about review flows): `reviewer` / `reviewer123`

## ⚠️ Decide before the next build: version number
`app.json` currently reads **version `2.0.6`, buildNumber `52`**. All the audit + UX work in this session was branded **"2.0.5"** in commits/docs (the last SUBMITTED build was 2.0.4 / build 50). Reconcile the intended version before building — either treat this release as 2.0.6, or set `version` back to `2.0.5`. `eas.json` production has `autoIncrement: true`, so the build number takes care of itself.

## What's on `main` (all merged, both gates clean: `tsc --noEmit` + functions build)
1. **2.0.5 audit P0/P1s** — voice fix, deleteAccount indexes+cascade, cold-start auth-race class (`useFirebaseUid`), booking reminders, remount storm, hot-mic, admin add-member, UTC→local day keys, Sound toggle.
2. **Never-silent legal/financial writes** — waivers, EULA proof, payroll shifts, paid orders, Apple-Pay receipts (durable queues, flushed on session in `App.tsx`).
3. **Carried-forward social register** — F1–F9, F11 fixed (F10 needs live backfill check; F12 accepted tradeoff).
4. **UX pass** — booking cluster (self-conflict guard, evening dead-end, calendar quick-add day), timers (keep-awake, wall-clock, real bowl tone), nutrition sync (clamps, de-poisoned migration, decimals), Contact-IT Support tab, Settings honesty.
5. **Parallel Senpai Phase-A** enhancement work rode the same branch (animations + dialogue/bond).

Full detail: `FIXES_APPLIED_2.0.5.md`. Audit source of truth: `APP_AUDIT_2.0.5.md` (§3 findings, §4 repair plan, §5 needs-device list).

## What's DEPLOYED live right now
- **Hosting** (web admin incl. new Support tab + announcements ISO fix) — deployed & verified.
- **Cloud Functions**: `listSupportMessages` (new, admin-gated — 401 verified), `adminDeleteUser`, `broadcastPush`, plus the `deleteAccount`/`purgeUserData` cascade. Collection-group indexes (`comments.userId`, `likes.uid`) deployed.
- **NOT deployed**: the pending `ff9c3d8` firestore.rules delta (`/users` member-guard, `/employeeTasks` split, `/config/scheduling` public read, `/followRequests` requester-read). The requester-read line for F1 is committed to `firestore.rules` but rides that pending deploy — don't deploy rules piecemeal without re-checking the gating calculus in the audit.

## New-PC setup (these are gitignored — not in the repo)
1. `git clone` the repo, then `npm install` (root) and `npm --prefix functions install`.
2. **`functions/.env`** — must contain `SENPAI_TTS_REQUIRE_SIGNATURE=false` or any `firebase deploy` of functions fails. (Also holds ElevenLabs / signing secrets — copy from the old machine or Firebase console.)
3. **`AuthKey_393722HSY5.p8`** (ASC API key) — referenced by `eas.json` submit config; needed for `eas submit`. Download from App Store Connect → Users and Access → Keys if not carried over.
4. Auth: `firebase login` and `eas login` (account `mattbrowntheemail`). `firebase deploy` was cached-login on the old machine.

## What's left before cutting the build
- **On-device smoke test** (audit §5) — the real gate: cold-launch with blocks set, first-time DM, a booking reminder firing, airplane-mode signup → relaunch → queue flush, Senpai mic/voice, a timer behind auto-lock, and an App-Review-style guest walk.
- Then: settle the version number (above), `eas build --profile production --platform ios`, `eas submit`, and finish the ASC version in the browser (release notes + attach build).

## Still-open backlog (deferred, not blocking)
Remaining §3 P2/P3 tail: cross-member booking conflicts, GPS start/End race, gamification pre-hydrate loss, EmployeeTasks assign picker, real data export, `senpaiUsage` GDPR purge (functions), guest `/schedule` read (pending rules deploy), F10 backfill check. The remaining Senpai follow-ups live in the saved `senpai-followups` skill/workflow.

## Memory
Long-term memory (not in this repo) lives at `~/.claude/projects/C--Users-mattb-Desktop-Zenki/memory/` — `MEMORY.md` is the index; `audit-2.0.5.md`, `admin-web-deployed.md`, `release-2.0.4.md` have the running state. That directory is per-machine; the source of truth for a fresh PC is this doc + the tracked `*_2.0.5.md` reports.
