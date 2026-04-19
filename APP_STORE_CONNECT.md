# App Store Connect — Answer Cheat Sheet

Exact copy/paste answers for every field in the App Store Connect submission for Zenki Dojo v1.0.

Use alongside [AUDIT_PLAN.md](./AUDIT_PLAN.md) Bundle G.

---

## Preflight before you start the ASC forms

- [ ] Apple Developer Program active (developer.apple.com — $99/yr, 1–2 day activation)
- [ ] APNs Auth Key (.p8) exported from Apple Dev Portal → Certificates → Keys → "Apple Push Notifications service (APNs)"
- [ ] Privacy Policy hosted at a public URL (see `PRIVACY_POLICY.md` if drafted)
- [ ] Support page hosted at a public URL
- [ ] Demo reviewer account created in the live Firebase project
- [ ] Functions deployed with real `ANTHROPIC_API_KEY` secret
- [ ] Firestore rules + storage rules + indexes deployed (Bundle C done ✓)

---

## Step 1 — Create new app in ASC

**My Apps → + → New App**

| Field | Value |
|---|---|
| Platforms | iOS |
| Name | **Zenki Dojo** |
| Primary Language | English (U.S.) |
| Bundle ID | `com.zenkidojo.app` *(must already be registered in Apple Dev portal — EAS does this automatically on first build)* |
| SKU | `ZENKI-DOJO-IOS-001` *(your choice, never shown to users, must be unique in your account)* |
| User Access | Full Access *(for now — restrict later if you add collaborators)* |

---

## Step 2 — App Information

### General Information

| Field | Value |
|---|---|
| Name | Zenki Dojo |
| Subtitle | Martial arts training & community *(30-char limit)* |
| Category → Primary | **Health & Fitness** |
| Category → Secondary | **Lifestyle** *(optional)* |
| Content Rights | "This app does not contain, show, or access third-party content." → **unchecked** *(you do — see Content Rights section below)* |
| Age Rating | 12+ expected — answer the questionnaire below |

### Localizable Information → English (U.S.)

| Field | Value |
|---|---|
| Name | Zenki Dojo |
| Subtitle | Martial arts training & community |
| Privacy Policy URL | `https://<your-domain>/privacy` |
| Privacy Choices URL | *(leave empty — no opt-out mechanism needed since no tracking)* |

---

## Step 3 — Age Rating questionnaire

ASC presents this as ~12 yes/no questions. Answer set below produces **12+** rating.

| Question | Answer | Rationale |
|---|---|---|
| Cartoon or Fantasy Violence | None | — |
| Realistic Violence | None | Martial-arts content is depicted in training context, not combat/violence |
| Prolonged Graphic or Sadistic Realistic Violence | None | — |
| Profanity or Crude Humor | None | — |
| Mature/Suggestive Themes | None | — |
| Horror/Fear Themes | None | — |
| Medical/Treatment Information | **Infrequent/Mild** | Bloodwork + DEXA scan upload features reference biomarkers & body composition — informational, not diagnostic |
| Alcohol, Tobacco, or Drug Use or References | None | — |
| Sexual Content or Nudity | None | — |
| Graphic Sexual Content or Nudity | None | — |
| Gambling and Contests | None | *Spin wheel gives free daily rewards; no real-money betting or loot boxes* |
| Simulated Gambling | None | — |
| Unrestricted Web Access | **No** | — |
| Gambling | **No** | — |
| Contests | **No** | — |
| **User-Generated Content** | **Yes** | Community posts, direct messages — **must provide moderation tools, see note below** |
| Messaging & Email | **Yes** | Direct messaging between members |

**Expected rating: 12+**

### ⚠ UGC moderation requirement (Apple 1.2)

If you answer **Yes** to User-Generated Content, Apple requires:
1. A method to filter objectionable content from the app
2. A mechanism for users to flag/report offensive content
3. The ability to block abusive users
4. Published developer contact info (your support URL)

**Verify before submit:** does the app have **Report** and **Block** buttons on posts and in DMs? If not, add them or admin will reject on first review. Search for "report" and "block" in `src/` — if zero matches, this is a blocker. (Not audited in depth during the original audit — flag to verify.)

---

## Step 4 — App Privacy

ASC → App Privacy → **Get Started**

### Data Collection Declaration

"Do you or your third-party partners collect data from this app?" → **Yes, we collect data from this app**

### Data Types — add one-by-one

For each row: the three questions are **Linked to User** (Yes), **Used for Tracking** (No), **Purposes** (App Functionality only).

| Data Type | Category in ASC |
|---|---|
| Name | Contact Info → Name |
| Email Address | Contact Info → Email Address |
| Phone Number *(optional field in app, only declare if you ask for it)* | Contact Info → Phone Number |
| Health | Health & Fitness → Health |
| Fitness | Health & Fitness → Fitness |
| Precise Location | Location → Precise Location |
| Photos or Videos | User Content → Photos or Videos |
| Customer Support | User Content → Customer Support |
| Other User Content | User Content → Other User Content |
| User ID | Identifiers → User ID |
| Device ID | Identifiers → Device ID |
| Purchase History | Purchases → Purchase History |
| Product Interaction | Usage Data → Product Interaction |

**Do NOT check:** Crash Data, Performance Data, Advertising Data, Search History, Browsing History, Coarse Location, Contacts, Payment Info, Credit Info, Sensitive Info (despite health data being sensitive, Apple's "Sensitive Info" bucket is for ethnicity/religion/sexual-orientation; Health goes under Health & Fitness).

**Tracking answer:** "Does this app collect data about the user, and is that data used to track them?" → **No**.

*(Confirmed: no IDFA, no ad networks, no data brokers. All Firebase/Anthropic/Expo Push usage is first-party app functionality.)*

### Privacy Policy URL

Paste your hosted policy URL.

---

## Step 5 — Pricing and Availability

| Field | Value |
|---|---|
| Price | **USD 0.00 (Free)** |
| Availability | **All countries and regions** *(or restrict to US if you want a softer launch)* |
| App Distribution | Public on the App Store |
| Pre-order | No |
| Volume Purchase Program | Unchecked |

---

## Step 6 — Version 1.0.0 submission

### iOS App Information → 1.0.0 → Localizable Information (English)

**Promotional Text** *(170 chars, editable without re-review):*
```
Level up your training. Track workouts, book classes, log macros,
and join the dojo community — all in one app.
```

**Description** *(up to 4000 chars):*
```
Zenki Dojo is the all-in-one training companion for Zenki Dojo members.

Book private sessions and group classes with instructors, track your
heart-rate zones during workouts, log nutrition with AI-powered food
recognition, and keep up with dojo announcements — all from one app.

FEATURES
• Book 1:1 privates and group classes in seconds
• Track heart-rate workouts with Bluetooth monitor support
• Log meals by photo, barcode, or search (USDA FoodData Central)
• Upload DEXA scans and bloodwork for AI-extracted biomarkers
• Follow fellow members, post training updates, DM friends
• Dojo Points + streak gamification — redeem rewards at the dojo
• Full menstrual cycle tracker with training-day phase guidance
• Dark mode with 8 custom visual themes (Sheikah Slate, Blade Runner,
  The Matrix, Jurassic Park, Nostromo, Ghost in the Shell, and more)
• Customizable home — drag sections to rearrange, hide what you
  don't use

PRIVACY
Your training data stays in your Zenki account. We never share with
advertisers or data brokers. Account and data deletion are available
in-app at any time (Settings → Danger Zone → Delete Account).

For members of Zenki Dojo training facility. Not a replacement for
professional medical or fitness advice.
```

**Keywords** *(100 chars, comma-separated — NO spaces after commas to save chars):*
```
martial arts,jiu jitsu,bjj,muay thai,karate,dojo,workout,macros,heart rate,fitness tracker,gym
```

**Support URL** — paste your hosted support URL

**Marketing URL** *(optional)* — your website, e.g. `https://zenkidojo.com`

### App Icon

Already declared via `app.json` `icon: "./assets/icon.png"`. Must be **1024×1024 PNG with no alpha**. Bundle B of the audit plan addressed this.

### Screenshots — 6.9" Display (Required)

**Resolution:** 1290×2796 or 2868×1320 *(portrait or landscape — pick portrait to match app orientation)*

**Minimum 3, maximum 10.** Suggested order:
1. Home screen with customization + training grid at top
2. Book a class screen
3. Heart-rate session in progress (or macro tracker)
4. Community feed
5. Achievements / Dojo Points
6. Profile with belt display

**How to capture:** On a real iPhone 16 Pro Max via TestFlight, use the physical Volume Up + Side button combo and AirDrop to your Mac. Or in Xcode Simulator: Device → iPhone 16 Pro Max → `xcrun simctl io booted screenshot ~/Desktop/shot-01.png`.

### App Preview *(optional but recommended)*

15-30 second video, 1080×1920 or the Pro Max resolution. You can skip for v1.0.

### Copyright
```
© 2026 Matt Brown
```

### Version Release

- **Automatically release this version** → recommended for v1.0 (goes live the moment Apple approves)
- *Alternative:* Manually release → gives you a final hold after approval, but you risk forgetting to click the button

---

## Step 7 — App Review Information

ASC → Version → App Review Information

| Field | Value |
|---|---|
| **Sign-In Required** | **Yes** |
| **Demo Account** — User name | `reviewer@zenkidojo.com` |
| **Demo Account** — Password | *(pick a strong password, save in 1Password)* |
| **Contact Information — First Name** | Matt |
| **Contact Information — Last Name** | Brown |
| **Contact Information — Phone** | *(your number)* |
| **Contact Information — Email** | `mattbrowntheemail@gmail.com` |

**Notes to Reviewer** *(this is where you head off rejection questions):*
```
Thank you for reviewing Zenki Dojo!

DEMO ACCOUNT
Username: reviewer@zenkidojo.com
Password: [provided above]

INVITE GATE
On first launch, the app shows an invite-code gate. Enter code:
  dragon

This is a private app for members of Zenki Dojo training facility.
The invite gate is a first-launch-only prompt and does not block
reviewers from accessing any app feature.

DEMO DATA
The reviewer account has pre-populated sample data:
 - 3 workouts logged
 - 1 sample bloodwork report (fake values)
 - 5 posts in the community feed
 - Dojo Points balance: 500

BOOKINGS / PURCHASES
This version of Zenki Dojo does NOT process payments in-app.
Bookings create pending inquiries that the dojo follows up on
by text/email. Store purchases are reservations — payment is
handled in person at the dojo. This is intentional for v1.0.

AI FEATURES
Food photo macro estimation, DEXA scan parsing, and bloodwork
parsing use Anthropic Claude Vision via our own backend. No
third-party ad SDKs or trackers.

HEALTH DATA
Bloodwork and DEXA uploads display a consent modal on first use
(Settings → Privacy → reset if needed to re-trigger). Data stays
in the user's account and is never shared without explicit consent.

ACCOUNT DELETION
Reachable in 2 taps: Settings → Danger Zone → Delete Account.
Fully removes Firebase Auth user, Firestore docs, Storage files.
```

**Attachment** *(optional)* — skip for v1.0.

---

## Step 8 — Export Compliance

ASC → Version → App Review Information → Export Compliance

| Question | Answer |
|---|---|
| Does your app use encryption? | **Yes** |
| Does your app qualify for any of the exemptions provided in Category 5, Part 2 of the U.S. Export Administration Regulations? | **Yes** |
| Does your app use or access standard encryption algorithms only? (e.g., HTTPS, TLS) | **Yes** |
| Does your app use or access proprietary encryption algorithms? | **No** |

Because `app.json` sets `ios.config.usesNonExemptEncryption: false`, ASC won't prompt for this question on subsequent builds. For the first build you'll answer it once. **Keep the doc that ASC generates for your records** (EAR99 exemption letter).

---

## Step 9 — Content Rights

| Question | Answer |
|---|---|
| Does your app contain, display, or access third-party content? | **Yes** — Anthropic AI-processed output, Wix-hosted product images |
| Do you have all the necessary rights to that third-party content, or is the use otherwise permitted by law? | **Yes** |

---

## Step 10 — Advertising Identifier

| Question | Answer |
|---|---|
| Does this app use the Advertising Identifier (IDFA)? | **No** |

*(No ad networks, no attribution SDKs, no ATT prompt.)*

---

## Step 11 — TestFlight Pre-flight

Before hitting **Submit for Review**:

- [ ] `eas build -p ios --profile production` succeeds
- [ ] Build appears in ASC → TestFlight → iOS Builds (takes 5-15 min to process)
- [ ] Encryption compliance answered for the build (one-time)
- [ ] Install build via TestFlight on a real iPhone (SE + Pro Max ideal for screen-size coverage)
- [ ] Walk every critical flow:
  - Signup → onboarding → invite code → home
  - Sign out → sign in → home persists
  - Book a class → receive the "inquiry sent" Alert
  - Upload bloodwork → see consent modal → upload → see parsed biomarkers
  - Create post → DM another user → block user (if implemented)
  - Settings → Delete Account → confirm → app returns to sign-in
- [ ] Cold-start after kill → session persists (no re-login required)
- [ ] Airplane mode during a booking → graceful error, no crash
- [ ] Screenshots captured at 1290×2796

---

## Step 12 — Submit

ASC → Version → **Submit for Review**

Expected timeline:
- **Day 0:** Submit
- **Day 1–3:** In Review (Apple typically responds within 24–48 hours)
- **Day 1–3:** Approved *or* Rejected with reviewer notes
- **If rejected:** address the feedback, bump `buildNumber` to `"2"`, rebuild, resubmit (same Version record, new build)

---

## Common rejection reasons to preempt

| Reason | How audit addresses it |
|---|---|
| **5.1.1(v) — no account deletion** | Bundle D: Delete Account in Settings ✓ |
| **3.1.1 — fake payment flow** | Bundle/Section 5: payments removed v6.2 ✓ |
| **2.1 — app incomplete/non-functional** | Bundle D: real signup, real signin, real password reset ✓ |
| **5.1.1 — permission string too vague** | Bundle B/v6.3: specific purpose strings ✓ |
| **1.2 — UGC without moderation** | **⚠ verify before submit** — does the app have Report + Block on posts and DMs? |
| **4.3 — minimum functionality / clone** | N/A — Zenki has unique UGC + gym integration |
| **2.3.3 — marketing/screenshots misleading** | Capture screenshots from the real app, not mockups |
| **5.1.2 — data sharing with 3rd parties** | Privacy policy discloses Firebase + Anthropic + Expo Push ✓ |

---

## Field-level quick reference (when ASC asks, here's the answer)

| ASC asks | Answer |
|---|---|
| Bundle ID | `com.zenkidojo.app` |
| SKU | `ZENKI-DOJO-IOS-001` |
| Primary Category | Health & Fitness |
| Secondary Category | Lifestyle |
| Age Rating | 12+ |
| Contains objectionable material? | No |
| Contains UGC? | Yes (moderated) *(verify) ←* |
| Contains in-app purchases? | No |
| Uses IDFA? | No |
| Uses encryption? | Yes, HTTPS-only (exempt) |
| Contains third-party content? | Yes, with rights |
| Minimum iOS version | iOS 15+ *(or whatever EAS sets; Expo SDK 52 default is 15.1)* |
| Device Family | iPhone |
| Supports iPad | No |
| Orientation | Portrait |
| Tracks users? | No |
| Sign-in required for reviewer? | Yes — credentials above |

---

## After approval

- App goes live per your release setting (automatic vs manual)
- You can't edit most metadata without submitting a new version
- Respond to user reviews in ASC → Ratings and Reviews
- Next patch: bump `expo.version` to `1.0.1` + `ios.buildNumber` to `"2"` → `eas build` → `eas submit`

---

*Last updated: 2026-04-19 (initial v1.0 submission prep)*
