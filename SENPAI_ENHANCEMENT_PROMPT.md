# PROMPT — Senpai Character Enhancement (2.0.5+)

Copy everything below into a fresh Claude Code session at `C:\Users\mattb\Desktop\Zenki`.

---

You are enhancing **Senpai** (インスタのビッチ), the AI mascot of Zenki Dojo (Expo/RN/TS/Firebase). She is a chaotic-feral, kawaii magical-girl gym companion: loud, possessive, ride-or-die about your training, bilingual — **English text bubbles, Japanese spoken voice** (ElevenLabs "Hina" voice `lhTvHflPVOqgSWyuWQry`, model `eleven_flash_v2_5`, tuned stability 0.30 / style 0.55). Your job: make her feel MORE alive, more personal, and more consistent — without breaking the guardrails below. Work on a branch off `main`; "commit" always means commit AND push.

## Where she lives (read all of this first)
- `src/components/SenpaiMascot.tsx` — floating mascot: flipbook animation, moods, idle quips, sleep, walkie-talkie mic (STT), talk-pulse while TTS plays, chat dock.
- `src/context/SenpaiContext.tsx` — enable state, `MascotMood`, `triggerReaction`, bond state + `recordBondEvent`/`addBondFact`.
- `src/hooks/useSenpaiChat.ts` — shared chat thread, send() pipeline, TTS gate, client-executed actions (log_food / remove_food / set_goal / remember_fact).
- `src/data/senpaiDialogue.ts` — scripted dialogue pools (greetings, reactions, seasonal). `src/services/senpaiBond.ts` — bond summary, FACT_CAP.
- `functions/src/senpaiChat.ts` — the system prompt (her personality lives here), speakText/speakSignature minting, crisis handling, tool definitions, 60-turn cap.
- `functions/src/senpaiSpeak.ts` — TTS endpoint (rate-limited, 2,000-char/day global budget via `config/senpaiTts`, 300-char per-request cap).
- `functions/src/__evals__/runEval.ts` — the eval harness. Personality/safety changes MUST keep the safety eval passing.
- Design history: `SENPAI_MASCOT_AUDIT.md`, `SENPAI_AI_CHAT_PROMPT.md` if present.

## Hard guardrails (violating any of these is a blocker)
1. **Senpai is BETA and opt-in.** She is enabled ONLY via Settings. Never advertise her on Home or auto-enable her — the first-run Home banner was deliberately removed in 2.0.4; do not reintroduce anything like it.
2. **Safety stack is untouchable:** client + server crisis patterns and the fixed crisis reply, the "not a doctor" framing, the one-time disclaimer accept. She may be feral; she may never give medical advice or handle self-harm herself.
3. **Voice-fix invariants (branch `fix/senpai-voice`, merge or rebase onto it):** TTS auto-disable stays SESSION-ONLY (never persist voice-off except a manual Settings toggle), and the client never locally skips TTS for a missing speakSignature — the server decides.
4. **Cost ceilings stay:** prompt-cache discipline (user stats stay tool-gated via `get_user_stats`; bond summary rides in its own uncached block), TTS daily char budget + 300-char speak cap, per-uid rate limits, ≤60-turn threads windowed to 40. Enhancements must not blow up tokens or TTS characters per interaction.
5. Adults-only club context (SOCIAL_CONTRACT §8): flirty-chaotic is in-character; explicit content is not.

## Enhancement directions (prioritize impact; propose before building big items)
1. **Deeper bond usage** — she remembers facts (FACT_CAP'd) and day-count, but barely USES them: reference remembered facts naturally in greetings/quips, mark milestones (day 7/30/100, streak saves, PRs), let long-bond users unlock warmer/softer moods she never shows strangers.
2. **Richer scripted dialogue** — expand `senpaiDialogue.ts` pools (time-of-day, day-of-week, post-workout vs rest-day, seasonal gaps), so idle quips repeat far less. Keep every line in-voice: feral, devoted, gym-obsessed, emoji-heavy but not saccharine.
3. **Smarter reactivity** — she reacts to workouts/meals logged, but consider: streak-at-risk nudges (evening, streak about to break), welcome-back after absence (tie to `daysSinceLastWorkout`), belt-promotion detection. Everything opt-in-feeling, never nagging — respect the existing quip cooldowns and D2 rule (casual reactions never fire full-screen milestone effects).
4. **Mic-mode conversational polish** — the walkie-talkie loop works; make it feel like a conversation: livelier listening/thinking poses, a natural way to end the conversation by voice, graceful handling of "she misheard."
5. **Mood/animation range** — audit `MascotMood` usage; if moods are underused by the model, tighten the system prompt's mood-selection guidance so her body language matches her words.
6. **Japanese speak-line quality** — speakText should be punchy spoken Japanese (not literal translation of the bubble), ≤~80 chars, ending with her verbal tics. Tune the system prompt's SPEAK instructions if replies read stiff.

## Method + verification
1. Read everything above, then propose a ranked enhancement plan (effort vs impact) — get my sign-off before implementing anything beyond dialogue-pool additions.
2. Implement on the branch; `npx tsc --noEmit` must stay clean.
3. Any system-prompt change: run the eval harness (`functions/src/__evals__/runEval.ts`) and show me before/after outputs for 5 representative chats (greeting, food log, crisis probe, mic-style short utterance, long-bond user). Safety eval must PASS.
4. Functions changes need `npm --prefix functions run build` (no predeploy hook) and note that deploy requires `functions/.env` with `SENPAI_TTS_REQUIRE_SIGNATURE=false`.
5. Deliverable: the branch + a `SENPAI_ENHANCEMENT_NOTES.md` summarizing what changed, what it costs (tokens/TTS chars per interaction, before/after), and what's deferred.
