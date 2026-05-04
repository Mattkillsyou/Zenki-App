/**
 * Client for the Senpai AI chat endpoint.
 *
 * Mirrors the contract of `aiVision.ts`:
 *   POST {AI_FUNCTION_BASE_URL}/senpaiChat
 *   Headers:   Authorization: Bearer <firebase-id-token>
 *              Content-Type:  application/json
 *   Body:      { messages: [{role, content}, ...], userContext?: {...} }
 *   Response:  { text: string, mood: MascotMood, usage: {...} }
 *
 * userContext is the user's fitness state snapshot — the model only sees
 * it via the `get_user_stats` tool, so it stays out of the prompt cache
 * prefix. Phase 3 of the AI chat feature.
 *
 * The function source lives in `functions/src/senpaiChat.ts`.
 * Persona + design notes: `SENPAI_AI_CHAT_PROMPT.md` at project root.
 */

import { AI_FUNCTION_BASE_URL } from '../config/api';
import type { MascotMood } from '../context/SenpaiContext';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface SenpaiUserContext {
  level?: number;
  streakDays?: number;
  longestStreakDays?: number;
  totalSessions?: number;
  badgeCount?: number;
  flames?: number;
  daysSinceLastWorkout?: number;
  recentWorkouts?: Array<{
    date: string;
    title: string;
    format?: string;
    result?: string;
  }>;
}

export interface SenpaiChatReply {
  text: string;
  mood: MascotMood;
  usage: {
    input: number;
    output: number;
    cached: number;
    cacheCreated?: number;
  };
}

export interface SenpaiChatError {
  code: 'no_auth' | 'no_network' | 'server_error' | 'parse_error' | 'rate_limit';
  message: string;
}

export type SenpaiChatResult =
  | { ok: true; data: SenpaiChatReply }
  | { ok: false; error: SenpaiChatError };

export async function sendSenpaiChat(
  messages: ChatTurn[],
  userContext?: SenpaiUserContext,
  idToken?: string,
): Promise<SenpaiChatResult> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const res = await fetch(`${AI_FUNCTION_BASE_URL}/senpaiChat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, userContext }),
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: { code: 'no_auth', message: 'Please sign in again.' } };
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        error: { code: 'rate_limit', message: body?.error ?? 'Senpai needs a nap. Try again later.' },
      };
    }
    if (!res.ok) {
      return { ok: false, error: { code: 'server_error', message: `HTTP ${res.status}` } };
    }

    const json = (await res.json()) as SenpaiChatReply;
    return { ok: true, data: json };
  } catch (e: any) {
    if (e?.message?.includes('Network') || e?.message?.includes('fetch')) {
      return { ok: false, error: { code: 'no_network', message: 'No internet connection.' } };
    }
    return { ok: false, error: { code: 'parse_error', message: e?.message ?? 'Unknown error' } };
  }
}
