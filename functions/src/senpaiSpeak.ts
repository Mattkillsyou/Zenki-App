/**
 * Firebase Cloud Function — Senpai TTS endpoint.
 *
 * Wraps the ElevenLabs Text-to-Speech API so the API key stays server-side.
 *
 * Flow per request:
 *   1. Verify Firebase Auth ID token (Authorization: Bearer ...).
 *   2. Validate body { text: string }. A client-sent voiceId is deliberately
 *      IGNORED — see the security note at DEFAULT_VOICE_ID below.
 *   3. Rate-limit per UID via enforceRateLimit('senpaiSpeak').
 *   4. POST to ElevenLabs /v1/text-to-speech/{voice_id} with model
 *      `eleven_flash_v2_5` — half the credit cost and ~75ms latency,
 *      well-suited for chat replies that are short and need to feel snappy.
 *   5. Return the MP3 bytes as base64 in JSON so the iOS client can decode
 *      and play via expo-audio without a separate file download step.
 *   6. Log usage to Firestore senpaiUsage for cost tracking.
 *
 * Voice selection: pinned server-side to DEFAULT_VOICE_ID (Hina — see
 * below). Pick a different voice from
 * https://elevenlabs.io/app/voice-library and change DEFAULT_VOICE_ID
 * here to change it globally.
 *
 * Cost note: ElevenLabs Starter ($5/mo) = 30K characters; Creator ($22/mo)
 * = 100K. At ~80 chars/reply, Starter covers ~375 replies/mo. Keep an eye
 * on the senpaiUsage collection if usage grows.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from './rateLimit';

const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY');

// Hina — community voice (Shunshun, "Japanese Cute Voice"). Young Japanese
// female, anime idol style, kawaii — Japanese-accent English via the
// multilingual flash model. Picked from the ElevenLabs voice library
// (29.4K users) as the closest match for インスタのビッチ's chaotic-feral
// magical-girl energy.
//
// SECURITY (audit E3): the voice is PINNED here. A client-sent `voiceId`
// used to be honored, which made this endpoint an open TTS proxy — any
// authed user could synthesize arbitrary text in ANY ElevenLabs voice on
// the app's key. The shipped client never sent one (useSenpaiChat passes
// undefined), so the override existed only as abuse surface. Ignore it.
const DEFAULT_VOICE_ID = 'lhTvHflPVOqgSWyuWQry';

const MODEL_ID = 'eleven_flash_v2_5';
// Hard cap to avoid runaway TTS costs. SPEAK lines are 1–2 short Japanese
// sentences (~80 chars typical, prompt-capped to ~6s of audio) — 300 gives
// generous headroom while keeping the worst case at 60 req/day/uid from
// burning the ElevenLabs quota (audit E3; was 1500).
const MAX_TEXT_CHARS = 300;

// ─────────────────────────────────────────────
// Auth (mirror of senpaiChat.ts pattern)
// ─────────────────────────────────────────────

async function authenticate(req: any): Promise<{ uid: string } | { error: string; status: number }> {
  const auth = req.get('Authorization') || req.headers?.authorization;
  if (!auth?.startsWith('Bearer ')) return { error: 'Missing token', status: 401 };
  const token = auth.substring(7);
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return { uid: decoded.uid };
  } catch (e) {
    return { error: 'Invalid token', status: 401 };
  }
}

// ─────────────────────────────────────────────
// Endpoint
// ─────────────────────────────────────────────

interface SpeakRequest {
  text?: string;
  // Accepted in the body for backwards compat but IGNORED (audit E3) —
  // the voice is pinned server-side to DEFAULT_VOICE_ID.
  voiceId?: string;
}

export const senpaiSpeak = onRequest(
  {
    secrets: [ELEVENLABS_API_KEY],
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' });
      return;
    }

    // 1. Auth
    const authResult = await authenticate(req);
    if ('error' in authResult) {
      res.status(authResult.status).json({ error: authResult.error });
      return;
    }
    const { uid } = authResult;

    // 2. Validate
    const body = (req.body ?? {}) as SpeakRequest;
    let text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'text required (non-empty string)' });
      return;
    }
    // Over-cap text is TRUNCATED, not rejected: nothing upstream bounds the
    // model's SPEAK line (parseSenpaiResponse has no length cap and the
    // client sends it verbatim), so a verbose reply used to 400 here — and
    // the client maps any 4xx to 'tts_error', one of the E2 strike codes
    // that auto-disable voice after two hits. Cutting the tail preserves the
    // exact same cost cap while long lines still play. Slice on a code-point
    // boundary so a surrogate pair (emoji) can't be split into a lone half.
    if (text.length > MAX_TEXT_CHARS) {
      let cut = text.slice(0, MAX_TEXT_CHARS);
      const lastUnit = cut.charCodeAt(cut.length - 1);
      if (lastUnit >= 0xd800 && lastUnit <= 0xdbff) cut = cut.slice(0, -1);
      text = cut;
    }
    // Deliberately ignore body.voiceId (audit E3): honoring it made this an
    // open proxy for any ElevenLabs voice on the app's key.
    const voiceId = DEFAULT_VOICE_ID;

    // 3. Rate limit
    const limit = await enforceRateLimit(uid, 'senpaiSpeak');
    if (!limit.ok) {
      res.status(429).json({ error: limit.reason });
      return;
    }

    // 4. Call ElevenLabs
    const apiKey = ELEVENLABS_API_KEY.value();
    let audioBuffer: Buffer;
    try {
      const elResp = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: MODEL_ID,
            voice_settings: {
              // Tuned for a chaotic, expressive character — looser
              // stability lets her hit highs and lows; higher style turns
              // up emotional exaggeration so "EEEEE!!" and "tee hee!!"
              // actually land in audio.
              stability: 0.30,
              similarity_boost: 0.70,
              style: 0.55,
              use_speaker_boost: true,
            },
          }),
        },
      );

      if (!elResp.ok) {
        const errText = await elResp.text().catch(() => '');
        logger.error('[senpaiSpeak] ElevenLabs error', { uid, status: elResp.status, errText });
        if (elResp.status === 401) {
          res.status(502).json({ error: 'TTS auth failed (check ELEVENLABS_API_KEY secret)' });
        } else if (elResp.status === 429) {
          res.status(503).json({ error: 'TTS quota exceeded — check ElevenLabs plan' });
        } else {
          res.status(502).json({ error: 'TTS upstream error' });
        }
        return;
      }

      const arrayBuf = await elResp.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuf);
    } catch (err: any) {
      logger.error('[senpaiSpeak] ElevenLabs fetch failed', { uid, error: err?.message });
      res.status(502).json({ error: 'TTS network error' });
      return;
    }

    // 5. Log usage to Firestore (fire-and-forget). Tracks the character
    // count which maps directly to ElevenLabs billing.
    admin
      .firestore()
      .collection('senpaiUsage')
      .add({
        uid,
        ts: admin.firestore.FieldValue.serverTimestamp(),
        kind: 'speak',
        voiceId,
        characters: text.length,
        bytesReturned: audioBuffer.length,
      })
      .catch((e) => logger.warn('[senpaiSpeak] usage log failed', { error: e?.message }));

    // 6. Return base64 mp3 — small enough at ~80-char replies (~10-20KB)
    // that the JSON wrapper overhead is fine and the client can play it
    // directly via expo-audio without a separate download step.
    res.json({
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/mpeg',
      characters: text.length,
    });
  },
);
