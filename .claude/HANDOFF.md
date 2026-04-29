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
| 9 | 41 final verification | `a93757e` | ⚠️ partial — see "Deferred" below |
| 9.1 | §32 sweep batch 1 | (this commit) | ⚠️ 20 of ~25 screens migrated; 4 left — Medication modal, Profile, WeightTracker, CreatePost+UserSearch |

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

### §32 keyboard sweep — IN PROGRESS (resume here)

**Done so far** (committed in this session, on top of `83d2ee9` chunk
8 / `a93757e` chunk 9):

- All 19 Group B "light fix" plain screens migrated to either
  `<KeyboardAwareScrollView>` (KAV+ScrollView combined) or
  `<KeyboardView>` (KAV-only, when there's a sticky footer outside
  the inner ScrollView, or a FlatList): AdminAnnouncements,
  AdminBroadcast, AdminEmployeeTasks, AdminProducts (outer only;
  inner edit-modal `<ScrollView style={{ flexGrow: 0 }}>` left
  alone — see "modal subset note" below), AdminSchedule (outer
  only; inner Add/Edit modal `ScrollView` left alone), Contact,
  ContactSupport (Header pulled outside KAS so it stays fixed),
  CycleTracker, DexaUpload (Header pulled outside), EmployeeChecklist,
  MacroSetup (`KeyboardView` + inner ScrollView preserved because
  of the sticky `<View style={styles.footer}>` Continue/Save
  button), MessagesChat (`KeyboardView` because content is a
  FlatList, not ScrollView), Onboarding (`KeyboardView` for the
  same sticky-footer reason — Back/Next nav row), PRDetail,
  SetPassword (used `outerStyle={styles.inner}` to preserve the
  original inner-style placement), Settings, Store (only the cart
  branch of the conditional render — outer ScrollView pager and
  other ScrollViews kept), UserProfile, Workout.
- Outer KAV+ScrollView for **MacroTracker** also migrated to
  `<KeyboardAwareScrollView>` (the outer wraps real form
  TextInputs at line ~689, so it counts as a Group B light fix
  even though the handoff tagged it "(modal)").

**Not yet done** — pick up here:

- `Medication` modal at `MedicationTrackerScreen.tsx:783-1103` —
  has a clear KAV+ScrollView in a slide modal. Migrate that
  modal's wrapper to `<KeyboardAwareScrollView>`. The screen's
  outer `<ScrollView>` at line ~239 is a plain list scroll (no
  KAV) and does NOT need migration.
- `Profile` outer KAV+ScrollView at `ProfileScreen.tsx:109-335` —
  migrate same as the others (outer wraps real form TextInputs).
- `WeightTracker` outer KAV+ScrollView at
  `WeightTrackerScreen.tsx:255-617` — migrate same.
- Group C full wrap — no KAV at all — `CreatePostScreen.tsx`,
  `UserSearchScreen.tsx`. Insert `<KeyboardAwareScrollView>` per
  the `89cc791` ForgotPasswordScreen pattern. Both already use
  `SoundPressable`, so no §12 risk applies.

**Modal subset note:** The handoff originally tagged MacroTracker,
Medication, Profile, WeightTracker as "(modal)", implying the
keyboard problem lived in a modal-internal `ScrollView` (mirroring
chunk 8's AdminMembers fix). On inspection only Medication
matches that shape — the others have their main keyboard pressure
on the OUTER screen's KAV+ScrollView, which is what got migrated.
The popup wizard / goals / set-goal modals on MacroTracker,
Profile, WeightTracker are small centered cards (not slide
sheets) with 4 TextInputs each; their iOS auto-keyboard-inset
handling is generally fine and they were NOT touched. If a
QA pass shows the SAVE button getting hidden behind the keyboard
on those popups, wrap the card in `<KeyboardView>` (KAV-only).

**Pattern reminders** (so you don't re-derive them):
- KAV had `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
  → KAS bakes that in, drop the prop.
- KAV had `keyboardVerticalOffset={64}` → use `offset={64}` on
  KAS (not `keyboardVerticalOffset`).
- ScrollView had `showsVerticalScrollIndicator={false}` and
  `keyboardShouldPersistTaps="handled"` → both baked into KAS,
  drop them.
- ScrollView's `contentContainerStyle={...}` → pass through to
  KAS as `contentContainerStyle={...}` (KAS already adds
  `flexGrow:1` + `paddingBottom:32` and merges).
- If the screen had its own `style={...}` on the KAV → pass to
  KAS as `outerStyle={...}` (see SetPasswordScreen).
- After dropping `KeyboardAvoidingView` and the keyboard-only
  `ScrollView` from `react-native` imports, **always** also drop
  `Platform` if grep shows no other `Platform.` usage in the
  file. Several files had `Platform` only in the keyboard
  wrapper. Onboarding kept it (3 other usages); Settings kept
  it (3 other usages); Store kept it; PRDetail dropped it.
- Add the new wrapper via the `../components` (or
  `../../components`) barrel import — both `KeyboardView` and
  `KeyboardAwareScrollView` are re-exported from
  `src/components/index.ts`. Don't deep-import.

### §32 keyboard sweep — Group C (still open)

`CreatePostScreen.tsx` and `UserSearchScreen.tsx` have no
keyboard wrapper at all. Insert `<KeyboardAwareScrollView>` the
same way `ForgotPasswordScreen` was migrated in chunk 8.

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
Verified 2026-04-28: actual counts are **167** `TouchableOpacity`
+ **54** `Pressable` (non-SoundPressable) = 221 callsites, vs
the prior "164+200=364" estimate. `SoundPressable` itself has
already landed at 818 callsites, so the rollout is mostly done.
Each remaining callsite still needs case-by-case review for
"already self-sounded" exclusions. Risky to do as one mechanical
sweep — defer until audio deliverability is verified end-to-end
on TestFlight.

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
one-line edit in `functions/src/sendPasswordReset.ts:42` after DKIM
setup. (Note: prior handoff said line 38 but the actual `from:`
is at line 42.)

### §12 / §32 / §36 unused-imports cleanup — DONE / obsolete
Re-checked 2026-04-28: `npx tsc --noEmit | grep "is declared but"`
returns **0**. The 21-warning estimate from the prior handoff is
no longer accurate — chunk 9 final verification cleaned this up.
Drop this item.

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

Last updated: 2026-04-28 (later same day) by Claude — §32 sweep
batch 1 landed (20 of ~25 screens). Context-limited; resume per the
"§32 keyboard sweep — IN PROGRESS" section above.
