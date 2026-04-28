# Handoff — Zenki Dojo, Master Prompt rework

## ⚠️ Decision change since the prior handoff

The prior handoff (now in git history at `6948324`) said the next step was "Build 25 — bundles ALL the App Review fixes." **That is now ON HOLD.** New direction from user: complete every section of `Zenki_Master_Prompt.md` (41 sections) BEFORE any next build. Build 25 + the Apple Resolution Center reply both wait until all chunks are done.

The App Review rejection text and the demo-video reply template are preserved in commit `6948324`'s `HANDOFF.md` — pull from git history when ready (`git show 6948324:.claude/HANDOFF.md`). Don't lose them.

## Current state

- Branch: `main`, HEAD `c89050b`
- TS: `npx tsc --noEmit` is **clean** (0 errors in real `src/`)
- All commits through `c89050b` are pushed to origin (verify with `git status` first turn)
- Stray 53MB `Simulator Screenshot - iPhone 17 Pro Max - 2026-04-24 at 23.39.52/` directory at repo root — untracked, contains a duplicate of the project tree, ignored via `.easignore` AND `tsconfig.json` exclude. Don't `rm -rf`; it's user data.

## The plan: 9 chunks, one fresh session per chunk

| # | Sections | Theme | Status |
|---|---|---|---|
| 1 | 0-verify, 5, 6, 11, 40 | Verify TS clean, small renames, dynamic version | ✅ done — commit `c89050b` (0 / 5 / 6 / 11 were no-ops, already done in prior sessions; 40 + tsconfig exclude landed) |
| 2 | 2, 7, 8, 24, 26, 30 | HomeScreen overhaul (top bar, section headers, icon colors, training subtitles, YOUR DAY swipe + miles, vouchers section move) | **NEXT** |
| 3 | 16, 17, 18, 25, 3 | Theme system (remove Jurassic/Ghost/Bladerunner, theme-specific sound packs, system-theme default, GPS theme-adaptive, spin wheel redesign) | pending |
| 4 | 13, 12, 38, 39 | Native sound engine (`expo-av`), SoundPressable rollout, admin spacing/dead-ends, secure CREDENTIALS | pending |
| 5 | 4, 14, 15, 28 | HealthKit context, profile edit-button move, profile bio, sign-in flow (inline error, persist username, Google/Apple sign-up) | pending |
| 6 | 19, 20, 21, 22, 23, 31 | Food log redesign (first-time setup, compact, top action bar, product review, draggable meals, AI fallback) | pending |
| 7 | 9, 10 | Weight page (chart top, calendar) | pending |
| 8 | 27, 32, 33, 34, 35, 36, 37 | Employee tabs/home, keyboard avoidance, community feed, booking layout, training screens, iPad globals, drink padding | pending |
| 9 | 41 | Final verification: `tsc`, `expo-doctor`, `expo export`, unused-import sweep | pending |

## Chunk 1 specifics (already shipped, for reference)

- §0 verification: the Master Prompt's "17,133 TS1127 errors from binary corruption" was wrong. Errors were entirely from the stray Simulator Screenshot directory being scanned by `tsc`. Real `src/` has 0 errors. **No mass `sed -i 's/[^[:print:]\t\n]//g'` was run.** Don't run it in any future chunk either — it would strip every emoji, em-dash, curly quote, and Japanese character in the codebase.
- §5/§6/§11: Zero matches in `src/` for "HR Session", "Calorie Tracking", "EXTENDED". Already renamed in prior sessions.
- §40: `SettingsScreen.tsx:847` now uses `Constants.expoConfig?.version ?? '1.0.0'` (import from `expo-constants`).

## Next session: do this

```bash
cd /Users/mbrown/Desktop/Zenki-App
git pull origin main
git status   # confirm clean tree
npx tsc --noEmit   # baseline: 0 errors
```

Then read `Zenki_Master_Prompt.md` sections 2, 7, 8, 24, 26, 30. They're all HomeScreen overhaul work — `src/screens/HomeScreen.tsx` is the primary file plus `SectionHeader.tsx`, `SpinWheelIcon.tsx` (delete), and `ProfileScreen.tsx` (vouchers move).

Chunk 2 detailed targets (from Master Prompt):
- **§2** — Delete `src/components/SpinWheelIcon.tsx`. In `HomeScreen.tsx` move spin-wheel trigger out of FAB (~line 640 in SpinWheelModal area) into top stats bar (~lines 530-561 alongside PointsBadge / flamesChip / StreakBadge / bell). Fix `styles.headerRight` spacing.
- **§7** — Unify all section headers: ALL CAPS, 13pt, weight 700, letterSpacing 1.5, primary sans-serif. Touches `HomeScreen.tsx` `sectionTitle` (~line 1267) and `src/components/SectionHeader.tsx`.
- **§8** — YOUR DAY stat cards (~lines 831-875): change icon colors from per-card mutes (red/warning/success/info) to gold/yellow to match Training section.
- **§24** — Differentiate Start Workout vs Workout in Training section: Start Workout (heart icon + "Live HR tracking" subtitle 10pt textSecondary), Workout (barbell icon + "Exercise library" subtitle). Update `styles.homeTool` for subtitles.
- **§26** — YOUR DAY: replace Active Min card with Miles (footsteps icon, `todayStats.miles` from GpsActivityContext). Wrap dashGrid in horizontal pager: Daily / Weekly / Monthly with dot indicators.
- **§30** — Move voucher section ProfileScreen → HomeScreen as a reorderable section (id `'vouchers'`). Touches `HomeScreen.tsx`, `ProfileScreen.tsx` (lines 287-333 + 446-494 + 730-873), and `useSpinWheel` is already imported in HomeScreen.

End of chunk: run `npx tsc --noEmit`, commit with message starting `Master Prompt chunk 2:`, push.

## Carry-forward gotchas

- `react-native-health` pulls in `@expo/config-plugins@7.9.2`. expo-doctor flags it. Don't override unless EAS prebuild fails.
- `CREDENTIALS` in `src/data/members.ts` is `__DEV__`-gated (chunk 4 / §39 may revisit).
- The `applesignin` entitlement is now explicit in `app.json` — don't remove.
- `package.json` upgraded to RN 0.83.6 / Expo 55 / React 19.2 since the Mac-session work began. The Xcode 26 vs RN 0.76 `fmt` blocker should no longer apply, but local builds still aren't part of the workflow — EAS only.
- The `34d7982` matrix-routing fix is in the branch; the file `ActivityTrackerScreen.matrix.tsx` does not exist and won't be reintroduced unless someone explicitly wants the Pip-Boy GPS variant back.
- GitHub auth is set up via `gh` CLI on this Mac (osxkeychain). `git push origin main` works directly.

## EAS / Apple state — reference

- `eas-cli/18.8.1`, logged in as `mattbrowntheemail` (Google SSO).
- Apple Team `RPV54B2NK5` (Matthew Brown — Individual). Distribution cert valid until 2027-04-24.
- App App ID: `6763685748` — <https://appstoreconnect.apple.com/apps/6763685748/distribution>.
- App Store Connect API key `AuthKey_393722HSY5.p8` is at project root, gitignored. **Back it up off-machine — Apple won't re-issue.**

---

Last updated: 2026-04-28 by Claude (Mac session, end of chunk 1 / context-exhausted).
