# Mac Handoff — Zenki Master Prompt Execution

This branch was prepared on Windows. The actual work is meant to be executed on Mac so the iOS Simulator can verify visual changes without a TestFlight roundtrip.

## Pull on Mac

```bash
git clone https://github.com/Mattkillsyou/Zenki-App.git   # or `git pull` if already cloned
cd Zenki-App
npm install
npx expo prebuild --clean        # regenerates ios/ for native modules (HealthKit)
cd ios && pod install && cd ..
npx expo run:ios                 # boots the simulator with Fast Refresh
```

If `expo run:ios` complains about a missing simulator, open Xcode once first and accept the license, then `xcodebuild -runFirstLaunch`.

## How to drive the prompt

The full work list is in [`Zenki_Master_Prompt.md`](./Zenki_Master_Prompt.md). 41 sections, executed in order.

In Claude Code, from the repo root:

```
@Zenki_Master_Prompt.md execute starting at §2 — Section 0 has been verified false (see below). Work through one section at a time, run `npx tsc --noEmit` after each, and verify visually in the iOS Simulator before moving on.
```

## ⚠️ DO NOT execute Section 0

Section 0 claims 17,133 TS1127 errors from binary corruption in 15 files and instructs running:

```
sed -i 's/[^[:print:]\t\n]//g' <file>
```

This was verified false on 2026-04-28 from Windows:

- `npx tsc --noEmit` returns **0 errors** on `main` at commit `a3bcb2c`
- The "corrupted" files (`themes.ts`, `synth.ts`, `RootNavigator.tsx`, etc.) read as clean UTF-8
- The files contain legitimate Unicode (box-drawing `═` separators, em-dashes) that the `sed` command would strip — **causing** corruption it claimed to fix

Skip §0 entirely. Skip §1 too — there are no compile errors to fix at the start. Begin at §2.

## Section ordering recommendation

Split the remaining 40 sections into batches by risk. Verify in Simulator after each batch.

**Batch A — Quick text/style (low risk, no visual verification needed):**
§5 HR Session → Start Workout · §6 Calorie Tracking → Tracking · §11 EXTENDED → OHM · §39 Secure CREDENTIALS · §40 Dynamic version string · §16 Remove 3 themes · §7 Unify section headers · §8 YOUR DAY icon colors

**Batch B — Single-screen UI (verify in Simulator):**
§14 Move Edit Profile button · §15 Profile bio · §24 Differentiate Start Workout vs Workout · §22 Product review screen · §37 Drink screen padding · §38 Admin panel spacing

**Batch C — Sound + theme system:**
§13 Native sound engine (requires bundled .mp3 files in `src/assets/sounds/` — confirm files exist before starting; if not, they need to be added) · §17 Theme-specific sound packs · §18 Default to system theme · §12 SoundPressable migration

**Batch D — Spin wheel + vouchers:**
§2 Move spin trigger to top bar · §3 Spin wheel redesign · §30 Move vouchers (already partially done in commit a3bcb2c — verify against current state)

**Batch E — Weight + food log:**
§9 Weight graph at top · §10 Weight calendar · §19 Macro setup wizard · §20 Food log compact · §21 Food log action bar · §23 Draggable meal sections

**Batch F — Heavy features (pause and confirm scope before starting each):**
§4 HealthKit (verify entitlements, requires real device for full testing) · §25 GPS theme-adaptive · §26 Miles + swipe views · §27 Employee tabs · §28 Sign-in (Firebase + Apple/Google) · §29 Senpai mascot (already partially done in a3bcb2c — diff against current) · §31 AI photo food logging (Cloud Functions deploy) · §33 Community feed

**Batch G — Layout audit (iPhone + iPad Simulator both):**
§32 Keyboard blocking · §34 Booking layout · §35 Training screens · §36 iPad global

**Final:** §41 verification — `npx tsc --noEmit`, `npx expo-doctor`, `npx expo export`.

## Already partially complete (check before redoing)

Commit `a3bcb2c` ("Fix Senpai scroll-blocking + move vouchers to Home screen") touched:
- `src/components/SenpaiMascot.tsx` — §29 may already be done
- `src/screens/HomeScreen.tsx` — voucher section likely added
- `src/screens/ProfileScreen.tsx` — voucher UI likely removed

Diff these against the §29 and §30 specs in the master prompt before starting fresh.

## Current state

- Branch: `main`
- HEAD: `a3bcb2c`
- TS errors: 0
- Untracked artifacts on Windows side (screenshots, .docx audits, .zip iconsets) intentionally left out of this push.
