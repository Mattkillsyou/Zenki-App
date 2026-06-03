# Owner actions — `fix/owner-items`

These three fixes close the remaining "owner-action" items from the whole-app
audit (APP_AUDIT F17/F19 + the invite-gate launch item). The **code** is done,
typechecked, and adversarially reviewed. Each item needs a console/EAS step that
only the project owner can perform. Do these **before** shipping the build.

---

## 1. Invite gate — TEMPORARILY OPEN (bypassed) ⚠️ re-secure before public launch

**Code change:** `SignInScreen.tsx` no longer accepts the hardcoded `'dragon'`
fallback in production. It calls the `validateInviteCode` Cloud Function and
**fails closed** — if the function errors or 404s, the user is told "couldn't
verify your invite code." The `'dragon'` shortcut now only works in `__DEV__`.

**CURRENT STATE (owner request): the gate is BYPASSED.** `INVITE_GATE_ENABLED = false`
in `SignInScreen.tsx` → everyone reaches sign-in with no invite code (no `'dragon'`,
no CF needed). This unblocks the Apple reviewer and any new install right now; the
gate UI + `validateInviteCode` wiring stay intact and simply unreached.

Note the fail-closed behavior above only bites when the gate is ON. Because
`validateInviteCode` is **not yet deployed in prod (404)**, turning the gate back
on without deploying it first would lock out every new install — so re-enable and
deploy together.

**To re-secure the gate (once it's safe), flip `INVITE_GATE_ENABLED = true` and:**
1. `firebase deploy --only functions:validateInviteCode`
2. Seed real invite codes in the `inviteCodes` Firestore collection (there is no
   admin UI for this — add docs by hand in the console). Confirm the function's
   expected doc shape in `functions/src/validateInviteCode.ts`.
3. Smoke test: enter a seeded code on a release build → passes; enter garbage →
   "valid invite code" error; confirm `'dragon'` is rejected.
4. **Apple review:** the invite gate is **pre-auth**, so the reviewer currently
   clears it with `'dragon'` — which dies in prod after this change. Seed a code
   the reviewer can use and record it in `APP_REVIEWER.md`, or the reviewer is
   locked out before they ever reach the demo login.

---

## 2. Stripe webhook — server-authoritative payment reconciliation (F19)

**Code change:** new `functions/src/stripeWebhook.ts` records every
succeeded/failed PaymentIntent to `payments/{paymentIntentId}` straight from
Stripe's signed event, independent of the app (so a client that dies after
charging still leaves a server record). New `payments` rule: admin-read,
no client writes (the Admin SDK in the function bypasses rules).

**Required before shipping:**
1. Set the webhook signing secret (also needed for the functions deploy to
   succeed, since it's a declared secret):
   `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`  ← the `whsec_…` value
2. `firebase deploy --only functions:stripeWebhook,firestore:rules`
3. Stripe Dashboard → Developers → Webhooks → Add endpoint:
   `https://us-central1-<project>.cloudfunctions.net/stripeWebhook`
   events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Smoke test: send a test event from the Stripe dashboard → expect `200`
   `{received:true}` and a new `payments/{id}` doc. Hit the URL with no/!bad
   signature → expect `400` (it's inert until the secret + signature line up).

---

## 3. GPS background tracking (F17)

**Code change:** `GpsActivityContext.tsx` now records the workout route with a
`TaskManager` background task + `Location.startLocationUpdatesAsync`, so the
route keeps accumulating when the app is backgrounded or the screen is locked.
Falls back to the old foreground-only watch (with an honest on-screen notice)
when the user only grants When-In-Use. Native config added in `app.json`
(iOS `location` background mode + `NSLocationAlwaysAndWhenInUse…`; Android
background-location + foreground-service permissions + plugin flags). New dep:
`expo-task-manager`.

**Required before shipping:**
1. This changes **native** config → a JS-only OTA update is not enough.
   Rebuild: `eas build` (both platforms) and submit the new binary.
2. Device test (cannot be verified in a simulator reliably):
   - Start a run, lock the phone, walk a few minutes, unlock → the route/distance
     includes the locked stretch (green location indicator shows on iOS; a
     persistent notification shows on Android).
   - Pause → walk → resume → the paused stretch is **excluded** from distance.
   - Deny "Always" (pick "While Using") → tracking still works foreground-only and
     the notice says "keep this screen open."
3. App Review: the binary now declares the `location` background mode. Be ready
   to justify it — "continuous GPS route recording during an active, user-started
   workout; stops when the workout ends." The in-app `TrackingNotice` copy makes
   the workout-only scope explicit.

---

### Deploy order (suggested)
```
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions:validateInviteCode,functions:stripeWebhook,firestore:rules
# register the Stripe endpoint in the dashboard
# seed inviteCodes docs
eas build   # ship the native binary for GPS background
```
Do **not** ship the client build to production until `validateInviteCode` is
live, or new installs cannot pass the invite gate.
