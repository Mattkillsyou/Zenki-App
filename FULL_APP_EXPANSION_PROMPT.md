# ZENKI DOJO — FULL APP FEATURE EXPANSION PROMPT

## ⚠️ ANTI-SIMPLIFICATION DIRECTIVE ⚠️

**You have a pattern of simplifying code. Here is what I will REJECT:**
- `// ... rest of component` or `// repeat for each item`
- `// TODO: implement` or `// simplified for brevity`
- Components under 100 lines when the spec requires 300+
- Rendering 2 items when the spec says 8
- Stubbing a panel with a `<Text>Coming soon</Text>`
- Skipping error states, empty states, or loading states
- Omitting chart/visualization implementations

**What I EXPECT:** Every file COMPLETE. Every function IMPLEMENTED. Every UI element RENDERED. Every list POPULATED. Every chart DRAWN. Every stat CALCULATED. Write 500-line files if needed. This is a production app.

---

## PROJECT CONTEXT

- **Framework**: Expo 52 + React Native 0.76.3 + React 18.3.1 + TypeScript
- **Location**: `D:\Zenki\App`
- **Styling**: React Native StyleSheet (NO Tailwind)
- **State**: React Context + AsyncStorage
- **Charts**: `src/components/LineChart.tsx` (SVG-based, already exists)
- **Sound**: Web Audio via `src/sounds/synth.ts`
- **Navigation**: @react-navigation/stack v7

**Read every file before modifying it. Do not guess at interfaces — read the actual types.**

---

## MODULE 1: HOME SCREEN (`src/screens/HomeScreen.tsx` — currently 875 lines)

### ADD these features (do not remove existing content):

**1.1 Today's Dashboard Panel** (insert below welcome message)
- "YOUR DAY" section with 4 metric cards in a 2x2 grid:
  - **Workouts Today**: count from `useWorkout().myLogs(user.id)` filtered to today's date
  - **Calories Burned**: sum from today's workout logs + HR sessions + GPS activities
  - **Macros Hit**: percentage of today's calorie goal met from `useNutrition().totalsForDate()`
  - **Active Minutes**: sum of all session durations today
- Each card: icon, value (large), label (small), progress ring showing % of daily goal
- Daily goals: workouts = 1, calories = 500, macros = 100%, active minutes = 30
- Cards animate in with stagger (use existing `FadeInView`)

**1.2 Next Class Countdown** (insert below dashboard)
- Pull from schedule data: find next class where `time > now`
- Display: class name, instructor, time, countdown timer `IN 2H 34M`
- "BOOK NOW" button if not already booked
- If no class today: show "NO CLASSES REMAINING TODAY"

**1.3 Quick Stats Carousel** (insert below next class)
- Horizontal `ScrollView` with snap-to-item, 5 cards:
  1. Latest weight + 7-day trend direction arrow (↑/↓/→)
  2. Current streak + flame icon
  3. Best recent PR (most recent PR from `useWorkout().prs`)
  4. Last GPS activity summary (distance + time)
  5. Weekly HR strain average
- Each card: 140px wide, surface background, gold accent border
- Swipe indicator dots below

**1.4 Friend Activity Feed** (insert below quick stats, only if community posts exist)
- Show 3 most recent community posts from followed users
- Each: avatar, name, "logged a 5K run", timestamp
- "SEE ALL" link → CommunityScreen

**1.5 Loading Skeletons**
- While contexts are loading, render pulsing placeholder rectangles for each section
- Use `Animated.loop(Animated.sequence([fadeIn, fadeOut]))` for pulse effect
- Match exact dimensions of real content to prevent layout shift

---

## MODULE 2: WORKOUT SCREEN (`src/screens/WorkoutScreen.tsx` — currently 720 lines)

### ADD these features:

**2.1 Structured Exercise Logging** (replace or enhance current free-text form)
- Exercise selector: searchable dropdown from `src/data/exercises.ts` (100+ exercises)
- For each exercise added:
  - Set rows: `Set 1: [weight] x [reps]`, `Set 2: [weight] x [reps]`, etc.
  - "Add Set" button to add more rows
  - RPE selector (1-10 scale) per set
  - Rest timer trigger between sets (navigates to TimerScreen or inline timer)
- Support multiple exercises per workout
- "Add Exercise" button appends another exercise block
- "Save Workout" compiles all exercises + sets into the WorkoutLog

**2.2 Exercise History** (add to PRs tab or new sub-tab)
- When viewing a specific exercise:
  - Chart: weight over time (line chart using existing `LineChart` component)
  - Chart: estimated 1RM over time (Epley formula: `weight × (1 + reps/30)`)
  - Table: last 10 sessions with date, sets×reps, weight, RPE
  - Personal bests: heaviest single, most reps at X weight, highest estimated 1RM

**2.3 Volume Tracking** (add to Stats tab)
- Total volume (weight × reps × sets) per session
- Volume chart: weekly total volume over last 12 weeks
- Muscle group heatmap: 
  - Pull `muscleGroup` from exercise definitions
  - Count volume per group
  - Render as list with `PipBoyProgressBar`-style bars:
    ```
    CHEST    ████████████░░░░  12,450 LBS
    BACK     ██████████░░░░░░  10,200 LBS
    LEGS     ████████████████  16,800 LBS
    ```

**2.4 Workout Templates**
- "Save as Template" button after logging a workout
- Templates stored in AsyncStorage
- Template list on Log tab: tap to pre-fill exercise/set structure
- "Last Workout" quick-repeat button

**2.5 Filters on History**
- Date range picker (This Week / This Month / Last 3 Months / All Time)
- Activity type filter (AMRAP, EMOM, For Time, Strength, etc.)
- Search by exercise name
- Sort: newest first, heaviest, longest

---

## MODULE 3: MACRO TRACKER (`src/screens/MacroTrackerScreen.tsx` — currently 905 lines)

### ADD these features:

**3.1 Meal Type Separation**
- Add meal type selector when logging food: Breakfast, Lunch, Dinner, Snacks
- Group today's entries by meal type with collapsible sections
- Show per-meal macro subtotals
- Meal timing display: "Breakfast — 7:30 AM (420 cal)"

**3.2 Macro Distribution Donut Chart**
- Below the progress bars, add a donut/pie chart:
  - 3 segments: Protein (gold), Carbs (blue→green), Fat (red→green)
  - Center text: total calories consumed / goal
  - Built with react-native-svg `<Path>` arcs (same pattern as LineChart)

**3.3 Quick-Add Recent Foods Row**
- Horizontal scroll of last 10 unique foods logged (from `recentFoodsFor()`)
- Each: food name truncated, calories, tap to re-log with same macros
- "+" button at end opens full food search

**3.4 Recipe/Meal Combo Saving**
- "Save as Meal" button when multiple items logged together
- Saved meals stored in AsyncStorage with name + items + total macros
- Meal library accessible from a new section in the food search modal
- Tap saved meal → adds all items at once

**3.5 Weekly Macro Chart**
- Stacked bar chart: 7 bars (Mon-Sun), each showing protein/carbs/fat stacked
- Goal line overlay showing calorie target
- Tap a day to see that day's detailed breakdown

**3.6 Adaptive TDEE Explanation Card**
- When `runAdaptiveUpdate()` triggers, show an expandable card:
  - "YOUR METABOLISM ADAPTED" header
  - Previous TDEE → New TDEE with arrow
  - Explanation: "Based on X weigh-ins and Y days of intake data"
  - Confidence indicator: "Low / Medium / High" based on data density
  - "Adjust Goals" button → opens MacroSetupScreen with pre-filled values

---

## MODULE 4: WEIGHT TRACKER (`src/screens/WeightTrackerScreen.tsx` — currently 411 lines)

### ADD these features:

**4.1 Goal Setting**
- "Set Goal" button → modal with:
  - Target weight input
  - Target date picker
  - Recommended rate: 0.5-1 lb/week for loss, 0.25-0.5 for gain
- Progress bar: current weight → goal weight with % complete
- Projected date at current rate

**4.2 Body Measurements** (new collapsible section)
- Log: chest, waist, hips, bicep (L/R), thigh (L/R), neck
- Each measurement: current value, 30-day change, trend arrow
- Stored in AsyncStorage via NutritionContext or new MeasurementContext
- Chart: waist-to-hip ratio over time

**4.3 Enhanced Weight Chart**
- Current chart shows dots + line. Add:
  - 7-day moving average line (smoothed, different shade)
  - Shaded goal zone (if goal set)
  - Tap a point to see exact value + date in tooltip
  - Time range selector: 7D / 30D / 90D / 1Y / ALL

**4.4 Weight Stats Panel**
- Highest weight ever, lowest weight ever, dates for each
- Current rate: "+0.3 lb/week" or "-1.2 lb/week" (calculated from regression)
- Days since last log
- Total change since first log

**4.5 Integration with DEXA**
- If DEXA scans exist, show:
  - Body fat % from latest scan
  - Lean mass vs fat mass stacked bar
  - "Your weight gain is X% lean mass" insight

---

## MODULE 5: COMMUNITY (`src/screens/CommunityScreen.tsx` — currently 302 lines)

### ADD these features:

**5.1 Post Detail View** (new screen or modal)
- Full post content (no truncation)
- Comment list below post with reply button
- Like count with names ("Liked by Tim and 3 others")
- Timestamp: relative ("2h ago") or absolute on tap

**5.2 Comments System**
- Comment input field at bottom of post detail
- Comments stored in Firestore (use existing `firebasePosts.ts` pattern)
- Show comment count on post card
- Reply to comment (single-level threading)

**5.3 Post Search & Filter**
- Search bar at top: search by text content or author name
- Filter chips: All, Workouts, PRs, Photos, Questions
- Sort: Recent, Most Liked, Most Commented

**5.4 Rich Post Creation** (enhance `CreatePostScreen.tsx`)
- Text input with character counter (500 max)
- Photo attachment (use expo-image-picker, already installed)
- Activity attachment: pick a recent workout or GPS activity to share
- Preview before posting

**5.5 User Mentions**
- `@` trigger in post text → member search dropdown
- Mentioned users get a notification (via existing push system)
- Mentioned names rendered as gold-colored links

---

## MODULE 6: SCHEDULE & BOOKING (`src/screens/ScheduleScreen.tsx` + `BookScreen.tsx`)

### ADD to ScheduleScreen:

**6.1 Multi-Week Navigation**
- Left/right arrows to navigate weeks
- "Today" button to snap back
- Month label updates as weeks change

**6.2 Class Detail Modal**
- Tap class card → modal with:
  - Full description, instructor bio, class type
  - Difficulty level: Beginner / Intermediate / Advanced (with colored badge)
  - Capacity: "8/12 spots filled" with progress bar
  - "Book This Class" button
  - Member reviews/ratings if available

**6.3 Class Filtering**
- Filter by: instructor, class type (BJJ, Muay Thai, Pilates), difficulty
- Filter chips below day selector
- Persist filter selection during session

### ADD to BookScreen:

**6.4 Date Picker**
- Calendar date selector (not just today)
- Show available slots for selected date
- Grey out fully booked dates

**6.5 Booking Management**
- "My Bookings" section showing upcoming bookings
- Cancel button with confirmation + cancellation policy notice
- Reschedule: cancel + rebook flow

**6.6 Package Deals**
- Display available session packages: "5-Pack: $200 (save $50)"
- Track remaining sessions in package
- Apply package credit at checkout

---

## MODULE 7: TIMER (`src/screens/TimerScreen.tsx` — currently 683 lines)

### ADD these features:

**7.1 Saved Presets**
- "Save" button on configured timer
- Preset name input
- Presets list: tap to load config
- Stored in AsyncStorage
- Default presets: Tabata (existing), EMOM 10, 20-10 HIIT, 5-Round Fight

**7.2 Timer History**
- After completing a timer session, log it:
  - Date, type, total duration, rounds completed
- History list below timer (collapsible)
- Weekly summary: "X minutes of timed training this week"

**7.3 Round Tracking for Interval Mode**
- Display current round prominently: "ROUND 3 OF 8"
- Log per-round split times
- After completion, show round breakdown table
- Highlight fastest and slowest rounds

**7.4 Audio Cue Customization**
- Settings panel (gear icon):
  - Beep volume slider
  - Countdown beep toggle (3-2-1 before each round)
  - Halfway alert toggle
  - Voice announcement toggle ("Round 3... Begin!")

---

## MODULE 8: BODY LAB (`src/screens/BodyLabScreen.tsx` — currently 256 lines)

### EXPAND significantly:

**8.1 DEXA Detail View** (enhance `DexaScanDetailScreen.tsx`)
- Full body composition breakdown:
  - Total body fat % with gauge visualization (arc chart)
  - Lean mass vs fat mass stacked bar
  - Regional breakdown: Arms (L/R), Legs (L/R), Trunk — each with fat % + lean mass
  - Android/gynoid ratio with explanation
  - Visceral fat score with risk indicator (Low/Moderate/High)
  - BMC (bone mineral content) and T-score if available
  - FMI and FFMI with athletic benchmark comparison
- Comparison to previous scan: delta arrows on every metric

**8.2 Bloodwork Detail View** (enhance `BloodworkReportDetailScreen.tsx`)
- Group biomarkers by category: Lipids, CBC, Metabolic, Thyroid, Hormones, Vitamins
- Each biomarker row:
  - Name, value, unit
  - Reference range bar with current value marker
  - Status: Optimal (green), Sufficient (yellow), Out of Range (red)
  - Tap to expand: clinical explanation, dietary suggestions, trend chart
- Summary: "X of Y markers optimal, Z flagged"

**8.3 BodyLab Dashboard** (the main screen)
- Trend cards with real data:
  - Body fat % over last 6 scans (line chart)
  - Lean mass over last 6 scans
  - Key bloodwork markers over last 6 reports (configurable)
- Health score composite: weight score + body comp score + bloodwork score → 0-100
- Insights: "Your body fat decreased 1.5% in 3 months" / "Vitamin D trending up since supplementation"

---

## MODULE 9: PROFILE (`src/screens/ProfileScreen.tsx` — currently 742 lines)

### ADD:

**9.1 Edit Profile Modal**
- Editable fields: display name, bio (140 char), fun fact, training goals
- Photo picker for avatar
- Save → update user in AuthContext + Firestore

**9.2 Social Stats Row**
- Followers count, Following count, Posts count
- Tap followers → list of followers
- Tap following → list of following

**9.3 Achievement Showcase**
- "Featured Achievements" section: 3-5 pinnable achievements
- Full achievement grid with categories: Training, Streaks, Community, Health, Store
- Tap achievement → AchievementDetailScreen (show date earned, description, XP/flames gained)
- Locked achievements: greyed out with requirement shown

**9.4 Training Summary Card**
- Member since date
- Total sessions all-time
- Most trained day of week
- Preferred class type
- Best streak

---

## MODULE 10: SETTINGS (`src/screens/SettingsScreen.tsx`)

### EXPAND significantly:

**10.1 Account Section**
- Display name (read-only, link to edit in profile)
- Email (read-only)
- Change password (existing, but add strength meter)
- Sign out button (with confirmation)
- Delete account (with "type DELETE to confirm" safety)

**10.2 Preferences Section**
- Units: Imperial / Metric toggle (affects all distance, weight, height displays)
- Theme: Light / Dark / System (existing)
- Sound: On/Off toggle + volume slider (connected to SoundContext)
- Sound theme: Default / Retro / Zen / Pip-Boy selector

**10.3 Notifications Section** (expand existing)
- Push notifications master toggle
- Per-type toggles: Class reminders, Streak alerts, Community mentions, Weekly report, Achievement unlocks
- Quiet hours: start time → end time pickers
- Each toggle persisted to AsyncStorage

**10.4 Data Section**
- Export all data as JSON (compile all AsyncStorage keys → downloadable file)
- Clear workout history (with confirmation)
- Clear nutrition data (with confirmation)
- Reset gamification (with double confirmation)
- App version display
- "About Zenki Dojo" link

---

## MODULE 11: WEEKLY REPORT (`src/screens/WeeklyReportScreen.tsx` — currently 348 lines)

### FIX and EXPAND:

**11.1 Fix Hardcoded Zeros**
- Currently `mealsLogged`, `avgWeightDelta`, `spinWins` are hardcoded to 0
- Pull real data:
  - `mealsLogged`: count from `useNutrition().myMacros(user.id)` filtered to this week
  - `avgWeightDelta`: compute from `useNutrition().myWeights(user.id)` this week vs last
  - `spinWins`: count from `useSpinWheel().history` this week

**11.2 Comparison to Previous Week**
- For each metric (sessions, duration, calories, distance):
  - Show delta: "+2 more sessions" or "-30 min less training"
  - Arrow indicator: ↑ green, ↓ red, → neutral
  - Percentage change

**11.3 Daily Breakdown**
- Expandable section: 7 rows (Mon-Sun)
- Each day: workout count, total minutes, calories, check/X for goal met
- Visual: 7 blocks in a row, filled = active, empty = rest

**11.4 Nutrition Insights**
- Average daily calories this week vs goal
- Macro adherence %: days where all 3 macros hit within 10% of target
- Best eating day, worst eating day

**11.5 Recommendations Engine**
- Based on this week's data, generate 3-5 text insights:
  - "You trained 4 days this week — try 5 next week for a new streak"
  - "Your average pace improved by 12 seconds — keep it up"
  - "You missed protein targets 3 days — consider adding a shake post-workout"
  - "Rest day recommended — your strain score was above 15 for 3 consecutive sessions"
- Logic: simple conditional rules, not AI — check totals against targets

---

## MODULE 12: STORE (`src/screens/StoreScreen.tsx` — currently 589 lines)

### ADD:

**12.1 Product Detail Modal**
- Full product image (larger)
- Description text
- Size selector: S / M / L / XL (radio buttons)
- Color selector if applicable
- "Add to Cart" with quantity stepper
- Member price vs regular price (strikethrough)
- Stock status badge

**12.2 Wishlist**
- Heart icon on product cards
- Wishlist section accessible from profile or store header
- Stored in AsyncStorage
- "Move to Cart" button on wishlist items

**12.3 Cart Persistence**
- Save cart to AsyncStorage on every change
- Restore on screen mount
- Cart badge count on tab bar icon (red dot with number)

**12.4 Promo Code**
- Input field in cart view
- "APPLY" button
- Validate against hardcoded promo list (or admin-set)
- Show discount amount

---

## CROSS-CUTTING FEATURES (apply to ALL screens)

### C1. Loading Skeletons
- Create `src/components/Skeleton.tsx` — animated placeholder rectangles
- Props: `width`, `height`, `borderRadius`, `count` (for lists)
- Animation: pulsing opacity 0.3-0.7 using `Animated.loop`
- Apply to every screen that loads async data

### C2. Empty State Variations
- Create `src/components/EmptyState.tsx`
- Props: `icon`, `title`, `subtitle`, `actionLabel`, `onAction`
- Each screen gets a contextual empty state:
  - Workout: "NO WORKOUTS YET — Log your first session"
  - Macros: "START TRACKING — Set up your nutrition goals"
  - Weight: "STEP ON THE SCALE — Log your first weigh-in"
  - Community: "JOIN THE CONVERSATION — Create your first post"

### C3. Pull-to-Refresh
- Add `RefreshControl` to every `ScrollView` / `FlatList`
- Trigger: re-read from AsyncStorage or Firestore
- Show spinner in theme gold color

### C4. Swipe Actions
- Workout history: swipe left to delete
- Activity history: swipe left to delete
- Weight entries: swipe left to delete
- Use `react-native-gesture-handler` (already installed) for swipe detection

### C5. Error Boundaries
- Create `src/components/ErrorBoundary.tsx`
- Catches render errors, shows "SOMETHING WENT WRONG" with retry button
- Wrap each screen in RootNavigator with ErrorBoundary

---

## EXECUTION ORDER

**Do these in order. Do not skip ahead. Complete each phase fully before moving on.**

1. Create utility components: Skeleton, EmptyState, ErrorBoundary
2. Expand `src/utils/gps.ts` with new functions
3. Expand `src/types/activity.ts` with new types
4. Expand `GpsActivityContext.tsx` (pause, remove, totalStats)
5. Expand `NutritionContext.tsx` if needed for meal types
6. Rewrite `ActivityTrackerScreen.tsx` (see PIPBOY_PROMPT.md for full Pip-Boy spec)
7. Expand `HomeScreen.tsx` (Module 1)
8. Expand `WorkoutScreen.tsx` (Module 2)
9. Expand `MacroTrackerScreen.tsx` (Module 3)
10. Expand `WeightTrackerScreen.tsx` (Module 4)
11. Expand `CommunityScreen.tsx` (Module 5)
12. Expand `ScheduleScreen.tsx` + `BookScreen.tsx` (Module 6)
13. Expand `TimerScreen.tsx` (Module 7)
14. Expand `BodyLabScreen.tsx` + detail screens (Module 8)
15. Expand `ProfileScreen.tsx` (Module 9)
16. Expand `SettingsScreen.tsx` (Module 10)
17. Fix `WeeklyReportScreen.tsx` (Module 11)
18. Expand `StoreScreen.tsx` (Module 12)
19. Apply cross-cutting features (C1-C5)
20. Full test pass — every screen renders without errors

---

## VERIFICATION

After ALL changes:
- `npx expo start --web` runs without errors
- Every screen loads and renders all specified features
- No TypeScript compilation errors
- No hardcoded `0` values where real data should exist
- Every chart/visualization renders with real or realistic mock data
- Every empty state renders contextually
- Every list supports pull-to-refresh
- Loading skeletons appear during async operations
- No screens broken by changes to shared contexts
