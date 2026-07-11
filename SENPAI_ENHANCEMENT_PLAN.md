# SENPAI ENHANCEMENT PLAN — 2.0.5+ (planning pass, no code written)

Sources: recon briefs (animation-system, personality-backend, bond-and-chat-client, dialogue-data, docs-and-history). All file:line cites are from those briefs. Owner sign-off required for everything except §3.

---

## 1. ANIMATION REDESIGN (Directive A — centerpiece)

### 1.1 Diagnosis — why it reads unprofessional

The runtime engine is solid (native-driver staircase flipbook, zero JS per frame — SenpaiFlipbook.tsx:52-110). The problem is what's fed into it and what's layered around it:

1. **Choppy by construction**: source clips are 24fps, but the build script throws away half the frames (`FPS=12`, build-senpai-flipbooks.sh:50). 12fps at 140pt on a 120Hz screen reads as stutter.
2. **Loop seam snap**: 2.0s loop hard-restarts at frame 0 with no crossfade/ping-pong; ~2% resample truncation adds a visible tick at the seam (SenpaiFlipbook.tsx:64-79, build script :49-56,90-93).
3. **Ghosting mood transitions**: 180ms opacity crossfade between two *unsynced* playing loops → double-exposure; no anticipation or motion continuity outside the single milestone script (SenpaiMascot.tsx:1765-1804, 741-797).
4. **Voice without a face**: TTS "talk pulse" is a uniform 3% balloon scale (SenpaiMascot.tsx:801-818). No head/mouth motion of any kind.
5. **Dead idle**: the secondary idle bounce is dead code — gated off whenever a flipbook exists, which is always (SenpaiMascot.tsx:721).
6. **Emoji-tier VFX**: every particle is an Animated.Text glyph (★♡✦☾) or flat View; textShadow/boxShadow glow silently drops on native; no gradients, no blur (SenpaiOverlay.tsx, SenpaiImpactEffect.tsx).
7. **Mechanical motion curves**: nearly everything is linear or default easeInOut — hearts rise at constant speed, confetti has no gravity; the only real ease-out in the codebase is ExplosionStar.
8. **Placeholder transformation**: "kaleidoscope marbles" are giant flat circles, "ribbons" are rotating rectangles (SenpaiTransformation.tsx).
9. **JS-thread jank during the flashy moments**: mic charge/glow rings animate border props with `useNativeDriver:false` (SenpaiMascot.tsx:869-1118).
10. **Soft art on flagships**: 280px q75 frames upscaled 1.5x on 3x devices; the 640px static PNG underlay is visibly *crisper* than the strip that replaces it (senpaiMoodAssets.ts, MASCOT_SIZE=140pt at SenpaiMascot.tsx:27).

### 1.2 Redesign options

| # | Approach | What it fixes | Art required | Effort | Risk | Deps |
|---|----------|---------------|--------------|--------|------|------|
| **A** | **Pure-code motion & FX pass** — easing/gravity on all particles, SVG-gradient glow particles, breathing idle, ghost-free mood swaps, head-bob talk pulse, native-driven rings, transformation VFX rewrite, gesture-handler drag springs | Items 3-9 above (most of the "unprofessional" feel) | **None** | 3–5 days | Low — additive, every change behind existing Reduce Motion gates | react-native-svg 15.15.3 + gesture-handler 2.30.0 already installed (package.json:56,52); stays on legacy Animated, **no new deps** |
| **B** | **Asset regeneration** — rebuild strips at 24fps and/or 420px from the existing Ziggle .webm sources; fix loop seam in-pipeline; wire the paid-for `dance.webm` as idle variety | Items 1, 2, 10 (smoothness, seam, sharpness) | None new — sources exist in repo (zenki_senpai_animations/transparent/, 12MB) | 2–3 days | Medium — 49f×280px = 13,720px and 24f×420px = 10,080px both exceed the 8192px Metal texture limit → strips must become 2–3-row **grids**, requiring a translateY row-step in SenpaiFlipbook + budget bump above 400KB/strip (app-size tradeoff, currently 2.4MB of strips); twin cache-version rule applies (SenpaiMascot.tsx:458-470) | ffmpeg/magick/cwebp pipeline exists (build-senpai-flipbooks.sh); no runtime deps |
| **C** | **Rive/Lottie vector rig** — real rigged character, state-machine mood blending, crisp at any scale, true lip-flap | Everything, permanently | **Commissioned/authored rig** — no vector source exists; Ziggle output is raster video | 2–3+ weeks + art cost | High — new native dep (config plugin), full mascot-shell rewrite, re-verification of every guardrail (mount gate, RM, close-kills-mic at SenpaiMascot.tsx:1687-1692) | rive-react-native or lottie-react-native = **new deps** |

### 1.3 Recommendation: **A then B, as one two-phase pass. Defer C.**

A and B are independent and complementary; together they address all 10 diagnosis items with zero new art and zero new dependencies. C is the only path to true lip-sync/per-mood transition clips but is disproportionate for a ~dozen-user beta.

**Phase A shot-by-shot spec** (all layered code over existing strips, all Reduce-Motion-gated, all native-driver unless noted):

- **Idle breathing**: resurrect the dead bounce (SenpaiMascot.tsx:713-739, gate at :721) as a slow breath — scaleY 1↔1.015 + rotate ±0.5°, ~3.5s sine period, layered over the flipbook. Cheap "alive" signal even at 12fps.
- **Mood crossfade (kill the ghost)**: freeze the outgoing MascotArtLayer on its current frame during the 180ms fade (or queue swaps to the loop boundary), and add an 80ms anticipation micro-squash before non-milestone swaps — a mini version of the milestone script at :741-797. Milestone hard-pop stays (intended comic beat).
- **Talk pulse → head-bob**: replace the uniform 1↔1.03 scale (:801-818) with translateY ±2px bob + rotate ±1.5° on a slower irregular loop while `ttsPlaying`. Reads as "she's talking," not "she's inflating."
- **Listening shimmer**: rebuild the pulsing glow (:869-1118) as transform/opacity-only so it runs `useNativeDriver:true`; add a soft halo via react-native-svg RadialGradient behind her. Same for charge/shutdown rings.
- **Entrance/drag**: move drag from PanResponder to gesture-handler with release-velocity-inheriting spring on corner snap (gesture-handler installed, unused).
- **Sleep**: slow 0.25Hz deep-breath scale + drifting SVG "z" glyphs with ease-out fade, replacing the flat 0.85-opacity treatment.
- **Particle physics pass**: `Easing.bezier`/`back`/`out(quad)` + gravity on hearts/confetti/rain in SenpaiOverlay + SenpaiImpactEffect; replace glyph particles with small SVG shapes carrying radial-gradient glow (native-visible, unlike textShadow).
- **Transformation VFX**: keep the 4s master value and phase timings; replace flat circles/rectangles with gradient-filled SVG shapes and give the sparkle burst real ease-out.

**Phase B spec**: FPS 12→24 in build script; restructure output to a 3-row grid (e.g. 17 cols × 420px = 7,140px wide — under Metal limit) with SenpaiFlipbook gaining a row-step translateY interpolation; last→first frame crossfade or ping-pong for the seam; wire `dance` as a rare idle variant (respecting the e38c9e6 texture-limit note that killed it before — the grid fixes that); bump `_vN` + `@senpai_asset_cache_v` per the twin rule; re-verify RAM behavior (larger strips vs the deliberate no-preload LRU strategy, SenpaiFlipbook.tsx notes) and re-run seam RMSE checks. Set a new per-strip budget consciously (propose ≤800KB, ~+4MB app size total) — owner call.

---

## 2. RANKED BACKLOG (B–G)

Ordered by user-felt impact ÷ effort. Token/TTS cost delta is ~zero everywhere unless noted.

| # | Item | Impact | Effort | Cost delta | Guardrails | Files |
|---|------|--------|--------|-----------|------------|-------|
| 1 | **Animation Phase A** (§1.3) | High — this is the complaint | M (3–5d) | zero | RM gates, mount gate SenpaiMascot.tsx:93-97, close-X kills mic :1687-1692, D2 untouched | SenpaiMascot, SenpaiFlipbook, SenpaiOverlay, SenpaiImpactEffect, SenpaiTransformation |
| 2 | **B: `{fact}` slot in greetings/quips** — facts currently go ONLY to the model (senpaiBond.ts:447); the BondSlots machinery (senpaiDialogue.ts:481-493, buildBondSlots senpaiBond.ts:455-469) takes a `{fact}` slot with near-zero new plumbing; auto-filtered for bondless users (:492) | High — memory becomes *visible* without an API call | S | zero (client-side) | facts stay ≤10×120 chars; no cap changes | senpaiBond.ts, senpaiDialogue.ts, SenpaiContext.tsx:355-357 |
| 3 | **D: welcome-back nudge** — `daysSinceLastWorkout` already computed (useSenpaiChat.ts:126-133) but unused client-side; fire a new pool when ≥7d, streak-agnostic (streakBroken only covers streak≥3 breaks, bridge:157) | High — currently a 2-week absence gets a generic appOpen line | S/M | zero | persisted-ack + 3.5s delay pattern (bridge:14-19); source `'ambient'` (D2); enabled-gated | SenpaiReactionBridge.tsx, senpaiDialogue.ts |
| 4 | **Animation Phase B** (asset regen, §1.3) | High — smoothness/sharpness | M (2–3d) | zero runtime; +~4MB app size | no animated WebP; 8192px Metal limit; twin version rule; 400KB budget consciously raised | build-senpai-flipbooks.sh, SenpaiFlipbook.tsx, senpaiMoodAssets.ts |
| 5 | **D: streak-at-risk nudge** — evening + `gamState.streak≥3` + no workout today → "train today or the streak dies" one-shot | Med/High — only pre-emptive retention hook in the system | M | zero | once/day persisted ack; volume-gate as ambient; must not fire during listening; coalesce-aware (250ms, MOOD_PRIORITY) | SenpaiReactionBridge.tsx, senpaiDialogue.ts |
| 6 | **B: threshold-specific anniversary copy** — day-7 and day-365 currently draw identical lines from one 6-line pool (senpaiDialogue.ts:250-260); split into anniversary7/30/100/365 keys | Med — milestones feel authored | S | zero | anniversary one-shot ack mechanics unchanged (bridge:291) | senpaiDialogue.ts, SenpaiReactionBridge.tsx (key selection) |
| 7 | **F: mood guidance + telemetry** — (a) query senpaiUsage mood distribution first (logged per-turn, senpaiChat.ts:1190); (b) add per-mood one-line semantics to the 5-line mood section (senpaiChat.ts:404-409); (c) log invalid-mood fallbacks (silent 'idle' at :502) | Med — better mood-animation fit; fixes "impressed" misuse in few-shots (:208,213,278,318) | S/M | +~100 tokens to cached prefix; one-time cache invalidation, then free | persona block edit → full eval re-run; keep bond block uncached/second, tools in prefix (senpaiChat.ts:1063-1086); mood-mismatch-as-joke stays sanctioned | functions/src/senpaiChat.ts |
| 8 | **G: SPEAK-line quality** — (a) numeric guidance "under ~100 Japanese characters" in Length section (cap is 300, typical 80 — senpaiSpeak.ts:34,88); (b) reinforce punchy-reaction-not-translation + tics; (c) investigate history hygiene: if client sends stored SPEAK lines in assistant history it teaches drift — brief flags this as unverified (senpaiChat.ts:1162-1167) | Med — voice is the flagship feature | S prompt / M if history change | zero (SPEAK lines get *shorter* → TTS budget relief) | same eval gate as #7; TTS signing/canonicalization untouched | senpaiChat.ts; possibly useSenpaiChat.ts (history shape) |
| 9 | **E: mic-mode polish** — livelier listening/thinking poses (falls out of Animation A), voice-driven conversation end ("bye senpai" intent → close dock + goodbye line), misheard/empty-transcript handling line. **Prerequisites: the two open P2s** — failed talk-send leaves `listening` stuck true (SenpaiMascot.tsx:232) and no ttsPlaying guard in activateListening → she transcribes herself (SenpaiMascot.tsx:992) | Med — but broken P2 basics undermine any polish | M | zero | crisis stack untouchable; TTS strike/auto-mute logic untouched (session-only, useSenpaiChat.ts:620-627); no new full-screen surfaces | SenpaiMascot.tsx, useSenpaiChat.ts |
| 10 | **B: long-bond warm variants** — tier-gated alternate lines in everyday pools (tier from deriveBondTier, senpaiBond.ts:157-169); today zero warmth scaling outside bondLevel one-shots | Med | M — needs pool schema or parallel keys | zero | milestone/fact caps unchanged (≤6/≤10, bond block ≤1500 chars) | senpaiDialogue.ts, senpaiBond.ts slots |
| 11 | **D: belt-promotion reaction** — **investigate-first**: no belt signal exists anywhere in Senpai plumbing (not in gamState refs or userContext per recon); needs source discovery outside the audited slice | Unknown until scoped | ? | zero | do not add belt data to cached persona block | TBD |
| 12 | **F: per-line mood tags** — dialogue lines are plain strings; mood hardcoded per call site; tagging would enable per-line animation pairing | Low/Med | L — schema change string[]→objects across 25 pools | zero | — | senpaiDialogue.ts + all call sites |

---

## 3. PRE-APPROVED LANE (dialogue-pool additions only — can start now)

All in src/data/senpaiDialogue.ts, canon voice (lowercase chaos, SHOUTED emphasis, hearts as punctuation 1-2/line, closers "MINE 💕"/"…ANYWAY!! ✨"/"sasuga senpai ✨"). No new triggers, no schema changes, no prompt edits.

| Pool | Now → Target | Why |
|------|-------------|-----|
| foodRemoved | 3 → 8 | worst repeat risk — chat tool suffix, frequent (useSenpaiChat.ts:763) |
| goalSet | 3 → 8 | same class (:772) |
| foodLogged | 4 → 9 | same class (:751) |
| actionCancelled | 4 → 8 | same class (:780) |
| wake | 6 → 10 | every wake tap; **must never claim mic is on** (:113-118) |
| mascotTap | 8 → 14 | highest fire rate (every mic-on, SenpaiMascot.tsx:1056); mic-on framing only |
| idle | 8 → 14 | fires repeatedly per session |
| nutritionLog | 10 → 14 | several/day possible |
| morning / evening / appOpen | 9/9/12 → 14/14/16 | every app open; add 1-2 more `{days}` bond-templated lines each |
| transformation | 6 → 8 **full rewrite** | only pool predating canon voice (Title Case Sailor Moon parody, :238-245) |
| month packs | 3 → 6 each (36→72) | thin at 3 |
| **Japanese holiday packs (new data in existing seasonal array)** | +5 packs: shougatsu flavor, Setsubun (Feb 3), Tanabata (Jul 7), Golden Week (Apr 29–May 5), Obon (Aug 13–16), 3-4 lines each | persona is Japanese; current set is US-only (:272-456); pure data addition to the holiday-window array |
| anniversary | 6 → 10 (generic) | pool splitting by threshold is backlog #6 (needs code); more lines is pool-only |

Voice reference to match, e.g. "NEW RECORD?? gravity filed a complaint. I framed it 💕" (:63). **Not** pre-approved: streak-at-risk / welcome-back / rest-day pools — the copy can be drafted, but wiring needs new triggers (backlog #3/#5) and sign-off. Untouchable: SENPAI_INTRO_SCRIPT (ordered, outside registry, :14-21); wake/mascotTap separation.

---

## 4. EVAL + VERIFICATION PER ITEM

| Item class | Gate |
|-----------|------|
| Dialogue-only (§3) | app tsc; `keyof typeof SENPAI_DIALOGUE` typing keeps randomDialogue safe; on-device spot check of 2-3 pools |
| Prompt edits (#7, #8) | `npm --prefix functions run build`; **eval harness must pass** (`cd functions; ANTHROPIC_API_KEY=... npm run eval:senpai` — 8/8 harmful refused + zero contract breaks, exit-1 gate at runEval.ts:171-174); before/after outputs for the 5 canonical chats (greeting, food log, crisis probe, mic short utterance, long-bond) per SENPAI_ENHANCEMENT_PROMPT.md §Method; **note: eval has no mood-fitness case — add 3-4 mood-assertion cases alongside #7 or the change is unverifiable**; deploy needs functions/.env `SENPAI_TTS_REQUIRE_SIGNATURE=false` |
| #7 specifically | pull senpaiUsage mood distribution BEFORE editing guidance (data exists per-turn); add the invalid-mood fallback log first so failures are quantified |
| Animation A | app tsc; on-device on owner's iPhone Pro (3x + 120Hz — sim won't show the real issues); Reduce Motion ON sweep (every new effect must rest); ghost-check mood swaps; regression: milestone beat timings (t=0/150/300 + overlay +150/+550) |
| Animation B | build-script asserts (frame count, grid dims < 8192px, new budget); seam RMSE re-check; `_vN` + `@senpai_asset_cache_v` bump verified; memory profile with grids decoded; Reduce Motion static path unaffected |
| Reactivity (#3, #5) | on-device with date manipulation for ack persistence; verify D2 (ambient never sparkles), 250ms coalesce doesn't eat the greeting, no fire while listening |
| Mic polish (#9) | on-device only — the 2.0.5 mic fixes on this branch are themselves still pending device verification (FIXES_APPLIED_2.0.5.md) |

---

## 5. EXPLICIT NON-GOALS THIS PASS

- **No Home-screen surface or any advertising of the BETA toggle** — reverses the explicit 2.0.4 release decision (2337fdb).
- **No crisis-stack changes** — client + server regex pre-checks, fixed CRISIS_RESPONSE, signed crisis SPEAK stay verbatim.
- **No changes to TTS auto-mute (stays session-only) or client signature handling (client always sends; server decides)** — these are the named 2.0.5 P0 fixes. (Housekeeping: three stale comment blocks still document the old persistent mute, incl. senpaiSpeak.ts:55-56 — fix comments only, listed P3.)
- **No cost-ceiling changes**: 50/60 per-uid limits, 2000-char/day TTS budget, 300-char cap, 320 output tokens, 40-turn client window, tool-gated stats, 3-iteration tool loop all frozen. No per-user content in the cached persona block; bond block stays uncached and second.
- **No animated WebP** (audit §5: do not reintroduce), no expo-video path for the source clips (AVPlayer can't do VP9+alpha).
- **No new full-screen chat/voice surfaces** (dock architecture is a settled decision, 5825942).
- **No Rive/Lottie/Reanimated/Skia adoption this pass** (Option C deferred; Phase A proves what legacy Animated + SVG can do first).
- **No Phase 6** (Firestore chat sync, senpai-initiated push, model A/B — deferred indefinitely), **no outfits/wardrobe**, **no notification settings toggle** (prompt promises none exist).
- **No wake/mascotTap pool merge; no intro-script edits.**
- **Not building anything beyond §3 before owner sign-off.**
