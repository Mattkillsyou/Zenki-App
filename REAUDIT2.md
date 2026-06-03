# Re-audit pass 3 — findings + fixes (2026-06-03)

Third full audit pass on merged `main` (after PR #1/#2/#3 + the first re-audit).
6-finder multi-agent sweep → dedup → **adversarial verification of every
finding**, then an adversarial review of the fixes (no regressions found).

**15 raw → 14 confirmed (0 blocker · 4 major · 6 minor · 4 nit).** All fixed on
`fix/reaudit-2`. `tsc --noEmit` + functions build green.

## Fixed

**🔴 Real data-loss bug**
- **`supportMessages` silently failed for everyone.** The rule requires
  `senderId == auth.uid` but the client never wrote `senderId`, so every support/
  bug message was permission-denied, locally queued (unable to drain), while the
  UI said "sent." Now stamps `senderId` on create + flush (`supportMessages.ts`).
  Also unblocks the GDPR delete (`deleteAccount` queries by `senderId`).

**🍎 App-Review readiness**
- Privacy policy contradicted the app: claimed "no in-app payments" (live Stripe/
  Apple Pay ships) and listed background location under "do NOT collect" (the PR #3
  background-GPS feature collects it). Corrected both `hosting/privacy.html` and
  `PRIVACY_POLICY.md` + bumped the date. **Owner must `firebase deploy --only hosting`.**
- Settings legal links were broken (undeployed `www.zenkidojo.com`; no Terms page).
  Privacy → the live `PRIVACY_URL`, About → the live hosted landing page, Terms row
  removed (the acceptable-use EULA is enforced at onboarding; no hosted ToS exists —
  add one later if desired).
- `UIBackgroundModes` declared unused `'fetch'` (Guideline 2.5.4) → removed; `'location'`
  (justified by background GPS) kept. **Needs EAS rebuild to take effect.**

**🟡 Minor / nit correctness**
- Conversation update rule only constrained top-level keys, letting a participant
  overwrite the *other* party's denormalized name/avatar. Tightened so a writer can
  only change their own `participantProfiles` entry (verified it still passes all
  legit DM writes).
- `unlikePost` could permission-deny + orphan a like-doc if the counter drifted to 0
  → now skips the no-op counter write and still deletes the like.
- `deleteAccount` did an unbounded `collectionGroup('requests').get()` → paged
  (bounded memory; deletion must succeed for Apple 5.1.1(v)).
- 4 client-facing functions (createPaymentIntent, senpaiChat, senpaiSpeak,
  sendPasswordReset) omitted `invoker: 'public'` → added (robustness vs. a future
  redeploy where Cloud Run's auto-grant doesn't apply).
- `adminActionReport` removeAndBlock threw (swallowed) on an empty `targetUserId`
  → guarded.
- Admin product edits were lost on a failed offline write → always persist to
  AsyncStorage (`ProductContext`).
- Background-pause left a stale speed readout → zero the gauge on pause.
- A `safeStorageSet` ran inside a `setState` updater (the one instance the earlier
  fix missed) → moved out (`SenpaiContext`).

## Residual / owner notes
- **unreadFor badge:** a participant can still nudge the *other* party's unread
  count in their shared 2-person conversation (no leak/escalation). Constraining
  arbitrary map *values* in rules is impractical; move unread bookkeeping to a
  Cloud Function if it ever matters. Low severity, left as-is.
- **Pre-auth "prospect" contact form:** can't write the auth-gated
  `supportMessages` collection, so it queues and only sends once the device signs
  in. For guaranteed delivery from non-members, route it through a public Cloud
  Function (like `sendPasswordReset`) or email.
- **Deploy:** `firebase deploy --only hosting,firestore:rules,functions`; EAS
  rebuild for the `app.json` background-mode change.
