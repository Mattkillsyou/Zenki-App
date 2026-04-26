# Handoff — Zenki Dojo App Store submission

This doc bridges sessions across machines and conversations. Read it on a fresh session to pick up exactly where we left off.

## What this app is

`Zenki Dojo` — invite-only React Native + Expo SDK 55 app for a luxury LA martial arts dojo. Members-only (the gym has ~20 paying members at $1000/mo). Bundle id `com.zenkidojo.app`. Repo: `github.com/Mattkillsyou/Zenki-App`. Owner on EAS / Expo: `mattbrowntheemail` (Google SSO).

## Where things stand right now

**Strategy decision (2026-04-26):** skipping submission of build 20 (SDK 52). Apple's April 28 2026 deadline requires iOS 26 SDK / Xcode 26 for any new uploads or submissions for distribution. Going straight to build 21 on **Expo SDK 55** so the first App Store submission is on a binary that won't be obsolete by deadline day.

Current branch: `sdk-55-upgrade` (commit `fe12263`). Build 21 is queued/running on EAS verifying the upgrade compiles natively. After it succeeds: merge to `main`, submit, click Add for Review.

## Current state

| Layer | Status |
|---|---|
| Local TS compile (`tsc --noEmit`) | ✅ clean |
| JS bundle (`expo export --platform ios`) | ✅ 6.4 MB |
| **EAS native iOS build (#21)** | ⏳ in progress — [e291474e](https://expo.dev/accounts/mattbrowntheemail/projects/zenki-dojo/builds/e291474e-9b27-456b-85ad-510784e00705) |
| App Store Connect metadata | ✅ done (Apr 26 session) |
| App Privacy disclosures | ✅ 13 data types, all linked to user, no tracking |
| App Review notes | ✅ "Zenki Dojo" branding, demo creds, demo data, no-IAP rationale |
| App ID capabilities | ✅ trimmed to actuals: HealthKit + Sign in with Apple + Push Notifications |
| Manual provisioning profile v2 | ✅ uploaded to EAS |
| App Store Connect API key | ✅ created (`393722HSY5`), `.p8` saved at project root, gitignored |
| `eas.json` submit config | ✅ wired to API key for hands-free submit |

## Key version bumps in this branch

| Package | Old (SDK 52) | New (SDK 55) |
|---|---|---|
| expo | `~52.0.0` | `^55.0.0` |
| react / react-dom | `18.3.1` | `19.2.0` |
| react-native | `0.76.9` | `0.83.6` |
| @types/react | `~18.3.0` | `~19.2.10` |
| All `expo-*` packages | `~52.x` | `~55.x` |
| All `react-native-*` packages | mixed | aligned to SDK 55 ranges |

`newArchEnabled: false` was set explicitly in `app.json` because `react-native-health` is flagged "Untested on New Architecture". Ship on legacy bridge with iOS 26 SDK; flip NA on once that lib is verified or replaced.

## Next session: do this

1. **Confirm build 21 succeeded** on EAS:
   ```bash
   npx eas-cli build:view e291474e-9b27-456b-85ad-510784e00705
   ```
   Status should be `finished`. If not, see "If build 21 errored" below.

2. **Merge `sdk-55-upgrade` to `main`** using the prepared commit message:
   ```bash
   git checkout main
   git merge --no-ff sdk-55-upgrade -F .claude/MERGE_MSG.txt
   git push origin main
   ```

3. **Submit build 21 to TestFlight** (eas.json is already wired for non-interactive submit via the `.p8` API key):
   ```bash
   npx eas-cli submit --platform ios --latest --non-interactive
   ```
   ~5-10 min for Apple processing. Email arrives when done.

4. **(Optional) install on real iPhone** via TestFlight to smoke-test sign-in / HealthKit / camera. If you don't have an iPhone handy, skip — Apple's reviewer tests on real hardware.

5. **Click Add for Review** in App Store Connect → Distribution. Confirm 44 of 175 country availability is intentional first.

6. **Watch for ITMS-90725 email**. If build 21 came in before April 28 with iOS 26 SDK, no warning. If not, see Plan B below.

## EAS / Apple state

- `eas-cli/18.8.1` installed on this Windows box, logged in as `mattbrowntheemail` (browser auth at https://expo.dev).
- Apple Developer Team `RPV54B2NK5` (Matthew Brown — Individual). Distribution cert valid until **2027-04-24**.
- App Apple ID: **`6763685748`** — https://appstoreconnect.apple.com/apps/6763685748/distribution
- App Store Connect API key file: `D:\Zenki\App\AuthKey_393722HSY5.p8` (Issuer `c17533c7-83ed-4f4e-8e9a-c4f7b72188fd`, Key ID `393722HSY5`, role App Manager). **Gitignored — back up separately, Apple will not let you re-download.**

## App Store Connect state (verified Apr 26)

| Section | Status |
|---|---|
| App Information, subtitle, description, keywords, URLs | ✅ |
| Privacy Policy URL: `https://zenki-dojo.web.app/privacy` | ✅ |
| Privacy disclosures (13 data types, Data Linked to You) | ✅ |
| Age Rating (9+) | ✅ |
| Pricing (USD, 44 countries — confirm intentional) | ⚠️ verify |
| App Review Information (`admin/password` reviewer creds + demo notes) | ✅ |
| **Screenshots** | ❌ 0 of 10 — needs 3+ at iPhone 6.5"/6.7" before Add for Review |
| **Active build attached** | ⏳ build 21 will be submitted here |

## If build 21 errored

Most likely culprits in order:

1. **`react-native-health` pod compile failure on Xcode 26.** This lib is unmaintained and may need a fork. Check the build logs for `react-native-health` Pod errors. Quick triage:
   - Lock to a specific commit on the lib's main branch
   - Try forking and patching the iOS pod's `min_ios_version` if it's blocking
   - Last resort: replace with `@kingstinct/react-native-healthkit` (actively maintained, supports New Architecture, drop-in for most reads)

2. **`@expo/fingerprint` duplicate dep.** `react-native-health` bundles its own `@expo/fingerprint@0.6.1`; project has `0.16.6`. Probably fine, but if EAS flags it, add an `npm overrides` block to force the project version.

3. **PrivacyInfo.xcprivacy** that we added in commit `4a6e838` got lost in the SDK upgrade — check `app.json` `expo.ios.privacyManifests` is still present.

## Plan B if April 28 deadline passes before build 21 submits

The April 28 deadline is for **uploads + submissions for distribution**. If build 21 is already uploaded to App Store Connect before midnight Pacific April 27/28, you can click Add for Review even after the deadline — Apple's review continues normally.

If build 21 doesn't make it in time, it can't be submitted at all on the SDK 52 binary. The fix is just to keep iterating on SDK 55 (which IS iOS 26 SDK) until build is green and submit.

## Known gotchas (carry forward)

1. **`react-native-health` is the project's biggest fragility.** Untested on New Architecture, pulls in stale `@expo/config-plugins`, may need replacement in v1.1+. `newArchEnabled: false` is the workaround for now. Plan replacement with `@kingstinct/react-native-healthkit` for v1.1.
2. **`firebase` and `leaflet`** show "No metadata available" in expo-doctor — informational, not blockers.
3. **`CREDENTIALS` in `src/data/members.ts`** is `__DEV__`-gated. Production ships username→memberId mapping with blank passwords; Firebase Auth verifies real password. Don't "clean this up" — it's intentional security hardening.
4. **Untracked at repo root** (don't auto-commit): `Zenki_Dojo_AppStore_Manual.mobileprovision`, `Zenki_Dojo_AppStore_Manual_v2.mobileprovision`, `AuthKey_393722HSY5.p8`. All are credentials, gitignored.
5. **Untracked icon work-in-progress** at repo root (`zenki-final-1024.png`, `zenki-iconset-inverted/`, etc.) — predates this session. User decides what to do with them.
6. **App Pay was on the App ID at one point and got removed.** App Store doesn't process payments in-app (per StoreScreen.tsx + BookScreen.tsx — both say "pay at dojo"). If you re-add Apple Pay later for v1.1+ (user mentioned wanting Apple Pay for Store + Booking), you need: re-enable APPLE_PAY on App ID + create Merchant ID + payment processor (Stripe recommended) + backend Cloud Function + UI screens.

## Critical preserved files

- `D:\Zenki\App\AuthKey_393722HSY5.p8` — App Store Connect API key (back up off-machine; Apple won't re-issue)
- `D:\Zenki\App\Zenki_Dojo_AppStore_Manual_v2.mobileprovision` — Provisioning profile (regenerable from developer.apple.com)
- `D:\Zenki\App\.claude\MERGE_MSG.txt` — pre-written merge commit message for `sdk-55-upgrade` → `main`
- `D:\Zenki\App\.claude\PRE_REVIEW_CHECKLIST.md` — smoke-test walkthrough for the new build before clicking Add for Review

---

Last updated: 2026-04-26 by Claude (Windows session, post-SDK-upgrade). On branch `sdk-55-upgrade`, commit `fe12263`, build 21 in flight.
