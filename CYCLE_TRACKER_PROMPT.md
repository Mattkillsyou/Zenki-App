# MENSTRUAL CYCLE TRACKER — Claude Code Prompt

Copy everything below the line into Claude Code.

---

## CONTEXT

This is a React Native / Expo app (Zenki) — a martial arts gym management app with nutrition tracking, workout logging, gamification, and health features. The app already has:

**ALREADY DONE (do NOT recreate):**
1. ✅ Biological sex question in onboarding — `src/screens/auth/OnboardingScreen.tsx` Step 3 collects `biologicalSex: 'male' | 'female' | 'other'` and stores it on the Member object.
2. ✅ `Member.biologicalSex` field — `src/data/members.ts` line 43.
3. ✅ Full cycle type system — `src/types/cycle.ts` has: FlowIntensity, CycleSymptom (10 symptoms with labels/icons), CyclePhase (menstrual/follicular/ovulation/luteal with labels/colors/icons), PHASE_RECOMMENDATIONS (energy/nutrition/training/calorieAdjustment per phase), PeriodEntry interface, CycleInfo interface, computePhase(), computeCycleInfo().
4. ✅ CycleTrackerContext — `src/context/CycleTrackerContext.tsx` with: entries, cycleInfo, settings.showOnDashboard, logPeriodStart(), logPeriodEnd(), updateEntry(), removeEntry(), memberEntries(), memberCycleInfo(), setShowOnDashboard(). Persists to AsyncStorage.
5. ✅ CycleTrackerProvider is wired into App.tsx.

**NOT YET DONE (your job):**
1. ❌ No CycleTrackerScreen exists — no UI for logging periods, viewing history, seeing predictions
2. ❌ No navigation route for the cycle tracker — not in RootNavigator.tsx
3. ❌ No dashboard integration — HomeScreen.tsx does not show cycle phase badge
4. ❌ No nutrition integration — MacroTrackerScreen.tsx does not factor cycle phase into calorie recommendations
5. ❌ No settings toggle — SettingsScreen.tsx has no cycle visibility toggle
6. ❌ No entry point — there's no way for users to navigate to the cycle tracker from anywhere in the app

## FILE STRUCTURE OVERVIEW

- Navigation: `src/navigation/RootNavigator.tsx` (stack navigator with all screen routes), `src/navigation/TabNavigator.tsx`
- Home: `src/screens/HomeScreen.tsx` — the main dashboard. Uses FadeInView sections. Shows: schedule, streaks, XP, achievements, announcements, appointments, workout stats, nutrition summary, employee checklist (if employee).
- Settings: `src/screens/SettingsScreen.tsx` — settings toggles
- Nutrition: `src/screens/MacroTrackerScreen.tsx` — daily macro/calorie tracking with SVG pie chart and macro bars
- Nutrition context: `src/context/NutritionContext.tsx` — has goalsFor() which returns calorie/macro targets
- Auth context: `src/context/AuthContext.tsx` — has useAuth().user which is the Member object with biologicalSex
- Components: `src/components/` — Card, Button, FadeInView, PressableScale, SectionHeader, etc. All use useTheme() for colors.
- Theme: uses `useTheme()` which provides `{ colors, isDark, overlay, theme }`. All colors come from `colors.*`.

## TASK 1: Create CycleTrackerScreen

Create `src/screens/CycleTrackerScreen.tsx`. This is a full-featured cycle tracking screen. It should match the visual quality and code style of the existing screens (MacroTrackerScreen, WorkoutScreen, etc.).

### Screen Layout (ScrollView, SafeAreaView wrapper, same pattern as other screens)

**Header section:**
- Screen title: "Cycle Tracker" with a back button (same header pattern as other screens)
- If no periods logged yet, show an empty state with an illustration icon and "Start tracking" CTA

**Current Phase Card (top, prominent):**
- Large card showing: current phase name (from PHASE_LABELS), phase icon (from PHASE_ICONS), phase color (from PHASE_COLORS) as the accent
- "Day X of ~Y" (cycleDay of avgCycleLength)
- Phase progress bar: a horizontal bar showing where in the cycle you are. Divide it into 4 colored segments (menstrual=red, follicular=teal, ovulation=amber, luteal=purple from PHASE_COLORS). Show a marker/indicator at the current position.
- "Next period in ~Z days" prediction text (from daysUntilNextPeriod)
- If currently on period (isOnPeriod), show a prominent "Currently on period" indicator and an "End Period" button

**Recommendations Card:**
- Show PHASE_RECOMMENDATIONS for the current phase: energy, nutrition, training text
- If calorieAdjustment > 0, show "+X cal recommended" callout
- Style each recommendation with a subtle icon (energy=⚡, nutrition=🥗, training=💪)

**Quick Log Section:**
- "Log Period Start" button (prominent, accent colored) — opens a modal/inline form:
  - Date picker (default today, allow past dates)
  - Flow intensity selector: three tappable pills (Light / Medium / Heavy) — use PressableScale
  - Symptom checkboxes: grid of tappable chips for each CycleSymptom, showing SYMPTOM_ICONS + SYMPTOM_LABELS. Selected state uses colors.accent background. Unselected uses colors.surface.
  - Optional notes text input
  - "Save" button → calls logPeriodStart() from context
- If there's an ongoing period (latest entry has no endDate), show "End Period" button that calls logPeriodEnd()

**History Section:**
- List of past period entries (from memberEntries()), most recent first
- Each entry shows: start date, end date (or "Ongoing"), flow intensity badge, symptom chips, duration in days
- Swipe-to-delete or long-press to delete (calls removeEntry())
- Show at most 6 entries, with a "See all" expanding option

**Cycle Calendar (if time permits, otherwise skip):**
- A simple monthly calendar view showing:
  - Period days highlighted in red/pink
  - Predicted period days in lighter shade
  - Current day marker
  - Phase color bar below each week

### Code Style Requirements
- Use `useTheme()` for ALL colors — never hardcode colors except the PHASE_COLORS constants from types/cycle.ts
- Use the existing component library: Card, Button, FadeInView, PressableScale, SectionHeader
- Use `spacing`, `borderRadius`, `typography` from `src/theme`
- Use `Ionicons` from `@expo/vector-icons` for icons
- Use `useAuth()` to get the current user's member ID for filtering entries
- Guard the entire screen: if `user?.biologicalSex !== 'female'`, this screen should not be accessible (the navigation should prevent it, but add a guard just in case)
- Use `useScreenSoundTheme` if there's a relevant sound theme, otherwise skip
- Match the animation patterns from other screens (FadeInView with staggered delays)

## TASK 2: Add Navigation Route

In `src/navigation/RootNavigator.tsx`:
1. Import CycleTrackerScreen
2. Add a `<Stack.Screen name="CycleTracker" component={...} />` entry (use withErrorBoundary wrapper, same as other screens)
3. Place it near the other health screens (WeightTracker, MacroTracker, Bloodwork, etc.)

## TASK 3: Dashboard Integration (HomeScreen.tsx)

Add a Cycle Phase card to the HomeScreen, visible ONLY for female users with the dashboard toggle enabled.

**Placement:** After the streaks/XP section, before the schedule section. It should be a compact card, not a huge section.

**Implementation:**
1. Import `useCycleTracker` from CycleTrackerContext
2. Import `useAuth` to check biologicalSex
3. Import the phase types: PHASE_LABELS, PHASE_COLORS, PHASE_ICONS from types/cycle.ts
4. Get `memberCycleInfo(user.id)` and `settings.showOnDashboard`
5. If `user.biologicalSex !== 'female'` OR `!settings.showOnDashboard` OR `cycleInfo === null`, render nothing
6. Otherwise render a compact card:

```
┌─────────────────────────────────────┐
│ 🌱 Follicular Phase  ·  Day 8/28   │
│ Next period in ~6 days              │
│                          [Details →]│
└─────────────────────────────────────┘
```

- Left side: phase icon + phase name + cycle day
- Bottom left: prediction text
- Right side: "Details" tap target that navigates to CycleTracker screen
- Background: subtle tint of the phase color (e.g., `PHASE_COLORS[phase] + '10'` for 6% opacity)
- Border left: 3px solid line in the phase color (color accent bar)
- Wrap in FadeInView with appropriate delay to match the stagger pattern

**If currently on period**, change the card to show:
```
┌─────────────────────────────────────┐
│ 🩸 Period  ·  Day 3                 │
│ Increase iron-rich foods            │
│                          [Details →]│
└─────────────────────────────────────┘
```

## TASK 4: Nutrition Integration (MacroTrackerScreen.tsx)

Factor the cycle phase into calorie recommendations for female users.

1. Import `useCycleTracker` and the phase recommendation types
2. Get the user's cycle info via `memberCycleInfo(user.id)`
3. If the user is female AND has cycle data AND the current phase has a `calorieAdjustment > 0`:
   - Show a small info banner below the calorie goal display:
     ```
     🌙 Luteal phase: your metabolism is higher. +200 cal adjustment applied.
     ```
   - Style: subtle card with phase color left border, using colors.infoMuted background
   - The calorie adjustment should be INFORMATIONAL ONLY — display the recommendation but do NOT automatically modify the user's calorie goal. The user set their own goals in MacroSetupScreen; we just show a suggestion.
4. If the phase is menstrual, show an iron reminder instead:
   ```
   🩸 Menstrual phase: consider increasing iron-rich foods (spinach, red meat, lentils).
   ```

## TASK 5: Settings Toggle (SettingsScreen.tsx)

Add a toggle in the Settings screen for cycle tracking visibility.

1. Import `useCycleTracker`
2. Import `useAuth` to check biologicalSex
3. Only show this setting if `user?.biologicalSex === 'female'`
4. Add a new section or add to an existing "Health" or "Privacy" section:
   - Label: "Show cycle phase on dashboard"
   - Subtitle: "Display your current cycle phase on the home screen"
   - Switch/toggle component (using the existing pattern from SettingsScreen)
   - Reads from `settings.showOnDashboard`, writes via `setShowOnDashboard()`
5. Place it near other health-related settings if they exist, otherwise create a "Health Tracking" section

## TASK 6: Entry Point from Profile/Health Screens

Add a navigation entry point so users can FIND the cycle tracker:

**Option A (preferred): Add to BodyLabScreen.tsx or a "Health" section on HomeScreen**
- If there's a BodyLabScreen or health hub, add a "Cycle Tracker" row/card that navigates to CycleTracker
- Only show for female users

**Option B: Add to ProfileScreen.tsx**
- Add a "Cycle Tracker" menu item in the profile screen's list of options
- Only show for female users

**In either case:**
- Use an appropriate Ionicons icon (e.g., 'fitness-outline', 'heart-circle-outline', or 'calendar-outline')
- Match the visual style of surrounding navigation items

## PRIVACY REQUIREMENTS

This data is sensitive. Follow these rules:
1. NEVER expose cycle data in the CommunityScreen, social feed, or any shared/public feature
2. The dashboard card should be subtly designed — not a large prominent banner screaming personal health data
3. The `showOnDashboard` toggle defaults to `true` but users can hide it
4. No push notifications about cycle phase — that's intrusive
5. If the user changes their biologicalSex setting later (in profile edit, if that exists), cycle data should remain but the dashboard card and settings toggle should respect the new sex value

## EXECUTION ORDER

Work through these tasks in this exact order:
1. CycleTrackerScreen.tsx (the screen itself — this is the bulk of the work)
2. Navigation route in RootNavigator.tsx
3. Dashboard integration in HomeScreen.tsx
4. Nutrition integration in MacroTrackerScreen.tsx
5. Settings toggle in SettingsScreen.tsx
6. Entry point navigation

Complete each task fully before moving to the next. After each task, verify the file compiles (check for missing imports, typos, type errors). Do not rush — the CycleTrackerScreen alone should be substantial (400+ lines). The phase progress bar with 4 colored segments, the symptom grid, and the history list are all detailed UI components that need careful implementation.
