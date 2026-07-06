# App Review Information — resubmission (v2.0.1, build 41)

Paste the block below into **App Store Connect → [your version] → App Review Information → Notes to Reviewer**.
Set **Sign-In Required: Yes**. Demo account fields: `reviewer` / `reviewer123`.

> ⚠️ **Critical correction vs. the old notes:** the app now processes **live payments** (Stripe / Apple Pay) for **physical goods**. The previous "does NOT process payments in-app" line is FALSE for this build and would get you rejected. The block below states the correct, compliant position (physical goods → Apple Pay, not IAP).

> 📹 **Before submitting:** upload your Bluetooth-HR-pairing video unlisted to YouTube/Vimeo and replace `<PASTE VIDEO LINK>` below. This is the Guideline 2.1 demo Apple explicitly requested — it's the main unblock.

---

```
Thank you for reviewing Zenki Dojo — the members' companion app for a private martial-arts gym.

DEMO ACCOUNT (Sign-In Required: Yes)
Username: reviewer
Password: reviewer123
No invite code is needed — the first-launch invite gate is disabled in this build, so you go straight to the sign-in screen. Tap "Have an account? Sign in", enter the credentials above, tap Sign In.

DEMO VIDEO — Bluetooth heart-rate pairing (Guideline 2.1)
Per your prior request, here is a physical-device video showing the app discovering and pairing a Bluetooth heart-rate monitor and streaming live BPM during a workout:
<PASTE VIDEO LINK>

BUSINESS MODEL / PAYMENTS (Guideline 2.1(b), 3.1.3(e) / 3.1.5)
The in-app Store and drink tab sell PHYSICAL goods only — branded apparel/gear and in-person beverages, fulfilled (picked up or consumed) AT the dojo. Per 3.1.3(e)/3.1.5, physical goods and services consumed outside the app are paid via Apple Pay / credit card (Stripe), NOT In-App Purchase. There is no digital content, subscription, or unlockable feature. Accounts are free; invite codes (when enabled) are given to members for free in person and are never sold.

HEALTHKIT (Guideline 2.5.1)
HealthKit is optional and clearly surfaced: Settings → "Apple Health" explains exactly what we read (steps, calories, active minutes, heart rate) and write (workouts, weight, nutrition, HR sessions), with a connect toggle; it's also an explicit optional step in onboarding. No HealthKit data is accessed unless the user enables it there.

USER-GENERATED CONTENT MODERATION (Guideline 1.2)
Community posts and direct messages include: Report (the ••• menu on every post, comment, DM, and profile, with categorized reasons), Block, and Mute. Blocked users are filtered from the feed and DMs; the blocked list is managed in Settings. Reports go to an admin-reviewed queue. Moderation contact: mattbrowntheemail@gmail.com.

PERMISSIONS (all requested lazily, only when used)
Location (attendance auto-check-in + GPS workouts — Deny is fine), Camera/Photos (only when you tap a food photo / scan / profile photo), Bluetooth (only when pairing an HR monitor), Calendar (optional).

ACCOUNT DELETION (Guideline 5.1.1(v))
Settings → Danger Zone → Delete Account — a two-step confirm that cascade-deletes the user's Firestore documents, Cloud Storage files, and Firebase Auth account.

Privacy Policy: https://zenki-dojo.web.app/privacy
Support: https://zenki-dojo.web.app/support
```

---

## What's covered vs. the prior rejection (Submission cd1a9097)

| Guideline | Issue | Status in build 41 |
|---|---|---|
| 2.1 | Demo video of BLE pairing | ✅ Recorded — paste link above |
| 2.1(a) | "Apple Pay does nothing" | ✅ Live Stripe Apple Pay sheet |
| 2.1(b) | Business model | ✅ Notes above (physical goods) |
| 2.5.1 | HealthKit identified in UI | ✅ Settings → Apple Health |
| 1.2 | UGC moderation | ✅ Report/Block/Mute on posts + DMs + profiles |
| Social functionality | "can't post / options missing" | ✅ Fixed (PR #8) — **re-test on the TestFlight build before submitting** |
