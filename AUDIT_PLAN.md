# App Store Submission — Audit Plan

**Audit date:** 2026-04-19
**Current version:** v7.3
**Target:** iPhone via EAS Build → TestFlight → App Store

Sections 1–14 of the audit are complete. Findings and the executable fix plan below. See full audit discussion in chat transcript (Claude session).

---

## Status at a glance

- **Bundle A — Repo hygiene:** ✅ done (v6.4)
- **Bundle B — Expo config + EAS scaffolding:** ✅ done (v6.5)
- **Bundle C — Firebase security:** ✅ done (v6.6)
- **Bundle D — Real auth + delete account:** ✅ done (v6.7)
- **Bundle E — UI polish:** ✅ done (v6.8)
- **Bundle F — Perf + bundle size:** ✅ done (v6.9)
- **v7.0 — UGC moderation (Report + Block):** ✅ done (Apple rule 1.2)
- **v7.1 — Admin reports triage queue:** ✅ done
- **v7.2 — Auth smoke-test fixes + dead-code sweep:** ✅ done
- **v7.3 — Moderation UI verification + Follow-button guard:** ✅ done
- **Bundle G — External pre-flight:** pending (1 day of human work + Apple review)

**Ready for Bundle G.** All Claude-executable blockers are fixed.

Work through bundles in order. Each bundle is independent enough to commit and push as its own version (v6.4, v6.5, ...) and ship to TestFlight for validation.

---

## Bundle A — Repo hygiene (~5 min)

One cleanup commit. Removes ~700 KB of dead code and tightens `.gitignore`.

- [ ] `git rm -r src-backup-pregamification`
- [ ] `git rm App.tsx.backup App.tsx.backup-pregamification`
- [ ] `git rm src/screens/ActivityTrackerScreen.tsx.backup`
- [ ] `git rm src/theme/colors.ts.backup src/theme/typography.ts.backup`
- [ ] `git rm -r --cached functions/lib`
- [ ] Append to `.gitignore`:
  ```
  ios/
  android/
  *.keystore
  GoogleService-Info.plist
  google-services.json
  functions/node_modules/
  functions/lib/
  .env.*
  ```
- [ ] Commit as **v6.4**

---

## Bundle B — Expo config + EAS (~20 min code + external)

Unblocks build and submit.

- [ ] **External:** re-export `assets/icon.png` at 1024×1024, no alpha channel
- [ ] Add to `app.json`:
  - `expo.scheme: "zenkidojo"` (top-level, for OAuth redirect)
  - `ios.buildNumber: "1"`
  - `ios.config.usesNonExemptEncryption: false`
  - `splash.image: "./assets/splash.png"` (ensure splash.png is PNG, ideally 1284×2778)
- [ ] Update `src/screens/BookScreen.tsx:109` — change `scheme: 'com.zenki.dojo'` to `scheme: 'zenkidojo'`
- [ ] Run `eas init` (writes `extra.eas.projectId`)
- [ ] Run `eas build:configure` (writes `eas.json` with production profile)
- [ ] Create EAS build secrets:
  ```
  eas secret:create EXPO_PUBLIC_USDA_API_KEY --value "..."
  eas secret:create EXPO_PUBLIC_GOOGLE_CLIENT_ID --value "..."
  eas secret:create EXPO_PUBLIC_SHEETS_URL --value "..."
  ```
- [ ] Delete the hardcoded `USDA_API_KEY = 'DEMO_KEY'` in `src/config/api.ts` — unify on `src/config/env.ts`
- [ ] Commit as **v6.5**

---

## Bundle C — Firebase security (~30 min + deploys)

**Urgent — current Firestore rules are wide-open.**

- [ ] Rewrite `firestore.rules` with per-collection rules + default-deny (see draft in Section 4 of audit below)
- [ ] Create `storage.rules` with `users/{uid}` ownership gating
- [ ] Add to `firebase.json`: `"storage": { "rules": "storage.rules" }`
- [ ] Populate `firestore.indexes.json` with composite indexes:
  - `attendance`: `(date ASC, checkInTime ASC)`
  - `posts`: `(userId ASC, createdAt DESC)`
- [ ] Rewrite `src/config/firebase.ts` to use:
  ```ts
  import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
  import AsyncStorage from '@react-native-async-storage/async-storage';
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  ```
- [ ] Deploy: `firebase deploy --only firestore:rules,storage,firestore:indexes`
- [ ] Commit as **v6.6**

### Minimum-viable Firestore rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /users/{uid} {
      allow read: if isSignedIn();
      allow create, update, delete: if isOwner(uid);
    }
    match /members/{memberId} {
      allow read: if isSignedIn();
      allow write: if false; // admin-only, gate later
    }
    match /posts/{postId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }
    match /threads/{threadId} {
      allow read: if isSignedIn() && request.auth.uid in resource.data.participants;
      allow create: if isSignedIn() && request.auth.uid in request.resource.data.participants;
      allow update: if isSignedIn() && request.auth.uid in resource.data.participants;
      match /messages/{messageId} {
        allow read: if isSignedIn() && request.auth.uid in get(/databases/$(database)/documents/threads/$(threadId)).data.participants;
        allow create: if isSignedIn() && request.auth.uid in get(/databases/$(database)/documents/threads/$(threadId)).data.participants
                      && request.resource.data.senderId == request.auth.uid;
      }
    }
    match /follows/{followId} {
      allow read: if isSignedIn();
      allow create, delete: if isSignedIn() && resource.data.followerId == request.auth.uid;
    }
    match /attendance/{docId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.resource.data.memberId == request.auth.uid;
      allow update, delete: if false;
    }
    match /products/{productId} {
      allow read: if isSignedIn();
      allow write: if false;
    }
    match /waivers/{waiverId} {
      allow read: if false;
      allow create: if isSignedIn() && request.resource.data.memberId == request.auth.uid;
      allow update, delete: if false;
    }
    match /supportMessages/{docId} {
      allow read: if false;
      allow create: if isSignedIn() && request.resource.data.senderId == request.auth.uid;
      allow update, delete: if false;
    }
    match /aiRateLimits/{uid}/endpoints/{endpoint} {
      allow read, write: if false;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Minimum-viable Storage rules

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{uid}/{all=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /public/{all=**} {
      allow read: if request.auth != null;
      allow write: if false;
    }
    match /{path=**} { allow read, write: if false; }
  }
}
```

---

## Bundle D — Real auth + account deletion (~2 hrs)

**Apple 5.1.1(v) blocker lives here.**

### Auth rewrite

- [ ] `AuthContext.createAccount`:
  - Replace local-only signup with `createUserWithEmailAndPassword(auth, email, password)`
  - Use returned Firebase uid as Member.id
- [ ] `SignInScreen.handleSignIn`:
  - Drop hardcoded `CREDENTIALS` map
  - Use `signInWithEmailAndPassword(auth, email, password)`
  - Keep admin/test accounts only as seeded Firestore users
- [ ] `ForgotPasswordScreen.handleReset`:
  - Replace fake `setTimeout` with `sendPasswordResetEmail(auth, email)`
- [ ] `SettingsScreen` Sign Out row:
  - Replace `navigation.replace('SignIn')` with:
    ```ts
    const { signOut } = useAuth();
    await signOut();              // clears local state
    await firebaseSignOut();      // clears Firebase Auth session
    navigation.replace('SignIn');
    ```
- [ ] `AuthContext.signOut`:
  - Also call `firebaseSignOut()`
  - Remove both `@zenki_current_user` AND `@zenki_custom_member` from AsyncStorage

### Delete Account

- [ ] Add "Delete Account" row in SettingsScreen Danger Zone (reachable in ≤2 taps)
- [ ] Destructive confirm Alert before delete
- [ ] Client calls Cloud Function `deleteAccount` with Firebase ID token
- [ ] On success: `await currentUser.delete()` (client-side Firebase Auth deletion)
- [ ] Handle `auth/requires-recent-login` — prompt re-auth
- [ ] `await AsyncStorage.clear()` after successful delete
- [ ] Add `deleteAccount` Cloud Function in `functions/src/index.ts`:
  - Cascade delete Firestore docs (users, posts, follows, attendance, waivers, bloodworkReports, dexaScans, supportMessages, pushTokens, aiRateLimits)
  - Cascade delete Storage files under `users/{uid}/`
  - Return `{ ok: true }`
  - See full scaffold in Section 13 of audit

### Stability fixes (crash + memory)

- [ ] Add `.catch()` to every top-level `AsyncStorage.getItem(...).then(...)` in context init effects (~15 files). Simplest: convert to async/await with try/catch/finally, put `setIsLoading(false)` in `finally`.
- [ ] Tear down `onSnapshot` listeners when `user?.id` becomes null — add `user?.id` to dep lists in MessagesListScreen, MessagesChatScreen, ProductContext subscriber

- [ ] Commit as **v6.7**

---

## Bundle E — UI polish (~1 hr)

- [ ] Wrap 14 TextInput screens in `<KeyboardAvoidingView>`:
  - `SignUpScreen`, `ForgotPasswordScreen`, `ContactScreen`
  - `CreatePostScreen`, `ProfileScreen`, `UserProfileScreen`, `UserSearchScreen`
  - `StoreScreen`, `SettingsScreen`, `CycleTrackerScreen`
  - `AdminProductsScreen`, `AdminMembersScreen`, `AdminAnnouncementsScreen`, `AdminScheduleScreen`
  - Pattern:
    ```tsx
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
      keyboardVerticalOffset={64}
    >
      <ScrollView keyboardShouldPersistTaps="handled">...</ScrollView>
    </KeyboardAvoidingView>
    ```
- [ ] Add `maxFontSizeMultiplier={1.3}` via a shared `<AppText>` wrapper, or as a default on common Text styles
- [ ] Add `onError` fallback on remote `<Image>` in `PostCard.tsx` (avatar + media)
- [ ] Add one-time health-data disclosure modal on first Bloodwork / DEXA upload (flag under `@zenki_health_consent_v1`)
- [ ] Commit as **v6.8**

---

## Bundle F — Perf + bundle size (~45 min)

- [ ] Split `src/screens/ActivityTrackerScreen.tsx`:
  - `ActivityTrackerScreen.native.tsx` — no Leaflet, show "GPS track will display in map on web" placeholder
  - `ActivityTrackerScreen.web.tsx` — full Leaflet map, imports `require('leaflet')`
  - Metro auto-resolves platform extension
- [ ] `npm uninstall react-leaflet expo-font` (verify app still launches)
- [ ] **External:** optimize brand images:
  - Run `assets/brand/*.png` and `.jpg` through ImageOptim (Mac) or TinyPNG (web)
  - Largest targets: `zenki-logo-white.jpg` (726 KB), `zenki-3d-logo-3.png` (680 KB), `zenki-3d-logo-2.png` (657 KB), `samurai-helmet.png` (628 KB)
  - Target: total assets folder < 1.5 MB
- [ ] Add `babel-plugin-transform-remove-console` (production-only) to `babel.config.js`:
  ```js
  module.exports = function(api) {
    api.cache(true);
    return {
      presets: ['babel-preset-expo'],
      env: { production: { plugins: ['transform-remove-console'] } }
    };
  };
  ```
- [ ] `npm install --save-dev babel-plugin-transform-remove-console`
- [ ] Commit as **v6.9**

---

## Bundle G — Final pre-flight (external, ~1 day)

### Apple + App Store Connect setup

- [ ] Enroll in Apple Developer Program ($99/yr) if not already — may take 1–2 days to activate
- [ ] Create App Store Connect app record with bundle id `com.zenkidojo.app`
- [ ] Export APNs Auth Key (.p8) from Apple Dev Portal → Certificates → Keys — save for EAS
- [ ] Fill ASC forms:
  - Primary Category: **Health & Fitness**
  - Age Rating: likely **12+** (user-generated content); bump to **17+** if UGC is unmoderated
  - Export Compliance: "No non-exempt encryption"
  - Content Rights: declare third-party content (Wix CDN product images, Anthropic AI processing)
  - IDFA: "Does not use IDFA"
  - Sign in with Apple: not required (no third-party social login)

### Firebase prod setup

- [ ] `firebase functions:secrets:set ANTHROPIC_API_KEY` with real Anthropic key
- [ ] `firebase deploy --only functions`
- [ ] Verify endpoint: `curl https://us-central1-zenki-dojo.cloudfunctions.net/recognizeFood` should return 405 Method Not Allowed (not DNS failure)
- [ ] Restrict Firebase Web API key in GCP Console → Credentials → iOS bundle ID `com.zenkidojo.app`
- [ ] (Recommended) Enable Firebase App Check with DeviceCheck provider

### Public URLs

- [ ] Host privacy policy at a public URL (e.g., `https://zenkidojo.com/privacy`) — must cover:
  - Data collected (see Section 12 of audit)
  - Why (App Functionality)
  - Sub-processors: Google/Firebase, Anthropic, Apple Push, Expo Push
  - User rights: access, correction, deletion
  - Contact email
- [ ] Host support page at a public URL
- [ ] Add both URLs in App Store Connect

### Demo reviewer account

- [ ] Create `reviewer@zenkidojo.com` with real password (via Bundle D signup)
- [ ] Pre-populate with sample data so reviewer can explore:
  - Complete a sample onboarding, add 2–3 workouts, a weight entry, a post
  - Leave invite code `dragon` if gate is still in place
- [ ] Put credentials in ASC "App Review Information" field

### Screenshots

- [ ] Capture 3–10 screenshots at **1290×2796** (iPhone 16 Pro Max)
- [ ] Cover: onboarding, home (customized), training grid, book class, community feed, profile
- [ ] Simulator path: Xcode → iPhone 16 Pro Max → `xcrun simctl io booted screenshot shot.png`

### Build + test

- [ ] `eas build -p ios --profile production` — watch for missing-module errors (BLE, etc.)
- [ ] Install via TestFlight on a real iPhone (SE + Pro Max ideal)
- [ ] Walk critical flows: signup → onboarding → book → home customize → store reserve → sign out → sign in → delete account
- [ ] Kill app + cold-start → confirm session persistence works
- [ ] Airplane-mode mid-flow → confirm graceful failure
- [ ] Foreground after 10 min → no crash, no stale state

### Submit

- [ ] `eas submit -p ios --profile production`
- [ ] Wait for App Review (typically 1–3 days)

---

## Key blockers summary (the 11 that must be fixed before submit)

| # | Blocker | Bundle | Section |
|---|---|---|---|
| 1 | `firestore.rules` wide-open (anyone can read/write all data) | C | 4 |
| 2 | No React Native auth persistence (users log out every launch) | C | 4 |
| 3 | `firestore.indexes.json` empty — queries fail silently in prod | C | 4 |
| 4 | Icon is 768×1024, not 1024×1024 | B | 2 |
| 5 | No `scheme` set — Google Calendar OAuth silently fails | B | 2 |
| 6 | No `eas.json` — can't build for store | B | 3 |
| 7 | No `ios.buildNumber` — upload fails validation | B | 2 |
| 8 | Missing `NSPhotoLibraryUsageDescription` — iOS crash | ✓ Fixed in v6.3 | 2 |
| 9 | Missing `NSCalendarsFullAccessUsageDescription` (iOS 17+) — crash | ✓ Fixed in v6.3 | 2 |
| 10 | No in-app account deletion (Apple 5.1.1(v)) | D | 7, 13 |
| 11 | Sign-out is cosmetic (Firebase session persists) | D | 7 |
| 12 | Signup throws away password (users locked out after sign-out) | D | 7 |

---

## References

- Full audit transcript: Claude session, 2026-04-19
- Apple rule 5.1.1(v): in-app account deletion
- Apple rule 3.1.1: in-app purchases (N/A after v6.2)
- Apple rule 4.8: Sign in with Apple (N/A — no social login)
- Firebase web API key security: https://firebase.google.com/docs/projects/api-keys
