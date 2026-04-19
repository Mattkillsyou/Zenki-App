# Privacy Policy

**Effective date:** 2026-04-19
**Last updated:** 2026-04-19

Zenki Dojo ("the app," "we," "us") is operated by **Matt Brown** on behalf of Zenki Dojo training facility. This policy explains what data we collect, why, and how we protect it.

If you have questions, email us at **mattbrowntheemail@gmail.com**.

---

## Summary

- We collect only the data needed to run the app's features.
- We **do not** sell, rent, or share your data with advertisers or data brokers.
- We **do not** track you across other apps or websites.
- You can permanently delete your account and all associated data from inside the app, at any time (Settings → Danger Zone → Delete Account).

---

## 1. What we collect

### Account information
- Name (first, last)
- Email address (used as your sign-in identifier)
- Phone number *(optional — only if you provide it)*
- Password *(hashed by Firebase Authentication; we never see it in plaintext)*
- Profile photo *(optional)*

### Training and health data
- Workouts, personal records, notes you log
- Heart-rate session data if you connect a Bluetooth monitor (BPM samples, zones, calories, duration)
- GPS activity tracks (route, distance, pace) when you start a GPS-tracked workout
- Weight entries, body composition measurements
- Menstrual cycle data (dates, notes, symptoms) if you use that feature
- Nutrition logs (foods, macros, calories)
- Uploaded DEXA scan files and bloodwork reports *(processed by an AI vendor — see Section 4)*

### Community content
- Community posts you publish
- Direct messages with other members
- Support messages you send to admins
- Likes, follows, comments

### Device and usage
- Firebase user ID (unique per account)
- Expo push notification token (so we can deliver notifications)
- App-interaction counts used for streak + achievement features (no telemetry shared externally)

### What we do NOT collect
- Advertising identifier (IDFA)
- Contacts, calendar, or other device data beyond what you explicitly attach
- Precise location in the background (foreground-only, and only while GPS workouts are running or you arrive at the dojo for check-in)
- Crash or performance analytics
- Third-party behavioral tracking of any kind

---

## 2. Why we collect it

Every piece of data above is collected **for App Functionality** only, using Apple's App Privacy definitions. Specifically:

| Purpose | What supports it |
|---|---|
| Account creation and sign-in | Name, email, password |
| Deliver notifications | Expo push token |
| Provide health + fitness features | Training, health, nutrition data |
| Community and messaging features | Posts, DMs, follows |
| Dojo operations | Attendance, waivers, support messages |
| Auto-check-in and GPS routes | Precise location (foreground, only while active) |
| AI macro estimation and scan parsing | Photos/PDFs you explicitly upload (see Section 4) |
| Improve the app | Anonymous error logs via Firebase *(no user identifiers)* |

We do **not** use your data for advertising, profiling, or personalization beyond what's visible to you (achievements, streak counts).

---

## 3. Where your data lives

Zenki Dojo uses Google Firebase as its backend. Your data is stored in:
- **Firebase Authentication** — account credentials
- **Cloud Firestore** — profile, posts, workouts, messages, health entries
- **Firebase Cloud Storage** — uploaded photos, DEXA / bloodwork files

Firebase is operated by Google LLC. Data is stored in Google data centers, typically in the United States. Google processes this data on our behalf under its Data Processing Addendum.

Reference: https://firebase.google.com/support/privacy

---

## 4. Third-party sub-processors

When you use a feature that needs help from another service, data flows to that service only as required:

### Anthropic (Claude AI)
When you upload a food photo, DEXA scan, or bloodwork report, the image or PDF is sent to our backend and from there to Anthropic's Claude AI for structured-data extraction. Anthropic's API does not retain your image or use it for model training.

Reference: https://www.anthropic.com/privacy

### Expo (Push Notifications)
We use Expo's push-notification service to relay notifications to Apple's APNs. Your device push token is stored in our Firestore database and sent to Expo when we deliver a notification.

Reference: https://expo.dev/privacy

### Apple (App Store, APNs)
Apple delivers push notifications and distributes the app. Apple's privacy policy applies to those interactions.

### Google (Calendar — optional)
If you choose to link Google Calendar in the Book screen, your Google account token is passed to Google's OAuth servers. We use it only to add booked sessions to your calendar on your behalf.

Reference: https://policies.google.com/privacy

### USDA FoodData Central / Open Food Facts (optional)
When you search for a food by name or barcode, we send the query string or barcode number (no personal data) to these public APIs.

---

## 5. Who can see your data

- **You** — always; everything you've added is visible in your profile and app screens
- **Other members** — can see your community posts, public profile, and your direct messages to them. You control visibility of your profile in Settings.
- **Dojo administrators** — can see your waivers, attendance, appointments you request, and support messages you send to them. Admins **cannot** see your private workout logs, nutrition, or messages with other members unless you're explicitly sharing (e.g., tagging them in a post).
- **Health data exception:** If you upload bloodwork or DEXA scans, the data stays in your account. Dojo admins cannot view it unless you explicitly share a report with them (feature forthcoming — not enabled in v1.0).

---

## 6. Your rights

You can:
- **Access** any data by opening the relevant screen in the app
- **Correct** most data by editing it inline (profile, posts, entries)
- **Export** all your data from Settings → Data → Export All Data (JSON download)
- **Delete** your account and every associated record from Settings → Danger Zone → **Delete Account**. This action is permanent and cascades across Firebase Auth, Firestore, and Storage.

Deletion requests via email are honored within 30 days — send to `mattbrowntheemail@gmail.com`.

### California residents
You have additional rights under the CCPA (to know, delete, and opt-out). Since we don't sell personal information, the opt-out right doesn't apply. Exercise any other right by emailing the address above.

### EU / UK residents
You have GDPR rights (access, rectification, erasure, portability, restriction, objection). Exercise these by emailing the address above. Our legal basis is: (a) contract performance — providing the app; (b) consent — where you opt into a specific feature like GPS tracking or Google Calendar; (c) legitimate interest — fraud prevention and app security.

---

## 7. Data retention

- **Active account:** we keep your data as long as your account exists.
- **After deletion:** immediate removal from live Firestore + Storage. Backups may retain for up to 30 days before the purge is complete.
- **Logs:** server logs retained for 30 days for debugging; they contain user IDs but no payload data.

---

## 8. Children

Zenki Dojo is intended for users **13 years of age or older**. We do not knowingly collect personal data from children under 13. If you believe we have collected such data, email us and we will delete it immediately.

If the app is used by a member under 18, a parent or guardian should review this policy with them.

---

## 9. Security

- Passwords are hashed and managed by Firebase Authentication.
- All data in transit uses HTTPS/TLS.
- Firestore rules enforce that you can only read/write your own data.
- Storage rules enforce that uploaded files are only accessible by you.
- We do not store credit-card, banking, or payment data inside the app — no in-app payments are processed as of v1.0.

No system is 100% secure. If you suspect a breach or vulnerability, email `mattbrowntheemail@gmail.com`.

---

## 10. Health information disclaimer

Zenki Dojo is not a medical device and is not intended to diagnose, treat, or prevent any disease. Bloodwork and DEXA parsing is informational only. Consult a licensed healthcare professional for medical advice.

---

## 11. Changes to this policy

We'll update the "Last updated" date at the top when this policy changes. Material changes will be communicated in-app before taking effect.

---

## 12. Contact

For any privacy question, data-access request, or deletion request:

**Matt Brown**
Email: `mattbrowntheemail@gmail.com`
