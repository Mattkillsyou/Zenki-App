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
| 9.1 | §32 sweep batch 1 (20 screens) | `b714dd3` | ✅ done |
| 9.2 | §32 wrapper rewrite (drop KAV on iOS) | `eb0876d` | ✅ done — fixes "keyboard blocks content" globally |
| 9.3 | Modal SafeArea bug (X under dynamic island) | `bf8a6e4` | ✅ done — FoodSearchModal + Med modal |
| 9.4 | §32 sweep batch 2 + Group C | `3f290d9` | ✅ done — Med modal, Profile, WeightTracker, CreatePost, UserSearch |
| 9.5 | §36 ScreenContainer sweep (16 screens) | `0dcc9ff` | ✅ done — 8 listed + 8 Admin siblings; AdminMembers KAV→KAS bonus |
| 9.6 | §36 touch targets (hitSlop default in SoundPressable) | `40feb6d` | ✅ done — single-line fix, ~800 callsites covered |
| 9.7 | §36 maxFontSizeMultiplier on critical text | `6ba359d` | ✅ done — Button + 4 shared badges |

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

### 🐛 Modal-header-under-status-bar bug — FIXED in this session

**User QA 2026-04-28:** "I can't exit the Food Log or the medication
screen. The headers need to move under the clock and the battery.
They are too high."

**Root cause:** `react-native-safe-area-context`'s inset context
does not propagate through React Native's `<Modal>`. The app has
exactly one `<SafeAreaProvider>` at `App.tsx:189`, so any
`<SafeAreaView edges={['top']}>` rendered inside a Modal returned
zero insets — the header sat at y=0 directly under the dynamic
island. The library docs confirm: "If you are using a Modal you
need to wrap it with a SafeAreaProvider so that the safe area
insets work inside the Modal."

**Fix applied** (this commit):
- `src/components/FoodSearchModal.tsx` — added
  `<SafeAreaProvider>` immediately inside `<Modal>` and around
  the existing `<SafeAreaView edges={['top']}>`.
- `src/screens/MedicationTrackerScreen.tsx` — same fix on the
  Add/Edit Medication modal (~line 757).
- Both files import `SafeAreaProvider` alongside `SafeAreaView`
  from `react-native-safe-area-context`.

**Audit done; other modals not affected:**
After fixing the two confirmed cases, I checked every other file
that has a `<Modal>` containing a `<SafeAreaView>`:
- `AdminMembersScreen` and `AdminScheduleScreen` — both use
  `presentationStyle="pageSheet"`, which on iOS auto-pads below
  the system status bar. No fix needed.
- `ProfileScreen` (edit), `SettingsScreen` (password),
  `AdminProductsScreen` (product edit) — centered-card popups
  (`modalBackdrop` → centered `modalCard`). The X / close button
  is on the card, not at y=0. No fix needed.
- `WeightTrackerScreen` history — bottom-sheet; header sits
  partway down the screen. No fix needed.
- `MacroTrackerScreen` wizard, `HomeScreen` voucher,
  `WeightTrackerScreen` calendar/goal — small centered fade
  popups. No fix needed.

**If a future bug report names another modal with this symptom**:
the fix is the same 4-line additive change — add
`<SafeAreaProvider>` inside `<Modal>`, wrap the existing
`<SafeAreaView edges={['top']}>`. Risk is essentially zero
because the provider only adds context; nothing existing breaks.

**Verify on device:** open the food log → Search foods button
in MacroTracker; open the Medication tracker → Add medication
button. On iPhone 17 Pro Max the X should now sit ~59pt below
the dynamic island and the Save button should be fully visible
to the left of the battery glyph.

### §32 keyboard sweep — DONE

The full ~25-screen sweep landed in three commits on top of
`83d2ee9` (chunk 8) / `a93757e` (chunk 9):

- `b714dd3` — batch 1: 19 Group B "light fix" plain screens +
  MacroTracker outer (20 total) → `<KeyboardAwareScrollView>` or
  `<KeyboardView>`.
- `eb0876d` — wrapper rewrite. User QA after batch 1 reported
  "the keyboard needs to not block the content on all of the
  pages. like a normal app." Root cause: the original
  KeyboardAwareScrollView wrapped a ScrollView in a
  `<KeyboardAvoidingView behavior="padding">`, AND the inner
  ScrollView also had `automaticallyAdjustKeyboardInsets`. Both
  add bottom inset = keyboard height; stacking them double-
  applied the inset and broke the iOS-native auto-scroll-to-
  focused-field. Fix: drop KAV on iOS (just `<View flex:1>` +
  ScrollView with `automaticallyAdjustKeyboardInsets +
  contentInsetAdjustmentBehavior="automatic"`); keep KAV
  `behavior="height"` on Android. Single-file change to
  `src/components/KeyboardView.tsx`.
- (current commit) — batch 2 + Group C: MedicationTrackerScreen
  modal, ProfileScreen outer, WeightTrackerScreen outer,
  CreatePostScreen wrapped, UserSearchScreen FlatList prop.

**KeyboardView (KAV-only) wrapper unchanged**: still uses
`behavior="padding"` on iOS. Used by 3 callers — MacroSetup,
MessagesChat, OnboardingScreen — each of which has a sticky
footer (Continue/Send/Next) that must ride above the keyboard.
The inner ScrollView/FlatList in those screens does not have
`automaticallyAdjustKeyboardInsets`, which is fine because the
KAV padding pushes the whole layout up — focused TextInputs
remain visible above the keyboard, even if at the cost of not
auto-scrolling the field into view inside the inner ScrollView.

**FoodSearchModal NOT touched**: same sticky-footer pattern (the
`pickPanel` with the servings TextInput is at the bottom). Its
existing KAV `behavior="padding"` is correct for that layout.
Did get the SafeAreaProvider fix in `bf8a6e4` for the X-button-
under-status-bar bug, though.

**Out of §32 scope but adjacent**: The popup wizard / goal
modals on MacroTracker, ProfileScreen edit modal, WeightTracker
goal modal, etc. are small centered cards (not slide sheets)
with TextInputs. Their iOS auto-keyboard-inset handling is
generally fine without explicit wrapping. If a future QA pass
shows the SAVE button hidden behind the keyboard on one of
those popups, wrap the card in `<KeyboardView>` (KAV-only).

**Pattern reminders** (so future work doesn't re-derive them):
- KAV had `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
  → KAS bakes that in, drop the prop.
- KAV had `keyboardVerticalOffset={64}` → use `offset={64}` on
  KAS (Android-only after the wrapper rewrite; iOS uses native
  frame measurement and ignores it).
- ScrollView had `showsVerticalScrollIndicator={false}` and
  `keyboardShouldPersistTaps="handled"` → both baked into KAS,
  drop them.
- ScrollView's `contentContainerStyle={...}` → pass through to
  KAS as `contentContainerStyle={...}` (KAS already adds
  `flexGrow:1` + `paddingBottom:32` and merges).
- If the screen had its own `style={...}` on the KAV → pass to
  KAS as `outerStyle={...}` (see SetPasswordScreen).
- After dropping `KeyboardAvoidingView` and the keyboard-only
  `ScrollView` from `react-native` imports, also drop
  `Platform` if grep shows no other `Platform.` usage in the
  file.
- Add the new wrapper via the `../components` (or
  `../../components`) barrel import — both `KeyboardView` and
  `KeyboardAwareScrollView` are re-exported from
  `src/components/index.ts`. Don't deep-import.

### §36 ScreenContainer sweep — DONE (commit `0dcc9ff`)
Wrapped 16 iPad-relevant screens in `<ScreenContainer>`: the 8
listed in the original handoff (TrainingHome, Workout,
WorkoutSession, MacroTracker, WeightTracker, Profile [form],
Settings [form], Admin) + all 8 Admin siblings (Announcements,
Appointments, Broadcast, EmployeeTasks, Members, Products,
Reports, Schedule). Phone behavior unchanged; iPad now caps
content width at 700pt (or 600pt for form-heavy screens) and
centers it. Bonus: AdminMembers's leftover outer
`KeyboardAvoidingView` from chunk 8 was migrated to
`<KeyboardAwareScrollView>` for consistency.

### §36 touch targets — DONE (commit `40feb6d`)
Baked `hitSlop={{top:8, bottom:8, left:8, right:8}}` as a default
into `SoundPressable`. Single-component change covers ~800
callsites globally. Callers can still override `hitSlop` to
disable or customize. The remaining 167 raw `TouchableOpacity`
callsites that aren't routed through `SoundPressable` will
inherit the default once they migrate under §12.

The visible-44×44pt half of the §36 sub-bullet is NOT enforced
mechanically — most existing buttons already have width/height
40-44; the few smaller icon-only callsites now still clear 44pt
of *hit* area thanks to the default hitSlop. If a per-callsite
audit shows a specific button still too small, that's a one-off
style edit.

### §36 maxFontSizeMultiplier — DONE (commit `6ba359d`)
Added `maxFontSizeMultiplier={1.3}` to `<Text>` inside the most-
used shared components: Button title, SectionHeader title +
action, StreakBadge count + label (both states), PointsBadge
count + label, XPProgressBar level/xp text. Body copy and form
labels intentionally NOT capped — they should still scale fully
with Dynamic Type. If a future QA pass at 200% text size shows
breakage on a specific surface (e.g., a screen-local Text
overflowing), that screen can add the prop on its own Text.

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

Last updated: 2026-04-28 (later same day) by Claude.
  • §32 keyboard sweep COMPLETE — wrapper rewrite (eb0876d) is
    the load-bearing fix; "like a normal app" behavior on every
    migrated screen.
  • Modal SafeArea bug FIXED in bf8a6e4 (Food Search + Add Med).
  • §36 ScreenContainer / touch targets / maxFontSizeMultiplier
    all COMPLETE in 0dcc9ff / 40feb6d / 6ba359d.
  • Still open and gated:
      – §12 SoundPressable rollout (167 raw TouchableOpacity + 54
        Pressable). Defer until audio is verified end-to-end on
        TestFlight; mechanical sweep risks double-sounds where
        parent cards already self-sound.
      – Resend Cloud Function deploy. Code is committed (8f466e1)
        but needs the user to set RESEND_API_KEY and run
        `firebase deploy --only functions:sendPasswordReset`.
