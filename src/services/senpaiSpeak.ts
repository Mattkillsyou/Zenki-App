/**
 * Client for the Senpai TTS endpoint.
 *
 *   POST {AI_FUNCTION_BASE_URL}/senpaiSpeak
 *   Headers: Authorization: Bearer <firebase-id-token>
 *   Body:    { text: string, voiceId?: string }
 *   Response: { audioBase64: string, mimeType: 'audio/mpeg', characters: number }
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

export async function fetchSenpaiAudio(
  text: string,
  voiceId?: string,
  idToken?: string,
): Promise<SenpaiSpeakResponse> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const res = await fetch(`${AI_FUNCTION_BASE_URL}/senpaiSpeak`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, voiceId }),
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
      return { ok: false, error: { code: 'tts_error', message: `HTTP ${res.status}` } };
    }

    const json = (await res.json()) as SenpaiSpeakResult;
    if (!json?.audioBase64) {
      return { ok: false, error: { code: 'parse_error', message: 'No audio returned' } };
    }
    return { ok: true, data: json };
  } catch (e: any) {
    if (e?.message?.includes('Network') || e?.message?.includes('fetch')) {
      return { ok: false, error: { code: 'no_network', message: 'No internet connection.' } };
    }
    return { ok: false, error: { code: 'parse_error', message: e?.message ?? 'Unknown error' } };
  }
}
