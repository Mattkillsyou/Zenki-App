/**
 * Firebase Cloud Functions — AI vision endpoints for Zenki Dojo.
 *
 * Each HTTPS endpoint:
 *   1. Verifies a Firebase Auth ID token (Authorization: Bearer ...).
 *   2. Rate-limits per UID.
 *   3. Forwards the image to Anthropic Claude Vision with a structured-output prompt.
 *   4. Parses and validates the model output before returning it.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import Anthropic from '@anthropic-ai/sdk';
import { enforceRateLimit } from './rateLimit';
import {
  FOOD_RECOGNITION_PROMPT,
  DEXA_EXTRACTION_PROMPT,
  BLOODWORK_EXTRACTION_PROMPT,
  safeParseJson,
} from './prompts';

// Re-export the deleteAccount endpoint from its own file.
export { deleteAccount } from './deleteAccount';

// Re-export the admin moderation endpoint.
export { adminActionReport } from './adminActionReport';

// Re-export the Zenki-branded password-reset email endpoint (Resend).
export { sendPasswordReset } from './sendPasswordReset';

// DEBUG ONLY — temporary triage endpoint, remove after the post pipeline is
// confirmed end-to-end on TestFlight.
export { diagPostsCount } from './diagPostsCount';

// Senpai AI chat endpoint — Daria-meets-DDLC chibi mascot powered by Haiku 4.5.
// See SENPAI_AI_CHAT_PROMPT.md for design + persona reference.
export { senpaiChat } from './senpaiChat';

// Senpai TTS endpoint — wraps ElevenLabs to give the chibi mascot a voice.
// Requires ELEVENLABS_API_KEY secret + at least Starter ($5/mo) plan.
export { senpaiSpeak } from './senpaiSpeak';

// ─────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────

admin.initializeApp();

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// Claude model ID — newest Sonnet tier, best reasoning ↔ cost ratio for vision
const MODEL = 'claude-sonnet-4-5';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

interface VisionRequest {
  imageBase64?: string;
  mimeType?: 'image/jpeg' | 'image/png' | 'application/pdf';
}

// ─────────────────────────────────────────────
// Shared validation + auth
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

function validateImagePayload(body: VisionRequest): string | null {
  if (!body?.imageBase64) return 'imageBase64 required';
  if (!body?.mimeType) return 'mimeType required';
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(body.mimeType)) {
    return 'unsupported mimeType';
  }
  // Rough size check — base64 is ~4/3 of raw bytes
  const estimatedBytes = (body.imageBase64.length * 3) / 4;
  if (estimatedBytes > MAX_IMAGE_BYTES) return 'image too large (max 8 MB)';
  return null;
}

// ─────────────────────────────────────────────
// Anthropic client helper
// ─────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'application/pdf',
  apiKey: string,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  // PDFs require the document content type rather than image
  const contentBlock =
    mediaType === 'application/pdf'
      ? {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: imageBase64,
          },
        }
      : {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mediaType,
            data: imageBase64,
          },
        };

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [contentBlock as any, { type: 'text', text: userPrompt }],
      },
    ],
  });

  // Concatenate all text blocks
  const text = message.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
    .trim();

  return text;
}

// ─────────────────────────────────────────────
// Endpoint: POST /recognizeFood  → Phase 3
// ─────────────────────────────────────────────

export const recognizeFood = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 60, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await authenticate(req);
    if ('error' in auth) { res.status(auth.status).send(auth.error); return; }

    const rate = await enforceRateLimit(auth.uid, 'recognizeFood');
    if (!rate.ok) { res.status(429).send(rate.reason); return; }

    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) { res.status(400).send(bodyErr); return; }

    try {
      const text = await callClaude(
        FOOD_RECOGNITION_PROMPT.system,
        FOOD_RECOGNITION_PROMPT.user,
        req.body.imageBase64,
        req.body.mimeType as any,
        ANTHROPIC_API_KEY.value(),
      );
      const parsed = safeParseJson<{ foods: any[] }>(text);
      if (!parsed || !Array.isArray(parsed.foods)) {
        res.status(502).send('Invalid model output');
        return;
      }

      // Shape guard + clamp
      const foods = parsed.foods.slice(0, 10).map((f: any) => ({
        name: String(f?.name ?? 'Unknown').slice(0, 80),
        estimatedGrams: Math.max(0, Math.round(Number(f?.estimatedGrams) || 0)),
        confidence: ['low', 'medium', 'high'].includes(f?.confidence) ? f.confidence : 'medium',
        macros: {
          calories: Math.max(0, Math.round(Number(f?.macros?.calories) || 0)),
          protein: Math.max(0, Math.round(Number(f?.macros?.protein) * 10) / 10 || 0),
          carbs: Math.max(0, Math.round(Number(f?.macros?.carbs) * 10) / 10 || 0),
          fat: Math.max(0, Math.round(Number(f?.macros?.fat) * 10) / 10 || 0),
        },
      }));

      res.json({ foods });
    } catch (e: any) {
      logger.error('recognizeFood failed', e);
      res.status(500).send('Processing failed');
    }
  },
);

// ─────────────────────────────────────────────
// Endpoint: POST /extractDexa  → Phase 4
// ─────────────────────────────────────────────

export const extractDexa = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 90, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await authenticate(req);
    if ('error' in auth) { res.status(auth.status).send(auth.error); return; }

    const rate = await enforceRateLimit(auth.uid, 'extractDexa');
    if (!rate.ok) { res.status(429).send(rate.reason); return; }

    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) { res.status(400).send(bodyErr); return; }

    try {
      const text = await callClaude(
        DEXA_EXTRACTION_PROMPT.system,
        DEXA_EXTRACTION_PROMPT.user,
        req.body.imageBase64,
        req.body.mimeType as any,
        ANTHROPIC_API_KEY.value(),
      );
      const parsed = safeParseJson<any>(text);
      if (!parsed) { res.status(502).send('Invalid model output'); return; }

      res.json(parsed);
    } catch (e: any) {
      logger.error('extractDexa failed', e);
      res.status(500).send('Processing failed');
    }
  },
);

// ─────────────────────────────────────────────
// Endpoint: POST /parseBloodwork  → Phase 5
// ─────────────────────────────────────────────

export const parseBloodwork = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, memory: '512MiB', timeoutSeconds: 90, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await authenticate(req);
    if ('error' in auth) { res.status(auth.status).send(auth.error); return; }

    const rate = await enforceRateLimit(auth.uid, 'parseBloodwork');
    if (!rate.ok) { res.status(429).send(rate.reason); return; }

    const bodyErr = validateImagePayload(req.body);
    if (bodyErr) { res.status(400).send(bodyErr); return; }

    try {
      const text = await callClaude(
        BLOODWORK_EXTRACTION_PROMPT.system,
        BLOODWORK_EXTRACTION_PROMPT.user,
        req.body.imageBase64,
        req.body.mimeType as any,
        ANTHROPIC_API_KEY.value(),
      );
      const parsed = safeParseJson<{ biomarkers: any[] }>(text);
      if (!parsed || !Array.isArray(parsed.biomarkers)) {
        res.status(502).send('Invalid model output');
        return;
      }
      res.json(parsed);
    } catch (e: any) {
      logger.error('parseBloodwork failed', e);
      res.status(500).send('Processing failed');
    }
  },
);
