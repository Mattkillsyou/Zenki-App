/**
 * Client for the Senpai TTS endpoint.
 *
 *   POST {AI_FUNCTION_BASE_URL}/senpaiSpeak
 *   Headers: Authorization: Bearer <firebase-id-token>
 *   Body:    { text: string, voiceId?: string, signature?: string }
 *   Response: { audioBase64: string, mimeType: 'audio/mpeg', characters: number }
 *
 * `signature` is the speakSignature the senpaiChat endpoint returned
 * alongside the reply (audit E3) — an opaque HMAC binding the text to that
 * reply. The backend refuses to voice unsigned/stale text once enforcement
 * is on, so callers must thread it through untouched.
 *
 * The audio is returned as base64-encoded MP3 so we can decode + play
 * via expo-audio without a separate file download. Caller writes the
 * bytes to a tempfile and feeds that URI to expo-audio's player.
 *
 * Voice ID — pass any ElevenLabs voice ID, or omit to use the backend
 * default (currently Rachel, a calm young female). Browse voices at
 * https://elevenlabs.io/app/voice-library and grab a `voice_id` to
 * override here. To change the global default, edit DEFAULT_VOICE_ID
 * in functions/src/senpaiSpeak.ts.
 */

import { AI_FUNCTION_BASE_URL } from '../config/api';

export interface SenpaiSpeakResult {
  audioBase64: string;
  mimeType: string;
  characters: number;
}

export interface SenpaiSpeakError {
  code: 'no_auth' | 'no_network' | 'rate_limit' | 'tts_error' | 'parse_error';
  message: string;
}

export type SenpaiSpeakResponse =
  | { ok: true; data: SenpaiSpeakResult }
  | { ok: false; error: SenpaiSpeakError };

// Hard cap on a single TTS round-trip. Without this, a stalled (half-open)
// response leaves the caller's ttsPlaying=true and the hold-to-talk mic
// stuck until the OS socket timeout (~1-2 min). Mirrors sendSenpaiChat.
const REQUEST_TIMEOUT_MS = 35_000;

// Mirror of the server's MAX_TEXT_CHARS (functions/src/senpaiSpeak.ts).
// Truncate BEFORE sending: a deployed function may still hard-REJECT
// over-cap text with a 400, which maps to 'tts_error' below — one of the
// E2 strike codes that auto-disable voice after two hits. A clipped tail
// on a rare verbose line beats a strike toward going permanently mute.
const MAX_TTS_CHARS = 300;
function capTtsText(t: string): string {
  if (t.length <= MAX_TTS_CHARS) return t;
  let cut = t.slice(0, MAX_TTS_CHARS);
  // Don't split a surrogate pair (emoji) at the boundary.
  const lastUnit = cut.charCodeAt(cut.length - 1);
  if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

export async function fetchSenpaiAudio(
  text: string,
  voiceId?: string,
  idToken?: string,
  // speakSignature from the senpaiChat reply (audit E3). Optional only for
  // legacy/version-skew tolerance — without it the backend rejects the
  // request once signature enforcement is on.
  signature?: string,
): Promise<SenpaiSpeakResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const res = await fetch(`${AI_FUNCTION_BASE_URL}/senpaiSpeak`, {
      method: 'POST',
      headers,
      // capTtsText mirrors the server's canonicalization (trim + 300-char
      // cap), so truncating here can't invalidate the signature — the
      // backend canonicalizes the received text before verifying.
      body: JSON.stringify({ text: capTtsText(text), voiceId, signature }),
      signal: controller.signal,
    });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: { code: 'no_auth', message: 'Please sign in again.' } };
    }
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: { code: 'rate_limit', message: body?.error ?? 'TTS rate limited.' } };
    }
    if (res.status === 503) {
      return { ok: false, error: { code: 'tts_error', message: 'ElevenLabs quota exceeded.' } };
    }
    if (!res.ok) {
      // Pull the body so we can surface the actual server reason
      // (e.g. "text required", "text too long") instead of a bare HTTP
      // code that gives no signal. Body parse is best-effort.
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        error: { code: 'tts_error', message: `HTTP ${res.status}: ${body || 'no body'}` },
      };
    }

    const json = (await res.json()) as SenpaiSpeakResult;
    if (!json?.audioBase64) {
      return { ok: false, error: { code: 'parse_error', message: 'No audio returned' } };
    }
    return { ok: true, data: json };
  } catch (e: any) {
    // AbortError from our timeout. Without this branch, a hung fetch would
    // leave the caller's ttsPlaying=true and block the next hold-to-talk gesture.
    if (e?.name === 'AbortError') {
      return { ok: false, error: { code: 'no_network', message: 'TTS timed out.' } };
    }
    if (e?.message?.includes('Network') || e?.message?.includes('fetch')) {
      return { ok: false, error: { code: 'no_network', message: 'No internet connection.' } };
    }
    return { ok: false, error: { code: 'parse_error', message: e?.message ?? 'Unknown error' } };
  } finally {
    clearTimeout(timeoutId);
  }
}
