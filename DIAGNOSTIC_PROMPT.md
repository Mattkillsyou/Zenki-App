# ZENKI DOJO — MICRO-DIAGNOSTIC PROMPT

> **Purpose**: Feed this entire prompt to Claude Code. It catalogs every known issue in the codebase by file, line number, severity, and prescribed fix.
>
> **ANTI-SIMPLIFICATION DIRECTIVE**: Do NOT stub, truncate, summarize, or "leave as exercise." Every fix must be implemented in full. If a file has 15 issues, fix all 15. If a function needs 40 lines, write all 40. Verify each fix compiles. If you skip anything, the build breaks.

---

## PHASE 1 — SECURITY (fix first, deploy-blocking)

### 1.1 BookScreen.tsx — Placeholder Google Client ID
- **Line 29**: `'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'` — hardcoded placeholder. Will crash OAuth in production.
- **Fix**: Move to environment variable. Create `src/config/env.ts` exporting `GOOGLE_CLIENT_ID` read from `Constants.expoConfig.extra` or `process.env`. Replace line 29 with the import.

### 1.2 SettingsScreen.tsx — Plaintext Password Storage
- **Lines 99-110**: Passwords stored as plaintext JSON in AsyncStorage under `ADMIN_PASSWORD_OVERRIDE_KEY`.
- **Line 101**: Hardcoded fallback `'password'` — any user without an override gets this default.
- **Fix**: Hash passwords with `expo-crypto` SHA-256 before storing. Compare hashes on login. Remove the `'password'` fallback — require explicit password set on first login.

### 1.3 firebaseAuth.ts — Predictable Password Generation
- **Line 9**: Password constructed as `zenki_${member.id}_${member.username}` — trivially guessable.
- **Fix**: Generate a random password with `expo-crypto.getRandomBytes(16)`, store hash only. Or use Firebase custom tokens instead of email/password auth.

### 1.4 StoreScreen.tsx — Client-Side Promo Codes
- **Lines 29-35**: Promo code dictionary with discount percentages hardcoded in client bundle. Anyone can read the JS bundle and extract codes.
- **Fix**: Move promo validation to a Firebase Cloud Function. Client sends code string, server returns discount (or error). Remove the dictionary from client code entirely.

### 1.5 foodSearch.ts — Exposed API Key
- Audit the file for any USDA API key embedded in client code. If present, move to server-side proxy or `expoConfig.extra`.

---

## PHASE 2 — MEMORY LEAKS & RACE CONDITIONS

### 2.1 HeartRateContext.tsx
- **Line 232-238**: Demo mode `setInterval` never cleared if BLE status transitions from `'unavailable'` to `'connected'` without calling `stopSession()`.
- **Fix**: In the `useEffect` that watches `bleStatus`, clear the demo interval when status changes away from `'unavailable'`.

### 2.2 AttendanceContext.tsx
- **Line 122-128**: `firestorePollRef` interval created in effect; cleanup only fires on unmount. If `useFirestore` dependency toggles, old interval leaks.
- **Line 191-192**: `intervalRef.current` can be truthy when the guard `!intervalRef.current` is checked, due to timing.
- **Fix**: Clear `firestorePollRef` in the dependency cleanup (not just unmount). Add a `null` assignment after clearing.

### 2.3 GpsActivityContext.tsx
- **Line 113-115**: `watchRef.current?.remove()` may silently fail.
- **Line 203**: `setLiveDuration` uses closure over `startTimeRef.current` — if pause is implemented, elapsed time overcounts.
- **Fix**: Guard `remove()` with try/catch. Store pause offset in a ref and subtract from elapsed calculation.

### 2.4 HomeScreen.tsx
- **Line 348-352**: `setTimeout` inside `onRefresh` callback — no cleanup if component unmounts during the timeout.
- **Fix**: Store the timeout ID in a ref, clear it in a cleanup return from `useEffect` or on unmount.

### 2.5 GamificationContext.tsx
- **Line 303-310**: Multiple `pendingCelebration` assignments in one state update — last write wins. If a level-up AND a streak milestone fire simultaneously, only the last celebration shows.
- **Fix**: Change `pendingCelebration` from a single object to a queue (array). Shift the queue in the celebration dismiss handler.

### 2.6 firebaseFollow.ts
- **Lines 36-59**: Two sequential `setDoc()` calls for mutual follow — not atomic. Network failure between them creates one-sided follow.
- **Fix**: Use a Firestore `writeBatch()` to make both writes atomic.

### 2.7 AppointmentContext.tsx
- **Line 145-151**: `appointments` in `cancelAppointment` closure may be stale during concurrent updates.
- **Fix**: Use functional state update `setAppointments(prev => prev.filter(...))` instead of reading from outer scope.

### 2.8 NutritionContext.tsx
- **Line 327**: `macrosForDateByMeal` depends on `macrosForDate` but it's missing from the dependency array.
- **Line 544**: `runAdaptiveUpdate` closure captures stale `effectiveTdee` because `weights` is not in deps.
- **Fix**: Add missing dependencies to both useCallback hooks.

### 2.9 SpinWheelContext.tsx
- **Line 233**: `spin` closure reads from `state` (lines 165, 177) but `state.history` is the dependency — stale closure risk.
- **Fix**: Use a ref mirror of `state` or use functional state update pattern inside `spin`.

### 2.10 TimeClockContext.tsx
- **Line 105**: `state.currentEntry!` non-null assertion — will throw if a race condition clears `currentEntry`.
- **Line 163-175**: Fire-and-forget `.then()` on `pushTimeEntry()` sets `synced: true` even if push fails.
- **Fix**: Remove non-null assertion, add null guard. Await the push and only set `synced: true` on success.

---

## PHASE 3 — ID COLLISION RISK (12 contexts)

Every context uses `Date.now().toString(36) + Math.random().toString(36).slice(2, 6)` for IDs. This has ~1.7M possible suffixes — collision is likely at scale, especially under rapid-fire operations.

**Files affected**: AnnouncementContext, AppointmentContext, AttendanceContext, DrinkTrackerContext, EmployeeTaskContext, GpsActivityContext, HeartRateContext, NutritionContext, ProductContext, SpinWheelContext, TimeClockContext, WorkoutContext.

**Fix**: Create `src/utils/generateId.ts`:
```typescript
import * as Crypto from 'expo-crypto';
export function generateId(): string {
  return Crypto.randomUUID();
}
```
Replace every `Date.now().toString(36) + Math.random()...` call across all 12 contexts with `generateId()`.

---

## PHASE 4 — FIRE-AND-FORGET SYNC (no retry, silent data loss)

These locations call async network operations without awaiting, retrying, or notifying the user on failure:

| File | Line(s) | Operation |
|------|---------|-----------|
| AttendanceContext.tsx | 157-158 | `pushAttendanceToSheets()`, `pushAttendanceToFirestore()` |
| AuthContext.tsx | 65-72 | `registerForPushNotifications()` |
| DrinkTrackerContext.tsx | 138 | `pushDrinkEntry()` |
| TimeClockContext.tsx | 163-175 | `pushTimeEntry()` |
| attendanceSync.ts | 17-42 | `fetch()` POST |
| drinkSheets.ts | 29, 59 | `fetch()` POST |
| googleSheets.ts | 67-71 | `fetch()` POST |
| memberSync.ts | 62-63 | Firestore + Sheets writes |
| waiverSync.ts | 27, 32 | Firestore + Sheets writes |
| pushNotifications.ts | 126-152 | Batch push without backoff |

**Fix**: Create `src/utils/retryAsync.ts`:
```typescript
export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 1000,
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw new Error('retryAsync: unreachable');
}
```
Wrap every fire-and-forget call with `retryAsync(() => pushX()).catch(err => console.warn('Sync failed:', err))`. For user-facing operations, surface a toast/snackbar on final failure.

---

## PHASE 5 — DEAD CODE & UNUSED STATE

### 5.1 ProfileScreen.tsx
- **Line 46**: `const [editOpen, setEditOpen] = useState(false)` — NEVER USED
- **Line 47**: `const [editBio, setEditBio] = useState('')` — NEVER USED
- **Line 48**: `const [editGoals, setEditGoals] = useState('')` — NEVER USED
- **Fix**: Either remove all three (dead code) or implement the edit-profile modal they were intended for. Recommended: implement the modal — the user wants feature-rich screens.

### 5.2 HomeScreen.tsx
- **Line 153**: `const { hasSpunToday } = useSpinWheel()` — destructured but never read.
- **Line 154**: `const [spinOpen, setSpinOpen]` — state declared, never toggled.
- **Fix**: Remove both, or wire them to a visible spin-wheel trigger button.

### 5.3 SettingsScreen.tsx
- **Lines 42-48**: `pushEnabled`, `classReminders`, `emailUpdates`, `streakAlerts`, `achievementAlerts`, `weeklyReportNotif`, `calendarSync` — states initialized but NEVER persisted to AsyncStorage. Toggling them does nothing across sessions.
- **Fix**: Add `useEffect` persistence for each, mirroring the pattern used for `unitPref` and `soundEnabled` (lines 55-58).

### 5.4 CommunityScreen.tsx
- **Lines 207-210**: StyleSheet entries `titleUnderline` and `screenTitle` defined but never applied.
- **Fix**: Remove unused style entries.

### 5.5 StoreScreen.tsx
- **Line 61**: `showWishlist` state declared but never rendered.
- **Line 65**: `appliedPromo` state declared but discount never applied to cart total.
- **Fix**: Implement wishlist view and apply promo discount to `cartTotal` calculation.

---

## PHASE 6 — HARDCODED COLORS (not using theme system)

Every instance below must be replaced with the appropriate `colors.*` token from `useTheme()`.

### HomeScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 372 | `color="#FF6B35"` | `colors.warning` or new `colors.flames` |
| 546 | `'rgba(245, 158, 11, 0.12)'` | `colors.warningMuted` |
| 547 | `color="#F59E0B"` | `colors.warning` |
| 552 | `backgroundColor: '#F59E0B'` | `colors.warning` |

### WorkoutScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 107, 108, 251, 286 | `'#000'` | `colors.textInverse` |
| 349 | `'#000'` (Rx badge) | `colors.textInverse` |
| 538 | `color="#FF6B35"` | `colors.warning` |

### MacroTrackerScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 320 | `'#22C55E'` | `colors.success` |
| 387 | `color="#FF6B6B"` | New `colors.macroProtein` |
| 397 | `color="#4ECDC4"` | New `colors.macroCarbs` |
| 407 | `color="#FFD166"` | New `colors.macroFat` |
| 453 | `stroke="#FFD166"` | `colors.macroFat` |
| 462 | `stroke="#4ECDC4"` | `colors.macroCarbs` |
| 471 | `stroke="#FF6B6B"` | `colors.macroProtein` |
| 492 | `backgroundColor: '#FF6B6B'` | `colors.macroProtein` |
| 498 | `backgroundColor: '#4ECDC4'` | `colors.macroCarbs` |
| 504 | `backgroundColor: '#FFD166'` | `colors.macroFat` |
| 581 | `'rgba(76,175,80,0.15)'` | `colors.successMuted` |
| 585 | `'#4CAF50'` | `colors.success` |

### ProfileScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 213 | `color="#FF6B35"` | `colors.warning` |
| 139 | `color="#000"` | `colors.textInverse` |

### ActivityTrackerScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 85-86 | `rgba(0, 255, 65, 0.03)` | Theme-dependent scanline color |
| 125, 127, 138 | `#00ff41` | Theme-dependent terminal color |

### DrinkScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 86, 182, 252, 321, 403 | `'#000'` | `colors.textInverse` |

### StoreScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 149 | `'#000'` | `colors.textInverse` |
| 213 | `'#000'` | `colors.textInverse` |

### TimerScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 302 | `'#000'` | `colors.textInverse` |

### BodyLabScreen.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 125-126 | `'#000'` | `colors.textInverse` |

### XPProgressBar.tsx (component)
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 103 | `'#000'` | `colors.textInverse` |

### Button.tsx (component)
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 48 | `'#FFFFFF'` | `colors.textInverse` |

### App.tsx
| Line | Hardcoded Value | Replace With |
|------|----------------|--------------|
| 70 | `'#000000'` | `colors.background` |
| 81 | Hardcoded box-shadow colors | `colors.frameGlow` |

### Theme action: Add these new tokens to `ThemeColors` in `colors.ts`:
```typescript
macroProtein: string;
macroCarbs: string;
macroFat: string;
flames: string;
```
Set appropriate values in both `darkColors` and `lightColors`.

---

## PHASE 7 — MISSING ERROR HANDLING

### Silent catch blocks (swallow errors with no logging or UI feedback):
| File | Line(s) | Fix |
|------|---------|-----|
| WorkoutScreen.tsx | 465 | Log error + show toast |
| WeightTrackerScreen.tsx | 65 | Log error + show fallback UI |
| TimerScreen.tsx | 56, 59 | Log error + fallback |
| CommunityScreen.tsx | 40, 65-72 | Log error + show snackbar |
| StoreScreen.tsx | 69-70 | Log error + fallback state |

### Missing null/error guards:
| File | Line | Issue | Fix |
|------|------|-------|-----|
| BodyLabScreen.tsx | 21-22, 60 | `user` may be null | Add `if (!user) return <EmptyState />` |
| BookScreen.tsx | 102 | `useAutoDiscovery` returns null | Add null check before using discovery doc |
| BookScreen.tsx | 153-159 | Race condition on double-book | Disable button during async, check server response |
| WeeklyReportScreen.tsx | 85-90 | Division by zero on empty arrays | Guard `array.length > 0` before dividing |

---

## PHASE 8 — MISSING TYPESCRIPT TYPES (`any` audit)

Replace every `any` with a proper type. High-priority instances:

| File | Line | Current | Replace With |
|------|------|---------|--------------|
| HomeScreen.tsx | 18 | `navigation: any` | `NativeStackNavigationProp<RootStackParamList>` |
| WorkoutScreen.tsx | 64 | `navigation: any` | Same typed navigation prop |
| MacroTrackerScreen.tsx | 70 | `navigation: any` | Same |
| ProfileScreen.tsx | 35 | `navigation: any` | Same |
| WeightTrackerScreen.tsx | 43 | `navigation: any` | Same |
| ActivityTrackerScreen.tsx | 187 | `navigation: any` | Same |
| WeeklyReportScreen.tsx | 47 | `navigation: any` | Same |
| BodyLabScreen.tsx | 46, 188, 206 | `any` for biomarker data | `Biomarker` type from types/ |
| ScheduleScreen.tsx | 20 | `as unknown as string[]` | Properly type the source data |
| MacroTrackerScreen.tsx | 297 | `(calendarDays as any)` | Type the calendar array correctly |
| ActivityTrackerScreen.tsx | 160 | `routeCoords.map((c: any)` | `GpsPoint` from types/activity |
| AchievementBadge.tsx | 40 | `achievement.icon as any` | `keyof typeof Ionicons.glyphMap` |

Create a shared navigation type file if one doesn't exist:
```typescript
// src/types/navigation.ts
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
export type RootStackParamList = {
  Main: undefined;
  Profile: { memberId?: string };
  // ... all routes
};
export type AppNavigation = NativeStackNavigationProp<RootStackParamList>;
```

---

## PHASE 9 — INCOMPLETE FEATURES & STUBS

### 9.1 SettingsScreen.tsx — Export Data (line 357-375)
- Shows an Alert with count of data stores but never actually exports. In production this is a no-op.
- **Fix**: Generate a JSON blob, write to `FileSystem.documentDirectory`, share via `Sharing.shareAsync()`.

### 9.2 ScheduleScreen.tsx — Empty onBook handler
- Booking handler exists but does not create an appointment in AppointmentContext.
- **Fix**: Wire to `bookAppointment()` from AppointmentContext, with confirmation modal and success feedback.

### 9.3 WeeklyReportScreen.tsx — Hardcoded zeros
- **Line 95-96**: `mealsLogged`, `avgWeightDelta`, `spinWins` are hardcoded to `0`.
- **Fix**: Compute from NutritionContext, WeightTracker data, and SpinWheelContext history respectively.

### 9.4 ActivityTrackerScreen.tsx — Native mobile has no map
- **Lines 138-164**: Web-only Leaflet map. Native shows placeholder text.
- **Fix**: Add `react-native-maps` MapView for native, or use a WebView-based Leaflet fallback.

### 9.5 ProfileScreen.tsx — No edit-profile modal
- Dead state vars (editOpen, editBio, editGoals) indicate this was planned but never built.
- **Fix**: Build a modal with TextInputs for bio and goals, avatar picker, and save to AuthContext/AsyncStorage.

### 9.6 StoreScreen.tsx — Wishlist and promo never applied
- `showWishlist` state exists but no UI. `appliedPromo` discount never subtracted from total.
- **Fix**: Add wishlist tab/section. Apply `appliedPromo` discount in cart total calculation.

---

## PHASE 10 — NAVIGATION & ROUTE ISSUES

### 10.1 Screens imported but NOT registered in Stack.Navigator:
- `ContactSupportScreen` — imported but no `<Stack.Screen>` entry.
- `UserSearchScreen` — imported but no `<Stack.Screen>` entry.
- **Fix**: Add `<Stack.Screen name="ContactSupport" component={ContactSupportScreen} />` and same for UserSearch.

### 10.2 Screens not exported from `src/screens/index.ts`:
21 screen files exist but are not exported from the barrel file. This doesn't break the app (RootNavigator imports directly) but creates inconsistency.
- **Fix**: Add all 21 missing exports to `src/screens/index.ts`.

### 10.3 Missing error boundaries:
Only `WorkoutScreen`, `TimerScreen`, and `MacroTrackerScreen` are wrapped with `withErrorBoundary()`.
- **Fix**: Wrap every screen with the `withErrorBoundary` HOC in `RootNavigator.tsx`.

---

## PHASE 11 — ACCESSIBILITY

Systematically missing across the codebase. Add these to every interactive component:

| Component | Missing | Fix |
|-----------|---------|-----|
| Button.tsx | `accessibilityRole="button"`, `accessibilityLabel` | Add both props |
| Card.tsx | `accessibilityRole`, `accessibilityLabel` | Add with content description |
| EmptyState.tsx | `accessible={true}` wrapper | Wrap container |
| PostCard.tsx | Image `accessibilityLabel`, caption announcement | Add alt text |
| FoodSearchModal.tsx | Input `accessibilityLabel` | Label all TextInputs |
| Skeleton.tsx | `accessible={false}` | Hide from screen reader |
| LineChart.tsx | `accessibilityLabel` with chart summary | Add description |
| XPProgressBar.tsx | `accessibilityRole="progressbar"` | Add with `accessibilityValue` |
| Tab bar | `accessibilityLabel` per tab | Add in TabNavigator |
| All toggle rows | `accessibilityRole="switch"` already on Switch, but label missing | Add `accessibilityLabel` to row |

---

## PHASE 12 — MAGIC NUMBERS & HARDCODED CONSTANTS

Extract to named constants in `src/constants/` or the relevant util:

| File | Line | Value | Constant Name |
|------|------|-------|---------------|
| MacroTrackerScreen.tsx | 423 | `4` (kcal/g protein) | `KCAL_PER_GRAM_PROTEIN` |
| MacroTrackerScreen.tsx | 426 | `4` (kcal/g carbs) | `KCAL_PER_GRAM_CARBS` |
| MacroTrackerScreen.tsx | 427 | `9` (kcal/g fat) | `KCAL_PER_GRAM_FAT` |
| ActivityTrackerScreen.tsx | 317 | `3.281` (m→ft) | `METERS_TO_FEET` |
| ActivityTrackerScreen.tsx | 318 | `2.237` (m/s→mph) | `MS_TO_MPH` |
| WeightTrackerScreen.tsx | 170 | `1500` (max weight) | `MAX_WEIGHT_LBS` |
| WeightTrackerScreen.tsx | 194 | `90 * 86400000` (90 days) | `DEFAULT_GOAL_DURATION_MS` |
| WeeklyReportScreen.tsx | 79 | `3.281` (m→ft) | `METERS_TO_FEET` (reuse) |
| TimerScreen.tsx | 385 | `[0, 200, 100, 200]` | `TIMER_VIBRATION_PATTERN` |
| NotificationsModal.tsx | 51 | `7 * 86400000` | `SEVEN_DAYS_MS` |
| firebaseMessages.ts | 157 | `limit(200)` | `MESSAGE_PAGE_SIZE` |
| HeartRateContext.tsx | 285 | `.slice(0, 200)` | `MAX_HR_SESSIONS` |

---

## PHASE 13 — INEFFICIENT QUERIES

| File | Line | Issue | Fix |
|------|------|-------|-----|
| firebasePosts.ts | 97-99 | Sequential `isLiked()` inside loop — N reads | Batch: fetch all liked post IDs in one query, then match client-side |
| firebaseUsers.ts | 43 | Client-side case-insensitive search on full user list | Add Firestore composite index or use `searchTerms` array field |
| NutritionContext.tsx | 183-207 | 7 separate `useEffect` hooks each writing AsyncStorage | Batch into one `useEffect` with debounce |
| ProductContext.tsx | 103 | `items.sort()` on every Firestore snapshot | Sort once on initial load, insert-sort on updates |
| SpinWheelContext.tsx | 165, 174-195 | O(n × m) history iteration per spin | Pre-compute cap counts in state, update incrementally |

---

## PHASE 14 — SERVICE LAYER ISSUES

| File | Line | Issue | Fix |
|------|------|-------|-----|
| calendarAvailability.ts | 27 | In-memory `Map` cache never cleared | Add TTL eviction or `LRU` with max size |
| firebaseStorage.ts | 15 | Filename uses `Date.now()` — collision on simultaneous uploads | Use `generateId()` (from Phase 3) for filenames |
| firebaseStorage.ts | 18 | No error handling for `fetch` or `blob()` | Add try/catch with user-facing error |
| googleSheets.ts | 11 | Hardcoded Google Apps Script URL | Move to `src/config/env.ts` |
| pushNotifications.ts | 126-152 | Batch push without exponential backoff | Add backoff: `delay * 2^attempt` |

---

## PHASE 15 — VERIFICATION CHECKLIST

After implementing all fixes, verify each item:

1. [ ] `npx tsc --noEmit` passes with zero errors
2. [ ] `npx expo start --web` loads without console errors
3. [ ] No `any` types remain in screen or context files (grep: `': any'`, `as any`)
4. [ ] No hardcoded hex colors remain in screen files (grep: `#[0-9A-Fa-f]{3,8}` outside of theme files)
5. [ ] Every context ID generation uses `generateId()` (grep old pattern: `Date.now().toString(36)`)
6. [ ] Every fire-and-forget sync wrapped with `retryAsync` (grep: `pushAttendance`, `pushDrink`, `pushTimeEntry`)
7. [ ] All 21 missing screens exported from `src/screens/index.ts`
8. [ ] `ContactSupportScreen` and `UserSearchScreen` registered in RootNavigator Stack
9. [ ] All screens wrapped with `withErrorBoundary`
10. [ ] SettingsScreen notification prefs persist to AsyncStorage
11. [ ] WeeklyReportScreen computes real values (no hardcoded zeros)
12. [ ] ProfileScreen edit modal implemented (no dead state)
13. [ ] StoreScreen promo discount applied to cart total
14. [ ] No empty `catch {}` blocks remain (grep: `catch\s*\{\s*\}`)
15. [ ] No `'password'` string literal in auth flow
16. [ ] BookScreen reads Google Client ID from env config
17. [ ] HeartRateContext demo interval properly cleaned up
18. [ ] GamificationContext celebration queue (not single overwrite)
19. [ ] firebaseFollow uses `writeBatch()` for atomic follows
20. [ ] All interactive components have `accessibilityLabel` or `accessibilityRole`

---

## FILE MODIFICATION MANIFEST

**New files to create:**
- `src/config/env.ts` — environment variable exports
- `src/utils/generateId.ts` — UUID generation
- `src/utils/retryAsync.ts` — retry wrapper
- `src/types/navigation.ts` — shared navigation param list
- `src/constants/nutrition.ts` — KCAL_PER_GRAM_* constants
- `src/constants/conversion.ts` — METERS_TO_FEET, MS_TO_MPH, etc.

**Files to modify (35+):**
- `src/theme/colors.ts` — add macroProtein/macroCarbs/macroFat/flames tokens
- `src/screens/*.tsx` — all 20+ screen files (hardcoded colors, types, error handling)
- `src/context/*.tsx` — all 12 contexts with ID generation + 10 with fire-and-forget
- `src/services/*.ts` — 10+ service files (retry, error handling, env vars)
- `src/components/*.tsx` — 12+ components (accessibility, theme colors)
- `src/navigation/RootNavigator.tsx` — register missing screens, add error boundaries
- `src/screens/index.ts` — add 21 missing exports
- `App.tsx` — replace hardcoded frame colors with theme tokens
