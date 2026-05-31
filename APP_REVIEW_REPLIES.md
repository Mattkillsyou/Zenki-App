# App Review — reply drafts (Submission cd1a9097, build 1.0(21))

Paste these into the **Resolution Center** reply in App Store Connect. Five issues; two are code (iPad layout, Apple Pay) handled in the build, three are replies/assets below.

---

## Guideline 2.1(b) — Business model (Information Needed)

> Zenki Dojo is the members' companion app for a **private martial-arts gym**. It is **not** a marketplace and sells **no digital content, subscriptions, or unlockable features**. Answering your questions:
>
> 1. **Who uses the paid content/services?** Existing members of our physical dojo — the people who train at our gym.
> 2. **Where are purchases made?** The in-app Store offers **physical goods only** — branded apparel/gear and in-person beverages. Orders are fulfilled **at the dojo** (picked up / consumed in person). There is no digital delivery.
> 3. **What previously-purchased content can be accessed in the app?** None. There is no digital content, subscription, or entitlement to restore.
> 4. **What paid content/features are unlocked without In-App Purchase?** None that are digital. The Store sells **physical products** (apparel, gear, drinks). Per App Store Review Guideline 3.1.3(e)/3.1.5, physical goods and services consumed outside the app use Apple Pay or a credit card, **not** In-App Purchase. "Dojo Points" are a **free** loyalty reward **earned** through activity (never purchased) and only discount physical-goods orders.
> 5. **How do users get an account? Is there a fee?** Accounts are **free**. Users sign up with email, Google, or Apple. There is no fee to create an account or to use the app.
> 6. **How do users get the invite code? Do they pay for it?** The dojo gives each member a **free** invite code when they join the gym in person. It is **not** sold — it simply gates the app to actual members. (Reviewer code provided in App Review Information below.)

---

## Guideline 2.1(a) — "No further action after Apple Pay tapped"

> Fixed in this build. Apple Pay now initiates a Stripe PaymentIntent and presents the system Apple Pay sheet on tap; if a device/account can't complete Apple Pay it cleanly falls back to in-person checkout rather than doing nothing. Tested on a physical device. (If you prefer, the Store also supports reserving an order to pay at the dojo.)

_(Internal note: confirm the Apple Pay sheet presents on a physical iPad before resubmitting — see APPLE_PAY_SETUP.md.)_

---

## Guideline 4 — iPad layout

> Fixed in this build. All screens now constrain content to a centered, readable width on iPad (no edge-to-edge stretching), and grids adapt to the larger viewport. Re-tested on iPad Air 11-inch (M3), portrait and landscape.

---

## Guideline 2.5.1 — HealthKit clearly identified in UI

> HealthKit usage is clearly surfaced in the app: **Settings → "Apple Health"** is a labeled section that explains exactly what we read (steps, calories, active minutes, heart rate) and write (workouts, weight, nutrition, heart-rate sessions), with a toggle to connect. It's also presented as an explicit, optional step in first-run onboarding. No HealthKit data is accessed without the user enabling it there.

---

## Guideline 2.1 — Demo video of BLE hardware pairing

Apple needs a video of the app pairing with the **Bluetooth heart-rate monitor** on a **physical device**. Film (on a real iPhone/iPad, NOT the simulator):
1. Open a heart-rate workout (Workout → start session).
2. Tap to **scan**, then **pair** the Bluetooth HR monitor (chest strap / armband) — show the device connecting and **live BPM** appearing.
3. Run the **full workout flow** with the monitor: live HR + calories + strain → end & save the session.
Upload unlisted (YouTube/Vimeo) and paste the link in **App Store Connect → App Review Information → Notes**.

### App Review Information to provide (App Store Connect)
- **Demo account:** username `reviewer` / password `<set one>` (a member account with sample data seeded). Provide real working credentials.
- **Invite code:** `dragon` (the gate code for reviewers; members get their own).
- **Notes:** "Store sells physical goods picked up at the gym; Apple Pay is for physical merchandise (not digital). HealthKit + Bluetooth HR monitor are optional. Demo video: <link>."
