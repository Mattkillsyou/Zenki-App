# Admin Setup — Zenki Dojo

This app has a lightweight admin-gate based on the `/admins/{uid}` Firestore
collection. To grant someone admin privileges (access to the **Reports** triage
queue at `AdminReportsScreen`, the `adminActionReport` Cloud Function, etc.):

1. **Get their Firebase Auth UID**
   Firebase Console → Authentication → Users → copy their UID.

2. **Seed the admin doc**
   Firestore Console → `admins` collection → add document with the UID as the
   document ID. Body can be empty `{}` or include metadata like:

   ```
   {
     "email": "matt@zenkidojo.com",
     "grantedAt": "2026-04-19T10:00:00Z",
     "grantedBy": "sensei.tim"
   }
   ```

3. The Firestore rules (`isAdmin()` in `firestore.rules`) and the
   `adminActionReport` Cloud Function both consult this collection.

## Bootstrapping the first admin

Security rules allow only existing admins to write to `/admins/{uid}`. For
the very first admin, create the doc from the Firebase Console (uses
service-account privileges that bypass rules), then subsequent admins can be
added from within the app or console by any existing admin.

## Verifying admin access works

- Sign in as that user in the app.
- Open the Admin panel. The **Reports** card should render.
- Tap it. The AdminReportsScreen should load without permission errors
  (check preview console logs if it doesn't — you'll see
  `[Moderation] listOpenReports failed: FirebaseError: Missing or
  insufficient permissions.` when the admin doc is missing).

## Upgrading to custom claims later

When we wire a `grantAdmin` Cloud Function that sets a custom claim via
`admin.auth().setCustomUserClaims(uid, { admin: true })`, the rules will
continue to accept either path (`token.admin == true` OR the doc). No
migration needed.

## Revoking admin

Delete the `/admins/{uid}` doc. They lose access immediately on their next
Firestore read.
