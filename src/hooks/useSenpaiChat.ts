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

import { sendSenpaiChat, type ChatTurn, type SenpaiChatError } from '../services/senpaiChat';
import { getCurrentIdToken } from '../services/firebaseAuth';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';

const HISTORY_KEY = '@senpai_chat_history';
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

export function useSenpaiChat() {
  const { triggerReaction } = useSenpai();
  const [messages, setMessages] = useState<ChatThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SenpaiChatError | null>(null);
  const hydratedRef = useRef(false);

  // Load persisted history on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_PERSISTED_TURNS));
        }
      } catch {
        /* ignore — fresh history is fine */
      } finally {
        hydratedRef.current = true;
      }
    })();
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
        const token = await getCurrentIdToken();
        const result = await sendSenpaiChat(apiMessages, token ?? undefined);

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

        // Mirror the chat reply into the floating mascot animation
        try {
          triggerReaction(mood, text, 4000);
        } catch {
          /* non-fatal */
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, triggerReaction],
  );

  const clear = useCallback(async () => {
    setMessages([]);
    setError(null);
    await AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  return { messages, loading, error, send, clear };
}
