/**
 * Senpai chat thread — state, AsyncStorage persistence, and the call to the
 * senpaiChat cloud function.
 *
 * The state is hoisted into a single SenpaiChatProvider (bottom of this file)
 * so the floating mascot, the full-screen chat modal, and Settings all share
 * ONE live conversation. Previously each useSenpaiChat() call got its own
 * copy, reconciled only loosely through AsyncStorage — which meant a message
 * sent in one surface didn't appear in another until an app restart.
 *
 * Persisted under @senpai_chat_history (last 50 turns trimmed on save).
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
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { searchFoods } from '../services/foodSearch';
import { randomDialogue } from '../data/senpaiDialogue';
import type { FoodSearchResult } from '../types/food';
import type { MealType, MacroEntry } from '../types/nutrition';

const HISTORY_KEY = '@senpai_chat_history';
const VOICE_KEY = '@senpai_chat_voice_enabled';
const MAX_PERSISTED_TURNS = 50;

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

const todayISO = () => new Date().toISOString().slice(0, 10);

function useSenpaiChatState() {
  const { triggerReaction } = useSenpai();
  const { state: gamState } = useGamification();
  const { myLogs } = useWorkouts();
  const { user } = useAuth();
  const { addMacroEntry, removeMacroEntry, updateGoals, macrosForDate, rememberFood } = useNutrition();
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
  const ttsFailureCountRef = useRef(0);
  const TTS_FAIL_AUTODISABLE = 2;
  const hydratedRef = useRef(false);

  // Load persisted history + voice flag on mount
  useEffect(() => {
    (async () => {
      try {
        const [historyRaw, voiceRaw] = await Promise.all([
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(VOICE_KEY),
        ]);
        const parsed = safeParseJSON<ChatThreadMessage[]>(historyRaw, [], Array.isArray);
        // Drop in-flight assistant placeholders (pending, empty content) that
        // got persisted when the app closed mid-reply — otherwise a stuck
        // "typing" bubble rehydrates forever. The user's real question is a
        // separate non-pending message, so nothing is lost.
        const restored = parsed.slice(-MAX_PERSISTED_TURNS).filter((m) => !m.pending);
        if (restored.length > 0) setMessages(restored);
        // Now that initial state is `true`, only override on an
        // explicit 'false' (auto-disable or user toggle). 'true' or
        // null both mean "keep voice on."
        if (voiceRaw === 'false') setVoiceEnabledState(false);
      } catch (err) {
        console.warn('[useSenpaiChat] hydrate failed:', err);
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  const setVoiceEnabled = useCallback((on: boolean) => {
    setVoiceEnabledState(on);
    safeStorageSet(VOICE_KEY, String(on), '[useSenpaiChat]');
    if (!on) {
      // Killed mid-clip — stop whatever's playing right now
      stopSenpaiAudio();
    }
  }, []);

  // Mirror messages into a ref so send() reads the LATEST array
  // synchronously. Reading state directly inside send() captures a
  // closure value that's always one render behind a clearChat() →
  // sendChat() sequence, which is exactly the failure mode the test
  // button hit (validation 400: "messages cannot be empty").
  const messagesRef = useRef<ChatThreadMessage[]>(messages);
  messagesRef.current = messages;

  // Persist any time messages change (after initial hydration)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const trimmed = messages.slice(-MAX_PERSISTED_TURNS);
    safeStorageSet(HISTORY_KEY, trimmed, '[useSenpaiChat]');
  }, [messages]);

  // Append a locally-generated assistant line (used for action confirmations
  // — deterministic, in-character, no model round-trip). DISPLAY-only: scripted
  // lines have no Japanese SPEAK text, so they don't trigger TTS.
  const pushSenpaiLine = useCallback(
    (text: string, mood: MascotMood = 'cheering') => {
      const msg: ChatThreadMessage = { id: makeId(), role: 'assistant', content: text, mood };
      setMessages((prev) => [...prev, msg]);
      setLastArrivedId(msg.id);
      try {
        triggerReaction(mood, text, 4000);
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
    },
    [user, macrosForDate],
  );

  const send = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || loading) return;

      setError(null);
      const userMsg: ChatThreadMessage = { id: makeId(), role: 'user', content: trimmed };
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
      const apiMessages: ChatTurn[] = [...messagesRef.current, userMsg]
        .filter((m) => !m.pending && !m.error && m.content.length > 0)
        .map((m) => ({ role: m.role, content: m.content }));
      // Optimistically render user message + assistant placeholder.
      setMessages((prev) => [...prev, userMsg, placeholder]);

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

        const token = await getCurrentIdToken();
        const result = await sendSenpaiChat(apiMessages, userContext, token ?? undefined);

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

        // text = English bubble copy. speakText = Japanese audio. The
        // model returns both; we render text and feed speakText to TTS.
        // Older replies before this rollout returned only `text` — the
        // backend parser maps that onto both fields, so reading either
        // here is safe even with a cached Claude response.
        const { text, speakText, mood } = result.data;
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

        // Mirror the chat reply into the floating mascot animation
        try {
          triggerReaction(mood, text, 4000);
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
          (async () => {
            const onTtsFail = (label: string, detail: unknown) => {
              // eslint-disable-next-line no-console
              console.warn('[senpaiSpeak]', label, detail);
              setTtsPlaying(false);
              ttsFailureCountRef.current += 1;
              if (ttsFailureCountRef.current >= TTS_FAIL_AUTODISABLE) {
                // eslint-disable-next-line no-console
                console.warn(
                  '[senpaiSpeak] auto-disabling voice after',
                  ttsFailureCountRef.current,
                  'consecutive failures',
                );
                setVoiceEnabledState(false);
                safeStorageSet(VOICE_KEY, 'false', '[useSenpaiChat]');
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
              const ttsToken = await getCurrentIdToken();
              const ttsResult = await fetchSenpaiAudio(speakText, undefined, ttsToken ?? undefined);
              if (ttsResult.ok) {
                ttsFailureCountRef.current = 0;
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
    [loading, triggerReaction, gamState, myLogs, user, voiceEnabled, stageAction],
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
  }, [pendingAction, user, addMacroEntry, removeMacroEntry, updateGoals, rememberFood, pushSenpaiLine]);

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
    await AsyncStorage.removeItem(HISTORY_KEY).catch((err) => {
      console.warn('[useSenpaiChat] removeItem failed:', err);
    });
  }, []);

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
