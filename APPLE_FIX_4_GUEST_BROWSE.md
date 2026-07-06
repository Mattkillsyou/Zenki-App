# Fix: Let guests browse the Store and private-class booking without an account (Apple 5.1.1(v))

## Guideline
**App Store Review Guideline 5.1.1(v)** — Apps may not require users to register or enable an account to access features that are **not** account-based. Registration may only gate account-based actions (cart checkout, booking a session, posting, messaging, profile).

## Verbatim rejection
> "The app requires users to register or log in to access features that are not account based. Specifically, the app requires users to register before browsing products and private classes. Registration can only be required for account-based features like adding to cart or checking out. Next Steps: Revise the app to let users freely access the app's features that are not account based. The app may still require registration for other features that are account based."

(Reviewed: build 45, v2.0.1, on iPad Air 11-inch M3, 2026-06-22.)

---

## Worktree setup
The repo is at `/Users/mbrown/Desktop/Zenki-App`. Create an isolated worktree off `origin/main`:

```bash
cd /Users/mbrown/Desktop/Zenki-App
git fetch origin
git worktree add ../Zenki-App-guest -b fix/guest-browse-no-login origin/main
cd ../Zenki-App-guest
npm install   # if node_modules isn't linked into the new worktree
```

---

## Where the problem is (verified file map)

**The hard login wall:**
- `src/navigation/RootNavigator.tsx:198-296` — `RootNavigator` reads `{ user, isLoading } = useAuth()`. At **line 211**: `initialRouteName={user ? 'Main' : 'SignIn'}`. When `user === null`, the app starts on `SignInScreen`. `Main` (the `TabNavigator`) is a registered `Stack.Screen` (line 232-236) but is only reached via `navigation.replace('Main')`.
- The only six `navigation.replace('Main')` calls are all post-auth: `src/screens/auth/SignInScreen.tsx` (lines 136, 210, 373, 390, 425), `src/screens/auth/SetPasswordScreen.tsx:69`, `src/screens/auth/PermissionsOnboardingScreen.tsx:202`. **There is no guest path.**

**The two flagged screens live only inside Main:**
- `src/navigation/TabNavigator.tsx:85-93` mounts tabs: `Home`, `Schedule`, `Book` (BookScreen — "private classes"), `Community`, `Hydration`, `Store` (StoreScreen — "products"), plus employee-only `Tasks`/`Clock`, and `Profile`. The employee tabs are gated on `user?.isEmployee` (lines 89-92).
- `src/screens/StoreScreen.tsx` — product browsing. Cart is fully local: `src/context/CartContext.tsx` has **no** auth/`user`/`getCurrentUid` dependency, so browsing + add-to-cart already work with `user === null`. The account action is **checkout** (`onPress` starting at line 361; it stamps `memberId: user?.id ?? 'unknown'` at line 426 — must be gated).
- `src/screens/BookScreen.tsx` — private session booking. Browsing instructors/types/times needs no account. The account action is `handleBooking` (line 127), which **already** guards: `if (!user) { Alert.alert('Sign in required', …) }` at lines 138-141 (but the alert is a dead-end — make it route to SignIn).

**Why guests won't crash on the other tabs (verified):**
- `HomeScreen.tsx`, `ScheduleScreen.tsx`, `ProfileScreen.tsx`, `CommunityScreen.tsx` all read `user` null-safely (`user?.id`, `user?.firstName ?? 'Member'`, `user?.belt ?? 'white'`, etc.). Examples: HomeScreen lines 348/373/491/782; ProfileScreen lines 42/95/121-123/211; ScheduleScreen line 95 (`a.memberId === user?.id`). A guest renders empty/default states, not red-boxes.
- `ProfileScreen.tsx:57` (`persistPhoto`) and `:95` (stats memo) already early-return on `!user`.

**Account actions that currently DON'T guard (guest would proceed with bad data) — must gate:**
- Checkout — `src/screens/StoreScreen.tsx` checkout `onPress` (line 361).
- Buy Now — `src/screens/ProductDetailScreen.tsx:75` `handleBuyNow`. (Add-to-cart at line 63 stays open.)
- Create post — `src/screens/CommunityScreen.tsx:322-327` FAB → `navigation.navigate('CreatePost')`.
- DMs — `CommunityScreen.tsx:223` → `MessagesList`. My-profile button `:230-233` already no-ops when `getCurrentUid()` is null.

---

## The fix

Architecture: **do NOT fake a `user` for guests** (that would silently un-gate every account-scoped feature and corrupt member-id-keyed data). Instead keep `user === null` for guests, add an explicit `isGuest` flag to `AuthContext`, let guests into `Main`, and intercept the specific account actions with a reusable prompt.

### 1. AuthContext — add guest state (`src/context/AuthContext.tsx`)
- Add a persisted key near the other keys (line ~18): `const GUEST_KEY = '@zenki_guest_mode';`
- Extend `AuthContextValue` (lines 22-32) and the default context (34-40):
  ```ts
  isGuest: boolean;
  continueAsGuest: () => Promise<void>;
  exitGuest: () => Promise<void>;
  ```
- Add `const [isGuest, setIsGuest] = useState(false);` next to the `user` state (line 43).
- In the restore effect (lines 46-99): if there is no stored user id (`!id`), before returning, read `GUEST_KEY`; if it is `'true'`, `setIsGuest(true)`. (So a guest who relaunches stays a guest.)
- Implement:
  ```ts
  const continueAsGuest = useCallback(async () => {
    setUser(null);
    setIsGuest(true);
    await AsyncStorage.setItem(GUEST_KEY, 'true');
  }, []);
  const exitGuest = useCallback(async () => {
    setIsGuest(false);
    await AsyncStorage.removeItem(GUEST_KEY);
  }, []);
  ```
- In `signIn` (line 144) and `createAccount` (line 180): after `setUser(...)`, also `setIsGuest(false)` and `AsyncStorage.removeItem(GUEST_KEY)` (signing in supersedes guest mode).
- In `signOut` (lines 286-299): also clear the guest flag (`setIsGuest(false)` + `removeItem(GUEST_KEY)`).
- Add `isGuest, continueAsGuest, exitGuest` to the Provider `value` (line 302).

### 2. SignInScreen — add a "Browse as Guest" entry (`src/screens/auth/SignInScreen.tsx`)
Below the existing "New here? Create Account" row (lines 584-590), add a third option. Pull `continueAsGuest` from `useAuth()` (it's already `const auth = useAuth();` at line 43, so use `auth.continueAsGuest`):
```tsx
<SoundPressable
  onPress={async () => { await auth.continueAsGuest(); navigation.replace('Main'); }}
  style={{ alignSelf: 'center', paddingVertical: 10, marginTop: 4 }}
  accessibilityLabel="Browse as guest"
>
  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.textSecondary, textDecorationLine: 'underline' }}>
    Browse as Guest
  </Text>
</SoundPressable>
```
Place it inside `ScreenContainer`, just after the `createAccountRow` View. Label text must read exactly **"Browse as Guest"**. The invite-gate Modal (lines 443-472) must still be satisfied first when `INVITE_GATE_ENABLED` is true — but it is currently `false` (line 38), so guests reach the sign-in screen directly; do not change the gate flag.

### 3. New reusable gate helper (`src/utils/requireAuth.ts`)
```ts
import { Alert } from 'react-native';

/**
 * Account-action gate. Returns true if the user may proceed (signed in).
 * For guests (user == null) it shows a prompt that routes to the sign-in
 * screen and returns false so the caller aborts the account action.
 * Browsing is never gated — only call this on checkout / book / post / DM.
 */
export function requireAuth(
  user: unknown | null,
  navigation: any,
  action = 'continue',
): boolean {
  if (user) return true;
  Alert.alert(
    'Sign in to continue',
    `Create a free account or sign in to ${action}. You can keep browsing without one.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Sign In', onPress: () => navigation.navigate('SignIn') },
    ],
  );
  return false;
}
```

### 4. Gate the account actions (browse stays open)
- **`src/screens/StoreScreen.tsx`** — at the very top of the checkout `onPress` (line ~363), add: `if (!requireAuth(user, navigation, 'check out')) return;` (`user` and `navigation` are already in scope). Add the import. Leave categories, product grid, add-to-cart, cart view, wishlist, promo all ungated.
- **`src/screens/ProductDetailScreen.tsx`** — in `handleBuyNow` (line 75), add `if (!requireAuth(user, navigation, 'check out')) return;` after the size check. Pull `user` from `useAuth()` (add the import/hook if not present). Leave `handleAddToCart` (line 63) ungated.
- **`src/screens/BookScreen.tsx`** — replace the dead-end alert at lines 138-141 with `if (!requireAuth(user, navigation, 'request a booking')) return;`. Leave instructor/type/time selection ungated.
- **`src/screens/CommunityScreen.tsx`** — FAB onPress (line 322-327): `if (!requireAuth(user, navigation, 'post')) return;` before `navigation.navigate('CreatePost')`. DM button (line 223): `if (!requireAuth(user, navigation, 'send messages')) return;` before navigating to `MessagesList`. (The Community tab itself stays open with no prompt; post content is members-only server-side — Firestore rules require sign-in for post reads — so guests see an honest "Sign in to see what members are sharing" state with a Sign In button, never a fake-empty feed. Member search likewise shows a dedicated sign-in state for guests.)

### 5. Profile + Settings for guests
- **`src/screens/ProfileScreen.tsx`** — when `user === null` (guest), render a friendly empty state with a prominent CTA button labeled **"Sign In / Create Account"** that calls `navigation.navigate('SignIn')`, instead of showing the member card with default "Member / white belt". Keep the Theme switcher and Help/Settings rows accessible. (`persistPhoto` already returns on `!user`.)
- **`src/screens/SettingsScreen.tsx`** — pull `isGuest` from `useAuth()`. For guests: hide/replace the "Sign Out" row (line 112 `handleSignOut`) and the "Delete Account" row (line 129) — guests have no account — and instead show a single **"Sign In / Create Account"** row → `navigation.navigate('SignIn')`. Keep `handleSignOut` clearing the guest flag for the signed-in case (already handled via `signOut` change in step 1).

### 6. Resume into Main for returning guests (`src/navigation/RootNavigator.tsx`)
- Read `isGuest` too: `const { user, isGuest, isLoading } = useAuth();`
- Change line 211 to: `initialRouteName={user || isGuest ? 'Main' : 'SignIn'}` so a guest who relaunches lands on Main, not the wall.

### 7. TabNavigator (`src/navigation/TabNavigator.tsx`)
- No structural change required: guests get `Home / Schedule / Book / Community / Hydration / Store / Profile` because `isEmployee` is false when `user` is null (lines 89-92 already exclude the employee `Tasks`/`Clock` tabs). Confirm guests never see employee tabs (they won't).

---

## Do NOT break
- **Keep all genuinely account-based actions gated**: checkout, Buy Now, booking, posting, DMs, profile-photo upload, account deletion. A guest must be prompted to sign in for these — never allowed to write with `memberId: 'unknown'`.
- **Do not fabricate a `user` object for guests.** `user` stays `null`; gating across the app (admin screens, member-id-keyed contexts, Firestore rules, `getCurrentUid()`-based ownership) relies on that. Faking a user would regress data integrity and security.
- **Do not regress prior rejection fixes**: Apple Pay checkout label logic (`applePayReady`, StoreScreen lines 70-75, 480-490) for 2.1(a); the reviewer demo seed flow (`seedReviewerDataIfNeeded`, AuthContext lines 89/152) for 2.1(a); the reviewer/admin sign-in paths. Signing in as `reviewer/reviewer123` must still seed and land on a fully populated Main.
- **Do not change `INVITE_GATE_ENABLED`** (it's intentionally `false`).
- **Do not require email verification** anywhere (per project history this locks accounts).
- Keep the guest flag cleared on real sign-in and on sign-out, so state never leaks between sessions.

---

## Acceptance criteria (what Apple's reviewer flow must pass)
1. Fresh install → SignIn screen shows a clearly-labeled **"Browse as Guest"** option.
2. Tapping it opens the **Main** tab bar with **no** sign-in required.
3. Guest can open the **Store** tab, browse all products, open product detail, and **add to cart** — no prompt.
4. Guest can open the **Book** tab and view instructors, session types, and available times — no prompt.
5. Guest can view the **Schedule** (class list) — no prompt. The **Community** tab opens without a prompt; because post content is account-based (members-only, rules-enforced), guests see a clear "Sign in to see what members are sharing" state with a Sign In button — not a blocking prompt and not a misleading empty feed. The member search screen shows the equivalent sign-in state.
6. Only when the guest taps **Checkout**, **Buy Now**, **Request Booking**, **Create Post**, or **Send Message** do they get a "Sign in to continue" prompt with a "Not now" / "Sign In" choice; "Sign In" routes to the sign-in screen.
7. Guest Profile/Settings show a **"Sign In / Create Account"** CTA, not a fake member card, and no "Delete Account"/"Sign Out" for guests.
8. Force-quit + relaunch as a guest returns to Main (not the wall).
9. Signing in (incl. `reviewer/reviewer123`) clears guest mode and lands on a populated Main; sign-out returns to SignIn and clears guest state.

---

## Verify
1. Typecheck: `npx tsc --noEmit` (expect only the pre-existing `expo-task-manager` error, no new errors).
2. Standalone Release build on the Simulator:
   ```bash
   xcrun simctl list devices | grep -i "iPad Air 11"   # grab a UDID (Apple reviewed on iPad Air 11" M3)
   npx expo run:ios --configuration Release --device <UDID>
   ```
   (Release build = no Metro; mirrors what App Review runs.)
3. On the SignIn screen, tap **Browse as Guest** → confirm Main opens. Walk the Store and Book tabs without signing in (criteria 3-5). Tap Checkout / Request Booking / Create Post → confirm the sign-in prompt (criterion 6). Open Profile/Settings as guest (criterion 7). Force-quit and relaunch → still in Main (criterion 8).
4. Then sign in as `reviewer` / `reviewer123` → confirm seed data populates and guest CTAs are gone; sign out → back to SignIn (criterion 9).
   - Sim typing gotcha: tap on-screen keys (or paste) rather than the synthetic `type` tool, which can trigger stuck accent popups.

---

## Ship
After verification:
```bash
git add -A
git commit -m "fix(app-review): allow guest browsing of Store + Book without login (5.1.1(v))

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
Then a new EAS production build is required (the rejection is on build 45):
```bash
eas build --platform ios --profile production --auto-submit
```
`buildNumber` in `app.json` (currently `"45"`, line 92) autoincrements on EAS but is NOT auto-committed — after the build, commit the bump:
```bash
git add app.json && git commit -m "chore(ios): bump buildNumber to 46 for App Review resubmission (5.1.1(v) guest browse)"
```
Update the App Review notes to mention: "Tap 'Browse as Guest' on the sign-in screen to access the store and class booking without an account; registration is only required for checkout, booking, and social features." Push the branch and open a PR to `main`.
