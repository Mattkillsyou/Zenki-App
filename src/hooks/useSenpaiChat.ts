/**
 * useSenpaiChat — owns the chat thread state, AsyncStorage persistence,
 * and the call to the senpaiChat cloud function.
 *
 * Persisted under @senpai_chat_history (last 50 turns trimmed on save).
 * Each Senpai reply also fires triggerReaction so the floating mascot
 * animation matches the chat mood.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  sendSenpaiChat,
  type ChatTurn,
  type SenpaiChatError,
  type SenpaiUserContext,
} from '../services/senpaiChat';
import { fetchSenpaiAudio } from '../services/senpaiSpeak';
import { playSenpaiAudio, stopSenpaiAudio } from '../services/senpaiAudio';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';

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

export function useSenpaiChat() {
  const { triggerReaction } = useSenpai();
  const { state: gamState } = useGamification();
  const { myLogs } = useWorkouts();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SenpaiChatError | null>(null);
  // The id of the most recently arrived assistant message — Phase 4 typing
  // reveal animates only this one. Naturally decays when the next reply
  // lands. Reset to null on hydrate so rehydrated history doesn't animate.
  const [lastArrivedId, setLastArrivedId] = useState<string | null>(null);
  // Voice playback toggle — when on, replies are sent through the
  // senpaiSpeak (ElevenLabs) function and the returned audio is played.
  // Persisted under @senpai_chat_voice_enabled. Default OFF — paid TTS
  // calls shouldn't fire on every chat session by default.
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  const hydratedRef = useRef(false);

  // Load persisted history + voice flag on mount
  useEffect(() => {
    (async () => {
      try {
        const [historyRaw, voiceRaw] = await Promise.all([
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(VOICE_KEY),
        ]);
        if (historyRaw) {
          const parsed = JSON.parse(historyRaw);
          if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_PERSISTED_TURNS));
        }
        if (voiceRaw === 'true') setVoiceEnabledState(true);
      } catch {
        /* ignore — fresh history is fine */
      } finally {
        hydratedRef.current = true;
      }
    })();
  }, []);

  const setVoiceEnabled = useCallback((on: boolean) => {
    setVoiceEnabledState(on);
    AsyncStorage.setItem(VOICE_KEY, String(on)).catch(() => {});
    if (!on) {
      // Killed mid-clip — stop whatever's playing right now
      stopSenpaiAudio();
    }
  }, []);

  // Persist any time messages change (after initial hydration)
  useEffect(() => {
    if (!hydratedRef.current) return;
    const trimmed = messages.slice(-MAX_PERSISTED_TURNS);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed)).catch(() => {});
  }, [messages]);

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

      // Snapshot the current thread + new user turn for the API call,
      // then optimistically render user message + assistant placeholder.
      let apiMessages: ChatTurn[] = [];
      setMessages((prev) => {
        const next = [...prev, userMsg, placeholder];
        // Build the API payload from prev + the new user turn (no placeholder).
        // Strip our local-only fields and any errored/pending entries from history.
        apiMessages = [...prev, userMsg]
          .filter((m) => !m.pending && !m.error && m.content.length > 0)
          .map((m) => ({ role: m.role, content: m.content }));
        return next;
      });

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

        const { text, mood } = result.data;
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

        // Voice playback — fire-and-forget so the chat UI stays responsive
        // even if TTS is slow or fails. Errors are logged via console only;
        // the bubble already shows the typed text.
        if (voiceEnabled) {
          (async () => {
            try {
              const ttsToken = await getCurrentIdToken();
              const ttsResult = await fetchSenpaiAudio(text, undefined, ttsToken ?? undefined);
              if (ttsResult.ok) {
                await playSenpaiAudio(ttsResult.data.audioBase64);
              } else {
                // eslint-disable-next-line no-console
                console.warn('[senpaiSpeak]', ttsResult.error.code, ttsResult.error.message);
              }
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[senpaiSpeak] playback failed', e);
            }
          })();
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, triggerReaction, gamState, myLogs, user, voiceEnabled],
  );

  // Stop any in-flight audio when the consumer unmounts (modal closes)
  useEffect(() => {
    return () => stopSenpaiAudio();
  }, []);

  const clear = useCallback(async () => {
    setMessages([]);
    setError(null);
    setLastArrivedId(null);
    await AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  return {
    messages,
    loading,
    error,
    lastArrivedId,
    voiceEnabled,
    setVoiceEnabled,
    send,
    clear,
  };
}
