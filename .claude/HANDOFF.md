# Handoff — Zenki Dojo (moving Windows → Mac, mid–v1.0 rework)

Read this on the Mac to pick up exactly where we left off.

## Where things stand right now

**App Review rejected build 21 (v1.0)** on Apr 28 with five separate issues. Fixes for all five are committed and pushed to `main` — but **no fresh build has been submitted yet**. Build 22 was the App Review fixes alone; build 23 finished but was never submitted; build 24 was queued with the permissions walkthrough but **canceled** ("stop building, we have a lot of work to do"). Then two more bug fixes landed.

**Branch: `main` at `a3bcb2c`** is the current head. Everything that follows is committed and pushed there.

## Bug fixes accumulated since build 21 — ALL on main, NOT yet built

| Commit | What it fixes |
|---|---|
| `f637d53` | App Review #1: Drink screen "Pay" button (Apple-logo + no feedback) → renamed "Settle Tab", checkmark icon, confirmation dialog, success alert. App Review #2: HealthKit transparency (2.5.1) — new "APPLE HEALTH" section in Settings with toggle + read/write data lists. |
| `3a3f129` | EAS: dropped `resourceClass: m-large` (requires paid plan) — `default` now |
| `bcb9615` | Onboarding permissions walkthrough — "Grant All Permissions" button walks Location → Health → Camera → Notifications → Photos sequentially with `await`, individual rows now disabled while a request is in flight (iOS would silently skip stacked prompts) |
| `a3bcb2c` | SenpaiMascot PanResponder no longer blocks ScrollView (locationX/Y bounds check + `onShouldBlockNativeResponder: () => false`); Vouchers section moved from ProfileScreen to HomeScreen as a reorderable section |

## Next-session: do this

### 1. Pull latest, install
```bash
cd ~/Desktop/Zenki-App   # or wherever it lives on this Mac
git pull origin main
npm install --legacy-peer-deps
```

### 2. Build 25 — bundles ALL the above
```bash
npx eas-cli build --platform ios --profile production --non-interactive --no-wait
```
~7 min on EAS. The `eas.json` submit profile already has the App Store Connect API key wired (`AuthKey_393722HSY5.p8` at project root, gitignored — back this up off-machine, Apple won't re-issue it). After it finishes, submit:

```bash
npx eas-cli submit --platform ios --latest --non-interactive
```
~5–10 min for Apple processing. You'll get an email when it's ready in TestFlight.

### 3. Install on iPhone via TestFlight
- TestFlight app from App Store → sign in with `mattbrowntheemail@gmail.com`
- Build 25 of "Zenki Dojo" appears → tap Install

### 4. Film the demo video Apple wants
Apple's Guideline 2.1 issue: they want a video showing the BLE heart-rate monitor pairing on a physical iPhone.

**Have:** iPhone, BLE heart-rate strap (per user), Mac for filming via QuickTime.

**Script** (~90 seconds, raw flow, no editing):
1. Open camera/QuickTime, frame iPhone + strap together
2. Voice-over: "Build 25 of Zenki Dojo on iPhone, paired with [strap model name]"
3. Open the app on iPhone, sign in with `admin` / `password`
4. Navigate to Workout → Start Session
5. Show BLE chip "Disconnected" at top of WorkoutSession screen
6. Tap chip → iOS Bluetooth permission prompt → grant
7. App scans, finds strap by name → "Connected"
8. Show live BPM updating (move/breathe to make it change)
9. Tap Record → timer runs with BPM streaming
10. Stop session → confirm → see saved entry in workout list

Upload as **YouTube unlisted** (don't use Drive/Dropbox — those gate to a Google login).

### 5. Reply to Apple in App Store Connect Resolution Center

Go to https://appstoreconnect.apple.com/apps/6763685748/distribution → App Review tab → reply to the rejection. **Paste this verbatim**, replacing `[YOUR YOUTUBE URL]` and `[STRAP MODEL]`:

```
Hi App Review team — thank you for the detailed feedback. Build 25
addresses every issue. Demo video showing BLE heart-rate monitor pairing
on a physical iPhone (per Guideline 2.1): [YOUR YOUTUBE URL]

Guideline 2.1(b) — Business Model:
Zenki Dojo is a complimentary companion app for paying members of our
private martial arts and CrossFit facility (1714 Hillhurst Ave,
Los Angeles CA 90027 — established 1997). Adult memberships are
$1,000/month, sold exclusively in person at the dojo. The app is
provided free to members at no additional cost.

1. Users: existing paying members of the physical Zenki Dojo facility.
2. Payment location: exclusively at the physical dojo (memberships,
   gear, training, recovery sessions). Nothing is sold inside the app.
3. Paid in-app content: none. The app provides class scheduling,
   workout tracking, gear reservation, and booking requests for
   in-person fulfillment and payment.
4. Paid content unlocked without IAP: none. No paywall, no
   subscriptions, no digital content for sale.
5. Account creation: members receive a one-time invite code from dojo
   staff when they sign up in person. Account creation in the app is
   free.
6. Invite code: provided as part of the existing in-person membership
   relationship — not separately purchased.

Guideline 2.1(a) — "No further action after Apple Pay tapped":
The button on the Hydration screen used Apple's logo with the label
"Pay" — incorrectly resembling Apple Pay. It was actually a "mark tab
as settled" action with no visible feedback. Build 25 replaces the
icon (now a checkmark), renames the button to "Settle Tab", adds a
confirmation dialog, and a success alert. There is no Apple Pay or
in-app payment processing in v1.0.

Guideline 2.5.1 — HealthKit transparency:
Build 25 adds a clearly-labeled "APPLE HEALTH" section in Settings
with a toggle, status indicator, and explicit lists of which data
types are read from Health (Steps, Active Energy, Heart Rate, Body
Mass) and written back (Workouts, Weight, Nutrition, Heart-Rate
Sessions).

Guideline 4 — iPad layout:
The app is configured iPhone-only (`supportsTablet: false`). Please
re-test on a supported iPhone — the iPad layout is intentionally not
supported in v1.0 and is on the roadmap for a future major version.

Guideline 2.1 — Demo video:
Linked at the top of this reply. The video shows the full BLE pairing
flow with [STRAP MODEL] and live HR streaming during a recorded
session, all on a physical iPhone.

Build 25 will be uploaded to App Store Connect shortly. Please re-test
once available.

Thank you,
Matt Brown
```

Also add the YouTube URL to **App Review Information → Notes** in App Store Connect (above the existing demo-account text).

### 6. Once build 25 lands in App Store Connect
- Distribution → swap the Build section over to build 25 (it'll auto-suggest)
- Click **Add for Review**

## After v1.0 is approved — v1.1 starts

`v1.1-apple-pay` branch already has Stripe Apple Pay scaffolding committed (`9873740` on that branch). Pending user actions before code can finish:
- Sign up at https://dashboard.stripe.com (test mode)
- Get the publishable key (`pk_test_...`) and share it
- Stash the secret key (`sk_test_...`) — to be set as Firebase secret via `firebase functions:secrets:set STRIPE_SECRET_KEY`
- Decide bookings flow: are class/private session bookings billed in v1.1, or just gear?
- Decide on Stripe Tax (~$0.05/tx + 0.5%) for CA sales tax compliance
- No in-app refunds (already decided — punt to "text the dojo")

## Two reference files in the repo root

- `Zenki_TestFlight_Bugs.docx` — bug list from this session. User dictated the two fixes from it that have shipped (Senpai + vouchers); rest of the doc may have more bugs to triage.
- `Zenki_Master_Prompt.md` — user pointed at this with "after you are done with that do this." Read it on the Mac before pushing on v1.1 work.

## EAS / Apple state — reference

- `eas-cli` logged in as `mattbrowntheemail` (Google SSO via `eas login --browser`)
- Apple Team `RPV54B2NK5` (Matthew Brown — Individual). Distribution cert valid until **2027-04-24**.
- App Apple ID: **`6763685748`** — https://appstoreconnect.apple.com/apps/6763685748/distribution
- App Store Connect API key file: `AuthKey_393722HSY5.p8` at project root (Issuer `c17533c7-83ed-4f4e-8e9a-c4f7b72188fd`, Key ID `393722HSY5`, role App Manager). **Gitignored — back up.**
- Provisioning profile: `Zenki_Dojo_AppStore_Manual_v2.mobileprovision` at project root. Apple-side is fine for v1.0 — App ID has HealthKit + Sign in with Apple + Push Notifications + (briefly added) Apple Pay merchant `merchant.com.zenkidojo.app` (only used by v1.1; v1.0 entitlements don't claim it).

## Known gotchas

1. `react-native-health` flagged "Untested on New Architecture" — `newArchEnabled: false` in `app.json` is the workaround. Plan replacement with `@kingstinct/react-native-healthkit` for v1.2.
2. `CREDENTIALS` in `src/data/members.ts` is `__DEV__`-gated. Production ships username→memberId map with blank passwords; Firebase Auth verifies real password. Don't "clean this up" — intentional.
3. Untracked icon work-in-progress at repo root (`zenki-final-1024.png`, `zenki-iconset*/`, `assets/_logo_backup/`, etc.) — predates this session, ignored by `.easignore`. Don't `rm -rf` without asking.
4. The 53MB `Simulator Screenshot - iPhone 17 Pro Max - 2026-04-24 at 23.39.52/` directory at repo root is duplicate user data — `.easignore` excludes it from EAS uploads.

---

Last updated: 2026-04-28 by Claude (Windows session, mid–v1.0 rework). On `main` at `a3bcb2c`.
