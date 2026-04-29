# Handoff — Zenki Dojo, post-Master Prompt sweep

## Current state

- Branch: `main` — pushed at end of every chunk
- TS: `npx tsc --noEmit` is **clean** (0 errors)
- expo-doctor: **17/18 checks pass**. The 1 failing is the
  `@expo/fingerprint` duplicate from `react-native-health@1.19.0`'s nested
  pin; harmless because `@expo/fingerprint` is JS-only build-tooling (EAS
  rebuild detection) and per the prior handoff line 59, "don't override
  unless EAS prebuild fails." Doctor's `react-native-health` "Untested on
  New Architecture" check is suppressed via
  `expo.doctor.reactNativeDirectoryCheck.exclude` in package.json.
- All 9 master-prompt chunks have shipped commits — see Master Prompt chunk index below.

## Master Prompt chunk index

| # | Sections | Final commit | Status |
|---|---|---|---|
| 1 | 0 / 5 / 6 / 11 / 40 | `c89050b` (prior) | ✅ done |
| 2 | 2 / 7 / 8 / 24 / 26 / 30 | `06aa91f` | ✅ done |
| 3 | 16 / 17 / 18 / 25 / 3 | `fcce881` | ✅ done (§25 deferred per handoff line 63) |
| 4 | 13 / 12 / 38 / 39 | `5149e28` | ⚠️ §13 + §38 + §39 ✅; §12 SoundPressable rollout DEFERRED |
| 5 | 4 / 14 / 15 / 28 | `eceb4d9` | ✅ done |
| 6 | 19 / 20 / 21 / 22 / 23 / 31 | `6a92a15` | ✅ done |
| 7 | 9 / 10 | `ce3804f` | ✅ done |
| 8 | 27 / 32 / 33 / 34 / 35 / 36 / 37 | `83d2ee9` | ⚠️ partial — see "Deferred" below |
| 9 | 41 final verification | this commit | ⚠️ partial — see "Deferred" below |

## Significant follow-up commits (out of chunk order)

| Commit | What | Why |
|---|---|---|
| `5a1bbec` → `d8877b0` | swap expo-av → expo-audio | expo-av@15.0.2 doesn't compile on SDK 55 (EXEventEmitter.h removed) |
| `54a5527` | HealthKit native-bridge guard | RN 0.83 bridgeless gap in react-native-health@1.19.0 |
| `1b072a4` | AuthContext fallback on email-already-in-use | sign in to existing Firebase account when create-account collides |
| `715fb4f` | SignIn username-or-email + Firestore Member hydration | admin-created users couldn't log in |
| `7e277e7` | trim whitespace in admin form / sign-in lookup | `mbrown ` (trailing space) failed to resolve |
| `89cac3f` | distinguish auth/wrong-password vs auth/email-already-in-use | error messages now actionable |
| `5621865` | SignIn keyboard: automaticallyAdjustKeyboardInsets | one-screen instance of §32 sweep |
| `8f466e1` | Resend Cloud Function for branded password-reset email | replaces Firebase's default spam-flagged sender |
| `d1e9d2d` | LogBox sim-only redbox filter | keychain entitlement / PushTokenManager / HK noise on unsigned sim builds |

## Deferred (open work)

### §32 keyboard sweep — large
After landing the `KeyboardAwareScrollView` wrapper (commit `89cc791`)
and migrating `ForgotPasswordScreen` + `AdminMembersScreen` modal,
~25 more screens need the same swap. Each is a 2–4 line diff:

- Group B (light fix — replace existing KAV+ScrollView with
  `<KeyboardAwareScrollView>`): AdminAnnouncements, AdminBroadcast,
  AdminEmployeeTasks, AdminProducts, AdminSchedule, Contact,
  ContactSupport, CycleTracker, DexaUpload, EmployeeChecklist,
  MacroSetup, MacroTracker (modal), Medication (modal),
  MessagesChat, Onboarding, PRDetail, Profile (modal), SetPassword,
  Settings, Store, UserProfile, WeightTracker (modal), Workout
- Group C (full wrap — no KAV at all): CreatePost, UserSearch

### §36 ScreenContainer sweep — large
`<ScreenContainer>` wrapper landed (commit `83d2ee9`). Applied as a
reference to `BookScreen`. Remaining iPad-relevant screens:
TrainingHomeScreen, WorkoutScreen, WorkoutSessionScreen,
MacroTrackerScreen, WeightTrackerScreen, ProfileScreen,
SettingsScreen, AdminScreen, all Admin sub-screens, etc. Each is a
single wrap.

### §36 touch targets — small
Audit all `SoundPressable` / `TouchableOpacity` for minimum 44×44pt
+ `hitSlop={{top:8,bottom:8,left:8,right:8}}` per master prompt.

### §36 maxFontSizeMultiplier — small
Apply `maxFontSizeMultiplier={1.3}` on critical text (some screens
already done, sweep needed).

### §12 SoundPressable rollout — large
~164 `TouchableOpacity` + ~200 `Pressable` across many files. Each
callsite needs case-by-case review for "already self-sounded"
exclusions. Risky to do as one mechanical sweep — defer until audio
deliverability is verified end-to-end on TestFlight.

### Resend password-reset email setup
Cloud Function code is committed (`8f466e1`) but not deployed. To
activate:
```
cd /Users/mbrown/Desktop/Zenki-App/functions
firebase functions:secrets:set RESEND_API_KEY
# (paste re_… key)
cd ..
npm --prefix functions run build
firebase deploy --only functions:sendPasswordReset
```
Until deployed, the client falls back to Firebase's default
spam-flagged sender (the existing pre-Resend behavior). Production
flip from `onboarding@resend.dev` to a verified domain is a
one-line edit in `functions/src/sendPasswordReset.ts:38` after DKIM
setup.

### §12 / §32 / §36 unused-imports cleanup
21 `noUnusedLocals` warnings remain. Each is a small per-file
removal but most are stateful (useState that's never destructured-
read, refs, local functions that may be referenced via JSX). Need
careful per-callsite review.

### `@expo/fingerprint` duplicate
expo-doctor flags the duplicate from
`react-native-health/node_modules/@expo/fingerprint@0.6.1` vs root
`@expo/fingerprint@0.16.6`. JS-only build tooling, harmless at
runtime. Per prior handoff line 59, leave alone unless EAS prebuild
fails.

## Carry-forward gotchas

- `react-native-health@1.19.0` is unmaintained. peer dep `>=0.67.3`
  hasn't been updated for RN 0.80+/bridgeless. The native-bridge
  guard at `54a5527` handles the JS shim's missing-method case on
  unsigned sim builds; production-signed builds typically work fine.
- `expo-av` is deprecated. We swapped to `expo-audio@~55.0.14`. If
  Expo eventually drops `expo-audio` in favor of something else, the
  refactor lives in `src/sounds/synth.ts:113-187` (NATIVE PLAYBACK
  block).
- The Cloud Function at
  `https://us-central1-zenki-dojo.cloudfunctions.net/recognizeFood`
  is healthy and rejects unauthenticated requests with HTTP 401
  (verified via curl). The `sendPasswordReset` sibling function is
  coded but not deployed.
- Local sim builds (`npx expo run:ios` direct, then xcodebuild) hit
  the Ruby/CocoaPods encoding bug — set `LANG=en_US.UTF-8` in the env
  before any `pod install`. Already in the prebuild flow per the
  earlier session.
- `applesignin` entitlement explicit in `app.json` — don't remove.
- `package.json` upgraded to RN 0.83.6 / Expo 55 / React 19.2.

## Master Prompt §25 — explicit decision

PipBoy/retro GPS variant for the matrix theme is **explicitly NOT**
being reintroduced (per prior handoff). ActivityTrackerScreen adapts
to all themes via `useTheme()` color tokens, which is sufficient for
the spec's clean-light / clean-dark / alien / sheikah variants.
Reopen only if explicitly requested.

## EAS / Apple state — reference

- `eas-cli/18.8.1`, logged in as `mattbrowntheemail` (Google SSO).
- Apple Team `RPV54B2NK5` (Matthew Brown — Individual). Distribution
  cert valid until 2027-04-24.
- App App ID: `6763685748` —
  <https://appstoreconnect.apple.com/apps/6763685748/distribution>.
- App Store Connect API key `AuthKey_393722HSY5.p8` is at project root,
  gitignored. **Back it up off-machine — Apple won't re-issue.**

---

Last updated: 2026-04-28 by Claude (Mac session, end of chunk 9 / context-limited).
