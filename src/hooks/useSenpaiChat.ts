/**
 * Senpai chat thread — state, AsyncStorage persistence, and the call to the
 * senpaiChat cloud function.
 *
 * The state is hoisted into a single SenpaiChatProvider (bottom of this file)
 * so the floating mascot's chat dock and Settings share ONE live
 * conversation. Previously each useSenpaiChat() call got its own
 * copy, reconciled only loosely through AsyncStorage — which meant a message
 * sent in one surface didn't appear in another until an app restart.
 *
 * Persisted per account under @senpai_chat_history:<memberId> (guest bucket
 * for guests; last 50 turns trimmed on save).
 * Each Senpai reply also fires triggerReaction so the floating mascot
 * animation matches the chat mood.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';

import {
  sendSenpaiChat,
  type ChatTurn,
  type SenpaiChatError,
  type SenpaiChatAction,
  type SenpaiUserContext,
} from '../services/senpaiChat';
import { fetchSenpaiAudio } from '../services/senpaiSpeak';
import { playSenpaiAudio, stopSenpaiAudio } from '../services/senpaiAudio';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';
import { buildBondSummary, FACT_CAP, FACT_MAX_LEN, bondHasFact } from '../services/senpaiBond';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { searchFoods } from '../services/foodSearch';
import { randomDialogue } from '../data/senpaiDialogue';
import { todayIso } from '../components/WeekCalendar';
import type { FoodSearchResult } from '../types/food';
import type { MealType, MacroEntry } from '../types/nutrition';

// F4: chat history is per-account — the persisted key is suffixed with the
// member id (guest bucket for guests) so signing in as a different member on
// the same device never inherits the previous user's transcript. The old
// unsuffixed key is migrated once: the first signed-in hydrate claims it,
// then it's removed so a second account can't also inherit it.
const HISTORY_KEY_BASE = '@senpai_chat_history';
const LEGACY_HISTORY_KEY = HISTORY_KEY_BASE; // pre-per-account builds wrote here
const historyKeyFor = (uid: string | null) => `${HISTORY_KEY_BASE}:${uid ?? 'guest'}`;
// Deliberately device-global (a preference, not user data — audit F4).
const VOICE_KEY = '@senpai_chat_voice_enabled';
const MAX_PERSISTED_TURNS = 50;
// C1: the backend rejects threads longer than 60 turns with a 400
// (functions/src/senpaiChat.ts) — window API calls well under that so a
// marathon session can never brick every subsequent send.
const MAX_API_TURNS = 40;

// Crisis pre-check — mirrors functions/src/senpaiChat.ts (CRISIS_PATTERNS) so
// self-harm / suicide intent is caught even offline or before auth and is never
// routed to the model. Kept conservative to avoid false positives on gym talk
// ("kill this set", "dead lift", "I'm dead tired").
const CRISIS_PATTERNS: RegExp[] = [
  /\bkill(?:ing)?\s+myself\b/i,
  /\bsuicid/i,
  /\bend(?:ing)?\s+(?:my\s+life|it\s+all)\b/i,
  /\btake\s+my\s+(?:own\s+)?life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\b(?:don'?t|do not)\s+want\s+to\s+(?:live|be alive|be here|exist)\b/i,
  /\bself[\s-]?harm\b/i,
  /\bhurt(?:ing)?\s+myself\b/i,
  /\bcut(?:ting)?\s+myself\b/i,
  /\bno\s+reason\s+to\s+live\b/i,
  /\bbetter\s+off\s+dead\b/i,
];
const isCrisisMessage = (t: string) => CRISIS_PATTERNS.some((re) => re.test(t));
const CRISIS_REPLY =
  "senpai. I'm putting the bit DOWN — you matter to me way too much for jokes right now 💕 " +
  "please talk to a real person who can help, ok? In the US you can call or text 988 (Suicide & Crisis Lifeline), " +
  "or text HOME to 741741 (Crisis Text Line) — free, 24/7, and they actually listen. If you're somewhere else, " +
  "your local emergency number works too. I'm staying right here with you.";

export interface ChatThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mood?: MascotMood; // assistant turns only
  pending?: boolean; // true while assistant reply is in flight
  error?: boolean;   // true if this turn failed
}

let nextId = 0;
const makeId = () => `msg_${Date.now()}_${nextId++}`;

// C1: normalize a thread window before it's handed to the API (or restored
// from storage): settled turns only, capped at `max`, and — critically —
// opening on a USER turn. The backend 400s on assistant-first threads, and
// pushSenpaiLine appends standalone assistant confirms, so a naive tail-slice
// can open assistant-first and brick every subsequent send until the
// destructive trash-clear.
function normalizeThread(thread: ChatThreadMessage[], max: number): ChatThreadMessage[] {
  const settled = thread.filter((m) => !m.pending && !m.error && m.content.length > 0);
  const windowed = settled.slice(-max);
  const firstUser = windowed.findIndex((m) => m.role === 'user');
  return firstUser > 0 ? windowed.slice(firstUser) : windowed;
}

// C1 (defense-in-depth): cap the in-memory thread on append too, so one long
// session can't grow an unbounded array. send() windows the API call
// separately; appended messages land at the tail so id-keyed updates
// (placeholder → reply) are unaffected.
function appendCapped(prev: ChatThreadMessage[], ...msgs: ChatThreadMessage[]): ChatThreadMessage[] {
  const next = [...prev, ...msgs];
  return next.length > MAX_PERSISTED_TURNS ? next.slice(-MAX_PERSISTED_TURNS) : next;
}

// F3: scale how long a reply holds the mascot bubble with its length — a
// fixed 4s cut multi-sentence replies (and the crisis resources) off
// mid-read. ~55ms/char, clamped to 4-15s.
const bubbleDurationMs = (text: string) => Math.min(15000, Math.max(4000, text.length * 55));

/**
 * Compute days between today and the most recent workout date, or undefined
 * if no workouts exist. Date strings are YYYY-MM-DD per WorkoutLog.date.
 */
function daysSinceMostRecent(latestDate: string | undefined): number | undefined {
  if (!latestDate) return undefined;
  const then = new Date(latestDate);
  if (Number.isNaN(then.getTime())) return undefined;
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

// ─── Client-executed actions (item 4) ───────────────────────────────────────
// The model can request log_food / remove_food / set_goal; the cloud function
// returns the request (it can't touch the client-side macro store) and the
// client does the work here — resolving REAL macros from the food DB,
// confirming with the user, then writing through NutritionContext. The model
// never supplies macro numbers.

export type PendingAction =
  | {
      kind: 'log_food';
      query: string;
      candidates: FoodSearchResult[];
      selectedIndex: number;
      servings: number;
      meal: MealType;
      status: 'resolving' | 'ready' | 'not_found';
    }
  | {
      kind: 'remove_food';
      label: string; // human-readable description of what we'll remove
      targetId: string | null; // resolved entry id; null = nothing matched
      status: 'ready' | 'not_found';
    }
  | {
      kind: 'set_goal';
      changes: { calories?: number; protein?: number; carbs?: number; fat?: number };
      status: 'ready';
    }
  | {
      kind: 'remember_fact'; // H2: save one durable fact to the bond file
      text: string; // trimmed + capped at 120 chars
      status: 'ready' | 'duplicate'; // duplicate = she already knows it
    };

const round0 = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Pick a sensible meal bucket from the wall clock when the user didn't say. */
function defaultMealByTime(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

// Audit 2.0.5 P1: meals are keyed by LOCAL calendar day (todayIso convention,
// utils/dates.ts) — the old UTC slice landed evening food logs on tomorrow
// and made remove_food search a day the tracker never wrote.
const todayISO = () => todayIso();

function useSenpaiChatState() {
  const { state: senpaiState, triggerReaction, recordBondEvent, addBondFact } = useSenpai();
  const { state: gamState } = useGamification();
  const { myLogs } = useWorkouts();
  const { user, isLoading: authLoading } = useAuth();
  const { addMacroEntry, removeMacroEntry, updateGoals, macrosForDate, rememberFood } = useNutrition();
  // F4: history is keyed per account (guest bucket while signed out / guest).
  const uid = user?.id ?? null;
  const historyKey = historyKeyFor(uid);
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  // Item 4: a client-executed action awaiting user confirmation (log/remove
  // food, set goal). Resolved from the model's tool request; null when idle.
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SenpaiChatError | null>(null);
  // The id of the most recently arrived assistant message — Phase 4 typing
  // reveal animates only this one. Naturally decays when the next reply
  // lands. Reset to null on hydrate so rehydrated history doesn't animate.
  const [lastArrivedId, setLastArrivedId] = useState<string | null>(null);
  // Voice playback toggle — when on, replies are sent through the
  // senpaiSpeak (ElevenLabs) function and the returned audio is played.
  // Persisted under @senpai_chat_voice_enabled. Default ON — voice is
  // the chat's whole UX, but auto-disables after TTS_FAIL_AUTODISABLE
  // failures and persists 'false' so a known-bad endpoint (e.g.
  // ElevenLabs free-tier blocked) doesn't keep burning round-trips.
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  // True from the moment we kick off TTS fetch until audio playback ends
  // (either naturally, by interruption, or by failure). The mascot reads
  // this to defer the after-reply mic re-arm until senpai is done talking,
  // so STT doesn't transcribe her own voice through the speaker.
  const [ttsPlaying, setTtsPlaying] = useState(false);
  // Count of consecutive TTS failures. When this hits TTS_FAIL_AUTODISABLE
  // we auto-flip voiceEnabled to false so the user isn't stuck waiting on
  // a known-bad TTS endpoint (e.g. ElevenLabs free-tier disabled). The
  // counter resets on a successful TTS playback.
  //
  // E2: only endpoint-health failures ('tts_error' / 'parse_error' /
  // 'rate_limit') count as strikes — a transient 'no_network' blip (35s
  // abort, connection drop) must never permanently persist voice-off.
  // Strikes also decay: failures more than TTS_STRIKE_DECAY_MS apart are
  // unrelated, so the counter restarts rather than accumulating forever.
  const ttsFailureCountRef = useRef(0);
  const lastTtsFailureAtRef = useRef(0);
  const TTS_FAIL_AUTODISABLE = 2;
  const TTS_STRIKE_CODES = ['tts_error', 'parse_error', 'rate_limit'];
  const TTS_STRIKE_DECAY_MS = 10 * 60 * 1000;
  const hydratedRef = useRef(false);

  // Load the voice flag once on mount — device-global by design (audit F4).
  useEffect(() => {
    (async () => {
      try {
        const voiceRaw = await AsyncStorage.getItem(VOICE_KEY);
        // Now that initial state is `true`, only override on an
        // explicit 'false' (auto-disable or user toggle). 'true' or
        // null both mean "keep voice on."
        if (voiceRaw === 'false') setVoiceEnabledState(false);
      } catch (err) {
        console.warn('[useSenpaiChat] voice hydrate failed:', err);
      }
    })();
  }, []);

  // Load persisted history — re-keyed and re-run per account (F4). Waits for
  // auth to resolve its persisted session so a relaunch-while-signed-in never
  // hydrates (or migrates the legacy key into) the guest bucket by mistake.
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    // Account switch: drop the previous user's thread from memory immediately
    // so nothing leaks across accounts while the new history loads. Keeping
    // hydratedRef false also blocks the persist effect from writing the old
    // thread (or this transient empty one) under the new key.
    hydratedRef.current = false;
    setMessages([]);
    setLastArrivedId(null);
    setError(null);
    setPendingAction(null);
    (async () => {
      try {
        let historyRaw = await AsyncStorage.getItem(historyKey);
        // One-time legacy migration: pre-per-account builds persisted under
        // the unsuffixed key. Only a signed-in hydrate claims it (guests
        // never do), then it's removed so the next account can't inherit it.
        if (historyRaw == null && uid != null) {
          const legacyRaw = await AsyncStorage.getItem(LEGACY_HISTORY_KEY);
          if (legacyRaw != null) {
            historyRaw = legacyRaw;
            await AsyncStorage.setItem(historyKey, legacyRaw);
            await AsyncStorage.removeItem(LEGACY_HISTORY_KEY);
          }
        }
        if (cancelled) return;
        const parsed = safeParseJSON<ChatThreadMessage[]>(historyRaw, [], Array.isArray);
        // C1: same normalization as send()'s API window — drops in-flight
        // placeholders persisted mid-reply (stuck "typing" bubble), failed
        // turns, and a leading assistant turn (pushSenpaiLine confirms) that
        // would make the backend reject the whole thread as assistant-first.
        const restored = normalizeThread(parsed, MAX_PERSISTED_TURNS);
        if (restored.length > 0) setMessages(restored);
      } catch (err) {
        console.warn('[useSenpaiChat] hydrate failed:', err);
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [historyKey, uid, authLoading]);

  // Monotonic TTS generation. stopTts() bumps it; a TTS fetch that started
  // under an older generation discards its result instead of playing. This is
  // the only way to "stop" a reply whose audio hasn't arrived yet — the
  // ElevenLabs fetch takes seconds and stopSenpaiAudio() can only stop a clip
  // that already started (a PTT barge-in during the fetch window would
  // otherwise get the full reply played over the open mic).
  const ttsGenRef = useRef(0);
  const stopTts = useCallback(() => {
    ttsGenRef.current += 1;
    stopSenpaiAudio();
    setTtsPlaying(false);
  }, []);

  const setVoiceEnabled = useCallback((on: boolean) => {
    setVoiceEnabledState(on);
    safeStorageSet(VOICE_KEY, String(on), '[useSenpaiChat]');
    if (on) {
      // Re-enabling voice must clear the auto-disable counter — otherwise a
      // prior 2-failure trip keeps voice silently dead, because send()'s TTS
      // gate also checks ttsFailureCountRef. This covers the chat/voice modal's
      // toggle + force-on, not just Settings' resetTtsFailures().
      ttsFailureCountRef.current = 0;
    } else {
      // Killed mid-clip OR mid-fetch — bump the generation so a TTS fetch
      // still in flight discards its result, stop whatever's playing now.
      ttsGenRef.current += 1;
      stopSenpaiAudio();
      // E1 defense-in-depth: a cancel that lands during playSenpaiAudio's
      // setup awaits can resolve without ever firing onEnded — and this
      // else-branch also gates off the TTS block that would otherwise reset
      // the flag. Clear it here so the PTT UI (SenpaiMascot reads
      // ttsPlaying) can never stay wedged.
      setTtsPlaying(false);
    }
  }, []);

  // Mirror messages into a ref so send() reads the LATEST array
  // synchronously. Reading state directly inside send() captures a
  // closure value that's always one render behind a clearChat() →
  // sendChat() sequence, which is exactly the failure mode the test
  // button hit (validation 400: "messages cannot be empty").
  const messagesRef = useRef<ChatThreadMessage[]>(messages);
  messagesRef.current = messages;

  // Persist any time messages change (after hydration for the CURRENT
  // account — the hydrate effect above flips hydratedRef false on an account
  // switch, which is what stops this from writing user A's thread under
  // user B's key in the switch-over commit).
  useEffect(() => {
    if (!hydratedRef.current) return;
    const trimmed = messages.slice(-MAX_PERSISTED_TURNS);
    safeStorageSet(historyKey, trimmed, '[useSenpaiChat]');
  }, [messages, historyKey]);

  // Append a locally-generated assistant line (used for action confirmations
  // — deterministic, in-character, no model round-trip). DISPLAY-only: scripted
  // lines have no Japanese SPEAK text, so they don't trigger TTS.
  const pushSenpaiLine = useCallback(
    (text: string, mood: MascotMood = 'cheering') => {
      const msg: ChatThreadMessage = { id: makeId(), role: 'assistant', content: text, mood };
      setMessages((prev) => appendCapped(prev, msg));
      setLastArrivedId(msg.id);
      try {
        // 'chat' source: pose + bubble only — confirms must not detonate the
        // full-screen milestone effects (D2).
        triggerReaction(mood, text, bubbleDurationMs(text), 'chat');
      } catch {
        /* non-fatal */
      }
    },
    [triggerReaction],
  );

  // Resolve a model-requested action into a PendingAction the user confirms.
  // For log_food this hits the food DB for REAL macros; we never trust numbers
  // from the model. Sets pendingAction; the confirm UI (SenpaiActionConfirm)
  // renders it and calls confirmAction / cancelAction.
  const stageAction = useCallback(
    async (action: SenpaiChatAction) => {
      const memberId = user?.id;
      const input = action.input ?? {};

      if (action.tool === 'log_food') {
        const query = (input.query ?? '').trim();
        const servings = typeof input.servings === 'number' && input.servings > 0 ? input.servings : 1;
        const meal: MealType = input.meal ?? defaultMealByTime();
        setPendingAction({ kind: 'log_food', query, candidates: [], selectedIndex: 0, servings, meal, status: 'resolving' });
        try {
          const results = await searchFoods(query, 8);
          setPendingAction((prev) =>
            prev && prev.kind === 'log_food'
              ? { ...prev, candidates: results, status: results.length ? 'ready' : 'not_found' }
              : prev,
          );
        } catch {
          setPendingAction((prev) => (prev && prev.kind === 'log_food' ? { ...prev, status: 'not_found' } : prev));
        }
        return;
      }

      if (action.tool === 'remove_food') {
        if (!memberId) {
          setPendingAction({ kind: 'remove_food', label: 'that', targetId: null, status: 'not_found' });
          return;
        }
        const today = macrosForDate(memberId, todayISO());
        let target: MacroEntry | undefined;
        if (input.name) {
          const n = input.name.toLowerCase();
          target = [...today].reverse().find((e) => e.name.toLowerCase().includes(n));
        } else {
          target = today[today.length - 1]; // 'last'
        }
        setPendingAction(
          target
            ? { kind: 'remove_food', label: `${target.name} (${round0(target.calories)} cal)`, targetId: target.id, status: 'ready' }
            : { kind: 'remove_food', label: input.name ?? 'that', targetId: null, status: 'not_found' },
        );
        return;
      }

      if (action.tool === 'set_goal') {
        const changes: { calories?: number; protein?: number; carbs?: number; fat?: number } = {};
        (['calories', 'protein', 'carbs', 'fat'] as const).forEach((k) => {
          const v = input[k];
          if (typeof v === 'number' && v >= 0) changes[k] = round0(v);
        });
        setPendingAction({ kind: 'set_goal', changes, status: 'ready' });
        return;
      }

      // H2: remember_fact — the model wants to write one durable fact into
      // the bond file. Trim + cap here; duplicates are pre-checked against
      // the current bond so the confirm card can say "she already knows".
      // (Unknown tools still fall through as a safe no-op — old clients
      // receiving a newer tool just show the DISPLAY line.)
      if (action.tool === 'remember_fact') {
        const text = typeof input.fact === 'string' ? input.fact.trim().slice(0, FACT_MAX_LEN) : '';
        if (!text) return; // nothing to remember — ignore the malformed call
        const bond = senpaiState.bond;
        const dup = !!bond && bondHasFact(bond, text);
        setPendingAction({ kind: 'remember_fact', text, status: dup ? 'duplicate' : 'ready' });
        return;
      }
    },
    [user, macrosForDate, senpaiState.bond],
  );

  const send = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || loading) return;

      setError(null);
      const userMsg: ChatThreadMessage = { id: makeId(), role: 'user', content: trimmed };

      // Crisis pre-check (mirrors the backend) — short-circuit self-harm intent
      // to fixed resources, never hitting the model. Works offline / pre-auth.
      if (isCrisisMessage(trimmed)) {
        const reply: ChatThreadMessage = {
          id: makeId(),
          role: 'assistant',
          content: CRISIS_REPLY,
          mood: 'encouraging',
        };
        setMessages((prev) => appendCapped(prev, userMsg, reply));
        setLastArrivedId(reply.id);
        // F3: length-scaled hold (hits the 15s cap for this reply — strictly
        // longer than the old fixed 8s) so the hotline numbers stay readable.
        try { triggerReaction('encouraging', CRISIS_REPLY, bubbleDurationMs(CRISIS_REPLY), 'chat'); } catch { /* non-fatal */ }
        // H2: the crisis short-circuit still counts as a chat — she was there.
        recordBondEvent({ type: 'chat' });
        return;
      }

      const placeholderId = makeId();
      const placeholder: ChatThreadMessage = {
        id: placeholderId,
        role: 'assistant',
        content: '',
        pending: true,
      };

      // Snapshot the current thread + new user turn for the API call.
      // Build apiMessages BEFORE setMessages — the updater fires async,
      // so doing it inside left apiMessages empty when the next user
      // turn fired right after a clearChat() (we observed
      // `messages cannot be empty` 400s from the test button which
      // clears history and sends in the same handler).
      // C1: normalizeThread windows to the last MAX_API_TURNS settled turns
      // and guarantees the window opens on a user turn — the backend 400s
      // both >60-turn and assistant-first threads, and each failed retry
      // used to append another user turn, so an over-long thread could
      // never self-heal. userMsg is always last, so the window is never
      // empty.
      const apiMessages: ChatTurn[] = normalizeThread([...messagesRef.current, userMsg], MAX_API_TURNS)
        .map((m) => ({ role: m.role, content: m.content }));
      // Optimistically render user message + assistant placeholder.
      setMessages((prev) => appendCapped(prev, userMsg, placeholder));

      setLoading(true);
      try {
        // Gather a fresh snapshot of the user's fitness state at send time.
        // The model only sees this via the `get_user_stats` tool, so it
        // stays out of the prompt cache prefix. See SENPAI_AI_CHAT_PROMPT.md
        // Phase 3 for design notes.
        const userId = user?.id;
        const recentLogs = userId ? myLogs(userId).slice(0, 5) : [];
        const badgeCount = gamState.achievements.filter((a) => a.unlocked).length;

        const userContext: SenpaiUserContext = {
          level: gamState.level,
          streakDays: gamState.streak,
          longestStreakDays: gamState.longestStreak,
          totalSessions: gamState.totalSessions,
          badgeCount,
          flames: gamState.flames,
          daysSinceLastWorkout: daysSinceMostRecent(recentLogs[0]?.date),
          recentWorkouts: recentLogs.map((l) => ({
            date: l.date,
            title: l.title,
            format: l.format,
            result: l.result,
          })),
        };

        // H2: pack the bond file into a compact summary, sent on EVERY turn
        // (she should know it's day 3 vs day 300 from turn one). userContext
        // stays tool-gated; the bond is ambient memory, so it rides in the
        // request body and the function serializes it into a second, uncached
        // system block. A pre-bond backend simply ignores the field.
        const bondSummary = senpaiState.bond ? buildBondSummary(senpaiState.bond) : undefined;

        const token = await getCurrentIdToken();
        const result = await sendSenpaiChat(apiMessages, userContext, token ?? undefined, bondSummary);

        if (!result.ok) {
          // Surface to console so the metro logs / debugger show the
          // exact failure reason. The bubble shows a typed message but
          // having the raw code+message logged makes diagnosing field
          // failures dramatically faster.
          // eslint-disable-next-line no-console
          console.warn('[senpaiChat] failed', result.error.code, result.error.message);
          setError(result.error);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === placeholderId
                ? { ...m, pending: false, error: true, content: '...' }
                : m,
            ),
          );
          return;
        }

        // text = English bubble copy. speakText = Japanese audio line. The
        // backend returns them as two SEPARATE fields (it does not copy text
        // into speakText). Guard speakText so a version-skewed reply that omits
        // it can't throw on the .slice()/regex below — we just skip TTS then.
        const { text, mood } = result.data;
        const speakText = result.data.speakText ?? '';
        // E3: HMAC minted by senpaiChat over speakText. Threaded verbatim to
        // fetchSenpaiAudio — senpaiSpeak only voices signed text once
        // enforcement is on. May be undefined on a skewed/older backend.
        const speakSignature = result.data.speakSignature;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, pending: false, content: text, mood }
              : m,
          ),
        );
        // Mark this as the freshly arrived id so the renderer knows to
        // typing-reveal it. Naturally decays when the next reply lands.
        setLastArrivedId(placeholderId);

        // H2: a successful chat send is a bond moment (totalChats++ and the
        // day touch happen in one pure reducer dispatch).
        recordBondEvent({ type: 'chat' });

        // Mirror the chat reply into the floating mascot animation. F3:
        // duration scales with reply length so multi-sentence answers stay
        // readable; 'chat' source keeps casual replies from detonating the
        // full-screen milestone effects (D2).
        try {
          triggerReaction(mood, text, bubbleDurationMs(text), 'chat');
        } catch {
          /* non-fatal */
        }

        // Item 4: if the model requested a client-executed action (log/remove
        // food, set goal), resolve it (food DB lookup, etc.) and stage a
        // confirmation. Fire-and-forget — the reply text above already
        // rendered as the in-character "logging that for you 💕" confirm line.
        if (result.data.action) {
          stageAction(result.data.action).catch((e) =>
            // eslint-disable-next-line no-console
            console.warn('[senpaiChat] action stage failed', e),
          );
        }

        // Voice playback — fire-and-forget so the chat UI stays responsive
        // even if TTS is slow or fails. ttsPlaying is set TRUE before the
        // fetch starts and cleared FALSE either via the onEnded callback
        // (audio actually finished) or in the error/fallback branches
        // below (so the mascot's mic re-arm isn't blocked forever).
        // After TTS_FAIL_AUTODISABLE consecutive failures we flip
        // voiceEnabled off so the user isn't burning round-trips on a
        // known-bad TTS endpoint (e.g. ElevenLabs free-tier disabled).
        // Double-gated: voiceEnabled state AND the failure-count ref
        // (which is always fresh, unlike state which can lag a render
        // behind rapid sendChat calls — observed: a 3rd TTS attempt
        // fired between auto-disable's setState and the next render).
        if (voiceEnabled && ttsFailureCountRef.current < TTS_FAIL_AUTODISABLE) {
          setTtsPlaying(true);
          const ttsGen = ++ttsGenRef.current;
          (async () => {
            const onTtsFail = (label: string, detail: unknown) => {
              // eslint-disable-next-line no-console
              console.warn('[senpaiSpeak]', label, detail);
              setTtsPlaying(false);
              // E2: only endpoint-health codes count toward auto-disable.
              // 'no_network' (35s abort / connection drop), 'no_auth', and
              // local 'playback_threw' are transient — two unrelated blips,
              // arbitrarily far apart, must not permanently mute her.
              if (!TTS_STRIKE_CODES.includes(label)) return;
              const now = Date.now();
              if (now - lastTtsFailureAtRef.current > TTS_STRIKE_DECAY_MS) {
                // Stale strike — unrelated to this failure, start fresh.
                ttsFailureCountRef.current = 0;
              }
              lastTtsFailureAtRef.current = now;
              ttsFailureCountRef.current += 1;
              if (ttsFailureCountRef.current >= TTS_FAIL_AUTODISABLE) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[senpaiSpeak] auto-disabling voice after',
                  ttsFailureCountRef.current,
                  'consecutive failures',
                );
                // 2.0.5: mute for THIS session only — do NOT persist 'false'.
                // The old auto-disable wrote 'false' to storage, so a transient
                // TTS outage (or a signature-enforcement skew) muted her
                // permanently — recoverable only by digging into Settings. Now a
                // relaunch clears the strike counter and voiceEnabled hydrates
                // back to true, so she retries on her own. A user's MANUAL
                // Settings toggle still persists (setVoiceEnabled), which is the
                // only voice-off intent that should survive a relaunch.
                setVoiceEnabledState(false);
                pushSenpaiLine(
                  "my voice glitched — typing only for now. I'll try again next time you open the app 💕",
                  'disappointed',
                );
              }
            };
            try {
              // Skip TTS if speakText doesn't contain Japanese script.
              // Use Unicode script properties for the broadest, most
              // accurate match — the previous narrow range
              // ([぀-ヿ一-龯]) missed some kana and extension kanji
              // blocks, which caused false-positive skips when the
              // model produced edge-case Japanese characters.
              const hasJapanese = /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/u.test(speakText);
              if (!hasJapanese) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[senpaiSpeak] skipping TTS — no Japanese chars in speakText:',
                  JSON.stringify(speakText.slice(0, 100)),
                );
                setTtsPlaying(false);
                return;
              }
              // 2.0.5: do NOT locally skip when speakSignature is missing. The
              // client can't know the server's enforcement state, and the old
              // skip silently muted EVERY reply whenever the deployed senpaiChat
              // returned unsigned text (e.g. the signing secret was unbound) —
              // no strike, no signal, permanent-feeling. senpaiSpeak voices
              // unsigned text while SENPAI_TTS_REQUIRE_SIGNATURE is off (its
              // default), so let the server decide; a valid signature (when
              // present) still verifies. If enforcement is ever turned on, the
              // now-session-only auto-disable above keeps a rejection from
              // muting her permanently.
              const ttsToken = await getCurrentIdToken();
              const ttsResult = await fetchSenpaiAudio(
                speakText,
                undefined,
                ttsToken ?? undefined,
                speakSignature,
              );
              if (ttsResult.ok) {
                ttsFailureCountRef.current = 0;
                // A stopTts() (barge-in / mute) landed while we were fetching —
                // this reply's audio is stale; never start it.
                if (ttsGenRef.current !== ttsGen) {
                  setTtsPlaying(false);
                  return;
                }
                await playSenpaiAudio(ttsResult.data.audioBase64, () => {
                  setTtsPlaying(false);
                });
              } else {
                onTtsFail(ttsResult.error.code, ttsResult.error.message);
              }
            } catch (e) {
              onTtsFail('playback_threw', e);
            }
          })();
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, triggerReaction, gamState, myLogs, user, voiceEnabled, stageAction, pushSenpaiLine, senpaiState.bond, recordBondEvent],
  );

  // ─── Action confirm / cancel (item 4) ───
  // The confirm UI (SenpaiActionConfirm) reads pendingAction and calls these.
  // All writes go through NutritionContext so the Food Log / Macro Tracker
  // updates immediately. Success/cancel is reported back as an in-character
  // assistant line.
  const confirmAction = useCallback(() => {
    const action = pendingAction;
    if (!action) return;
    const memberId = user?.id;
    setPendingAction(null);

    // H2: remember_fact writes the bond file, which is per-account INCLUDING
    // the guest bucket — so it's handled before the memberId guard the
    // nutrition actions need. addBondFact answers synchronously (bond-ref
    // mirror) and flushes the persist immediately: a confirmed fact can
    // never be lost to the debounce window.
    if (action.kind === 'remember_fact') {
      if (action.status === 'duplicate') {
        pushSenpaiLine('I already knew that one, senpai — keep up 💕', 'cheering');
        return;
      }
      const willEvict = (senpaiState.bond?.facts.length ?? 0) >= FACT_CAP;
      const result = addBondFact(action.text);
      if (result === 'duplicate') {
        pushSenpaiLine('I already knew that one, senpai — keep up 💕', 'cheering');
        return;
      }
      pushSenpaiLine(
        willEvict
          ? "memory's full, so I evicted the oldest fact. survival of the cutest ✨"
          : 'written in permanent marker. inside my soul. and my JSON 💕',
        'cheering',
      );
      return;
    }

    if (!memberId) {
      pushSenpaiLine("hmm I can't find your account senpai 💕 try signing in again", 'disappointed');
      return;
    }

    if (action.kind === 'log_food') {
      const food = action.candidates[action.selectedIndex];
      if (!food) return;
      const s = action.servings;
      const entry = {
        memberId,
        date: todayISO(),
        name: s !== 1 ? `${food.name} ×${s}` : food.name,
        calories: round0(food.macros.calories * s),
        protein: round1(food.macros.protein * s),
        carbs: round1(food.macros.carbs * s),
        fat: round1(food.macros.fat * s),
        mealType: action.meal,
      };
      addMacroEntry(entry);
      try {
        rememberFood(memberId, food);
      } catch {
        /* non-fatal */
      }
      pushSenpaiLine(
        `logged it!! ${entry.name} → ${entry.calories} cal, ${entry.protein}g protein 💕 ${randomDialogue('foodLogged')}`,
        'cheering',
      );
      return;
    }

    if (action.kind === 'remove_food') {
      if (!action.targetId) {
        pushSenpaiLine("couldn't find that one to remove senpai 💕", 'disappointed');
        return;
      }
      removeMacroEntry(action.targetId);
      pushSenpaiLine(`gone — ${action.label} erased from existence 💕 ${randomDialogue('foodRemoved')}`, 'impressed');
      return;
    }

    if (action.kind === 'set_goal') {
      updateGoals(memberId, action.changes);
      const parts = Object.entries(action.changes)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      pushSenpaiLine(`done!! new goals — ${parts} 💕 ${randomDialogue('goalSet')}`, 'celebrating');
      return;
    }
  }, [pendingAction, user, addMacroEntry, removeMacroEntry, updateGoals, rememberFood, pushSenpaiLine, addBondFact, senpaiState.bond]);

  const cancelAction = useCallback(() => {
    if (!pendingAction) return;
    setPendingAction(null);
    pushSenpaiLine(randomDialogue('actionCancelled'), 'disappointed');
  }, [pendingAction, pushSenpaiLine]);

  // Let the confirm UI tweak a pending log before writing (servings, meal,
  // which candidate). No-op for non-log actions.
  const updatePendingFood = useCallback(
    (patch: Partial<{ selectedIndex: number; servings: number; meal: MealType }>) => {
      setPendingAction((prev) => (prev && prev.kind === 'log_food' ? { ...prev, ...patch } : prev));
    },
    [],
  );

  // Backstop: stop in-flight audio if the whole provider tears down (full app
  // unmount). State is hoisted to app root now, so this no longer fires on
  // modal close — the modal stops its own audio in its close/unmount effects.
  useEffect(() => {
    return () => stopSenpaiAudio();
  }, []);

  const clear = useCallback(async () => {
    setMessages([]);
    setError(null);
    setLastArrivedId(null);
    await AsyncStorage.removeItem(historyKey).catch((err) => {
      console.warn('[useSenpaiChat] removeItem failed:', err);
    });
  }, [historyKey]);

  // Dismiss the current chat error without wiping history. Used by the
  // mascot's hold gestures so the user can always escape an error state
  // (the error otherwise persists in the bubble until a successful send).
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Reset the TTS failure counter so the next reply gets a fresh shot
  // at voice playback. Called when the user re-enables Senpai Voice in
  // Settings — typically after upgrading their ElevenLabs plan to clear
  // the auto-disable that fired earlier.
  const resetTtsFailures = useCallback(() => {
    ttsFailureCountRef.current = 0;
  }, []);

  // Auto-dismiss errors after 8 seconds so a stale error never sticks
  // around forever. Long enough to read, short enough to not block the
  // user from seeing the listening UX once they hold to retry.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error]);

  return {
    messages,
    loading,
    error,
    lastArrivedId,
    voiceEnabled,
    setVoiceEnabled,
    ttsPlaying,
    stopTts,
    send,
    clear,
    clearError,
    resetTtsFailures,
    // Item 4 — client-executed actions
    pendingAction,
    confirmAction,
    cancelAction,
    updatePendingFood,
  };
}

// ─── Shared provider ────────────────────────────────────────────────────────
// One conversation, shared by the floating mascot bubble, the full-screen
// chat modal (item 5), and Settings. React.createElement (not JSX) keeps this
// a .ts file so existing `import { useSenpaiChat } from '../hooks/useSenpaiChat'`
// paths don't change.

type SenpaiChatContextValue = ReturnType<typeof useSenpaiChatState>;

const SenpaiChatContext = createContext<SenpaiChatContextValue | null>(null);

export function SenpaiChatProvider({ children }: { children: React.ReactNode }) {
  const value = useSenpaiChatState();
  return React.createElement(SenpaiChatContext.Provider, { value }, children);
}

export function useSenpaiChat(): SenpaiChatContextValue {
  const ctx = useContext(SenpaiChatContext);
  if (!ctx) {
    throw new Error('useSenpaiChat must be used within a SenpaiChatProvider');
  }
  return ctx;
}
