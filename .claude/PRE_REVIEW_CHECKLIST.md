# Pre-Review Checklist — Zenki Dojo v1.0 (Build 20)

Walk through this before clicking **Add for Review** in App Store Connect. Skipping items that fail can cause Apple to reject in 24–48 hours and force a resubmission cycle.

## 1. TestFlight processing (automated, ~5–10 min)

- [ ] Apple sends "Build 20 has been processed" email
- [ ] Build 20 (1.0.0) appears in App Store Connect → TestFlight → iOS with status **Active** (not Expired)
- [ ] If `Missing Compliance` warning appears, click it and confirm encryption: not used (matches `usesNonExemptEncryption: false` in app.json)

## 2. Install on real iPhone

- [ ] Install **TestFlight** app on iPhone (App Store)
- [ ] Open TestFlight app → sign in with `mattbrowntheemail@gmail.com`
- [ ] Accept the test invite for "Zenki Dojo"
- [ ] Install build 20 via TestFlight

## 3. Smoke test on device (golden path + reviewer flow)

**Sign-in flow** (this proves the `__DEV__`-gated CREDENTIALS refactor works in prod):
- [ ] Cold launch the app → invite gate appears → enter `dragon` → continue
- [ ] Sign in with `admin` / `password` → reaches Home
- [ ] Sign out → sign back in (verifies last-username prefill from this morning's auth UX commit)

**Sign in with Apple** (Apple specifically tests this since Google sign-in is offered):
- [ ] Tap "Sign in with Apple" → Apple ID sheet appears → cancel (don't actually create a separate Apple-auth member here, you'd duplicate the test reviewer account)

**Permission prompts** (each must trigger correct usage description text from app.json):
- [ ] HealthKit — go to a screen that reads HK (HomeScreen, ActivityTracker) → permission sheet shows "reads steps, calories…"
- [ ] Camera — go to BarcodeScanner or PhotoFood → permission sheet shows correct text
- [ ] Photos — try to upload a profile picture → permission sheet shows correct text
- [ ] Calendar — try to add a booking to calendar → permission sheet shows correct text
- [ ] Location — start a GPS workout or check in at the dojo → permission sheet shows correct text
- [ ] Bluetooth — go to HR monitor connect screen → permission sheet shows correct text
- [ ] Motion — usage tracked passively, no explicit prompt expected

**Core flows:**
- [ ] All 5 nav tabs render without crashes (Home, Schedule, Book, Store, Profile)
- [ ] Book a class → confirmation alert "We'll confirm by text or email. Payment is handled in person at the dojo."
- [ ] Add gear to cart → checkout → "RESERVE · PAY $X.XX AT DOJO" alert
- [ ] Open Workout screen → log a set → save
- [ ] Open Settings → Theme switching works
- [ ] Account deletion path: Settings → Danger Zone → Delete Account (don't actually delete the reviewer account, just verify the screen exists)

**Stability:**
- [ ] 5 minutes of casual usage with no crashes
- [ ] No red error overlays, no console errors visible to user

## 4. Screenshots (App Store Connect → Distribution → Previews and Screenshots)

Apple requires at least 3 screenshots for **iPhone 6.5"** display (1242×2688 or 2688×1242). Optional iPad. Suggested screens:

- [ ] Home (animated logo + stats + classes)
- [ ] Schedule (day-based class grid)
- [ ] Book (private appointment picker)
- [ ] Store (gear catalog) — *optional but visually distinctive*
- [ ] Workout / Macros — *optional but shows tracking*

Capture method:
- **iPhone (recommended for accuracy)**: power + volume up → goes to Photos → AirDrop or upload from there
- **iOS Simulator** (Mac only): `Cmd+S` in Simulator menu, saves to Desktop
- Drag PNGs into App Store Connect → iPhone 6.5" tab → confirm 3+ are uploaded

## 5. App Store Connect → Distribution: final pre-flight

- [ ] **Build** section attached: build 20 selected (it'll appear after TestFlight processes)
- [ ] **App Information**: Name "Zenki Dojo", subtitle, category "Health & Fitness" — verified earlier ✓
- [ ] **Pricing**: free, US base, 44 countries (confirm 44 is intentional, not accidentally trimmed)
- [ ] **App Privacy**: 13 data types declared, all "Data Linked to You", no tracking — verified ✓
- [ ] **Age Rating**: 9+ — verified ✓
- [ ] **App Review Information**:
  - Sign-in: `admin` / `password`
  - Contact: Matt Brown, your phone, your email
  - Notes: covers demo account, invite gate, demo data, no-IAP, AI, health data, account deletion — verified today ✓
- [ ] **App Store Version Release**: "Automatically release this version" — verified ✓
- [ ] **Privacy Policy URL**: `https://zenki-dojo.web.app/privacy` (load it in a browser to confirm the page actually serves)
- [ ] **Support URL**: `https://zenki-dojo.web.app/support` (same — confirm it loads)
- [ ] Marketing URL: `http://www.zenkidojo.com` (confirm it loads)
- [ ] Encryption documentation: `usesNonExemptEncryption: false` in app.json should auto-fill; if App Store Connect asks separately, answer "No"

## 6. Click "Add for Review"

App Store Connect → Distribution → top-right blue **Add for Review** button. This:
1. Locks the version
2. Validates the metadata
3. Sends to Apple App Review queue (~24–48 hours typical for first-time apps; can be longer)

Apple's reviewer will:
- Test on real hardware
- Check that all declared capabilities work
- Verify the privacy disclosures match observed behavior
- Test the demo account credentials
- Look for anything in the app that contradicts the metadata

## 7. After approval

- App auto-releases (per current setting)
- Search for "Zenki Dojo" on the App Store appears within ~2–4 hours of release

## 8. After rejection (if it happens)

Common rejections + fixes:
- **Demo account didn't work** → reviewer note password mismatch or Firebase didn't seed → re-test sign-in on TestFlight build before re-submitting
- **Privacy questions don't match observed behavior** → update the privacy questions to match reality
- **Subscriptions/IAP missing** → if reviewer thinks the dojo membership is digital, clarify in resolution center that membership is a physical service paid in person; "v1.0 has no in-app payments by design"
- **Missing required information** → check the rejection email; re-submit after fixing
- **Background modes** — `UIBackgroundModes: ["fetch"]` in app.json; if reviewer flags unused background fetch, either implement it or remove from app.json

Use App Store Connect → Resolution Center to respond. After fixes, re-submit (no need for a new build unless the fix is a code change).

---

Last updated: 2026-04-26 by Claude. Build 20, commit 09d1449.
