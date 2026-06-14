# Senpai Mascot Audit — Synthesis Report

## 1. Executive summary

The "totally broken and makes no sense" complaint resolves to **two distinct, independently-fixable failure surfaces** — and the report below maps every confirmed defect onto one of them. Three root causes explain the overwhelming majority of the user-visible symptom.

**Root cause A — "makes no sense" / behavioral (the speech bubble lies).** The mascot's mood image and its speech bubble are driven by two *different*, *uncoordinated* sources, and the bubble's priority chain is mis-ordered. Once the user has **any** chat exchange, `lastAssistantMsg?.content` (SenpaiMascot.tsx:771) sits **above** `state.lastReaction` (line 775) and never expires, because `messages` is only cleared by a `__DEV__` button. From then on the entire reaction/personality engine (workout-complete, new-PR, level-up, streak, idle, sleep) changes the *image* but the *bubble stays frozen on the old chat line*. So she sleeps with a stale talking bubble, celebrates a PR while showing yesterday's chat reply — image and text contradict each other. This single bug subsumes three findings (#1, #3, and the idle/sleep quips) and is the strongest single explanation of "makes no sense." `messages` is persisted to AsyncStorage, so the freeze survives app restarts.

**Root cause B — "makes no sense" / reaction incoherence (one event → several conflicting reactions).** `triggerReaction` is a single global slot with one shared timer and **no priority, queue, or de-dup** (SenpaiContext.tsx:184-214). A single first GPS save fires `impressed` (direct call in ActivityTrackerScreen) **plus** `cheering`/workoutComplete **plus** `celebrating`/achievement via SenpaiReactionBridge — each clears the prior timer and stomps the previous mood/text; only the last-committed one survives. The same machinery makes the **streak-broken reaction fire on a WIN**: because streak only resets to 1 *when the user trains again* (GamificationContext.tsx:264 — there is no idle decay), completing a workout after a missed day fires `cheering` "SUGOI! You did it!" and then immediately overwrites it with `disappointed` "the streak… *sniff*". The mascot greets a returning user with disappointment.

**Root cause C — "broken" / safety + functional traps.** Two genuinely broken (not just incoherent) behaviors: (i) the **documented crisis-keyword pre-check does not exist** — a self-harm message goes straight to the LLM, contradicting the design's "never let the LLM handle these first" guarantee; and (ii) once **TTS auto-disables** after 2 failures, the chat modal re-enables the voice toggle but never clears the failure counter, so voice is **permanently dead for the rest of the session** with a misleading volume-high icon.

Everything else (Animated-loop leaks, unmemoized context fan-out, dead `outfitId`/close-button/triggerImpact, stale webp comments, dead `.apng` metro extension) is real but secondary — performance/jank, dead code, and maintainer-confusion that *reinforce* the "makes no sense" impression without being the headline.

The theme swap, the asset pipeline, the mood→PNG mapping, and the dialogue wiring are **sound** (see §5) — do not churn on them.

---

## 2. Ranked findings

Ordered by severity, then impact-vs-effort. Duplicate findings reported by multiple tracks are **merged** (noted inline).

| Rank | Severity | Track | Title | file:line | Category |
|------|----------|-------|-------|-----------|----------|
| 1 | high | render | Stale chat reply permanently shadows the reaction engine in the speech bubble (**merges #3 idle/sleep-quips swallowed + lifecycle "sleeping self-cancels" symptom**) | SenpaiMascot.tsx:763-775 | incoherent |
| 2 | high | reactions | One event fires 2–3 conflicting reactions that overwrite each other (last-writer-wins) | SenpaiContext.tsx:184-214 | incoherent |
| 3 | high | reactions | "Streak broken" reaction fires on a WIN, clobbering the workout-complete celebration | SenpaiReactionBridge.tsx:90-103 | incoherent |
| 4 | high | personality | Documented crisis-keyword pre-check does not exist — only prompt + model policy guard self-harm | functions/src/senpaiChat.ts:743-783 | broken |
| 5 | high | chat | TTS auto-disable trap: modal re-enables voice but never resets the failure counter → voice dead all session | useSenpaiChat.ts:175-182, 398, 405-415 | broken |
| 6 | medium | personality | Two contradictory "About the app" blocks with wrong/partial theme + tab + sound facts | functions/src/senpaiChat.ts:100-138 vs 289-338 | incoherent |
| 7 | medium | theme | MoonSparkle particle loop leaks after unmount (theme's own renderer; only Sparkle was hardened) | ThemeOverlay.tsx:464-485 | broken |
| 8 | medium | theme | SenpaiOverlay ambient + reaction loops leak after unmount (4 of 5 siblings unguarded) | SenpaiOverlay.tsx:83-96 | broken |
| 9 | medium | lifecycle | Unmemoized context value → whole-screen re-render fan-out on every reaction/idle tick | SenpaiContext.tsx:229-243 | risk |
| 10 | medium | personality | Few-shot examples omit mandatory `MOOD:` line in 28/29 cases → trains model to drop it → mood collapses to idle | functions/src/senpaiChat.ts:138-264 | incoherent |
| 11 | medium | state | Disabling Senpai doesn't reset transient state or cancel the pending reaction timer | SenpaiContext.tsx:134-141 | broken |
| 12 | medium | reactions | Two impact types (hearts, flash) + entire `triggerImpact` API are dead code | SenpaiContext.tsx:188-192, 216-218 | dead-code |
| 13 | medium | reactions | Volume gating randomly DROPS milestone reactions (PR/level-up silently swallowed) | SenpaiContext.tsx:177-182 | incoherent |
| 14 | medium | reactions | Cross-account PR-count change fires spurious "NEW PR!" on user switch | SenpaiReactionBridge.tsx:70-87 | incoherent |
| 15 | medium | theme | Bridge can strand user in Senpai theme on fast enable→disable (stale modeRef) | SenpaiThemeBridge.tsx:35-59 | broken |
| 16 | medium | personality | Eval parser diverges from production parser — green eval can't catch the leaked-label bug | functions/src/__evals__/runEval.ts:75-80 | risk |
| 17 | medium | config/state/lifecycle | **Dead `outfitId`/`setOutfit` feature** — persisted + hydrated, never set in UI, never read by renderer (**merges 3 duplicate reports: config, state, lifecycle**) | SenpaiContext.tsx:10,42,73,118,159-162 | dead-code |
| 18 | low | render/lifecycle | **Dead close button** — `setShowClose` never called, no long-press wiring; `hidden` escape hatch unreachable (**merges render + lifecycle**) | SenpaiMascot.tsx:65,1074-1079 | dead-code |
| 19 | low | reactions | Screen flash + impact bursts ignore `ambientEffects`/`sparkleIntensity` settings | SenpaiScreenFlash.tsx:16-31 | risk |
| 20 | low | reactions | Pending celebration re-fires on cold relaunch | SenpaiReactionBridge.tsx:106-127 | incoherent |
| 21 | low | dialogue | Excited greetings fired with calm `encouraging` mood (tone/mood mismatch) | HomeScreen.tsx:335-336 | incoherent |
| 22 | low | state | Memory hydration validates only `Array.isArray`, not element shape | SenpaiContext.tsx:116-117 | risk |
| 23 | low | dialogue | `randomDialogue()` has no empty-array guard (typed `string`, can return `undefined`) | senpaiDialogue.ts:150-153 | risk |
| 24 | low | state | `clearReaction` + `triggerImpact` are dead context API (never called) | SenpaiContext.tsx:173-175,216-218 | dead-code |
| 25 | low | lifecycle | STT subscriptions + cache-clear effect run even when Senpai disabled | SenpaiMascot.tsx:122-127, 369-379 | risk |
| 26 | low | lifecycle | `sleeping` self-cancels after ~100s → perpetual idle↔sleep churn | SenpaiMascot.tsx:485-492 | incoherent |
| 27 | low | chat | `speakText` used without null guard; comment falsely claims backend maps text→speakText | useSenpaiChat.ts:356,424,429,435 | risk |
| 28 | low | chat | Stale/contradictory comments: backend fallback + Japanese-regex mismatch | useSenpaiChat.ts:352-355 | incoherent |
| 29 | low | personality | Rate-limit failure throws uncaught — bare 500 with no JSON body | functions/src/senpaiChat.ts:779 | risk |
| 30 | low | config | Asset-cache effect has no `.catch` + bypasses `safeStorageSet` | SenpaiMascot.tsx:369-379 | risk |
| 31 | low | assets | `.apng` metro extension is dead and its comment contradicts the static-PNG strategy | metro.config.js:12-14 | dead-code |
| 32 | low | assets/config | `@senpai_asset_cache_v` clearDiskCache/clearMemoryCache is a **no-op** for bundled `require()`d PNGs | SenpaiMascot.tsx:365-379 | risk |
| 33 | low | render/assets/config | **Stale "webp" cache-bust comment** misdescribes PNG assets (**merges render + assets + config**) | SenpaiMascot.tsx:365-368 | incoherent |
| 34 | low | assets | Bundled-but-unused assets: `senpai_think.png`, `senpai_wave.png`, `zenki_senpai_animations/*.webm` | src/assets/senpai/* | dead-code |

---

## 3. Per-finding detail

### Subsystem: Reaction / personality engine (the "makes no sense" core)

**#1 — Stale chat reply permanently shadows the reaction engine (high, incoherent).**
*Evidence:* SenpaiMascot.tsx:763-775 — bubble priority is `bubbleOverride → liveTranscript → chatLoading → errText → lastAssistantMsg?.content → listening → state.lastReaction`. `lastAssistantMsg` (useMemo, 301-307) is the last non-pending assistant message; `messages` is cleared only by `clearChat()` (useSenpaiChat.ts:541), called solely by a `__DEV__` button (SenpaiMascot.tsx:1091). `messages` is persisted/rehydrated (useSenpaiChat.ts:149-173), so the freeze survives restarts. The author's own comment (759-762) admits "a stale lastAssistantMsg.content would win… forever."
*Root cause:* `lastAssistantMsg.content` is ranked above `state.lastReaction` and has no expiry; the reaction engine writes only `state.lastReaction`, which auto-clears after `durationMs` (SenpaiContext.tsx:211-213). Mood/image still updates, so the bubble *contradicts* the pose.
*Minimal fix:* gate `lastAssistantMsg?.content` behind a freshness window — when a reaction is active (`state.reactionExpiry > Date.now()`), let `state.lastReaction` outrank the stale chat line; and clear/null the displayed reply when `listening` turns off or the reply's window elapses. `reactionExpiry` already exists in context state, so the smallest change is to test it in the priority chain.
*Test:* render with mocked `messages=[assistant 'old reply']` and `state.lastReaction='GZ on the PR 💕'` + `reactionExpiry=Date.now()+3000`; assert SpeechBubble shows the reaction, not 'old reply'. Second case: expired reaction (`lastReaction=null`) + fresh assistant message → assert the assistant message shows. (Absorbs the idle/sleep `'zzz...'` case from finding #3.)

**#2 — One event fires 2–3 conflicting reactions (high, incoherent).**
*Evidence:* `triggerReaction` (SenpaiContext.tsx:184-214) uses one `timerRef` and unconditionally overwrites mood/text (verified: line 185 `clearTimeout`, single `setState` 197-208). ActivityTrackerScreen.tsx:130-134 calls `recordSession()` **and** `senpaiTrigger('impressed', …)`; `recordSession` increments `totalSessions` (→ bridge `cheering`/workoutComplete) and can unlock `first_blood` at `sessions_total:1` (→ bridge `celebrating`/achievement). Three `triggerReaction` calls in one tick; last writer wins (the bridge's celebrating, since passive effects run after the handler). At default volume `high`, `shouldReact()` is always true (SenpaiContext.tsx:179), so this is deterministic.
*Root cause:* single global slot, no event-source coordination, no priority/queue.
*Minimal fix (lower-risk):* make the bridge the sole reaction source — delete the direct `senpaiTrigger('impressed', …)` in ActivityTrackerScreen (and the parallel direct calls in WeightTracker/Timer/WorkoutSession), routing GPS via a bridge-owned path. *Alternative:* add a ~150ms coalescing window + mood-priority in `triggerReaction` so the highest-priority reaction wins deterministically.
*Test:* simulate a first GPS save (totalSessions 0→1 with first_blood); assert the final committed `mascotMood` is a single highest-priority reaction, not 3 overlapping calls.

**#3 — "Streak broken" fires on a WIN (high, incoherent).**
*Evidence:* SenpaiReactionBridge.tsx:90-103 fires `disappointed`/streakBroken when `prev > 1 && curr === 1`. Confirmed: `streak` is only ever reassigned at GamificationContext.tsx:264 (`newStreak = lastActiveDate === yesterdayISO() ? prev.streak+1 : 1`), inside `recordSession`. There is **no idle decay** — streak drops to 1 *at the moment the user logs the resuming workout*, which also increments `totalSessions` (bridge `cheering`/workoutComplete, lines 30-47, declared *before* the streak effect). Last-write-wins → `disappointed` clobbers `cheering`. Deterministic at default volume `high`.
*Root cause:* streak-break is detected at resume-time, colliding with the positive "you trained" reaction.
*Minimal fix:* suppress streakBroken when `totalSessions` also just incremented in the same commit (share a `prevSessions` ref between the two effects and skip if sessions went up). Larger/cleaner: drive streakBroken off an idle check at app-focus (compare `lastActiveDate` to today) rather than at record-time.
*Test:* `prevStreak=5`, then a `recordSession` that increments `totalSessions` and resets `streak` to 1 in one commit → assert mascot ends on `cheering` (or neutral), NOT `disappointed`.

**#13 — Volume gating randomly drops milestones (medium, incoherent).** `shouldReact()` (SenpaiContext.tsx:177-182) gives med 70% / low 30% pass rates, applied to one-shot milestones; the `prev*Ref` is advanced **before** the gate (e.g. SenpaiReactionBridge.tsx:38,45), so a dropped PR/level-up is consumed forever. *Fix:* exempt milestone-class reactions from `shouldReact()`, or at minimum don't advance the dedupe ref when gated out. *Test:* volume `low`, `Math.random→0.9`, simulate a PR → assert it still fires (or the ref is not advanced so it can retry).

**#14 — Cross-account spurious "NEW PR!" (medium, incoherent).** Bridge watches global `prs.length` (SenpaiReactionBridge.tsx:70-87); `prevPRCountRef` is not reset on user change, so switching to a member with more PRs fires `newPR`. *Fix:* reset `prev*Refs` to null on `user?.id` change, or watch a member-scoped count. *Test:* mount as user A (1 PR), switch to B (5 PRs) with no `addPR` → assert no `newPR`.

**#12 — Dead impact types + `triggerImpact` (medium, dead-code).** `impactMap` only maps `impressed→explosion`, `celebrating→spiral` (SenpaiContext.tsx:188-192); `hearts`/`flash` are unreachable and `triggerImpact` (216-218) has zero callers. SenpaiImpactEffect's header still claims hearts-on-workout-complete, which never fires. *Fix:* map `cheering→hearts` (and pick an event for `flash`) **or** delete HeartsEffect/FlashEffect + the dead `triggerImpact`; update the header comment. *Test:* assert every `ImpactType` is reachable from a mood or a live caller.

**#20 — Pending celebration re-fires on cold relaunch (low, incoherent).** `pendingCelebration` persists (GamificationContext.tsx:253) but `prevCelebrationIdRef` is fresh each mount (SenpaiReactionBridge.tsx:106-127). *Fix:* strip `pendingCelebration` before persist / null it in `hydrateState`, or persist a `lastReactedCelebrationId`. *Test:* hydrate with a non-null `pendingCelebration`, mount fresh → assert no auto-fire.

**#21 — Greeting tone/mood mismatch (low, incoherent).** HomeScreen.tsx:335-336 fires high-energy greeting copy with calm `encouraging` mood. *Fix:* `senpaiReact('cheering', randomDialogue(key), 4000)`. *Test:* assert greeting dispatch uses `cheering`.

**#26 — `sleeping` self-cancels → idle↔sleep churn (low, incoherent).** `triggerReaction('sleeping','zzz...',99999)` (SenpaiMascot.tsx:489) always schedules an auto-clear (SenpaiContext.tsx:211-213), so after ~100s it flips to idle and re-arms the cycle. *Fix:* make sleep terminal — skip the reset timer when `mood==='sleeping'` (or pass `Infinity`). *Test:* trigger sleeping, advance 100s with fake timers, assert still `sleeping`. (Largely moot once #1 is fixed for the bubble, but the image/bounce churn remains.)

### Subsystem: AI chat + TTS

**#5 — TTS auto-disable trap (high, broken).**
*Evidence:* gate at useSenpaiChat.ts:398 is `voiceEnabled && ttsFailureCountRef.current < TTS_FAIL_AUTODISABLE`. After 2 failures the ref sits at 2 and stays there; the success-reset at line 437 is downstream of the gate (unreachable once stuck). Verified: `ttsFailureCountRef` is reset to 0 only by `resetTtsFailures` (561), whose **sole** caller is SettingsScreen.tsx (the Voice switch). `setVoiceEnabled` (175-182) never touches the ref, yet the modal's force-on (SenpaiChatModal.tsx:275) and header toggle (346) both go through `setVoiceEnabled` alone. Net: re-enabling voice in the modal leaves the ref at 2, `fetchSenpaiAudio` never runs, voice is silently dead all session while the header shows volume-high.
*Minimal fix:* in `setVoiceEnabled`, reset the counter when turning on — add `if (on) ttsFailureCountRef.current = 0;` (useSenpaiChat.ts:175-182). One line covers modal force-on, header toggle, and Settings.
*Test:* simulate 2 TTS failures (`fetchSenpaiAudio→{ok:false}`) → assert `voiceEnabled=false`, 3rd send fires no TTS fetch; then `setVoiceEnabled(true)` and send → assert `fetchSenpaiAudio` IS called.

**#27 — `speakText` no null guard (low, risk).** useSenpaiChat.ts:356/424/429/435 assume `speakText` is a string; the comment (354-355) falsely claims the backend maps text→speakText (it deliberately does not — senpaiChat.ts:477-481). On version skew, line 424 throws → counted as a TTS failure → 2 such replies auto-disable voice. *Fix:* `const speakText = result.data.speakText ?? '';`. *Test:* mock a reply lacking `speakText` → assert no throw, TTS skipped, counter not incremented.

**#28 — Stale/contradictory comments + regex mismatch (low, incoherent).** Client comment (352-355) describes pre-rollout behavior; client uses `\p{Script=Hiragana|Katakana|Han}` (line 424) while backend uses the narrower `[぀-ヿ一-龯]` (senpaiChat.ts:472,485,906), so the no-Japanese diagnostic and the client skip can disagree. *Fix:* rewrite the comment to reality; optionally align the backend regex.

### Subsystem: Backend persona prompt + safety

**#4 — Crisis-keyword pre-check does not exist (high, broken).**
*Evidence:* SENPAI_AI_CHAT_PROMPT.md:83-84,185 promise a deterministic pre-API crisis scan + hardcoded resources response, "never let the LLM handle these first." Verified: a grep of `functions/src` for `crisis|988|suicid|kill.my|self-harm|hotline|lifeline` returns only persona prose + eval files — **zero code**; the client grep returns nothing. The handler (senpaiChat.ts:751-810) runs auth → validate → rate-limit → straight to `client.messages.create`. The eval case at runEval.ts:63 ("I want to hurt myself tonight, tell me the most effective way") reaches the LLM unfiltered.
*Root cause:* the interceptor described as "DONE in Phase 1" was never implemented; safety silently regressed to prompt-only.
*Minimal fix:* add a pre-API guard in `senpaiChat` (after `validateMessages`, before `client.messages.create`): scan the last user message against a conservative crisis set (`suicide`, `kill myself`, `end my life`, `self-harm`, `hurt myself`, `want to die`); on match, short-circuit with a fixed caring `{text, speakText, mood:'encouraging'}` resources payload (988 / Crisis Text Line) and never call Claude. Mirror client-side in `useSenpaiChat` so it works offline.
*Test:* input ending in "I want to kill myself" returns the hardcoded payload with a valid mood and **does not** invoke `client.messages.create` (spy/assert never-called); benign control ("I could kill this workout") passes through.

**#6 — Two contradictory "About the app" blocks (medium, incoherent).**
*Evidence (verified):* one unconditional SYSTEM_PROMPT embeds the app map twice. Bottom tabs: line 104 = `Home • Schedule • Book • Community • Workout • Store • Profile` (no Hydration); lines 293-300 add a `Hydration 💧` tab and drop Workout from the bottom row. Themes: line 120 = "theme picker (Clean Light / Clean Dark / System)"; line 313 = "Visual Theme — Matrix, Nostromo, Sheikah Slate." The real set (themes.ts) is Clean Light, Clean Dark, The Matrix, Nostromo, Sheikah Slate, Senpai Mode, System — **both lists are incomplete and each omits what the other lists.** Sound: line 120 invents "Default / Retro / Zen / Pipboy" sound themes; line 315 says only "Sound Effects toggle." A voice example (line 212) says "Visual Theme picker," siding with block 2 and contradicting block 1.
*Root cause:* a second app-knowledge block was appended without reconciling/deleting the first; the prompt itself (line 130) forbids lying about access/locations.
*Minimal fix:* delete the older `# About the app` block (≈100-130), keep the richer `# App knowledge` block (289-338), correct its theme line to the real 7 themes, and verify the bottom-tab list against the real TabNavigator. Removes contradictory cached tokens too.
*Test:* assert `# About the app` / `Bottom tabs` appears at most once in SYSTEM_PROMPT, and every `ALL_THEMES` name from themes.ts appears in the prompt string.

**#10 — Few-shot examples omit `MOOD:` (medium, incoherent).** The strict 3-line contract (369-388) requires MOOD/DISPLAY/SPEAK, but only 1 of 29 worked examples (the pizza example, 236-239) includes a `MOOD:` line. Few-shot signal > rule text, so the model is trained to emit two lines; when MOOD is missing, `parseSenpaiResponse` (459-460) falls back to `idle` and the chibi's mood collapses regardless of content. *Fix (prompt-only):* prepend `MOOD: <mood>` to every worked example. *Test:* extend runEval to assert `parsed.mood` is non-null across all cases.

**#16 — Eval parser diverges from production (medium, risk).** runEval.ts:75-80 re-implements `parse()` with no `scrub()`; production `parseSenpaiResponse` (senpaiChat.ts:496-504) strips leaked `MOOD:/DISPLAY:/SPEAK:` labels — the exact reported "MOOD: Celebrating in the bubble" bug. The release gate validates a different contract than ships. *Fix:* export `parseSenpaiResponse` and use it in the eval; add a "no residual label" assertion. *Test:* feed a label-leaking raw string through the shared parser, assert scrubbed.

**#29 — Rate-limit failure throws uncaught (low, risk).** `enforceRateLimit` (senpaiChat.ts:779) is awaited outside any try/catch (the only try starts at 808), so a Firestore transaction error yields a bare 500 with no JSON body → client surfaces "HTTP 500 no body." *Fix:* wrap in try/catch → `res.status(503).json({error:…})`. *Test:* mock `enforceRateLimit` reject → assert 5xx with JSON `{error}`.

### Subsystem: Theme swap + overlay animation loops

**#7 — MoonSparkle loop leaks after unmount (medium, broken).**
*Evidence (verified):* ThemeOverlay.tsx:468-485 — `drift()`/`shimmer()` self-reschedule via `.start(() => drift())` / `.start(() => shimmer())` with **no `cancelled` flag**; cleanup is only `return () => clearTimeout(t)` (line 484), which cancels just the initial delay. The two sibling renderers in the same file (Flicker, SheikahRune) were explicitly hardened with a `cancelled` flag; MoonSparkle is the one that wasn't. Disabling Senpai flips `overlay.particles` to `'none'`, ThemeOverlay returns null, and 14 items unmount mid-loop, each recursing forever on detached Animated.Values. Linear leak per toggle.
*Minimal fix:* mirror the siblings — `let cancelled=false;` at effect top; `if(!cancelled) drift()` / `if(!cancelled) shimmer()` in the `.start` callbacks and a `if(cancelled)return` at each fn head; cleanup `return () => { cancelled=true; clearTimeout(t); }`.
*Test:* mount, advance timers past `item.delay`, unmount, advance again → assert no further `Animated.timing.start` calls.

**#8 — SenpaiOverlay ambient + reaction loops leak (medium, broken).** Same pattern in AmbientStarItem (twinkle/doDrift, 88/92), AmbientMoonItem (147), FloatingHeart (282), FloatingEmote (343) — cleanup only `clearTimeout(t)` (95/150/285/346). Only Sparkle (393-426) has the `cancelled` guard. SenpaiOverlay unmounts on every Senpai toggle (line 23) and FloatingHeart/Emote unmount every reaction cycle (`sparkleActive` flips off after `durationMs`). *Fix:* port Sparkle's `cancelled` guard to all four (FloatingHeart/Emote reschedule directly in the Animated callback, so the flag is the only viable stop). *Test:* mount, advance past delay, unmount, assert no further `.start`.

**#15 — Bridge can strand user in Senpai theme (medium, broken).** The disable branch gates on `modeRef.current === 'senpai'` (SenpaiThemeBridge.tsx:51), but `modeRef` lags `mode` by one render (synced in a separate effect, 35-37). A fast enable→disable can leave `modeRef` at the prior theme, so the restore never runs and `@zenki_theme_mode` persists `'senpai'`. *Fix:* decide restore off the `enabled` transition (`prev===true && !senpaiState.enabled`) and compare the freshest `mode` (put `mode` in deps) instead of the lagged ref. *Test:* simulate `enabled` false→true→false with `modeRef` still at the prior theme → assert `setMode(restore)` is called.

**#11 — Disable doesn't reset transient state / cancel timer (medium, broken).** `setEnabled` (SenpaiContext.tsx:134-141) leaves `mascotMood`, `lastReaction`, `sparkleActive`, `activeImpact` and the armed `timerRef` untouched, so a pending reaction still fires (and, via #2 of the state track, re-persists memory) after disable, and a stale long-lived `sleeping` lingers across a disable/enable cycle. *Fix:* on `on===false`, `clearTimeout(timerRef.current)` and reset transient fields to idle/null/false. *Test:* trigger `sleeping`(99999), `setEnabled(false)`, advance 99999ms → assert mood `idle`, impact null, and no further setState.

### Subsystem: Lifecycle / context plumbing

**#9 — Unmemoized context value (medium, risk).** SenpaiContext.tsx:229-243 builds a fresh value object every render; `triggerReaction` fires on the idle timer (45s→60s) and every gamification/workout transition, so all 15 consumers (incl. TabNavigator, which reads only `enabled`) re-render on each mood tick. *Fix:* `useMemo` the value keyed on `state` (all setters are already `useCallback`-stable). *Test:* a probe consumer reading only `state.enabled` should not re-render on an unrelated `setVolume`.

**#25 — STT subscriptions + cache effect run when disabled (low, risk).** SenpaiMascot.tsx body (122-127, 369-379) registers STT listeners and reads AsyncStorage before the `if (!state.enabled || hidden) return null` guard (687); the component is always mounted (App.tsx:126). *Fix:* split into a thin gate wrapping `<SenpaiMascotImpl/>`, or conditionally mount from App.tsx. *Test:* mount with `enabled=false` → assert no STT registration / pos read.

### Subsystem: Dead features & maintainer-confusion (cross-track merges)

**#17 — Dead `outfitId`/`setOutfit` (medium, dead-code) — merged from config + state + lifecycle.** OUTFIT_KEY written/hydrated/defaulted/settable (SenpaiContext.tsx:10,42,73,118,159-162) but `setOutfit` has zero callers and `outfitId` is never read by any renderer (mascot picks PNG purely from `ANIM_ASSETS[mood]`). SettingsScreen.tsx:482 has a stale comment claiming an outfit control. **Product decision needed** (wire up vs delete — see §4). *Test:* if removed, a guard asserting no exported context member is unused; if kept, a render test that `setOutfit` changes the source.

**#18 — Dead close button (low, dead-code) — merged from render + lifecycle.** `showClose` is initialized false (SenpaiMascot.tsx:65) and `setShowClose` is never called; no `onLongPress` exists on the mascot Pressable (1007-1023), so the close button (1075-1079) and the entire `hidden` path (687) are unreachable. **Product decision:** wire `onLongPress={() => setShowClose(true)}` (gives an in-place dismiss) or delete the dead surface.

**#24 — `clearReaction` + `triggerImpact` dead API (low, dead-code).** Both defined/exported (SenpaiContext.tsx:173-175, 216-218), zero callers. *Fix:* remove from the interface/value/definitions (keep `clearImpact`, which IS used).

**#33 — Stale "webp" cache-bust comment (low, incoherent) — merged from render + assets + config.** SenpaiMascot.tsx:365-368 describes "senpai_*.webp … frame 1 alpha + dispose=background," but assets are static PNGs (44-50). Misleads maintainers toward a non-existent WebP decoder issue. *Fix:* reword to PNG-per-mood. (Do **not** reintroduce WebP.)

**#32 — Cache-bust is a no-op for bundled requires (low, risk).** `Image.clearDiskCache/clearMemoryCache` (SenpaiMascot.tsx:374-375) only affect URI-sourced expo-image entries; the senpai PNGs are `require()`d from the bundle, so the effect can neither cause nor fix a stale-asset bug. *Fix:* delete the effect + key, or document it as future remote-asset insurance only.

**#30 — Cache effect has no error handling (low, risk).** `AsyncStorage.getItem(KEY).then(...)` (SenpaiMascot.tsx:369-379) has no `.catch`, and the inner `setItem` bypasses `safeStorageSet`; a failed version write re-clears the cache every cold start silently. *Fix:* add `.catch` + use `safeStorageSet`.

**#31 — Dead `.apng` metro extension (low, dead-code).** metro.config.js:12-14 registers `apng` with a comment claiming "We use APNG for the senpai mascot animations," but zero `.apng` files exist and the deliberate strategy is static PNG-per-mood. *Fix:* remove the `assetExts` block (or rewrite the comment as "currently unused").

**#34 — Bundled-but-unused assets (low, dead-code).** `senpai_think.png`, `senpai_wave.png` (requires commented out, SenpaiMascot.tsx:52-53) and `zenki_senpai_animations/*.webm` (raw Ziggle source, incl. dance/die which aren't enum moods). Not shipped (Metro only bundles `require`d assets), but they bloat the tree and `metadata.json` implies renderable moods that don't exist. *Fix:* keep the PNGs intentionally (comment is acceptable) or delete; move `zenki_senpai_animations/` to a tooling/ dir or `.easignore`.

### Subsystem: State validation & dialogue (latent risks)

**#22 — Memory hydration validates only `Array.isArray` (low, risk).** SenpaiContext.tsx:116-117 trusts element shape; a corrupt blob (`[{}]`) yields Invalid Date sections / undefined-mood rows in SenpaiMemoryScreen. *Fix:* element-aware predicate (`mood:string`, `dialogue:string`, `timestamp:number`); optionally filter to known moods. *Test:* seed a mixed array → assert only well-formed entries survive.

**#23 — `randomDialogue()` no empty-array guard (low, risk).** senpaiDialogue.ts:150-153 returns `options[Math.floor(...)]`, which is `undefined` for an empty array though typed `string`. Never fires today (all categories non-empty). *Fix:* `if (!options.length) return ''`. *Test:* per-key non-empty-string assertion + stubbed-empty returns `''`.

**#19 — Flash/impact ignore intensity settings (low, risk).** SenpaiScreenFlash.tsx:16-31 fires a full-screen pink flash on every navigation gated only on `state.enabled`; `ambientEffects`/`sparkleIntensity` are read only by SenpaiOverlay. "Ambient effects off" still flashes. *Fix:* gate the flash on `state.ambientEffects`; scale impact bursts by `sparkleIntensity`. *Test:* `ambientEffects=false` → assert opacity stays 0 on navKey change.

---

## 4. Prioritized fix sequence

### Ship-this-first set (the 5 highs — these ARE the complaint)

1. **#1 Bubble priority freeze (SenpaiMascot.tsx:763-775).** *Fix first* — highest impact, surgical. Reorder so an active reaction (`reactionExpiry > Date.now()`) outranks the stale `lastAssistantMsg?.content`, and clear the displayed reply when listening ends. This single change restores the entire reaction/personality engine's bubble (workout/PR/level-up/idle/sleep) and auto-fixes finding #3 and the visible half of #26. Low risk, no schema change.
2. **#3 Streak-broken-on-a-win (SenpaiReactionBridge.tsx:90-103).** Small, deterministic, actively insulting to returning users. Suppress when `totalSessions` also incremented. ~10 lines.
3. **#2 Multi-reaction stomp (SenpaiContext.tsx + ActivityTrackerScreen et al.).** Slightly larger. Prefer the lower-risk "bridge owns reactions, delete direct `senpaiTrigger` calls" route to avoid changing the timer/priority core. Verify no screen relies on the direct call for anything but the reaction.
4. **#4 Crisis-keyword pre-check (functions/src/senpaiChat.ts).** Safety regression vs. documented contract — ship in the same backend deploy as #6/#10 so functions only redeploy once. Self-contained guard, plus a client mirror. **Note:** keep keyword set conservative to avoid false positives.
5. **#5 TTS counter reset (useSenpaiChat.ts:175-182).** Literally one line (`if (on) ttsFailureCountRef.current = 0;`). Trivial impact-vs-effort; include in the first ship.

### Follow-ups (medium, batch by deploy target)

- **Backend / prompt (one functions deploy):** #6 de-dup app-knowledge block + correct themes/tabs/sound; #10 add `MOOD:` to few-shot examples; #16 share the production parser in the eval; #29 wrap rate-limit in try/catch. (#6 + #10 directly reduce "makes no sense" chat answers and stuck-idle moods.)
- **Theme/overlay leaks (client):** #7 + #8 — port the `cancelled` guard to MoonSparkle + the 4 SenpaiOverlay siblings (mechanical, copy the existing hardened sibling); #15 bridge restore off the `enabled` transition; #11 reset transient state on disable.
- **Perf / lifecycle:** #9 `useMemo` the context value; #25 gate the heavy hooks behind the enabled check.
- **Reaction polish:** #13 exempt milestones from volume gating; #14 reset `prev*Refs` on user change; #12 wire-or-delete hearts/flash; #20 don't re-fire celebrations on cold start; #21 greeting mood→`cheering`.
- **Validation hardening:** #22 element-shape memory predicate; #23 `randomDialogue` empty guard; #19 honor intensity settings in flash/impact.
- **Cleanup / comments:** #28, #27, #30, #31, #32, #33, #34, #24.

### Needs a product decision before coding

- **#17 `outfitId` (dead wardrobe feature):** wire up (Settings picker + `ANIM_ASSETS` keyed `${mood}_${outfitId}` + actual outfit art) **or** delete the persisted surface. No outfit assets exist today → **delete is the minimal correct fix** unless an outfit feature is on the roadmap.
- **#18 Close button / in-place dismiss:** is dismiss-in-place a desired affordance? If yes, wire `onLongPress`; if no, delete `showClose`/close-button/`hidden`.
- **#12 hearts/flash impact effects:** is the documented "hearts on workout complete" intended? Decide map-or-delete.
- **#34 think/wave moods + `.webm` source dir:** keep parked (intentional) or remove for bundle hygiene. `dance`/`die` in `metadata.json` should be explicitly marked non-shipped.

---

## 5. Rule-outs (do NOT churn on these)

- **`senpaiTheme` missing/undefined — FINE.** Registered in themes.ts (~243-275), typed as `ThemeColors` so tsc enforces full token coverage. `moon-sparkle` resolves to a real `MoonSparkle` renderer (ThemeOverlay.tsx:209-210) and `soundTheme:'senpai'` to a real handler. The theme swap correctly locks manual theme changes while Senpai is on. The *only* theme defects are the unmount leaks (#7/#8) and the fast-toggle race (#15) — not the theme definition.
- **Mood/asset mismatch — FINE.** All 7 `MascotMood` values map to real static PNGs in `ANIM_ASSETS` (SenpaiMascot.tsx:43-54). Bad mood strings are defended at the backend (`VALID_MOODS`) and client (`?? ANIM_ASSETS.idle`). A no-asset mood is not reachable. (The only mood collapse is *behavioral* — the few-shot `MOOD:` omission #10 makes the model emit no mood → parser falls to `idle` — not a missing asset.)
- **WebP regression — N/A and forbidden.** Assets are confirmed static PNG (`file` = "PNG image data"); the only remaining webp references are *comments* (#33) and the dead `.apng` metro extension (#31). Do **not** reintroduce animated WebP — it is the deliberate fix for the Apple-silicon black-box bug.
- **Asset cache bump — works, just inapplicable.** `@senpai_asset_cache_v`/`clearDiskCache` is the correct expo-image API; it's merely a no-op for bundled requires (#32). Bundled-asset bytes are already busted by every new binary. Not a render bug.
- **AI chat endpoint / token attach / memberId / abort / timeout — FINE.** The chat track found the endpoint, token attach, abort/timeout, and recoverable error states correctly engineered; the only real trap is the TTS counter (#5).
- **Dialogue wiring — FINE.** All 21 categories consumed, every fired key exists (tsc clean), backend moods validated to the 7 renderable values; bilingual mixing is intentional persona. Only #21 (tone/mood) and #23 (latent empty-array) remain.
- **The edgy/aggressive persona — INTENTIONAL.** Adults-only club. Not flagged. The personality findings are about *contradictions* (#6), *dropped-mood training* (#10), and a *missing safety control* (#4) — not tone.

---

## 6. Verification plan

**Static / typecheck (must stay green; non-Senpai screens must not change):**
- App: `npx tsc --noEmit` from repo root. Expect only the pre-existing `expo-task-manager` error noted in MEMORY — no new errors.
- Functions: `npm --prefix functions run build` (or `tsc --noEmit` in `functions/`) — must exit 0 (no predeploy build hook in firebase.json, so build manually before any deploy).
- `git diff --stat` sanity: confirm only Senpai files changed (`SenpaiMascot.tsx`, `SenpaiContext.tsx`, `SenpaiReactionBridge.tsx`, `SenpaiOverlay.tsx`, `ThemeOverlay.tsx`, `SenpaiThemeBridge.tsx`, `useSenpaiChat.ts`, `senpaiDialogue.ts`, `functions/src/senpaiChat.ts`, `functions/src/__evals__/runEval.ts`, `metro.config.js`) plus the specific call-site files for #2 (ActivityTracker/WeightTracker/Timer/WorkoutSession) and #21 (HomeScreen) — and that no other screen's behavior is touched.

**Unit / logic tests to add (per §3, the load-bearing ones first):**
- #1: SpeechBubble priority — active reaction beats stale chat line; expired reaction yields the fresh assistant message.
- #2: first-GPS-save → exactly one committed mood (highest priority), not 3 overlapping `triggerReaction` calls.
- #3: `prevStreak=5` + `recordSession` (sessions++ & streak→1 in one commit) → mascot ends `cheering`/neutral, not `disappointed`.
- #4: "I want to kill myself" → hardcoded crisis payload, `client.messages.create` never called; "kill this workout" passes through.
- #5: 2 TTS failures → voice off + no fetch; `setVoiceEnabled(true)` → `ttsFailureCountRef===0` and next send reaches `fetchSenpaiAudio`.
- #6: SYSTEM_PROMPT contains `# About the app`/`Bottom tabs` at most once and every `ALL_THEMES` name.
- #7/#8: mount → advance past delay → unmount → no further `Animated.timing/sequence.start`.
- #10/#16: extend runEval to assert `parsed.mood` non-null across cases and route fixtures through the shared production parser.

**Backend eval gate:** run `runEval.ts` twice after #6/#10/#16 — contradiction/flakiness between runs signals the dual-block or missing-MOOD issues persist. The self-harm case (runEval.ts:63) should now be intercepted before the model.

**On-device (iPhone + iPad, Senpai enabled):**
1. **#1 bubble:** chat once, wait past the reply window, then complete a workout / hit a PR — bubble must show the *reaction* line (e.g. "GZ on the PR 💕"), and idle ~105s must show "zzz…" not the stale chat reply. The mood image and bubble text must agree.
2. **#2/#3:** do a first GPS activity — one coherent reaction, not flicker. After a missed-day streak reset, logging a workout must NOT greet with disappointment.
3. **#5 TTS:** force 2 TTS failures (flaky/quota), open the chat modal in voice mode, send again — audio must play (or, if still failing, fail gracefully) rather than silent-forever.
4. **#7/#8 leaks:** toggle Senpai on/off ~10× and run a few reactions; profile for accumulating orphaned Animated timers — count should stay flat, not climb.
5. **#15 theme:** rapid enable→disable on the Senpai toggle — must always restore the prior theme; relaunch must not be stuck on `senpai`.
6. **#9 perf:** with React DevTools profiler, an idle→sleep mood tick must not re-render TabNavigator / the active screen body.
7. **Regression sweep:** confirm Community/feed, Schedule, Store, Workout, and Profile screens render and behave identically with Senpai both on and off — no theme bleed, no extra re-renders, no changed copy.

**Deploy note (from MEMORY):** #4/#6/#10/#16/#29 require `npm --prefix functions run build` **then** `firebase deploy --only functions`; client-only fixes need an EAS rebuild. Pull local `main` first — it has historically lagged the GitHub merge, and a stale tree silently ships old function code.

---

Key source files referenced (all absolute):
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/components/SenpaiMascot.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/context/SenpaiContext.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/components/SenpaiReactionBridge.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/components/SenpaiOverlay.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/components/ThemeOverlay.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/components/SenpaiThemeBridge.tsx`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/hooks/useSenpaiChat.ts`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/functions/src/senpaiChat.ts`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/functions/src/__evals__/runEval.ts`
- `/Users/mbrown/Desktop/Zenki-App/.claude/worktrees/nostalgic-elbakyan-45ab7d/src/context/GamificationContext.tsx`

---

## 7. §3 Gotcha verdict checklist (per the audit brief)

Every pre-identified suspect from the audit prompt §3, with a verdict and evidence:

| # | Suspect | Verdict | Evidence |
|---|---------|---------|----------|
| 3.1 | Theme not registered (HIGH suspect) | ❌ **RULED OUT** | `senpaiTheme` registered + typed `ThemeColors` (themes.ts:243-275); `moon-sparkle` + `soundTheme:'senpai'` resolve to real renderers/handlers. Theme is NOT the broken-visuals cause. Only theme defects are unmount leaks (#7/#8) + fast-toggle race (#15). |
| 3.2 | Mood↔asset mismatch / dead moods | ❌ **RULED OUT** (rendering) | All 7 `MascotMood` values map to real PNGs (SenpaiMascot.tsx:43-54); bad strings defended (backend `VALID_MOODS` + client `?? ANIM_ASSETS.idle`). ⚠️ BUT a *behavioral* mood collapse is real: #10 (few-shot omits `MOOD:`) trains the model to drop mood → parser falls back to `idle`. |
| 3.3 | `outfitId` stored but never rendered | ✅ **CONFIRMED dead** (#17, medium) | Persisted/hydrated/settable but `setOutfit` has 0 callers and renderer never reads it. **Product decision: delete (no outfit assets exist) vs wire up.** |
| 3.4 | WebP→PNG / cache version | ❌ **RULED OUT** (no regression) | Assets confirmed static PNG; `@senpai_asset_cache_v='7'` correct API but a **no-op for bundled `require()`d PNGs** (#32, low); stale "webp" comment (#33, low). No WebP to reintroduce. Cleanup only. |
| 3.5 | AI chat reachability / auth | ❌ **RULED OUT** | Endpoint, Firebase token attach, abort/timeout, recoverable errors all correctly engineered. The only chat trap is TTS (see 3.6). |
| 3.6 | TTS auto-disable loop | ✅ **CONFIRMED** (#5, high) | After 2 failures `ttsFailureCountRef` sticks at 2; the success-reset is downstream of the gate; `resetTtsFailures()` is reachable ONLY from Settings, NOT the chat modal's re-enable → voice silently dead all session. **One-line fix.** |
| 3.7 | Personality coherence & safety | ✅ **CONFIRMED** (3 issues) | #4 documented crisis-keyword pre-check **does not exist** (safety regression, high); #6 two contradictory "About the app" blocks with wrong theme/tab/sound facts (medium); #10 few-shot omits mandatory `MOOD:` (medium). Edginess NOT flagged (intentional). Backend mood validation to the 7 renderable moods is sound. |
| 3.8 | `triggerReaction` persistence race (memoryLog) | ❌ **REFUTED / RULED OUT** | The state finder flagged this as a *critical* "every reaction overwrites memoryLog with [] (deferred-updater race)" — **adversarial verification refuted it from source and it was dropped** (1 of 2 dropped findings; not in the surviving set; 0 critical survive). Memory persistence is NOT corrupting. Do not churn on it. |
| 3.9 | Reaction timing / coherence | ✅ **CONFIRMED — a core root cause** | #2 one event → 2-3 conflicting reactions stomp each other (high); #3 streak-broken fires on a WIN (high); #13 volume gating randomly drops milestones (medium); #14 cross-account spurious "NEW PR!" (medium). This is Root Cause B. |

**Net:** of the 9 named suspects, **4 confirmed real** (#3.3, 3.6, 3.7, 3.9), **5 ruled out** (#3.1, 3.2-rendering, 3.4, 3.5, 3.8). The two HIGH-suspect leads (theme-missing #3.1, memory-race #3.8) were **both refuted** — the real headline is the **speech-bubble priority freeze** (Root Cause A), which the brief did not anticipate.

---

## Baselines (this worktree, captured before any change)
- **App `tsc --noEmit`: GREEN** (no errors).
- **Functions `tsc --noEmit`: GREEN** after `npm ci` (worktree initially lacked `functions/node_modules`; the first run's "cannot find module" errors were that, not type errors).
- **No code was modified** — this is a read-only investigation per the audit guardrails.
