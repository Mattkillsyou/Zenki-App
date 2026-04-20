# App Store Screenshots

Apple accepts three display sizes for iPhone:

| Device class | Pixel size | Device |
|---|---|---|
| 6.7" / 6.9" | **1290 × 2796** | iPhone 17 Pro Max |
| 6.5" | 1242 × 2688 | iPhone 11 Pro Max |
| 5.5" | 1242 × 2208 | iPhone 8 Plus (legacy) |

Only **one** size is actually required for submission — Apple will auto-scale
the same set for other device classes. Target 1290×2796 for the 6.9" bucket
and you're done.

---

## How to capture (do this after `eas build` and a simulator install)

1. Build the app locally so you can run it in the Simulator:
   ```sh
   eas build -p ios --profile development --local
   ```
   Or for a full production bundle after code signing:
   ```sh
   eas build -p ios --profile production
   ```

2. Boot the iPhone 17 Pro Max simulator:
   ```sh
   xcrun simctl list devices | grep "17 Pro Max"
   xcrun simctl boot "iPhone 17 Pro Max"
   open -a Simulator
   ```

3. Install the build:
   ```sh
   xcrun simctl install booted path/to/build.app
   xcrun simctl launch booted com.zenkidojo.app
   ```

4. Sign in with the reviewer account so the screens look realistic:
   - Invite code: `dragon`
   - Tap "Have an account? Sign in"
   - Username: `reviewer`
   - Password: `ZenkiTest2026!`

5. Navigate to each of the screens listed below and capture:
   ```sh
   xcrun simctl io booted screenshot app-store-screenshots/01-home.png
   ```

---

## The 6 screenshots to ship

In order of marketing strength (Apple shows the first one at the top of
the listing, so lead with the best):

1. **01-home.png** — Home screen showing the Training grid, level/XP
   ring, streak, and daily quote. This is the "what is this app"
   screen.

2. **02-macros.png** — Macro Tracker showing the calorie hero + protein
   / carbs / fat bars + today's food list. Key differentiation vs
   generic fitness apps.

3. **03-weight-trend.png** — Weight Tracker with a populated trend
   chart (do a few test weigh-ins first so the line has shape).
   Shows the EWMA trend math in action.

4. **04-workout-session.png** — HR Session with live heart rate +
   zone indicator. BLE HR is a Whoop-style premium feature; lead
   with it.

5. **05-ai-recognition.png** — DEXA or food photo recognition review
   screen showing the AI-extracted metrics with source badges. Leans
   into the AI-powered angle.

6. **06-community.png** — Community feed with at least 2-3 posts.
   (May need to seed fake posts via Firestore Console first.)

---

## Alt: hard-code a viewport screenshot from web

If you absolutely need screenshots right now and can't wait for the
iOS build:

1. Open Chrome → View → Developer → Device Mode
2. Set device to iPhone 15 Pro Max
3. Set device pixel ratio to 3
4. Navigate to each screen
5. Use DevTools → 3-dot menu → Capture full size screenshot

The output will be PNG at 1290×2796 (or whatever the Pro Max is).
Usable as placeholders while you wait for the real Simulator shots.

---

## Submission

Upload to App Store Connect → Your App → Version → Screenshots → 6.9"
Display. Drag in all 6, in order, click Save.
