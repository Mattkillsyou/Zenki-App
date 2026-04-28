# ZENKI — MASTER PROMPT

Complete list of all changes, fixes, and features.
Execute each section sequentially. Run `npx tsc --noEmit` after each to verify. Do NOT skip sections.

---

## 0. Strip Binary Corruption (DO THIS FIRST)

15 files have corrupted non-printable bytes causing 17,133 TS1127 errors that cascade into 21,000+ false positives. Nothing else will compile until this is fixed.

Files:
- `src/theme/themes.ts`, `src/sounds/synth.ts`, `src/screens/AdminScheduleScreen.tsx`
- `src/navigation/RootNavigator.tsx`, `src/screens/DrinkScreen.tsx`, `src/content/trainingModules.ts`
- `src/components/ThemeOverlay.tsx`, `src/screens/SettingsScreen.tsx`, `src/screens/MedicationTrackerScreen.tsx`
- `src/theme/index.ts`, `src/screens/EmployeeChecklistScreen.tsx`, `src/types/activity.ts`
- `src/utils/insights.ts`, `src/components/EmptyState.tsx`, `src/data/achievements.ts`

For each: `sed -i 's/[^[:print:]\t\n]//g' <file>`. Verify with `file <path>` it reads as text. Re-run tsc after all 15 are clean. Fix any remaining structural TS errors (unclosed JSX tags, missing braces).

---

## 1. Fix All TypeScript Compilation Errors

After binary corruption is stripped, run `npx tsc --noEmit`. Fix every remaining error. Target: zero errors. Most will be cascade artifacts from section 0 that vanish once corruption is removed. Fix any real structural errors that remain.

---

## 2. Replace SpinWheelIcon + Move to Top Bar

Delete `src/components/SpinWheelIcon.tsx` (ugly generic SVG spoke wheel). Replace all usages with an Ionicons icon. In `src/screens/HomeScreen.tsx`, the spin wheel trigger is a floating FAB inside SpinWheelModal around line 640. Move the trigger into the top stats bar (header area at lines 530-561, alongside PointsBadge, flamesChip, StreakBadge, notification bell). Remove the floating FAB. Size to match other bar items. Fix `styles.headerRight` so all items are evenly spaced and horizontally centered.

---

## 3. Daily Spin Wheel Redesign

The Daily Spin wheel modal is ugly. Currently white background with flat yellow/black segments and raw emoji icons. Redesign:
- Dark background matching app theme, not white
- Each wheel slice a different vibrant color (red, blue, green, purple, orange, pink, teal, gold)
- Replace raw emojis with styled Ionicons for rewards
- Add glow/shine gradient effect on wheel surface
- Improve pointer/arrow at top
- Polish spin animation (easing, slight bounce at end)
- Make TAP TO SPIN button more exciting — gradient background, larger, pulse animation while idle
- Modal title/subtitle should match app typography

---

## 4. Apple HealthKit Sync

Integrate bidirectional Apple HealthKit sync. The app already has `react-native-health` in package.json and health entitlements in app.json. Create `src/context/HealthKitContext.tsx` that syncs: workouts, calories burned, active minutes, nutrition/macros, weight (WeightTrackerScreen), heart rate (HeartRateContext), steps. Wire into providers in App.tsx. On app launch + after local data writes, push to HealthKit. On app foreground, pull from HealthKit. Add required entitlements and permissions to app.json.

---

## 5. Rename "HR Session" → "Start Workout"

In `src/screens/HomeScreen.tsx` around line 891, the training module label says "HR Session". Rename to "Start Workout". Grep entire `src/` for "HR Session" and rename every occurrence including navigation labels, help text in HelpScreen (around line 36), WorkoutSessionScreen headers.

---

## 6. Rename "Calorie Tracking" → "Tracking"

In `src/screens/HomeScreen.tsx` around line 738. Also check SectionHeader component. Grep `src/` for "Calorie Tracking" and update all references.

---

## 7. Unify Section Header Styling

All section headers on home screen are inconsistent. Unify ALL to: ALL CAPS, fontSize 13, fontWeight 700, letterSpacing 1.5, primary sans-serif font. Update both inline styles in HomeScreen (`sectionTitle` at line 1267) and SectionHeader component at `src/components/SectionHeader.tsx`.

---

## 8. Icon Color Consistency

In `src/screens/HomeScreen.tsx`, YOUR DAY stat cards (lines 831-875) use different icon colors per card (redMuted, warningMuted, successMuted, infoMuted). Training module icons use gold. Unify YOUR DAY stat card icons to also use gold/yellow color scheme, matching Training section.

---

## 9. Weight Page — Graph at Top + Layout Fix

In `src/screens/WeightTrackerScreen.tsx`:
- Move the chart to the top of the page (currently below log form)
- Wire chart to 7D/14D/30D/TOTAL tab buttons
- Plot actual weigh-in data points as dot markers, add dashed trend line for rolling average
- Fix save button clipped off right edge (formRow layout issue)
- Fill empty space at bottom with Recent Logs and Goal Progress content
- Style chart to match dark theme with gold accents

---

## 10. Weight Page — Calendar View

Below the chart, add a monthly calendar view. Days with a logged weigh-in show a gold dot. Days without are unmarked. Minimal design, dark theme.

---

## 11. Rename EXTENDED → OHM

In `src/screens/TimerScreen.tsx`, find the timer preset labeled "EXTENDED" and rename to "OHM". Grep `src/` for "EXTENDED" and update all references including constants, types, storage keys.

---

## 12. Global Button Click Sounds

`SoundPressable` wrapper at `src/components/SoundPressable.tsx` already exists. Project-wide find-and-replace: every `TouchableOpacity` and `Pressable` in `src/screens/` and `src/components/` should use `SoundPressable` instead. Exclude any that already call a sound manually.

---

## 13. Fix Sound Engine for Native iOS

**CRITICAL:** No sounds play on iOS/iPad. Root cause: `src/sounds/synth.ts` is Web Audio API only. Line 27: `if (Platform.OS !== 'web') return null` — `playSynth()` no-ops on native.

Fix: implement native playback using `expo-av` (already in Expo SDK):
- Keep existing Web Audio path for `Platform.OS === 'web'`
- For native, use `expo-av` `Audio.Sound` to play short bundled .mp3 files (`tap.mp3`, `success.mp3`, `error.mp3`, `navigate.mp3`, `open.mp3`, `close.mp3`, `transform.mp3`) in `src/assets/sounds/`
- Pre-load Sound objects on first call, cache in module-level Map
- Each sound theme (default, matrix, alien, sheikah, senpai) should use different files or vary playbackRate/volume
- `playSynth()` must NOT return early on native — it must produce audible output on iOS

---

## 14. Move Edit Profile Button

In `src/screens/ProfileScreen.tsx` (lines 182-188), move the Edit Profile button to top-right corner of the screen header. Use absolute positioning or place in header bar. Remove from current location in profile card. Keep same onPress behavior.

---

## 15. Profile Bio Display

In `src/screens/ProfileScreen.tsx` (lines 173-176), below the user's name and above the FOUNDING MEMBER badge, show the user's bio/funFact from onboarding. The user object has a `funFact` field (`src/data/members.ts` line 45). Display in `colors.textSecondary`, fontSize 14. If empty, don't render.

---

## 16. Remove Themes: Jurassic, Ghost, Blade Runner

In `src/theme/themes.ts`, remove `jurassicTheme` (~line 143), `ghostTheme` (~line 189), `bladerunnerTheme` (~line 235). Remove from `ALL_THEMES` array (~line 643). Grep `src/` for `'jurassic'`, `'ghost'`, `'bladerunner'` and remove all references. Remove associated sound theme entries in `src/sounds/synth.ts`.

---

## 17. Theme-Specific Sound Packs

Verify Matrix, Nostromo, Sheikah Slate each have distinct sound profiles in `synth.ts` for all 7 SoundEvent types. Matrix = digital/glitchy, Nostromo = industrial/alarm, Sheikah Slate = mystical/chime. If any fall back to default, create unique profiles.

---

## 18. Default to System Theme

On first launch, use `Appearance.getColorScheme()` from react-native to pick `'clean-light'` or `'clean-dark'`. Only as default for first launch — if user previously selected a theme, respect stored choice. Check `src/context/ThemeContext.tsx` for initialization logic.

---

## 19. Food Log — First-Time Macro Setup

In `src/screens/MacroTrackerScreen.tsx`, on first mount check flag `'@zenki_macro_setup_done'`. If false/missing, show modal wizard for daily calorie/protein/carb/fat goals. Include Skip and Save buttons. Reuse logic from `src/screens/MacroSetupScreen.tsx` inside the modal.

---

## 20. Food Log — Compact Layout

In `src/screens/MacroTrackerScreen.tsx`, compress whitespace. Reduce padding > 16 to 10-12, gap > 12 to 8, secondary font sizes > 14 to 12. Same information, less vertical space.

---

## 21. Food Log — Top Action Bar

In `src/screens/MacroTrackerScreen.tsx`, add sticky row at top with three pill buttons: Search (Ionicons search), Scan (barcode), Photo (camera). Gold accent, same style as Training module buttons. Wire Search to food search modal, Scan to barcode scanner, Photo to PhotoFoodScreen.

---

## 22. Food Log — Product Review Screen

When barcode is scanned or AI camera used, before logging show a review screen: product name, calories, protein, carbs, fat, serving size. Two buttons: "Log It" (gold/primary) and "Cancel" (secondary).

---

## 23. Food Log — Draggable Meal Sections

In `src/screens/MacroTrackerScreen.tsx`, make meal sections (Breakfast/Lunch/Dinner/Snacks) draggable and reorderable using same pattern as HomeScreen's drag-to-reorder. Persist order in AsyncStorage or Firestore.

---

## 24. Differentiate Start Workout vs Workout

In HomeScreen Training section, two confusingly similar modules. Fix:
- **Start Workout**: keep heart icon, add subtitle "Live HR tracking" in fontSize 10, `colors.textSecondary`
- **Workout**: use barbell icon, add subtitle "Exercise library" in fontSize 10, `colors.textSecondary`
- Update `styles.homeTool` to accommodate subtitle text.

---

## 25. GPS Screen — Theme-Adaptive

In `src/screens/ActivityTrackerScreen.tsx`, PipBoy/retro style should ONLY appear for Matrix theme (ID `'matrix'`). For others:
- `clean-light`: minimal, light map tiles, no retro effects
- `clean-dark`: dark map tiles, no retro effects
- Nostromo (ID `'alien'`): amber/orange sci-fi industrial
- Sheikah Slate (ID `'sheikah'`): blue glowing, runic accents

Read theme from ThemeContext. Conditionally render PipBoyMap only for matrix. Create alternative styling for others.

---

## 26. YOUR DAY — Miles + Swipe Views

In `src/screens/HomeScreen.tsx` YOUR DAY section (lines 831-875):
- Replace Active Min card with Miles — use Ionicons footsteps/walk, display `todayStats.miles` from GpsActivityContext
- Wrap dashGrid in horizontal pager with 3 pages: Daily (default), Weekly (swipe left), Monthly (swipe right)
- Add dot indicators below cards for active page
- Compute weekly/monthly aggregates from same data sources

---

## 27. Employee Tab Access + Home Screen

**27a. Tab Navigator Fix**
In `src/navigation/TabNavigator.tsx`, employees currently only see Home + Profile. Fix: employees should see ALL tabs EXCEPT Store and Hydration, replaced by Tasks and Clock. Lines 85-93 need restructuring — Schedule, Community, Book should be visible to employees too.

**27b. Home Screen Employee Section**
Replace store section with Clock In/Out component (reuse existing) and Task List. On task list, make the ENTIRE pill/row tappable to toggle checkbox (not just the small checkbox). Use SoundPressable wrapper.

**27c. Remove Employee Mode Button**
In `src/screens/ProfileScreen.tsx` lines 389-396, remove the "Employee Mode" MenuTile block (icon `people-outline`, label "Employee Mode", sub "View as staff member"). Keep Admin Panel block above it.

---

## 28. Sign-In Flow Fixes

**28a. Inline Error Banner**
In `src/screens/auth/SignInScreen.tsx`, replace all `Alert.alert()` calls in handleSignIn (line 202, 254) and legacyLocalSignIn (line 272) with inline error banner. Add `errorMsg` state. Render banner above Sign In button with `colors.red` styling, Ionicons `alert-circle` icon. Friendly messages: credential error → "Hmm, that username or password doesn't look right." Rate limit → "Too many attempts — take a breather." Network → "Couldn't connect — check your internet."

**28b. Persist Username on Logout**
In `src/context/AuthContext.tsx` signOut (line 141), save username to AsyncStorage `'@zenki_last_username'` before clearing state. In SignInScreen.tsx, read on mount and prefill username field.

**28c. Sign Up with Google + Apple**
SignInScreen footer (lines 429-434) says "Not a member? Inquire" → change to "New here? Sign Up" navigating to `'SignUp'`. In `src/screens/auth/SignUpScreen.tsx`, add Google and Apple sign-up buttons (copy auth logic from SignInScreen). Replace the setTimeout placeholder (lines 40-47) with real Firebase `createUserWithEmailAndPassword`. After social auth success, navigate to OnboardingScreen.

---

## 29. Senpai Mascot Fixes

**29a. Black Box Behind Mascot**
In `src/components/SenpaiMascot.tsx`, `mascotImage` style (lines 294-297) needs `backgroundColor: 'transparent'`. Container style (line 287) needs `overflow: 'visible'`. On the `<Image>` component (line 232), add `backgroundColor: 'transparent'` prop.

**29b. Scroll Lock After Senpai Mode**
The PanResponder on the Animated.View (line 197) captures all touch events, preventing ScrollView underneath from scrolling — even after Senpai mode is deactivated. Fix: `onStartShouldSetPanResponder` should only return true when touch is directly on mascot. `onMoveShouldSetPanResponder` should check touch bounds. Add `onShouldBlockNativeResponder: () => false`. Verify component returns null (line 176) when disabled, and PanResponder doesn't persist.

---

## 30. Move Vouchers to Home Screen

Move voucher section from ProfileScreen to HomeScreen:
- HomeScreen: import `freeDrinkCredits`, `freeShirtCredits`, `consumeFreeDrink`, `consumeFreeShirt` from useSpinWheel (line 40 already imports useSpinWheel)
- Add `activeVoucher` state, `handleRedeemVoucher` function
- Copy voucher section JSX (ProfileScreen lines 287-333) as new reorderable section (id `'vouchers'`)
- Copy redemption modal (ProfileScreen lines 446-494) and voucher styles (lines 730-873)
- ProfileScreen: remove all voucher UI, state, styles, and useSpinWheel voucher destructuring

---

## 31. Fix AI Photo Food Logging

`src/config/api.ts` line 31 has TODO: Cloud Functions URL not deployed. Either:
- Deploy `functions/` directory: `cd functions && npm install && npx firebase deploy --only functions`, then update URL
- Or add graceful fallback in PhotoFoodScreen: show "AI food recognition coming soon. Use Search or Scan instead." with navigation buttons

Also verify `getCurrentIdToken()` returns valid token for local CREDENTIALS sign-ins — handle `'no_auth'` case.

---

## 32. Fix Keyboard Blocking Input Fields

On iPad, keyboard covers inputs on most screens. Audit every screen with TextInput:
- Ensure `KeyboardAvoidingView` with `behavior='padding'` on iOS
- `keyboardVerticalOffset` must account for iPad's larger keyboard — use `Platform.isPad` to conditionally increase offset
- TextInput must be inside ScrollView with `keyboardShouldPersistTaps='handled'`
- Screens without KeyboardAvoidingView that have TextInput: wrap them
- Ensure ScrollView scrolls to focused input on long forms

---

## 33. Fix Community Feed — Posts Don't Appear

Root cause: CommunityScreen loads feed on mount only, doesn't reload on return from CreatePostScreen. Also `getFeed()` (`firebasePosts.ts` line 74-86) only queries followed users — empty for new users.
- Add `useFocusEffect` to CommunityScreen to reload feed on every screen focus
- In `getFeed()`: if user follows nobody, query all recent posts (not just own) so feed isn't empty

---

## 34. Fix Booking Screen Layout

`src/screens/BookScreen.tsx` has hardcoded widths designed for phone. On iPad, elements are misaligned/off-screen. Replace fixed pixel widths with flex-based or percentage-based layouts. Time slot grid should use `flexWrap` with calculated item width based on `Dimensions.get('window').width`.

---

## 35. Fix Training Screens Layout

TrainingHomeScreen, TrainingModuleScreen, WorkoutScreen, and WorkoutSessionScreen are misaligned or off-page on iPad.

**TrainingHomeScreen.tsx:**
Line 14: SCREEN_WIDTH from Dimensions — already adapts COLS for 600px+, but tile width uses string percentage (line 76: `width: \`${100 / COLS - 2}%\``). Verify this renders correctly on iPad widths (768-1024px). Add maxWidth constraint so tiles don't stretch too wide.

**WorkoutScreen.tsx:**
Multiple hardcoded widths: line 840 (`width: 100`), line 860 (`width: 60`), line 880 (`width: '80%'`), line 885 (`width: '100%'`). Replace with flex-based sizing. Add `maxWidth: 700` or similar to content container so it doesn't span the full iPad width.

**WorkoutSessionScreen.tsx:**
Stats and zone bars use hardcoded widths (line 372: `width: '80%'`, line 408: `width: 30`). Replace with flex. Add maxWidth to scroll content.

**General fix for all training screens:** wrap main content in a View with `maxWidth: 600` and `alignSelf: 'center'` so content stays centered and readable on iPad without stretching edge-to-edge.

---

## 36. iPad Optimization — All Screens

The entire app needs iPad optimization. This is a TestFlight build running on iPad. Apply these rules globally:

**Layout:**
- All screen content containers: add `maxWidth: 700` (or 600 for form-heavy screens) with `alignSelf: 'center'` and `width: '100%'`. This prevents content from stretching edge-to-edge on iPad's wide viewport.
- All grid layouts (flexWrap grids, card grids): use `Dimensions.get('window').width` to calculate column count. Phone (< 600): 2 columns. iPad (600-1024): 3 columns. iPad landscape (> 1024): 4 columns.
- All hardcoded widths in StyleSheets: audit and replace with flex-based or percentage-based values. Grep for `width:` followed by a number across all screen files.

**Touch targets:**
- All SoundPressable / TouchableOpacity: ensure minimum 44x44pt touch target (Apple HIG)
- Add `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}` where missing

**Typography:**
- Use `maxFontSizeMultiplier={1.3}` on critical text (already done on some screens, apply everywhere)

**Safe areas:**
- Verify SafeAreaView edges are correct for iPad (iPad has different insets than iPhone)
- Bottom tab bar height should account for iPad's different safe area insets

---

## 37. Fix Drink Screen Padding

`src/screens/DrinkScreen.tsx` has binary corruption (fix in section 0 first), excessive padding, spacer View with `height: spacing.xxl * 2`, duplicate paddingTop (0 and 4), and `paddingBottom: 140` for balance bar spacing. After corruption is stripped, audit and fix all padding so content fills the screen properly with no dead space.

---

## 38. Admin Panel Spacing + Dead Ends

`src/screens/AdminScreen.tsx` dashboard grid: `gap: 14`, `paddingHorizontal: spacing.lg`, cards have inline `padding: 22`, `minHeight: 160` causing uneven heights. Fix spacing for consistent card sizes.

Dead-end buttons across admin sub-screens (AdminProductsScreen has 15 `Alert.alert` placeholders, AdminScheduleScreen has 10). Every button that currently shows an `Alert.alert` placeholder ("Coming soon", "Not implemented", etc.) needs to either be wired to real functionality or removed/disabled with visual indication it's not yet available.

---

## 39. Secure Sensitive Data

`src/data/members.ts` lines 140-148 has plaintext CREDENTIALS. Wrap in `__DEV__` guard:

```typescript
export const CREDENTIALS = __DEV__ ? { /* existing */ } : {};
```

Verify `babel.config.js` has `transform-remove-console` for production. Add if missing:

```javascript
plugins: [...(process.env.NODE_ENV === 'production' ? ['transform-remove-console'] : [])]
```

---

## 40. Dynamic Version String

`src/screens/SettingsScreen.tsx` line 787 has hardcoded "Zenki Dojo v1.0.0". Replace with dynamic:

```typescript
import Constants from 'expo-constants';
const appVersion = Constants.expoConfig?.version ?? '1.0.0';
// Render: `Zenki v${appVersion}`
```

---

## 41. Final Verification

- Run `npx tsc --noEmit` — target: 0 errors
- Run `npx expo-doctor` — check dependency conflicts
- Run `npx expo export` — verify JS bundle compiles
- Remove unused imports across all `src/` files
- Verify all screens render without crash on iPad viewport
- Report final error count
