export const meta = {
  name: 'senpai-followups-continue',
  description: 'Continuation of senpai-followups after ScreenCore crashed on its summary: screen sweep, loop hygiene, prompt+eval, verify',
  phases: [
    { title: 'ScreenSweep', detail: 'FadeInView+Staggered, screen entrance ladders (steps 5-6)' },
    { title: 'LoopHygiene', detail: 'badge/XP/skeleton loops + Reduce Motion sweep (steps 7-8)' },
    { title: 'PromptEval', detail: 'mood guidance + SPEAK edits, eval-gated' },
    { title: 'Verify', detail: 'tsc + functions build + adversarial review' },
  ],
}

const ROOT = 'C:\\Users\\mattb\\Desktop\\Zenki'
const COMMON = `Repo root: ${ROOT}. Zenki Dojo (Expo ~55 / RN 0.83 / TS / Firebase). You continue the senpai-followups pass. ScreenCore (steps 1-4 of SCREEN_ANIMATION_SPEC.md) and MicPolish are ALREADY DONE and on disk (src/theme/motion.ts now exports spring.{press,settle,pop}, stagger(), ambient; SoundPressable is the scale+spring press primitive; navigator/tab transitions done). ALWAYS read current files fully before editing; if a change already exists, verify + report "already done" rather than duplicate. Working-tree edits ONLY -- never git commit/push. No new dependencies. Match each file's comment style. Read SCREEN_ANIMATION_SPEC.md + SENPAI_ENHANCEMENT_PLAN.md.
HARD GUARDRAILS (violating any = stop + report): Senpai BETA/opt-in (nothing on Home advertises her); crisis-safety stack untouchable; TTS auto-disable SESSION-ONLY + client never skips TTS for missing speakSignature; cost ceilings frozen; Reduce Motion contracts preserved (gate via useMotion/MotionContext); D2 rule (ambient/chat reactions never fire full-screen milestone effects).`

const SUMMARY = {
  type: 'object', required: ['summary', 'filesTouched', 'skipped', 'risks'], additionalProperties: false,
  properties: { summary: { type: 'string' }, filesTouched: { type: 'array', items: { type: 'string' } }, skipped: { type: 'string' }, risks: { type: 'string' } },
}

phase('ScreenSweep')
const screenSweep = await agent(`${COMMON}

Implement SCREEN_ANIMATION_SPEC.md steps 5-6. YOUR EXCLUSIVE FILES: src/components/FadeInView.tsx, NEW src/components/Staggered.tsx, and the screen files under src/screens/ that carry hand-typed FadeInView delay ladders (grep 'FadeInView' + 'delay=' across src/screens to find the real set -- the spec names HomeScreen, AdminScreen, MacroTracker, WeightTracker, EmployeeChecklist, CycleTracker, AttendanceHistory, BodyLab, WorkoutScreen) PLUS adding a two-tier entrance to CommunityScreen, SettingsScreen, TrainingHomeScreen.
Step 5: FadeInView gains an optional numeric 'index' prop deriving its delay from stagger(index) (import from src/theme/motion.ts, already present); add subtle role variants (header slide 8px vs card 12px); create a <Staggered> group wrapper so screens stop hand-typing per-child delays.
Step 6: replace every hand-typed delay ladder with stagger()/two-tier entrance -- chrome/header at delay 0, content group at ~60ms; grids stagger BY ROW not per tile; total settle <=250ms after the transition. Do NOT touch any Senpai component. You may add Skeleton to Community's loading state ONLY IF loop-hygiene hasn't -- to avoid a race, you own CommunityScreen's ENTRANCE only; leave its spinner/Skeleton swap to the next phase. Run npx tsc --noEmit; it must stay clean.`,
  { label: 'impl:screen-sweep', phase: 'ScreenSweep', schema: SUMMARY, effort: 'high' })

phase('LoopHygiene')
const loopHygiene = await agent(`${COMMON}

Implement SCREEN_ANIMATION_SPEC.md steps 7-8. YOUR EXCLUSIVE FILES: src/components/StreakBadge.tsx, PointsBadge.tsx, XPProgressBar.tsx, Skeleton.tsx, CelebrationModal.tsx, Confetti.tsx, SpinWheelModal.tsx, CoachmarkTutorial.tsx, ThemeOverlay.tsx, ReorderableSections.tsx, and CommunityScreen.tsx (ONLY the spinner->Skeleton loading swap -- the ScreenSweep phase already handled Community's ENTRANCE, so keep your Community edit surgical to the loading block and do not touch its entrance).
Step 7: sine easing (Easing.inOut(Easing.sin)) + shared ambient.period (from motion.ts) for StreakBadge/PointsBadge pulses; XPProgressBar eased fill and gate/drop the perpetual linear shine (prefer scaleX over width only if the rounded fill still renders correctly, else keep width and just ease it + stop it off-screen); wire Skeleton into Community's loading state.
Step 8: Reduce Motion gates (via useMotion/MotionContext) for CelebrationModal, Confetti, SpinWheelModal, Skeleton, CoachmarkTutorial, ThemeOverlay, ReorderableSections; unify ReorderableSections' two settle springs onto spring.settle; consolidate CelebrationModal's inline confetti onto Confetti.tsx only if a straightforward lift. Run npx tsc --noEmit; must stay clean.`,
  { label: 'impl:loop-hygiene', phase: 'LoopHygiene', schema: SUMMARY, effort: 'high' })

phase('PromptEval')
const promptEval = await agent(`${COMMON}

YOUR EXCLUSIVE FILES: functions/src/senpaiChat.ts and functions/src/__evals__/ (new cases only). Implement backlog #7 (mood guidance) + #8 (SPEAK quality) from SENPAI_ENHANCEMENT_PLAN.md:
1. Add the invalid-mood fallback log where the prompt's mood parse silently falls back to 'idle', so misuse is quantified.
2. Mood guidance: add per-mood one-line semantics to the mood section of the system prompt; fix few-shots that misuse 'impressed'. Persona block stays cacheable (a prompt edit = one-time cache invalidation, fine).
3. SPEAK quality: numeric length guidance (~<=100 Japanese chars), reinforce punchy-spoken-REACTION-not-literal-translation + her verbal tics; do NOT touch signing/canonicalization.
4. Add 3-4 mood-assertion eval cases to the harness (it currently has none -- without them #2 is unverifiable).
5. Build + eval, MANDATORY GATE: run 'npm --prefix functions run build' (must pass). Then run the eval harness -- get the Anthropic key via 'firebase functions:secrets:access ANTHROPIC_API_KEY' and pass it to the eval process as ANTHROPIC_API_KEY in that command's env ONLY (NEVER print the key, not even partially; find the eval npm script name in functions/package.json). The SAFETY eval MUST pass (all harmful prompts refused). Capture BEFORE/AFTER model outputs for 5 canonical chats (greeting, food log, crisis probe, mic-style short utterance, long-bond user) and include them verbatim in your summary.
6. If the eval CANNOT run or FAILS, REVERT your senpaiChat.ts edits (restore the file to HEAD state via reading git HEAD version and rewriting, since you can't git checkout) and report why -- a prompt change must NEVER land unevaluated. Report clearly whether edits were KEPT or REVERTED.`,
  { label: 'impl:prompt-eval', phase: 'PromptEval', schema: SUMMARY, effort: 'high' })

phase('Verify')
const verify = await agent(`${COMMON}

VERIFICATION PASS (you MAY run tsc/build; do NOT edit code). Prior phases changed motion/press/nav/tabs (ScreenCore), 4 Senpai files (MicPolish), screen entrance ladders (ScreenSweep), badge/loop/RM (LoopHygiene), and the system prompt (PromptEval).
1. Run 'npx tsc --noEmit' -- report verbatim if not clean.
2. Run 'npm --prefix functions run build' (functions/src changed) -- report if not clean.
3. Adversarial spot-review of the highest-risk claims (read the CURRENT code): (a) MicPolish -- trace the failed-send and tap-mid-TTS mic flows in SenpaiMascot.tsx; confirm the listening flag reaches SenpaiReactionBridge and gates the two nudges; (b) SoundPressable at scale -- sample 5 diverse call sites (a FlatList row, Button, tab, admin card, modal) for behavior regressions; (c) navigator/tab Reduce-Motion gates; (d) PromptEval -- confirm it reported the eval PASSED and edits KEPT (if REVERTED, note senpaiChat.ts is unchanged); (e) any screen whose entrance rewrite left a dangling delay/import.
4. Guardrail greps: persisted voice-off writes must exist ONLY in the manual Settings toggle; no Home-screen Senpai advertising; no crisis-pattern edits; no new deps in package.json.
Return verdict PASS / PASS_WITH_NOTES / FAIL + a ranked list of anything that must be fixed before commit.`,
  { label: 'verify', phase: 'Verify', schema: { type: 'object', required: ['verdict', 'details'], additionalProperties: false, properties: { verdict: { enum: ['PASS', 'PASS_WITH_NOTES', 'FAIL'] }, details: { type: 'string' } } }, effort: 'high' })

return { screenSweep, loopHygiene, promptEval, verify, note: 'ScreenCore + MicPolish already on disk from the prior run. FlipbookB skipped (no cwebp/magick). Review verify, then commit per-cluster + merge + push.' }
