# Handoff — Zenki Dojo App Store submission

This doc bridges sessions across machines. Last session: Windows. Next session: Mac.

## What this app is

`Zenki Dojo` — invite-only React Native + Expo SDK 52 app for a luxury LA martial arts dojo. Members-only (the gym has ~20 paying members at $1000/mo). Bundle id `com.zenkidojo.app`. Repo: github.com/Mattkillsyou/Zenki-App, branch `main`.

## Current state

- TS compiles clean (`npx tsc --noEmit` → 0 errors)
- Web preview runs cleanly under `npx expo start --web`
- `npx expo export --platform ios` succeeds (~6.31 MB JS bundle)
- App Store Connect is mostly configured (see below)
- **Two remaining blockers to App Store submission:** screenshots and a fresh production build that includes recent commits

## Recent commits relevant to submission

| SHA | What |
|---|---|
| `75bb40a` | (pre-audit) external config items 1–5 |
| `75562d0` | Pre-App Store audit + auth UX polish — strip seed passwords from CREDENTIALS in production, remove unused android `RECORD_AUDIO` permission, inline error banner on sign-in, ~80 unused-import cleanup across 30+ files |
| `4a6e838` | Add iOS privacy manifest in `app.json` (`expo.ios.privacyManifests`) — declares 4 required-reason APIs (UserDefaults/CA92.1, FileTimestamp/C617.1, DiskSpace/E174.1, SystemBootTime/35F9.1) and `NSPrivacyTracking: false` |

## App Store Connect state

App Apple ID: `6763685748` — https://appstoreconnect.apple.com/apps/6763685748/distribution

| Section | Status |
|---|---|
| App Information (name, bundle id, category Health & Fitness, subcategory Lifestyle) | ✅ |
| Subtitle "Train, recover, level up." | ✅ |
| Description, keywords, support URL (`zenki-dojo.web.app/support`), marketing URL (`zenkidojo.com`) | ✅ |
| Privacy Policy URL (`zenki-dojo.web.app/privacy`) | ✅ |
| App Privacy disclosures (13 data types, "Data Linked to You") | ✅ |
| Age rating (9+) | ✅ |
| Pricing (USD), tax category | ✅ |
| App Review Information (reviewer credentials + demo notes) | ✅ — fixed in last session ("ZENKI FIT" → "Zenki Dojo") |
| **Screenshots** | ❌ 0 of 10 — needs 3+ at iPhone 6.5"/6.7" |
| **Active build attached** | ❌ Apr 24 builds 1.0.0 (1) and 1.0.0 (16) are both Expired in TestFlight |

App availability: 44 of 175 countries enabled. Confirm this is intentional (US-focused) before hitting Add for Review.

## Next steps on Mac

```bash
git pull
npm install
```

**1. Screenshots** — open in iOS Simulator and capture:
```bash
npx expo run:ios --device "iPhone 15 Pro Max"
```
First run does a local prebuild and native compile, ~10 min. In the Simulator: `Cmd+S` saves a screenshot to Desktop. Capture at least 3 (Apple uses the first 3 in install sheets). Suggested screens: Home, Schedule, Book, Store, Workout. Drag the PNGs into App Store Connect → Distribution → Previews and Screenshots → iPhone 6.5".

**2. Production build** to EAS:
```bash
npx eas-cli login
npx eas-cli build --platform ios --profile production
```
`appVersionSource: "remote"` in `eas.json` means EAS auto-bumps build number — next will be 17 (after 16). Cloud build, ~20 min, runs without local action after submit.

**3. Submit to TestFlight + verify reviewer login:**
```bash
npx eas-cli submit --platform ios --latest
```
After it processes (~10 min), install on a real iPhone or via Simulator and **manually test sign-in with the reviewer credentials** (in App Store Connect → App Review Information). The Windows session refactored `CREDENTIALS` so prod ships with empty seed passwords — Firebase Auth is the source of truth. The first sign-in attempt either uses an existing Firebase Auth record (created during build 16's TestFlight testing) or seeds a new one. **Verify before submitting for review.**

**4. Hit Add for Review** in App Store Connect → Distribution.

## Known gotchas

1. **`react-native-health` pulls in `@expo/config-plugins@7.9.2`** — everything else is on 9.0.17. `expo-doctor` flags this. If `npx expo run:ios` chokes during prebuild, the override is:
   ```bash
   npm install --save-exact @expo/config-plugins@9.0.17
   ```
   Don't override unless the build actually fails — react-native-health's plugin code might depend on v7 APIs.

2. **`react-native-health` is "Untested on New Architecture"** — also from expo-doctor. Only matters if New Arch is enabled. Default in Expo SDK 52 is opt-in, so likely fine.

3. **`firebase` and `leaflet`** show "No metadata available" in expo-doctor — informational, not a blocker.

4. **`CREDENTIALS` in `src/data/members.ts`** is now `__DEV__`-gated. Production has the username→memberId mapping but blank passwords. Firebase Auth verifies the real password. Don't "fix" this in a future cleanup pass — it's intentional security hardening.

## Untracked files in working tree (not in git)

These were intentionally not committed in the last session — decide what's keepable:

- `Zenki_Pre_AppStore_Audit.docx` — audit doc Cowork generated, lives here for reference
- `CLAUDE_CODE_PROMPT.md`, `PROMPT_MedPeptideTracker.md` — prompt artifacts, probably local-only
- `app-store-screenshots/01-home.png`, `app-store-screenshots/capture.py` — in-progress screenshot work
- `assets/_logo_backup/` — backup, gitignored by underscore convention
- `scripts/` — contains `make_transparent.py`
- `src/screens/ActivityTrackerScreen.matrix.tsx` — experimental variant, not imported
- `zenki-final-1024.png`, `zenki-final-Inverted-1024.png` — likely the App Store marketing icon
- `zenki-iconset.zip`, `zenki-iconset-inverted.zip`, `zenki-iconsets/`, `zenki-kb-z-refined-appiconset/`, `zenki-zenki-final-appiconset.zip` — icon work-in-progress

If `zenki-final-1024.png` is the final marketing icon, wire it into `app.json` (`expo.icon`) before the production build.

## What's NOT a blocker

- `tsc` errors — there are none, despite Cowork's earlier (incorrect) claim. Don't waste a minute on the "binary corruption" / "21k errors" thread; it was wrong.
- Privacy manifest — committed in `4a6e838`. EAS will bundle it.
- Babel `transform-remove-console` — already wired for production via `babel.config.js` env block.

---

Last updated: 2026-04-26 by Claude (Windows session).
