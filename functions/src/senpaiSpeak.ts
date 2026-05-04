/**
 * Firebase Cloud Function — Senpai TTS endpoint.
 *
 * Wraps the ElevenLabs Text-to-Speech API so the API key stays server-side.
 *
 * Flow per request:
 *   1. Verify Firebase Auth ID token (Authorization: Bearer ...).
 *   2. Validate body { text: string, voiceId?: string }.
 *   3. Rate-limit per UID via enforceRateLimit('senpaiSpeak').
 *   4. POST to ElevenLabs /v1/text-to-speech/{voice_id} with model
 *      `eleven_flash_v2_5` — half the credit cost and ~75ms latency,
 *      well-suited for chat replies that are short and need to feel snappy.
 *   5. Return the MP3 bytes as base64 in JSON so the iOS client can decode
 *      and play via expo-audio without a separate file download step.
 *   6. Log usage to Firestore senpaiUsage for cost tracking.
 *
 * Voice selection: client passes a voiceId; falls back to the default
 * (currently `Rachel`, calm young female). Pick a different voice from
 * https://elevenlabs.io/app/voice-library and set it in
 * src/services/senpaiSpeak.ts → DEFAULT_VOICE_ID to change globally.
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

// Rachel — calm young female, decent fit for the Daria-DDLC deadpan.
// Override per-request via the `voiceId` body field.
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const MODEL_ID = 'eleven_flash_v2_5';
const MAX_TEXT_CHARS = 1500; // hard cap to avoid runaway TTS costs

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
  voiceId?: string;
}

export const senpaiSpeak = onRequest(
  {
    secrets: [ELEVENLABS_API_KEY],
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
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
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      res.status(400).json({ error: 'text required (non-empty string)' });
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      res.status(400).json({ error: `text too long (max ${MAX_TEXT_CHARS} chars)` });
      return;
    }
    const voiceId = typeof body.voiceId === 'string' && body.voiceId.length > 0
      ? body.voiceId
      : DEFAULT_VOICE_ID;

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
              stability: 0.45,        // slightly looser → more natural
              similarity_boost: 0.75,
              style: 0.15,            // a touch of expression for the deadpan
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
