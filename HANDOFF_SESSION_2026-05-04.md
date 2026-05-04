# Session Handoff — 2026-05-04

Pick up here in a fresh conversation. The all-time handoff lives at
[`.claude/HANDOFF.md`](.claude/HANDOFF.md); this doc is just the slice
of work from the most recent session.

---

## TL;DR — where things stand

✅ **Senpai AI Chat is fully built, deployed, and running on the simulator.** Phases 0-4 plus voice (mic + TTS) are live behind the SECRET LAB flag.

⏸️ **Admin panel data flow is broken across 8 sections** — investigated, mapped, NOT yet fixed. User wants to come back to this.

---

## What's running right now

| Surface | State |
|---|---|
| Simulator (iPhone 17 Pro Max, UDID `72421A8B-7229-4C67-B8EE-68685AA66EBD`) | App installed (`com.zenkidojo.app`), launched (PID `14620` at last check), sitting at "Members Only" invite-code gate |
| Metro bundler | Running on `:8081`, dev-client mode (`npx expo start --dev-client`) — bundle compiled cleanly, 1706 modules |
| Cloud functions | `senpaiChat` + `senpaiSpeak` both deployed and live: `https://us-central1-zenki-dojo.cloudfunctions.net/{name}`. Both return `401 Missing token` to unauthed requests (working as intended). |
| Firebase secret `ELEVENLABS_API_KEY` | Set (version 1), granted to compute service account |
| Native build artifact | `ios/build/Build/Products/Debug-iphonesimulator/ZenkiDojo.app` (xcodebuild Debug, simulator destination) |

**Git:** Branch `main`, last pushed commit is `330aac8` ("functions: route deploy/serve/logs through npx firebase-tools"). The Senpai feature commits leading up to it: `28845e6` → `8c1db08` → `5413d4e` → `4a8368d` → `d27a098` → `d1ec58b` → `330aac8`.

There is a **large pile of uncommitted work** in the tree from prior sessions — `git status` shows ~50 modified files. Don't blanket-stage anything. Stage only what you intend to ship.

**TypeScript:** `npx tsc --noEmit` passes for both root and `functions/`. Build is green.

---

## Senpai AI Chat — what shipped

Full design doc at [`SENPAI_AI_CHAT_PROMPT.md`](SENPAI_AI_CHAT_PROMPT.md). Highlights:

| Phase | What | Commit |
|---|---|---|
| 0+1 | Cloud function `senpaiChat` (Haiku 4.5, Daria-DDLC persona, prompt-cached system prompt, crisis-keyword pre-check, 50/day rate limit, MOOD/TEXT structured output) | `28845e6` |
| 2 | Client UI: `SenpaiChatModal`, `useSenpaiChat` hook, AsyncStorage history (last 50 turns), SECRET LAB toggle in Settings, mascot tap-to-open | `8c1db08` |
| 3 | `get_user_stats` tool use — Senpai can reference level, streak, badges, recent workouts via tool call (not stuffed into prompt prefix, so cache stays valid) | `5413d4e` |
| 4 | Typing-reveal animation on fresh replies (~30 chars/sec, only newest assistant turn) | `4a8368d` |
| Voice | `senpaiSpeak` cloud function (ElevenLabs Flash v2.5, base64-mp3 over JSON), `expo-speech-recognition` for STT, mic button + voice toggle in modal, audio playback via `expo-audio` + tempfile | `d1ec58b` |

**Phase 5 (cost dashboard, extra hardening) was explicitly skipped** — audience is 1-10 occasional users, not worth the work. Existing safety baseline (crisis keyword, rate limit, disclaimer, drop-the-bit system prompt rule) covers the realistic risk surface.

**To use it:** Settings → enable Senpai Mode → SECRET LAB → toggle "Chat with Senpai" on → tap floating mascot → modal opens. Speaker icon in modal header toggles voice replies; mic button in input row does STT.

---

## The leaked-key incident (informational only)

Mid-session the user pasted their ElevenLabs API key directly in chat. It's been:
- Set as the Firebase secret (working in production)
- The user explicitly said they don't care about local exposure (locked-basement single-user machine) and asked me NOT to delete it
- Still active in their ElevenLabs account as `Zenki Senpai Chat`

If you ever need to rotate it: ElevenLabs dashboard → API Keys → delete `Zenki Senpai Chat` → create new → set via:

```sh
cd /Users/mbrown/Desktop/Zenki-App
printf '%s' 'NEW_KEY' | npx firebase-tools functions:secrets:set ELEVENLABS_API_KEY --data-file=-
npx firebase-tools deploy --only functions:senpaiSpeak
```

---

## ⏸️ Admin panel — investigated, not fixed

**User's complaint:** "the whole admin section is completely broken. nothing is updating on the user side and it seems to be stuck with default users." Confirmed across 8 sections.

### Audit findings (from Explore agent — full results in last session transcript)

| # | Section | Status | Root cause |
|---|---|---|---|
| 1 | **Schedule** | 🔴 BROKEN | No Firestore code at all. AsyncStorage-only on admin's device. |
| 2 | **Announcements** | 🔴 BROKEN | Same — no Firestore. Device-local. |
| 3 | **Appointments** | 🔴 BROKEN | Same — no Firestore. |
| 4 | **Employee Tasks** | 🔴 BROKEN | Same — no Firestore. |
| 5 | **Members** | 🟡 RACE | Has Firestore sync, BUT user-side seeds from `src/data/members.ts` first; live subscription patches in async, so seed wins if subscription is slow/fails. **This is the "stuck with default users" symptom.** |
| 6 | **Products** | 🟡 PARTIAL | Writes to Firestore `customProducts`, reads via `onSnapshot`. Same seed-first race + no fallback if subscription stalls. |
| 7 | **Attendance** | 🟡 PARTIAL | Fire-and-forget Firestore writes. Admin sees user data only via 60s manual polling, no real-time. |
| 8 | **Broadcasts** | ❓ UNKNOWN | Need to read `AdminBroadcastScreen.tsx` to determine. Likely uses FCM/push. |

### Proposed fix order (for next session)

1. **Tier 1 — same-pattern batch refactor** (4 contexts × ~80 LOC each): wire Firestore sync into `ScheduleContext`, `AnnouncementContext`, `AppointmentContext`, `EmployeeTaskContext`. Each needs:
   - `onSnapshot` subscription on read
   - `setDoc`/`deleteDoc` on writes from admin screens
   - Update `firestore.rules` to allow `request.auth.token.admin == true` for write, all-read for read
2. **Tier 2 — race fix**: For Members + Products, swap "seed first, subscribe later" for "subscription cached value first, seed only as last-resort fallback." Need to verify Firestore subscriptions actually fire on TestFlight builds (not just simulator).
3. **Tier 3** — Attendance: replace 60s polling with real `onSnapshot`.
4. **Tier 4** — Broadcasts: read the file, decide if it works.

**Recommended starting move (when user is ready):** do all 4 Tier 1 sections in one batch since they share the exact same fix pattern. Probably ~2-3 hrs of work, one big commit.

### Existing uncommitted work in admin files

`git status` shows these have working-tree edits — likely abandoned mid-fix from prior sessions:
- `firestore.rules`
- `src/data/products.ts`
- `src/screens/AdminBroadcastScreen.tsx`
- `src/screens/AdminProductsScreen.tsx`
- `src/screens/AdminReportsScreen.tsx`
- `src/screens/AdminScreen.tsx`
- `src/screens/ProductDetailScreen.tsx`
- `src/screens/StoreScreen.tsx`
- `src/services/memberSync.ts`

**Read these before starting Tier 1** — they may already contain partial implementations of what we'd otherwise rebuild from scratch. Or they may be stale dead code that should be reverted. Triage with `git diff <file>` and the user.

---

## Gotchas the next agent needs to know

### Firebase CLI is NOT on PATH
Only `npx firebase-tools` works on this machine. The package name is `firebase-tools`, the CLI binary is named `firebase`. Calling bare `firebase` fails with "command not found." This is why I updated `functions/package.json` scripts to use `npx firebase-tools` (commit `330aac8`).

### `expo run:ios` falls into code-signing path
There's an offline iPhone (74) physical device paired (`xcrun xctrace list devices` shows it). Even with `--device <simulator-udid>`, expo's CLI goes down the physical-device build path and fails with "No code signing certificates are available to use." Workaround: skip expo's wrapper and use xcodebuild directly:

```sh
cd /Users/mbrown/Desktop/Zenki-App/ios
LANG=en_US.UTF-8 xcodebuild \
  -workspace ZenkiDojo.xcworkspace \
  -scheme ZenkiDojo \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=72421A8B-7229-4C67-B8EE-68685AA66EBD' \
  -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO \
  build
```

Then install + launch via simctl:

```sh
xcrun simctl install booted /Users/mbrown/Desktop/Zenki-App/ios/build/Build/Products/Debug-iphonesimulator/ZenkiDojo.app
xcrun simctl launch booted com.zenkidojo.app
osascript -e 'tell application "Simulator" to activate'
```

Metro must be running separately: `cd /Users/mbrown/Desktop/Zenki-App && npx expo start --dev-client`.

### CocoaPods locale bug
Cocoapods 1.16.2 on Ruby 4.0.x throws `Unicode Normalization not appropriate for ASCII-8BIT (Encoding::CompatibilityError)` unless `LANG=en_US.UTF-8` is set. Always prefix prebuild / pod install commands with `LANG=en_US.UTF-8`.

### `expo-file-system` v55 deprecation
Default `import * as FileSystem from 'expo-file-system'` exports stub methods that **throw at runtime** (`readAsStringAsync`, `writeAsStringAsync`, `cacheDirectory`, etc). Two screens use the deprecated path and likely break at runtime: `BloodworkUploadScreen.tsx`, `DexaUploadScreen.tsx`. Not in scope for this session, but worth a follow-up. Use `expo-file-system/legacy` for the legacy API (see how `src/services/senpaiAudio.ts` does it).

### iOS native module: `expo-speech-recognition`
Added in this session (commit `d1ec58b`). Has native code, requires a fresh native build. JS reload alone won't pick it up. Needs `expo prebuild --clean` (with the `LANG` workaround) and a rebuild every time the package version changes.

---

## File map of new code added this session

```
src/
├── components/
│   ├── SenpaiChatModal.tsx         ← NEW: chat modal w/ mic + voice toggle
│   └── SenpaiMascot.tsx            ← MOD: tap-to-open chat when chat flag on
├── hooks/
│   └── useSenpaiChat.ts            ← NEW: chat thread state + history + voice
├── services/
│   ├── senpaiChat.ts               ← NEW: API client for senpaiChat function
│   ├── senpaiSpeak.ts              ← NEW: API client for senpaiSpeak function
│   └── senpaiAudio.ts              ← NEW: base64 mp3 → tempfile → expo-audio
├── context/
│   └── SenpaiContext.tsx           ← MOD: add chatEnabled flag + setter
└── screens/
    └── SettingsScreen.tsx          ← MOD: SECRET LAB chat toggle row

functions/src/
├── senpaiChat.ts                   ← NEW: Claude Haiku 4.5 cloud function
├── senpaiSpeak.ts                  ← NEW: ElevenLabs cloud function
├── rateLimit.ts                    ← MOD: add senpaiChat + senpaiSpeak limits
├── package.json                    ← MOD: route scripts through npx firebase-tools
└── index.ts                        ← MOD: re-export both functions

(root)
├── SENPAI_AI_CHAT_PROMPT.md        ← NEW: design + plan doc
└── app.json                        ← MOD: expo-speech-recognition plugin + NSSpeechRecognitionUsageDescription
```

---

## Suggested first prompts for the next session

To pick up where we left off, paste one of these into a fresh conversation:

**To continue the admin panel fix:**
> Read HANDOFF_SESSION_2026-05-04.md. Start at Tier 1 of the admin panel fix — refactor ScheduleContext, AnnouncementContext, AppointmentContext, and EmployeeTaskContext to add Firestore sync. Same pattern across all four. First, triage the existing uncommitted edits in admin files to see if any contain partial implementations worth keeping.

**To verify the senpai voice feature on device:**
> Read HANDOFF_SESSION_2026-05-04.md. The simulator should still have the app installed. Open the chat modal under SECRET LAB, send a few messages, confirm voice playback works with the default Rachel voice. If the voice doesn't fit the deadpan-DDLC vibe, browse https://elevenlabs.io/app/voice-library and update DEFAULT_VOICE_ID in functions/src/senpaiSpeak.ts.

**To fix the latent expo-file-system v55 issue:**
> Read HANDOFF_SESSION_2026-05-04.md → "expo-file-system v55 deprecation". Migrate BloodworkUploadScreen.tsx and DexaUploadScreen.tsx to use the legacy import (or upgrade to the new File/Directory API). They currently throw at runtime when used.
