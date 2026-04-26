# Handoff — Zenki Dojo App Store submission

This doc bridges sessions. Last session: Mac, context-exhausted mid-build. Next session: fresh Mac.

## What this app is

`Zenki Dojo` — invite-only React Native + Expo SDK 52 app. Bundle id `com.zenkidojo.app`. Repo: `github.com/Mattkillsyou/Zenki-App`, branch `main`. Owner on EAS / Expo: `mattbrowntheemail` (Google SSO).

## Where things stand right now

The remaining blocker is **one EAS production build that succeeds**. App Store Connect is otherwise configured (see prior handoff section below). User is handling screenshots independently.

### Local commits NOT yet pushed to origin

Both committed on this Mac, push blocked because no GitHub auth is set up (no SSH key, no `gh` CLI, osxkeychain empty):

| SHA | What |
|---|---|
| `34d7982` | Remove broken matrix-mode routing from GPS screen — `ActivityTrackerScreen.tsx` was importing the never-committed `ActivityTrackerScreen.matrix.tsx`, breaking fresh clones. |
| `e2f979d` | Branding swap — overwrites `icon.png`, `icon-light.png`, `adaptive-icon.png`, `splash.png` with the white-circle / black-Z (`icon-dark.png` contents). Switches splash + android adaptiveIcon `backgroundColor` from `#FFFFFF` to `#000000`. Adds `.easignore` excluding the 53MB stray `Simulator Screenshot - iPhone 17 Pro Max - 2026-04-24 at 23.39.52/` directory and `app-store-screenshots/`. |

To push when auth is set up: easiest is `brew install gh && gh auth login` (osxkeychain is already configured to cache the credential). Then `git push origin main`.

### Working-tree change NOT yet committed

`app.json` — added explicit Sign in with Apple entitlement to defeat EAS profile auto-gen flakiness:
```json
"entitlements": {
  "com.apple.developer.healthkit": true,
  "com.apple.developer.healthkit.access": [],
  "com.apple.developer.applesignin": ["Default"]
}
```
Commit before kicking off the next build.

### What blew up (and why)

1. **Local Xcode build is dead.** Xcode 26.4.1 + RN 0.76 `fmt` Pod hit `5 errors generated` during compile. `xcodebuild` exit 1 in ~5 min, even with `CODE_SIGNING_ALLOWED=NO`. EAS cloud builders use older Xcode that RN 0.76 supports — cloud is the only viable build path on this hardware. Don't waste a minute trying to fix `fmt` locally; install Xcode 15 from <https://developer.apple.com/download/all> if you really need a local build (~30 GB disk).

2. **Local `npx expo run:ios` is dead too** — same `fmt` error, plus Expo CLI on Xcode 26 misidentifies simulator UDIDs as physical devices via the new `devicectl` JSON, demanding code signing certs we don't have for simulator builds.

3. **EAS production build attempt #1 failed.** Build URL: <https://expo.dev/accounts/mattbrowntheemail/projects/zenki-dojo/builds/0869d1ee-7208-4586-921a-f79e5fd563fb>. Status `ERRORED` at the fastlane step:
   > Provisioning profile `*[expo] com.zenkidojo.app AppStore 2026-04-25T00:25:29.648Z` doesn't support the HealthKit and Sign in with Apple capability.

   The Xcode build itself succeeded on EAS; the failure was Apple's fastlane upload step. Build was auto-incremented to **17** (next will be 18). One credit consumed.

   User confirmed HealthKit IS enabled on the App ID at developer.apple.com. EAS's auto-generated profile from yesterday is stale and never picked up the capabilities. Sign in with Apple cap status on the App ID was not verified — verify in next session.

## Next session: do this

1. **Verify capabilities** at <https://developer.apple.com/account/resources/identifiers/list> → tap `com.zenkidojo.app`. Both **HealthKit** and **Sign in with Apple** must be checked. Save if either was off.

2. **Commit the entitlement change**:
   ```bash
   cd /Users/mbrown/Desktop/Zenki-App
   git add app.json
   git commit -m "Add explicit applesignin entitlement"
   ```

3. **Force EAS to regenerate the provisioning profile**. Two paths — pick one:

   **Path A (try first, faster):**
   ```bash
   eas credentials
   #   iOS → production → Provisioning Profile → Remove provisioning profile from EAS
   #   confirm, then quit
   eas build --platform ios --profile production
   #   prompts for Apple ID + app-specific password
   #   prompts to regenerate provisioning profile → Y
   ```

   **Path B (bulletproof if A fails again):**
   - At <https://developer.apple.com/account/resources/profiles/list> → "+" → App Store distribution → `com.zenkidojo.app` → select existing distribution cert → name it `Zenki Dojo AppStore Manual` → download `.mobileprovision`.
   - `eas credentials` → iOS → production → Provisioning Profile → "Use existing / upload" → point at the file.
   - `eas build --platform ios --profile production --non-interactive`

4. **Watch the build** (~20 min cloud). Status check:
   ```bash
   eas build:view <BUILD_ID> --json | jq -r '.status'
   ```
   Or just refresh the build URL.

5. **Submit to TestFlight**:
   ```bash
   eas submit --platform ios --latest
   ```

6. **Verify reviewer login on the new build** before submitting for review. The Windows-session refactor of `src/data/members.ts` strips seed passwords from production (`__DEV__`-gated). Reviewer creds in App Store Connect → App Review Information.

7. **Hit Add for Review** in App Store Connect → Distribution. Confirm 44 of 175 country availability is intentional first.

## EAS / Apple state on this Mac

- `eas-cli/18.8.1` installed, logged in as `mattbrowntheemail` (Google SSO via `eas login --sso`).
- Apple Developer Team `RPV54B2NK5` (Matthew Brown — Individual). Distribution cert valid until **2027-04-24**. App-specific password: not set up; you'll be prompted to make one at <https://appleid.apple.com>.
- App App ID: **`6763685748`** — <https://appstoreconnect.apple.com/apps/6763685748/distribution>.

## App Store Connect state (unchanged from last handoff except where noted)

| Section | Status |
|---|---|
| App Information, subtitle, description, keywords, URLs | ✅ |
| Privacy disclosures, age rating, pricing | ✅ |
| App Review Information (reviewer credentials + demo notes) | ✅ — name was renamed "ZENKI FIT" → "Zenki Dojo" in a prior session |
| **Screenshots** | User is handling independently — not a Claude task |
| **Active build attached** | ❌ Apr 24 builds 1.0.0 (1) and 1.0.0 (16) Expired in TestFlight. Build 17 (this session) Errored. **Next build will be 18.** |

## Current home-screen state (TestFlight build 16, what user sees)

Build 16 bundled the OLD assets and OLD app name. User's iPhone shows:
- Icon: red `zenki-logo-red.png` "ZENki LA" tile
- Display name: `ZENKI FIT`
- First-launch splash: red ZENki LA tile on dark background

All three are corrected in commit `e2f979d` and the next successful build (18) will install with the white-circle/black-Z icon, "Zenki Dojo" name, and white circle on black splash.

## Known gotchas (carry forward)

1. `react-native-health` pulls in `@expo/config-plugins@7.9.2` (everything else is 9.0.17). expo-doctor flags it. Don't override unless EAS prebuild actually fails — the plugin code may need v7 APIs.
2. `react-native-health` "Untested on New Architecture" — only matters if New Arch is enabled. Default in SDK 52 is opt-in.
3. `firebase` and `leaflet` show "No metadata available" in expo-doctor — informational.
4. `CREDENTIALS` in `src/data/members.ts` is `__DEV__`-gated. Production ships username→memberId mapping with blank passwords; Firebase Auth verifies the real password. Don't "clean this up" — it's intentional security hardening.
5. The 53MB `Simulator Screenshot - iPhone 17 Pro Max - 2026-04-24 at 23.39.52/` directory at the repo root contains a duplicate of the project tree. Untracked, predates this session, ignored via `.easignore`. Don't `rm -rf` without asking — it's user data.
6. `package.json` scripts: `npx expo run:ios` will silently rewrite `android`/`ios` script lines from `expo start --android/--ios` to `expo run:android/ios`. Revert if it happens — irrelevant to EAS but a sneaky diff.
7. The `./ios/` directory exists from the previous prebuild attempt. It's gitignored and easignored. EAS does its own prebuild on the cloud from `app.json`, so it's harmless. Could `rm -rf ios` to keep the tree tidy.

## What's NOT a blocker

- TypeScript: `npx tsc --noEmit` is clean after the `34d7982` matrix fix.
- Privacy manifest: committed in `4a6e838` (in main branch since before this session).
- `transform-remove-console`: wired for production via `babel.config.js`.
- The `applesignin` plugin (`expo-apple-authentication`) is supposed to inject the entitlement during prebuild. It hasn't been doing so reliably — the explicit entry in `app.json` belt-and-suspenders this.

---

Last updated: 2026-04-26 by Claude (Mac session, context exhausted before final build).
