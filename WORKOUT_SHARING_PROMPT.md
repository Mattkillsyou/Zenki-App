# WORKOUT SHARING TO COMMUNITY FEED — Claude Code Prompt

Copy everything below the line into Claude Code.

---

## CONTEXT

This is a React Native / Expo app (Zenki) — a martial arts gym app with workout logging, heart rate tracking, GPS activities, gamification, and an Instagram-style community feed.

### Existing Systems You Need to Understand

**Community Feed (already built):**
- `src/screens/CommunityScreen.tsx` — Instagram-style feed with stories rail, FlatList of posts, FAB to create. Uses `getFeed()` which pulls posts from Firestore filtered by followed users.
- `src/components/PostCard.tsx` — renders individual posts. Has: header (avatar + name + time), media area (image/video) OR text body, action row (heart, comment, share, bookmark), like count, inline caption. Double-tap to like.
- `src/services/firebasePosts.ts` — Firebase service. The `Post` interface:
  ```ts
  interface Post {
    id: string;
    userId: string;
    displayName: string;
    avatar: string | null;
    mediaUrl?: string | null;
    mediaType?: 'photo' | 'video' | null;
    caption: string;
    likes: number;
    liked?: boolean;
    createdAt: string;
  }
  ```
  Functions: `createPost()` (media + caption), `createTextPost()` (text only), `getFeed()`, `likePost()`, `unlikePost()`, `getUserPosts()`, `deletePost()`.
- `src/screens/CreatePostScreen.tsx` — "New Post" screen with Photo/Text mode toggle. Photo mode: pick from library or camera, then add caption. Text mode: 280-char text post.

**Workout System (already built):**
- `src/types/workout.ts` — `WorkoutLog` (id, memberId, date, title, format, result, rxOrScaled, notes, durationMinutes, createdAt) and `PersonalRecord` (id, memberId, exerciseKey, value, reps, date, notes, createdAt). `WorkoutFormat`: AMRAP, EMOM, FOR_TIME, TABATA, CHIPPER, STRENGTH, OTHER.
- `src/context/WorkoutContext.tsx` — `logWorkout()`, `myLogs()`, `myPRs()`, `currentBest()`, etc. Persists to AsyncStorage. Awards gamification points.
- `src/screens/WorkoutScreen.tsx` — Training screen with Log/PRs/Stats tabs. Users log workouts (title, format, result, Rx/Scaled, notes) and track PRs by exercise.

**Heart Rate System (already built):**
- `src/types/heartRate.ts` — `HRSession` (id, memberId, startedAt, endedAt, durationMinutes, avgBpm, maxBpm, minBpm, samples, zones, strain, calories, activityType, deviceName). `ActivityType`: martial_arts, strength, cardio, hiit, yoga, open_mat, other.
- `src/context/HeartRateContext.tsx` — BLE heart rate monitor connection, live BPM, session recording.
- `src/screens/WorkoutSessionScreen.tsx` — Live workout session with HR monitoring, zone display, calories, strain calculation.

**GPS Activity System (already built):**
- `src/types/activity.ts` — `GpsActivity` (id, memberId, type, startedAt, endedAt, durationSeconds, distanceMeters, elevationGainMeters, avgPaceSecsPerKm, maxSpeedMps, route, splits, calories). `GpsActivityType`: run, walk, bike, hike.
- `src/context/GpsActivityContext.tsx` — GPS tracking, route recording, split calculation.

**Gamification (already built):**
- `src/context/GamificationContext.tsx` — points, XP, streaks, achievements, level.
- `src/types/gamification.ts` — Achievement, Celebration types.

**App Infrastructure:**
- Navigation: `src/navigation/RootNavigator.tsx` (stack navigator), `src/navigation/TabNavigator.tsx`
- Theme: `useTheme()` provides `{ colors, isDark, overlay, theme }`. All colors via `colors.*`.
- Components: Card, Button, FadeInView, PressableScale, SectionHeader, StreakBadge, PointsBadge, XPProgressBar, etc.
- Styling: `spacing`, `borderRadius`, `typography`, `shadows` from `src/theme`.
- Firebase: Firestore for posts, `src/services/firebaseStorage.ts` for media uploads.

## THE PROBLEM

Users can log workouts and track HR sessions, but there's no way to share them to the community feed. The workout and social systems are completely disconnected. Members should be able to share their workouts as rich, formatted "workout cards" in the feed — similar to how Strava, WHOOP, or Apple Fitness share workout summaries.

## WHAT TO BUILD

### 1. Extend the Post type to support workout posts

**In `src/services/firebasePosts.ts`:**

Add new optional fields to the `Post` interface to support workout post data:

```ts
interface Post {
  // ... existing fields ...

  /** Post type — undefined or 'standard' for normal posts, 'workout' for workout shares */
  postType?: 'standard' | 'workout';

  /** Embedded workout data (only present when postType === 'workout') */
  workoutData?: {
    // Source type — what kind of workout is being shared
    source: 'workout_log' | 'hr_session' | 'gps_activity' | 'personal_record';

    // Common fields (present for all workout posts)
    activityLabel: string;          // "Martial Arts", "AMRAP", "Run 5K", etc.
    activityIcon: string;           // Ionicons name
    durationMinutes?: number;
    caloriesBurned?: number;

    // WorkoutLog fields (source === 'workout_log')
    workoutTitle?: string;          // "Fran", "Murph", etc.
    workoutFormat?: string;         // "AMRAP", "For Time", etc.
    workoutResult?: string;         // "4:32", "5 rounds + 12 reps"
    rxOrScaled?: string;            // "Rx" or "Scaled"

    // HR Session fields (source === 'hr_session')
    avgBpm?: number;
    maxBpm?: number;
    strain?: number;                // 0-21
    zoneBreakdown?: {               // minutes in each zone
      zone1: number;
      zone2: number;
      zone3: number;
      zone4: number;
      zone5: number;
    };

    // GPS Activity fields (source === 'gps_activity')
    distanceMeters?: number;
    avgPaceSecsPerKm?: number;
    elevationGainMeters?: number;
    gpsActivityType?: string;       // 'run', 'walk', 'bike', 'hike'

    // Personal Record fields (source === 'personal_record')
    exerciseName?: string;
    prValue?: number;
    prUnit?: string;                // 'lbs', 'sec', 'reps'
    previousBest?: number;          // for showing improvement

    // Gamification data shown on the card
    xpEarned?: number;
    streakCount?: number;
    flamesEarned?: number;
  };
}
```

Add a new function `createWorkoutPost()`:

```ts
export async function createWorkoutPost(
  workoutData: Post['workoutData'],
  caption: string,
  mediaUri?: string | null,
): Promise<Post | null>
```

This function should:
1. Get the current user's info (same pattern as createPost)
2. If mediaUri is provided, upload it (user took a gym selfie to attach)
3. Create the Firestore document with postType='workout', the workoutData payload, caption, and optional media
4. Return the created Post

### 2. Create a WorkoutPostCard component

**Create `src/components/WorkoutPostCard.tsx`**

This is a specialized rendering component that displays workout data inside a PostCard-like layout. It replaces the media/text area when `post.postType === 'workout'`.

The card should be visually distinct from photo/text posts — members scrolling the feed should immediately recognize "that's a workout share" the same way you recognize a Strava activity in an Instagram story.

**Layout for ALL workout post types:**

```
┌──────────────────────────────────────────────────┐
│  [Avatar] Matt Brown · 2h                    ··· │  ← standard PostCard header (reuse existing)
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  🥋  MARTIAL ARTS                          │  │  ← activity type label + icon
│  │                                            │  │
│  │  ╔══════════╗  ╔══════════╗  ╔══════════╗  │  │  ← stat pills (varies by source)
│  │  ║  45 min  ║  ║ 423 cal  ║  ║ 14.2     ║  │  │
│  │  ║ Duration ║  ║ Calories ║  ║ Strain   ║  │  │
│  │  ╚══════════╝  ╚══════════╝  ╚══════════╝  │  │
│  │                                            │  │
│  │  "Fran" · AMRAP · Rx                       │  │  ← workout-specific detail line
│  │  Result: 5 rounds + 12 reps                │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────┐      │  │  ← HR zone bar (if HR data)
│  │  │ █████░░░░░░░░░████░░░░███░░░██  │      │  │
│  │  │ Z1    Z2       Z3    Z4   Z5   │      │  │
│  │  └──────────────────────────────────┘      │  │
│  │                                            │  │
│  │  +25 XP  ·  🔥 12 day streak              │  │  ← gamification badges
│  │                                            │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  [If user attached a photo, show it here]        │
│                                                  │
│  ❤️ 💬 📤                              🔖      │  ← standard action row
│  12 likes                                        │
│  Matt Brown  Felt great today, legs were fresh   │  ← caption
└──────────────────────────────────────────────────┘
```

**Design specifications for the workout card inner area:**

- Background: `colors.surface` with `borderRadius: 16`, `padding: 16`
- Left-side color accent bar: 3px wide vertical bar on the left edge using the activity type's color (martial arts = `colors.gold`, cardio = `colors.red`, strength = `colors.accent`, etc. — define a mapping)
- Activity icon + label at top: use Ionicons, rendered in `colors.accent`. Label in `colors.textPrimary`, fontWeight 800, fontSize 13, uppercase, letterSpacing 1.5
- Stat pills: row of 2-4 rounded-rect pills depending on available data. Each pill has: large bold value on top (fontSize 20, fontWeight 900, `colors.textPrimary`), small label below (fontSize 10, `colors.textMuted`, uppercase). Pill background: `colors.surfaceSecondary`. Border: 1px `colors.borderSubtle`. These should feel like instrument readouts.
- Workout detail line: if workout_log source, show format + result + Rx/Scaled. Style: `colors.textSecondary`, fontSize 14.
- HR zone bar (only if zoneBreakdown present): horizontal bar divided into 5 segments proportional to time in each zone. Colors: zone1=#72D5FF, zone2=#4CAF50, zone3=#FFB800, zone4=#FF6B35, zone5=#FF3333. Height 6px, borderRadius 3. Below the bar, tiny zone labels.
- GPS map route (only if gps_activity): if route data isn't included (it's too large for a post), just show distance + pace + elevation as stat pills. No map rendering needed.
- PR callout (only if personal_record): show exercise name, new PR value, and if previousBest exists show "↑ +X lbs improvement" in `colors.success`.
- Gamification row at bottom: small badges showing XP earned and streak, using `colors.gold` for XP and flame icon for streak. Only show if xpEarned or streakCount are present.

**Stat pills per source type:**
- `workout_log`: Duration, Calories (if available). Detail line shows title, format, result, Rx/Scaled.
- `hr_session`: Duration, Calories, Avg BPM, Strain. Zone bar shown.
- `gps_activity`: Distance (formatted km/mi), Duration, Pace (min/km or min/mi), Elevation. Use the formatting utilities from `src/utils/gps.ts` if they exist.
- `personal_record`: Exercise name prominent, PR value large, improvement delta if available.

### 3. Modify PostCard to render WorkoutPostCard

**In `src/components/PostCard.tsx`:**

In the media/text rendering section (lines ~85-96 area), add a condition:

```tsx
{post.postType === 'workout' && post.workoutData ? (
  <WorkoutPostCard workoutData={post.workoutData} />
) : post.mediaUrl ? (
  // ... existing media rendering ...
) : (
  // ... existing text post rendering ...
)}
```

If the workout post ALSO has a mediaUrl (user attached a gym selfie), render the WorkoutPostCard ABOVE the media image. Both should be visible — the workout stats card first, then the photo below it.

### 4. Add "Share to Feed" functionality to workout completion flows

**4a. WorkoutScreen.tsx — Share after logging a workout**

After a user successfully calls `logWorkout()`, show a share prompt. This should NOT be a forced flow — it should be optional and non-intrusive.

Implementation: after `logWorkout()` returns successfully, show a small animated banner/toast at the top of the workout log list:

```
┌────────────────────────────────────────────┐
│ ✓ Workout logged!                          │
│                                            │
│ [Share to Feed]          [Dismiss ✕]       │
└────────────────────────────────────────────┘
```

"Share to Feed" navigates to a new `ShareWorkoutScreen` (see Task 5) with the WorkoutLog data pre-filled.

Alternatively (and simpler): add a share icon button on each workout log entry in the history list. Tapping it navigates to ShareWorkoutScreen with that log's data.

Do BOTH — the post-log banner AND the per-entry share button.

**4b. WorkoutSessionScreen.tsx — Share after completing an HR session**

After `stopSession()` completes and the session summary is shown, add a "Share to Feed" button in the session summary area. This should pass the HRSession data to ShareWorkoutScreen.

**4c. GPS Activity — Share after completing a GPS activity**

Find where GPS activities are completed/saved (likely in `src/context/GpsActivityContext.tsx` or an Activity screen) and add a similar share button. Pass the GpsActivity data.

**4d. PRs — Share when a new PR is set**

In WorkoutScreen.tsx's PR tab, after `addPR()` is called, show a share prompt similar to 4a. New PRs are exciting — the share prompt should be slightly more prominent (use `colors.gold` background, celebratory tone: "New PR! 🎉 Share it?").

### 5. Create ShareWorkoutScreen

**Create `src/screens/ShareWorkoutScreen.tsx`**

This is the "compose" screen for workout posts. It receives workout data via navigation params and lets the user preview the workout card, add a caption, optionally attach a photo, and post.

**Navigation params:**
```ts
type ShareWorkoutParams = {
  source: 'workout_log' | 'hr_session' | 'gps_activity' | 'personal_record';
  workoutLog?: WorkoutLog;
  hrSession?: HRSession;
  gpsActivity?: GpsActivity;
  personalRecord?: PersonalRecord & { exerciseName: string };
  xpEarned?: number;
  streakCount?: number;
  flamesEarned?: number;
};
```

**Screen layout:**

```
┌──────────────────────────────────────────────┐
│  ✕  Share Workout                    [Post]  │  ← header
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │    [Preview of WorkoutPostCard]      │    │  ← non-interactive preview
│  │    showing exactly how it will       │    │
│  │    appear in the feed                │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ Write a caption...                   │    │  ← text input, 500 char max
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │ 📷 Add a photo (optional)            │    │  ← tap to pick/take photo
│  └──────────────────────────────────────┘    │
│                                              │
│  [If photo selected, show thumbnail here]    │
│                                              │
└──────────────────────────────────────────────┘
```

The screen should:
1. Extract the relevant workout data from the navigation params into the `workoutData` shape defined in Task 1
2. Show a live preview of the WorkoutPostCard using that data
3. Let the user type a caption
4. Let the user optionally attach a photo (library or camera, same pattern as CreatePostScreen)
5. "Post" button calls `createWorkoutPost()` with the assembled data
6. On success, navigate back (go back 1-2 screens depending on where they came from)
7. Show loading state while posting (same pattern as CreatePostScreen)

**Data extraction logic (important — map each source type to workoutData):**

For `workout_log`:
```ts
workoutData = {
  source: 'workout_log',
  activityLabel: WORKOUT_FORMAT_LABEL[log.format] || 'Workout',
  activityIcon: formatToIcon(log.format), // you define this mapping
  durationMinutes: log.durationMinutes,
  workoutTitle: log.title,
  workoutFormat: WORKOUT_FORMAT_LABEL[log.format],
  workoutResult: log.result,
  rxOrScaled: log.rxOrScaled,
  xpEarned, streakCount, flamesEarned,
}
```

For `hr_session`:
```ts
workoutData = {
  source: 'hr_session',
  activityLabel: ACTIVITY_LABELS[session.activityType],
  activityIcon: activityToIcon(session.activityType), // you define this
  durationMinutes: session.durationMinutes,
  caloriesBurned: session.calories,
  avgBpm: session.avgBpm,
  maxBpm: session.maxBpm,
  strain: session.strain,
  zoneBreakdown: session.zones,
  xpEarned, streakCount, flamesEarned,
}
```

For `gps_activity`:
```ts
workoutData = {
  source: 'gps_activity',
  activityLabel: GPS_ACTIVITY_LABELS[activity.type],
  activityIcon: GPS_ACTIVITY_ICONS[activity.type],
  durationMinutes: Math.round(activity.durationSeconds / 60),
  caloriesBurned: activity.calories,
  distanceMeters: activity.distanceMeters,
  avgPaceSecsPerKm: activity.avgPaceSecsPerKm,
  elevationGainMeters: activity.elevationGainMeters,
  gpsActivityType: activity.type,
  xpEarned, streakCount, flamesEarned,
}
```

For `personal_record`:
```ts
workoutData = {
  source: 'personal_record',
  activityLabel: 'New Personal Record',
  activityIcon: 'trophy',
  exerciseName: exerciseName,
  prValue: pr.value,
  prUnit: determineUnit(exerciseKey), // lbs, sec, or reps based on exercise type
  previousBest: previousBest?.value,
  xpEarned, streakCount, flamesEarned,
}
```

### 6. Add navigation route

**In `src/navigation/RootNavigator.tsx`:**
1. Import ShareWorkoutScreen
2. Add `<Stack.Screen name="ShareWorkout" component={withErrorBoundary(ShareWorkoutScreen, 'ShareWorkout')} />`
3. Place it near CreatePost in the stack

### 7. Feed-level recognition

When users scroll the community feed and encounter a workout post, it should be immediately visually distinct from a text or photo post. To achieve this:

**In CommunityScreen.tsx**, do NOT change the FlatList. The PostCard + WorkoutPostCard rendering handles the visual distinction automatically.

**However**, add subtle workout-type filtering to the feed. Add a small horizontal filter row below the stories rail:

```
[All] [Workouts 🏋️] [Photos 📸] [Text 💬]
```

Implementation:
- State: `filter: 'all' | 'workout' | 'photo' | 'text'`
- Filter the posts array before passing to FlatList
- 'workout' = `post.postType === 'workout'`
- 'photo' = `post.postType !== 'workout' && post.mediaUrl`
- 'text' = `post.postType !== 'workout' && !post.mediaUrl`
- Style: horizontal ScrollView of tappable pills, same style as the mode toggle in CreatePostScreen. Active pill uses `colors.gold` background.

## EXECUTION ORDER

1. Extend Post interface + add createWorkoutPost() in firebasePosts.ts
2. Create WorkoutPostCard.tsx component (the visual card — this is the centerpiece, spend time here)
3. Modify PostCard.tsx to conditionally render WorkoutPostCard
4. Create ShareWorkoutScreen.tsx
5. Add navigation route in RootNavigator.tsx
6. Add share buttons to WorkoutScreen.tsx (post-log banner + per-entry button)
7. Add share button to WorkoutSessionScreen.tsx (post-HR-session)
8. Add share button to GPS activity completion (find the right screen)
9. Add share button for new PRs in WorkoutScreen.tsx
10. Add feed filter pills to CommunityScreen.tsx

Complete each step fully before moving on. The WorkoutPostCard (step 2) is the most important piece — it needs to look polished, handle all 4 source types gracefully, and be visually distinctive in the feed. Spend the most time there. The stat pills, zone bar, and gamification badges all need careful spacing and alignment.

Do NOT change any existing functionality. The normal photo/text post flow must continue working exactly as before. Workout posts are additive.
