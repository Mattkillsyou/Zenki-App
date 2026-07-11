# PROMPT — Full App Audit + Usability Pass (pre-2.0.5)

Copy everything below into a fresh Claude Code session at `C:\Users\mattb\Desktop\Zenki`.

---

You are auditing **Zenki Dojo** (Expo ~55 / React Native 0.83 / TypeScript / Firebase, project `zenki-dojo`) before the 2.0.5 release. The goal is twofold: **(1) regression safety — make sure nothing is broken or about to break**, and **(2) usability — find every place a real member or admin gets stuck, confused, or silently fails.** This is an AUDIT: report first, fix only after I approve, and any fixes go on a branch off `main` (never commit to main directly; when I say "commit" that always means commit AND push).

## Current state (trust this, don't re-derive)
- `main` = 2.0.4 / build 50, **submitted to App Review** (auto-release). Do not bump versions; next release is 2.0.5.
- Branch `fix/senpai-voice` (unmerged) holds the Senpai voice fix — session-only TTS auto-disable + no client-side speakSignature skip. **Do not undo those two behaviors.**
- Backend LIVE in prod: social Firestore rules + indexes (since 2026-06-08), ~28 Cloud Functions incl. `deletePostCascade`, `banUser`, `redactDmMessages`, `notifyOnReport`, `broadcastPush`. Web admin live at `zenki-dojo.web.app/admin`.
- **NOT deployed:** the `ff9c3d8` firestore.rules delta (`/users` `member:` guard + `/employeeTasks` source-split) — gated until old clients (≤2.0.2) stop writing `member:` on first OAuth sign-in. Flag anything that changes this calculus; do not deploy rules yourself.
- `functions/.env` (gitignored) must contain `SENPAI_TTS_REQUIRE_SIGNATURE=false` or any functions deploy fails. There is NO predeploy build hook — `npm --prefix functions run build` before any deploy.
- Long-term memory: `C:\Users\mattb\.claude\projects\C--Users-mattb-Desktop-Zenki\memory\` — read MEMORY.md first.

## Prior audits (read, don't repeat)
`APP_AUDIT.md` (70-finding repair, shipped), `SOCIAL_AUDIT_2026-07-07.md` (social defects F1–F12 — verify which are now fixed, carry forward the rest), `SOCIAL_CONTRACT.md` (social architecture source of truth), `LAUNCH_READINESS`/handoff notes. Anything those docs mark accepted-with-rationale stays accepted unless you find new evidence.

## Scope
Everything: all screens (`src/screens/**`), services (`src/services/**`), contexts (`src/context/**`), navigation, components, `functions/src/**`, `firestore.rules`/`storage.rules`/indexes vs actual client traffic, and the web admin (`hosting/admin/index.html`).

**Regression sweep:** broken imports/exports, unhandled rejections, subscription leaks, listeners without unsubscribe, `route.params` crashes, unsafe member access on optional Firestore fields, Timestamp-vs-ISO date mismatches, queries needing missing indexes, client ops the LIVE rules deny, dead code paths, race conditions on auth-not-ready, error states swallowed into empty states (the app's known worst habit — flag every one).

**Usability sweep (walk each flow as a persona):** new member (onboarding → EULA → first post → follow → DM), regular member (book, shop, log workout/macros, community), guest mode (App Review 5.1.1(v) — nothing may hard-require sign-in that shouldn't), admin (all 10 admin cards + web admin), Senpai user (enable, chat, mic, voice). For each: dead ends, missing loading/empty/error states, no-feedback taps, unreachable screens, confusing copy, destructive actions without confirmation, and anything that silently no-ops.

## Method
1. Read the memory + prior audits, then `npx tsc --noEmit` as a baseline gate.
2. Fan out by subsystem; every finding needs **file:line, severity (P0 broken/crash/data-loss → P3 polish), concrete repro ("user does X → Y"), and evidence (code excerpt)**.
3. Adversarially verify each P0/P1 against the actual code before reporting — no plausible-but-wrong findings.
4. Deliverable: `APP_AUDIT_2.0.5.md` in repo root — root-cause summary, findings table ordered P0→P3, a repair plan split into (a) client fixes for 2.0.5, (b) deploy-side actions with gating conditions, (c) deferred-with-rationale. Note explicitly what needs live-Firebase or on-device verification you couldn't do statically.
5. Stop after the report. I'll pick what to fix.

Reviewer demo login (for reasoning about review flows): `reviewer` / `reviewer123`. Do not touch prod data or deploy anything.
