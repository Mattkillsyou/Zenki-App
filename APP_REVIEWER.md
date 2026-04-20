# App Store Review — Demo Account

Paste the "Demo Account" section below into App Store Connect →
Your App → App Review Information, verbatim.

---

## Demo Account (for App Review)

**Invite code (first-launch gate):** `dragon`

**Username:** `reviewer`
**Password:** `ZenkiTest2026!`

Sign-in flow:
1. Launch the app. Enter invite code `dragon` and tap Continue.
2. On the sign-in screen, tap **Have an account? Sign in** at the bottom.
3. Enter username `reviewer` and password `ZenkiTest2026!`.
4. Tap Sign In.

---

## What the reviewer will see

The `reviewer` account is a standard (non-admin) member profile. It
does not see the admin panel. Features accessible:

- Home feed with daily quote, schedule, achievement grid
- Training hub: HR Session, Workout, Food Log, Weight, Timers, Body
  Lab, GPS, Weekly Report
- Community feed + post composer
- Profile + Settings (including Sign Out + Delete Account)
- Store (inquiry-only, no in-app purchase)
- Calendar with class bookings

## What the reviewer will not see (admin-only)

The following screens are gated behind `user.isAdmin === true` and
are not reachable for the `reviewer` account:

- Admin panel (Members, Store, Schedule, Broadcast, Announcements,
  Appointments, Employee Tasks, Reports queue)

If the reviewer wants to see admin features, sign in with
`admin` / `password` instead.

---

## Notes for the reviewer

- **Location permission** is requested on first launch for attendance
  auto-check-in when near the dojo. Deny is fine.
- **Camera + Photo Library** permissions are only requested when the
  reviewer taps features that need them (barcode scan, food photo,
  DEXA upload, bloodwork upload, profile photo).
- **Bluetooth** permission is requested only when the reviewer taps
  "HR Session" and tries to pair a heart-rate monitor.
- **Calendar** permission is optional and only needed for calendar
  sync from Settings.
- All AI features (photo food recognition, DEXA/bloodwork parsing)
  route to a Firebase Cloud Function that wraps Anthropic Claude. The
  image is processed once and not retained. See Privacy Policy at
  https://zenki-dojo.web.app/privacy

## Privacy + Support URLs

- Privacy Policy: https://zenki-dojo.web.app/privacy
- Support: https://zenki-dojo.web.app/support

## Account deletion (Apple 5.1.1(v))

Settings → Danger Zone → Delete Account. Two-step destructive confirm,
then the app calls a Cloud Function that cascade-deletes the user's
documents from Firestore and their files from Cloud Storage, deletes
the Firebase Auth user, and clears all local state.

---

## Firebase record (internal, not for ASC)

- Firebase Auth UID for reviewer: `CbtlEU2PeGMAHmncdOvc69eJS8i2`
- Firestore profile doc: `/users/CbtlEU2PeGMAHmncdOvc69eJS8i2`
  (auto-seeded on first sign-in via firebaseSignInOrSeedAccount)
