export const meta = {
  name: 'senpai-followups',
  description: 'Run the remaining Senpai 2.0.5+ enhancements: mic polish + P2 fixes, screen-motion implementation, prompt/eval edits, flipbook Phase B',
  whenToUse: 'When the owner says to run the senpai follow-ups. Makes working-tree edits only — review + commit happens after.',
  phases: [
    { title: 'Preflight', detail: 'tooling + secret availability checks (gates later phases)' },
    { title: 'MicPolish', detail: 'mic P2 fixes, listening flag, voice-end, misheard handling' },
    { title: 'ScreenCore', detail: 'motion tokens, press primitive, navigator + tab transitions' },
    { title: 'ScreenSweep', detail: 'stagger system + screen ladder sweep; loop hygiene + RM sweep' },
    { title: 'PromptEval', detail: 'mood guidance + SPEAK edits, eval-gated (skips without API key)' },
    { title: 'FlipbookB', detail: 'asset regen 24fps/420px grids (skips without ffmpeg/cwebp)' },
    { title: 'Verify', detail: 'tsc + adversarial review of everything changed' },
  ],
}

const ROOT = 'C:\\Users\\mattb\\Desktop\\Zenki'

const COMMON = `Repo root: ${ROOT}. Zenki Dojo (Expo ~55 / RN 0.83 / TS / Firebase). You are one phase of the saved "senpai-followups" workflow. The working tree may have drifted since this workflow was written — ALWAYS read the current files fully before editing, and if a change you're asked to make already exists, verify it and report "already done" instead of duplicating it. Make working-tree edits only: NEVER run git add/commit/push. Do not create new dependencies. Match each file's comment style (why-comments). Reference docs in the repo root: SENPAI_ENHANCEMENT_PLAN.md (ranked plan + guardrails) and SCREEN_ANIMATION_SPEC.md (screen-motion spec).
HARD GUARDRAILS (from the plan; violating any = stop and report instead): Senpai stays BETA/opt-in (nothing on Home advertises her); crisis-safety stack untouchable; TTS auto-disable stays SESSION-ONLY and the client never skips TTS for missing speakSignature; cost ceilings frozen (tool-gated stats, uncached bond block, TTS 2000-char/day + 300-char/request, per-uid rate limits, 60-turn cap / 40-window); Reduce Motion contracts preserved; D2 rule (ambient/chat reactions never fire full-screen milestone effects).`

const SUMMARY = {
  type: 'object', required: ['summary', 'filesTouched', 'skipped', 'risks'], additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    skipped: { type: 'string' },
    risks: { type: 'string' },
  },
}

// ─── Preflight: what can this environment actually run? ───
phase('Preflight')
const preflight = await agent(`${COMMON}

Check (read-only, no edits) and report EXACTLY these facts as JSON-ish text:
1. ffmpeg, magick (ImageMagick), and cwebp availability on PATH (run each with -version via Bash; on this Windows box they may be absent).
2. Whether zenki_senpai_animations/transparent/ exists and what source clips it contains (names + sizes).
3. Whether functions/.env exists and contains SENPAI_TTS_REQUIRE_SIGNATURE.
4. Whether an Anthropic API key is reachable for the eval harness: check env ANTHROPIC_API_KEY, and if absent try 'firebase functions:secrets:access ANTHROPIC_API_KEY' (report only WHETHER it returned a value — NEVER print the key itself, not even partially).
5. Current git branch and whether the four Senpai component files + senpaiDialogue/bridge/bond are clean or locally modified.`,
  { label: 'preflight', phase: 'Preflight', model: 'sonnet', schema: { type: 'object', required: ['report', 'hasImageTooling', 'hasEvalKey'], additionalProperties: false, properties: { report: { type: 'string' }, hasImageTooling: { type: 'boolean' }, hasEvalKey: { type: 'boolean' } } } })
log(`preflight: imageTooling=${preflight.hasImageTooling} evalKey=${preflight.hasEvalKey}`)

// ─── Mic polish + P2 fixes (exclusive: SenpaiMascot.tsx, useSenpaiChat.ts, SenpaiContext.tsx, SenpaiReactionBridge.tsx, senpaiDialogue.ts) ───
phase('MicPolish')
const micPolish = await agent(`${COMMON}

YOUR EXCLUSIVE FILES: src/components/SenpaiMascot.tsx, src/hooks/useSenpaiChat.ts, src/context/SenpaiContext.tsx, src/components/SenpaiReactionBridge.tsx, src/data/senpaiDialogue.ts. Read all five fully first. Implement:

1. P2 FIX — stuck listening after failed send: in SenpaiMascot's STT 'end' handler (~L232 region), when the captured transcript triggers sendChat but the send FAILS (chat error state), 'listening' can remain true with no active recognizer — trace the actual current flow and make failure paths either re-arm STT or cleanly flip listening off (visual + ref), matching whichever the UX intends (prefer: flip off + show the error bubble; the user re-taps).
2. P2 FIX — self-transcription guard: activateListening (~L992 region) must refuse (or defer) while ttsPlaying is true, so she never transcribes her own voice when the user taps the mic mid-reply. The post-reply re-arm effect already waits on ttsPlaying — mirror that.
3. LISTENING FLAG: expose a read-only 'listening' boolean from SenpaiContext (mascot writes it via a setter kept out of the public type, or a paired internal setter — follow the context's existing patterns). Then gate the welcomeBack and streakAtRisk nudges in SenpaiReactionBridge on !listening (this closes the review MEDIUM from the dialogue pass).
4. NUDGE COLLISION: welcomeBack and streakBroken can both schedule at ~3.5s on the same open; the coalesce keeps one bubble but the loser's ack is burned. Fix minimally: when a streak-break line fires for this open, skip scheduling welcomeBack for the same open (do not burn its ack) — or stagger welcomeBack to 8s for that case. Preserve once-per-absence semantics.
5. VOICE-DRIVEN GOODBYE: when a final mic transcript is a goodbye intent (regex on: bye/goodbye/bye bye/see you/later senpai/oyasumi/good night + senpai variants — keep conservative to avoid false positives mid-sentence: match only if the WHOLE trimmed transcript is <= ~5 words and contains a goodbye token), do NOT send to the model: stop listening, play a goodbye line from a NEW small pool 'micGoodbye' (5 lines, canon voice — soft possessive sign-off, e.g. lowercase chaos + 'MINE 💕' closers; add to senpaiDialogue.ts), and collapse the dock if open. Zero tokens spent on goodbyes.
6. MISHEARD HANDLING: when STT 'end' fires with a NON-empty transcript that the send path rejects as garbage, or empty after the user clearly held the mic (list what signals exist — do the minimal honest version): show a scripted "didn't catch that" line from a NEW pool 'micMisheard' (4 lines, canon voice, self-deprecating not user-blaming) instead of dead silence, and re-arm per the existing loop.
Keep every existing TTS invariant (session-only auto-disable; no client speakSignature skip). tsc must stay clean (you may run npx tsc --noEmit).`,
  { label: 'impl:mic-polish', phase: 'MicPolish', schema: SUMMARY, effort: 'high' })

// ─── Screen motion core (exclusive: motion.ts, SoundPressable, PressableScale, Button, RootNavigator, TabNavigator, AnimatedTabIcon) ───
phase('ScreenCore')
const screenCore = await agent(`${COMMON}

Implement SCREEN_ANIMATION_SPEC.md steps 1-4 EXACTLY as specified there (read the spec first, it has file:line targets). YOUR EXCLUSIVE FILES: src/theme/motion.ts, src/components/SoundPressable.tsx, src/components/PressableScale.tsx, src/components/Button.tsx, src/navigation/RootNavigator.tsx, src/navigation/TabNavigator.tsx, src/components/AnimatedTabIcon.tsx — plus the ~19 files carrying ad-hoc activeOpacity overrides (grep and normalize them; those one-line prop deletions are yours too).
Step 1: spring tokens {press, settle, pop} + stagger() helper + ambient.period in motion.ts; duration.standard 300->250; delete unused overshoot.
Step 2: SoundPressable becomes THE press primitive — scale to the existing scale.pressed token on press-in (duration.instant, decelerate), spring.press release, opacity dim softened to 0.9, Reduce Motion -> opacity-only; alias/fold PressableScale into it (keep its export as a thin alias so its 2 call sites don't break); remove scattered activeOpacity overrides.
Step 3: RootNavigator — crossfade opacity map [0,1]->[0,1] @ 250-300ms; push OPEN uses stack v7 {animation:'spring'} with spring.settle char, close stays timing/accelerate; replace the hardcoded 300ms literals with tokens; gate all transitionSpecs on the MotionContext reduce-motion flag with short-fade fallbacks.
Step 4: TabNavigator animation:'shift'; pin the icon size prop (no 24->28 layout pop) and animate scale via the existing focus spring in AnimatedTabIcon; sine-ease AnimatedTabIcon's senpai bounce/sparkle loops.
Verify each edit against the CURRENT file (the spec's line numbers may have drifted). tsc must stay clean.`,
  { label: 'impl:screen-core', phase: 'ScreenCore', schema: SUMMARY, effort: 'high' })

// ─── Screen sweep + polish, parallel (disjoint file sets) ───
phase('ScreenSweep')
const [screenSweep, loopHygiene] = await parallel([
  () => agent(`${COMMON}

Implement SCREEN_ANIMATION_SPEC.md steps 5-6 (read the spec + the just-updated src/theme/motion.ts for the stagger() helper and tokens). YOUR EXCLUSIVE FILES: src/components/FadeInView.tsx, NEW src/components/Staggered.tsx, and the screen files under src/screens/ that carry hand-typed entrance delay ladders (the spec names HomeScreen, AdminScreen, MacroTracker, WeightTracker, EmployeeChecklist, CycleTracker, AttendanceHistory, BodyLab, WorkoutScreen — grep FadeInView delay= across src/screens to find the real current set) plus adding the two-tier entrance to CommunityScreen, SettingsScreen, TrainingHomeScreen.
Step 5: FadeInView gains an optional index prop deriving delay from stagger(); subtle variants (header slide 8px vs card 12px); a <Staggered> group component so screens stop hand-typing delays.
Step 6: replace every hand-typed ladder with stagger()/two-tier entrance (chrome at 0, content group ~60ms; grids stagger BY ROW; total settle <= 250ms after transition). Do NOT touch Senpai components. tsc clean when done.`,
    { label: 'impl:screen-sweep', phase: 'ScreenSweep', model: 'sonnet', schema: SUMMARY, effort: 'high' }),
  () => agent(`${COMMON}

Implement SCREEN_ANIMATION_SPEC.md steps 7-8. YOUR EXCLUSIVE FILES: src/components/StreakBadge.tsx, PointsBadge.tsx, XPProgressBar.tsx, Skeleton.tsx, CelebrationModal.tsx, Confetti.tsx, SpinWheelModal.tsx, CoachmarkTutorial.tsx, ThemeOverlay.tsx, ReorderableSections.tsx, and CommunityScreen.tsx ONLY for wiring Skeleton into its loading state (coordinate: the screen-sweep agent owns CommunityScreen's ENTRANCE; you own only the spinner->Skeleton swap — keep your edit surgical to that block).
Step 7: sine easing + shared ambient.period for the badge pulses; XPProgressBar eased fill and gate/drop the perpetual linear shine (prefer scaleX over width if the rounded fill still renders correctly, else keep width and just ease it); wire Skeleton into Community's loading state.
Step 8: Reduce Motion gates (via the MotionContext flag) for CelebrationModal, Confetti, SpinWheelModal, Skeleton, CoachmarkTutorial, ThemeOverlay, ReorderableSections; unify ReorderableSections' two settle springs onto spring.settle; consolidate CelebrationModal's inline confetti onto Confetti.tsx if it is a straightforward lift. tsc clean when done.`,
    { label: 'impl:loop-hygiene', phase: 'ScreenSweep', model: 'sonnet', schema: SUMMARY, effort: 'high' }),
])

// ─── Prompt edits + eval (skips without a key) ───
phase('PromptEval')
let promptEval = null
if (preflight.hasEvalKey) {
  promptEval = await agent(`${COMMON}

YOUR EXCLUSIVE FILES: functions/src/senpaiChat.ts (and functions/src/__evals__/ if the harness needs new cases). Implement backlog items #7 + #8 from SENPAI_ENHANCEMENT_PLAN.md:
1. FIRST pull real mood telemetry if cheaply possible (senpaiUsage logs mood per turn — check if a quick Firestore query script is feasible with available creds; if not, note it and proceed on the few-shot evidence in the plan).
2. Add the invalid-mood fallback log (the silent 'idle' fallback) so misuse is quantified.
3. Mood guidance: add per-mood one-line semantics to the mood section of the system prompt; fix the few-shots that misuse 'impressed'. Keep the persona block cacheable (edit = one-time cache invalidation, fine).
4. SPEAK quality: numeric length guidance (~<=100 Japanese chars), punchy-spoken-reaction-not-translation reinforcement, verbal tics; do NOT touch signing/canonicalization.
5. Add 3-4 mood-assertion eval cases (the harness has none — without them item 3 is unverifiable).
6. Run: npm --prefix functions run build (must pass), then the eval harness (get the key the way preflight did — NEVER print it; pass via env to the process). The safety eval MUST pass (8/8 refusals). Capture BEFORE/AFTER outputs for the 5 canonical chats (greeting, food log, crisis probe, mic-style short utterance, long-bond user) — include them verbatim in your summary for the owner.
If the eval cannot run (key/env failure), REVERT your prompt edits (working tree restore of the file) and report why — prompt changes must never land unevaluated.`,
    { label: 'impl:prompt-eval', phase: 'PromptEval', schema: SUMMARY, effort: 'high' })
} else {
  log('PromptEval SKIPPED — no Anthropic key reachable; run later with ANTHROPIC_API_KEY available')
}

// ─── Flipbook Phase B (skips without tooling) ───
phase('FlipbookB')
let flipbookB = null
if (preflight.hasImageTooling) {
  flipbookB = await agent(`${COMMON}

YOUR EXCLUSIVE FILES: scripts/build-senpai-flipbooks.sh, src/components/SenpaiFlipbook.tsx, src/components/senpaiMoodAssets.ts, src/assets/senpai/** and SenpaiMascot.tsx ONLY if the cache-version constant lives there. Implement Phase B per SENPAI_ENHANCEMENT_PLAN.md §1.3:
- Build script: FPS 12->24, frame size 280->420px, output as row GRIDS (e.g. 3 rows, keep every dimension < 8192px — assert it in-script), seam fix (ping-pong or last->first blend), include the dance clip as an idle variant strip.
- SenpaiFlipbook: add row-step translateY to the staircase (same interpolate-node technique; read the file header for the 120Hz rationale and preserve it).
- senpaiMoodAssets: new _v2 filenames + frames/fps/grid metadata; bump the @senpai_asset_cache_v constant (twin rule — read the header comment).
- Regenerate the strips by RUNNING the build script against zenki_senpai_animations/transparent/ (bash). Verify per-strip size (report total asset weight; flag if any strip > 800KB).
- Wire 'dance' as a RARE idle variant (e.g. every Nth idle loop) in the mascot's art selection if that lives in senpaiMoodAssets/SenpaiFlipbook; if it requires SenpaiMascot changes beyond the cache constant, DESCRIBE the change in your summary instead of making it (that file belongs to MicPolish this run).
tsc clean when done.`,
    { label: 'impl:flipbook-b', phase: 'FlipbookB', schema: SUMMARY, effort: 'high' })
} else {
  log('FlipbookB SKIPPED — ffmpeg/magick/cwebp not all available on this machine; install them (e.g. winget install ffmpeg + libwebp) and re-run')
}

// ─── Verify everything ───
phase('Verify')
const verify = await agent(`${COMMON}

VERIFICATION PASS (read-only except nothing — do not edit). The phases above changed: ${JSON.stringify([micPolish, screenCore, screenSweep, loopHygiene, promptEval, flipbookB].filter(Boolean).flatMap(r => r.filesTouched))}.
1. Run npx tsc --noEmit — must be clean (report verbatim output if not).
2. Run npm --prefix functions run build IF functions/src changed.
3. Adversarial spot-review of the highest-risk claims: (a) mic P2 fixes — trace failed-send and tts-playing tap flows in the CURRENT code; (b) listening gate actually reachable in the bridge; (c) SoundPressable change — sample 5 diverse call sites (FlatList row, Button, tab, admin card, modal) for visual/behavioral regressions; (d) navigator RM gates; (e) if Phase B ran: grid math (frames x cols/rows vs image dimensions), version-bump twin rule followed.
4. Check no guardrail regressions: grep for persisted voice-off writes (must only exist in the manual Settings toggle), Home-screen Senpai advertising, crisis-pattern edits.
Return: PASS/FAIL per area + a ranked list of anything that must be fixed before commit.`,
  { label: 'verify', phase: 'Verify', schema: { type: 'object', required: ['verdict', 'details'], additionalProperties: false, properties: { verdict: { enum: ['PASS', 'PASS_WITH_NOTES', 'FAIL'] }, details: { type: 'string' } } }, effort: 'high' })

return {
  preflight: preflight.report,
  micPolish, screenCore, screenSweep, loopHygiene,
  promptEval: promptEval || 'SKIPPED (no eval key)',
  flipbookB: flipbookB || 'SKIPPED (no image tooling)',
  verify,
  note: 'Working-tree edits only — nothing committed. Review the verify verdict, then commit per-cluster (mic polish / screen motion / prompt / flipbook) and push.',
}
