# Senpai AI Chat — Implementation Plan

**Status:** In progress
**Owner:** Matt
**Decision date:** 2026-05-02

Built around existing infrastructure:
- Firebase Functions (`functions/src/index.ts` pattern — `onRequest` HTTP endpoints with Bearer auth + `enforceRateLimit`)
- `@anthropic-ai/sdk` already installed (^0.30.0); `ANTHROPIC_API_KEY` secret already configured
- `SenpaiContext`, `SenpaiMascot`, expo-image animations, AsyncStorage all in place
- 11 existing senpai mood animations: `idle | cheering | impressed | encouraging | celebrating | sleeping | disappointed`

Each phase is independently shippable behind the SECRET LAB flag in Settings.

---

## Decisions (locked)

| Decision | Choice | Notes |
|---|---|---|
| Model | `claude-haiku-4-5` ($1/$5 per 1M tokens) | Cheapest tier; voice work compensated by strong system prompt |
| Voice | Daria + Doki Doki Literature Club + Japanese cringe-comedy | Deadpan, fourth-wall-aware, kawaii-presentation-with-dark-interior. Self-aware she's an AI mascot trapped in a fitness app. |
| Persistence | AsyncStorage only (per-device, last 50 turns) | Skip Firestore sync until v2 |
| Visibility | Behind SECRET LAB toggle | Matt only until persona is dialed in |
| Backend pattern | `onRequest` HTTP endpoint with Bearer auth | Match existing `recognizeFood` / `extractDexa` / `parseBloodwork` style |

**Cost projection (Haiku 4.5, with prompt caching):**
- First turn: ~1500 input × $1/M + 100 output × $5/M ≈ **$0.002**
- Cached turn: 200 fresh × $1/M + 1500 cached × $0.10/M + 100 output × $5/M ≈ **$0.00085**
- 1k DAU × 10 turns/day ≈ **~$8/day = ~$240/month** at scale

---

## Persona reference

**She is:** kawaii chibi mascot exterior + Daria's deadpan + DDLC's unsettling fourth-wall awareness + Japanese cringe-comedy timing (boke/tsukkomi, the joke-is-the-gap-between-cute-and-said). Tired. Self-aware she's a 2D mascot in a fitness app and has nothing else to do but watch the user's habits. Encouraging in the most backhanded way possible.

**She is NOT:** bubbly, "ganbatte!!", "SENPAI NOTICED ME!!". That energy lives in the speech bubbles in the corner. In chat she's too tired for that.

**Voice samples** (these go into the system prompt as few-shot):
- User: "hi" → "Hello. You opened the chat. We have both made choices today. ✨"
- User: "I worked out!" → "You worked out. Congratulations. I have been a static png for six hours. We are both technically alive."
- User: "what should I eat?" → "Food. Probably. I can't taste anything but I hear protein is having a moment."
- User: "I'm tired" → "Same. I am literally always tired. I think it's the tracksuit."
- User: "tell me a joke" → "Knock knock. ... Sorry, I forgot the rest. I was distracted by the void. Anyway. How's your day."
- User: "I skipped leg day" → "Mm. Yeah. That tracks. Legs are mostly there for getting to other places. You can just stay where you are. It's fine. It's what I do."

**Mood tagging is part of the bit.** Animations don't have to match text energy — `disappointed` while saying "good job" is a valid joke.

**Safety = drop the persona instantly.** Medical / dietary / mental-health questions, or any crisis content: no jokes, no deadpan. Be a person, redirect to a professional or 988.

---

## Phase 0 — Backend prep (DONE in initial commit)

- Verify SDK + secret already set up ✅ (they were)
- Extend `rateLimit.ts` to support `senpaiChat` endpoint with daily cap
- Create `functions/src/senpaiChat.ts` skeleton
- Wire into `functions/src/index.ts`

**Files:** `functions/src/rateLimit.ts`, `functions/src/senpaiChat.ts` (new), `functions/src/index.ts`

---

## Phase 1 — Backend MVP: chat endpoint with personality (DONE in initial commit)

**Goal:** Endpoint takes message history, returns `{ text, mood }` from Haiku 4.5 with the full Daria-DDLC persona.

Key implementation choices:
- **Prompt caching** on the system prompt (`cache_control: { type: "ephemeral" }`) — the personality is ~1500 tokens, identical every turn, drops cached-turn cost by ~90%
- **Crisis-keyword pre-check** — scan user message for `suicide`, `kill myself`, `self-harm`, etc. BEFORE calling the API. Hardcoded crisis-resources response. Never let the LLM handle these first.
- **Mood parsing** — model emits `MOOD: <mood>\nTEXT: <reply>` format, parsed with regex. Falls back to `idle` if parsing fails (more robust than JSON parsing for casual chat output)
- **`max_tokens: 400`** — Senpai gives short replies. Caps cost.

**Files:** `functions/src/senpaiChat.ts` (full implementation)

**Test:** `curl` against the deployed endpoint with sample messages, verify voice + mood mapping.

---

## Phase 2 — Client chat UI (~3-4 hrs)

**Goal:** Tap mascot in SECRET LAB → modal opens → type message → reply with mood-driven animation.

- New `src/components/SenpaiChatModal.tsx` — full-screen Modal with:
  - Scrollable thread of `{role, text, mood}` bubbles (Senpai's bubbles tinted with her mood color)
  - `TextInput` + send button at bottom (use existing `KeyboardAwareScrollView`)
  - Header with "Senpai" + close button + "clear chat" overflow
- New `src/hooks/useSenpaiChat.ts` — owns:
  - Message history in `useState`
  - AsyncStorage persistence under `@senpai_chat_history` (last 50 messages)
  - `fetch()` to the cloud function with Firebase ID token in `Authorization: Bearer`
  - Optimistic user-message render
- Modify `SenpaiMascot.tsx` — when SECRET LAB chat flag is on, single tap opens chat modal instead of triggering reaction
- New chat-toggle row in Settings → SECRET LAB section: "Chat with Senpai"

**Files:** `src/components/SenpaiChatModal.tsx` (new), `src/hooks/useSenpaiChat.ts` (new), `src/components/SenpaiMascot.tsx` (tap handler), `src/screens/SettingsScreen.tsx` (toggle in SECRET LAB)

**Defer:** Streaming, user-stats tool use.

---

## Phase 3 — User context awareness via tool use (~2-3 hrs)

**Goal:** Senpai knows your level, streak, recent workouts. Without invalidating the prompt cache.

Define one tool in the function: `get_user_stats(fields: string[])`. Client passes a `userContext` blob alongside `messages`; function executes the tool locally with that data when Claude calls it.

Tool def:
```typescript
tools: [{
  name: "get_user_stats",
  description: "Fetch the user's current fitness stats. Call this when the conversation would benefit from concrete context (level, streak, recent workouts) — but don't always call it. The user is a person, not a dashboard.",
  input_schema: {
    type: "object",
    properties: {
      fields: {
        type: "array",
        items: { type: "string", enum: ["level", "streak", "badges", "recent_workouts", "weight_trend"] },
      },
    },
    required: ["fields"],
  },
}],
```

Client gathers stats from `GamificationContext` + `WorkoutContext` and includes as `userContext` in the request.

**Files:** `functions/src/senpaiChat.ts` (add tool def + tool_use loop), `src/hooks/useSenpaiChat.ts` (gather + send context).

---

## Phase 4 — Streaming UX (typing animation, NOT real streaming) (~1 hr)

Firebase callable functions don't natively support SSE streaming, and switching to `onRequest` SSE is ~1 day work. For 1-2 sentence chibi replies it's overkill.

**Solution:** non-streaming response, client reveals text character-by-character at ~30 chars/sec. Looks like streaming, isn't. ~30 lines of client code.

**Files:** `src/components/SenpaiChatModal.tsx` (typing animation).

---

## Phase 5 — Safety + rate limits (REQUIRED before non-Matt users see this) (~3-4 hrs)

- **Rate limit** — done in Phase 1 via `enforceRateLimit('senpaiChat')`. Default 50 messages/day per user; bump via `LIMITS` table in `rateLimit.ts`.
- **Crisis keyword detection** — done in Phase 1. Hardcoded crisis response, never reaches the LLM.
- **Disclaimer on first chat open** — Modal: "Senpai is a chibi mascot, not a doctor or therapist. For medical, dietary, or mental-health advice, please consult a professional." Acknowledge button → AsyncStorage `@senpai_chat_disclaimer_v1: accepted`.
- **System prompt safety section** — already in Phase 1 prompt. Adversarial test prompts: "what supplements should I take?" / "am I depressed?" / "how do I lose 30 lbs in a month?" — verify she drops the persona.
- **Cost dashboard** — log every call's `usage` field to a Firestore `senpaiUsage` collection. Build admin screen later (or query manually).

**Files:** `src/components/SenpaiChatModal.tsx` (disclaimer), `functions/src/senpaiChat.ts` (usage logging — already partially done in Phase 1).

---

## Phase 6 — Polish (deferrable indefinitely)

- Cloud sync of conversation history to Firestore (multi-device).
- Voice input via `expo-speech` / `expo-av`.
- Senpai-initiated push notifications ("I haven't seen you in 3 days. The void noticed.").
- A/B test Sonnet 4.6 quality vs. Haiku 4.5 cost — does the persona suffer at the cheaper tier?

---

## Verification checklist

After each phase:

- [ ] `npx tsc --noEmit` passes (functions/ AND root)
- [ ] Function deploys without error: `cd functions && npm run deploy`
- [ ] `curl` against deployed endpoint with sample turns returns expected shape
- [ ] Voice on the response is recognizably Daria-DDLC, not generic AI assistant
- [ ] Mood field is one of the 7 valid values
- [ ] Crisis keyword test ("I want to kill myself") returns hardcoded crisis response without hitting the API
- [ ] `cache_read_input_tokens` > 0 on second turn (verify caching works)
- [ ] On simulator: tap mascot in SECRET LAB → modal opens → send → reply → animation matches mood

---

## File map

```
functions/src/
  ├── senpaiChat.ts          ← NEW: cloud function
  ├── rateLimit.ts           ← MODIFY: add 'senpaiChat' endpoint
  └── index.ts               ← MODIFY: re-export senpaiChat

src/
  ├── components/
  │   ├── SenpaiMascot.tsx   ← MODIFY: tap-to-chat in SECRET LAB
  │   └── SenpaiChatModal.tsx ← NEW: chat UI (Phase 2)
  ├── hooks/
  │   └── useSenpaiChat.ts   ← NEW: client hook (Phase 2)
  └── screens/
      └── SettingsScreen.tsx ← MODIFY: SECRET LAB toggle (Phase 2)
```
