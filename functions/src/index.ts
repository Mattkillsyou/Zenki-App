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
  buildFoodRecognitionUserPrompt,
  safeParseJson,
} from './prompts';

// Re-export the deleteAccount endpoint from its own file.
export { deleteAccount } from './deleteAccount';

// Re-export the admin moderation endpoint.
export { adminActionReport } from './adminActionReport';

// Cascade post deletion (post doc + likes/comments subcollections + Storage
// media). Authored-by or admin. Fixes the orphaned-subcollection leak.
export { deletePostCascade } from './deletePostCascade';

// Admin "ban / eject user" — disables the Firebase Auth account (Apple 1.2).
export { banUser } from './banUser';

// Admin HARD delete — fully erases a target user (same cascade as self-service
// deleteAccount). Admin-gated; refuses self / other admins. Used by the web
// admin's Members tab to clear out test accounts.
export { adminDeleteUser } from './adminDeleteUser';

// The authority for SPENDABLE currency (Dojo Points 💎 / Flames). Firestore rules
// pin the balance fields immutable to the client, so this is the only thing that
// can move them — points redeem for real merchandise, and a member holding their
// own ID token must not be able to mint product from a browser. Server-owned
// reward table + per-mutation idempotency (doubles as the audit ledger).
export { pointsLedger } from './pointsLedger';

// Firestore trigger: push admins on every new report (≤24h review SLA backstop).
export { notifyOnReport } from './notifyOnReport';

// HTTP (admin-gated): broadcast a push notification to all members. The web
// admin can't call Expo directly (browser CORS), so it routes through here.
export { broadcastPush } from './broadcastPush';

// HTTP (admin-gated): surface /supportMessages to the web admin's Support tab.
// The collection is client-read:false (contact PII), so the Admin SDK is the
// only sanctioned read path — fixes the "Contact IT black hole" (audit 2.0.5).
export { listSupportMessages } from './listSupportMessages';

// Firestore triggers: maintain denormalized follower/following counts on /users
// from the follower-edge source of truth (abuse-proof; client can't write them).
export { onFollowerEdgeCreated, onFollowerEdgeDeleted } from './followerCounters';

// Firestore triggers + one-shot backfill: maintain a /blockedBy mirror of the
// /blocks graph so a blocked user can be hidden bidirectionally (they stop seeing
// the blocker too). Mirror is Admin-SDK-written only — clients can't forge it.
export { onBlockCreated, onBlockDeleted, backfillBlockedBy } from './blockMirror';

// One-shot admin migration — stamp authorIsPrivate on pre-existing posts so the
// feed's where('authorIsPrivate','==',false) doesn't drop legacy posts. Run once.
export { backfillPostPrivacy } from './backfillPostPrivacy';

// One-shot admin migration — seed users.followerCount/followingCount from the
// real subcollection counts so the increment triggers start from a correct base
// (increment on an absent field would otherwise initialize it to ±1). Run once.
export { backfillFollowCounts } from './backfillFollowCounts';

// One-shot admin migration — re-stamp each appointment's firebaseUid to the
// booking member's uid so the owner-scoped read rule doesn't hide legacy
// bookings (F25). Run once after deploying the tightened rule.
export { backfillAppointmentOwners } from './backfillAppointmentOwners';

// One-shot admin migration — strip the legacy `member:` PII blob (real email
// + name) from every /users doc (finding 1-P1.2). Run once after deploy.
export { backfillUsersPii } from './backfillUsersPii';

// One-shot admin migration — stamp firebaseUid on legacy PERSONAL employee
// tasks so the owner-scoped read rule doesn't hide them (1-P2.32). Run once
// with the tightened /employeeTasks rules deploy.
export { backfillEmployeeTaskOwners } from './backfillEmployeeTaskOwners';

// One-shot admin sweep — purge /nutrition/{uid} trees whose Auth user no
// longer exists (accounts deleted before deleteAccount purged nutrition —
// finding 1-P1.3). Dry-run by default; pass {"dryRun":false} to delete.
export { sweepOrphanedNutrition } from './sweepOrphanedNutrition';

// Stripe webhook — server-authoritative payment reconciliation (records every
// succeeded/failed PaymentIntent in payments/{id}). Owner sets STRIPE_WEBHOOK_SECRET
// + registers the endpoint; inert until then.
export { stripeWebhook } from './stripeWebhook';

// Admin moderation — redact an offender's messages in a reported conversation
// (DM "Remove & Block"). Client can't redact other users' messages.
export { redactDmMessages } from './redactDmMessages';

// Re-export the Zenki-branded password-reset email endpoint (Resend).
export { sendPasswordReset } from './sendPasswordReset';

// Server-side invite-code validation (launch report P2-2). Public endpoint —
// the invite gate runs pre-auth; validates against the inviteCodes collection.
export { validateInviteCode } from './validateInviteCode';

// Public pre-auth contact/membership-inquiry endpoint — lets a non-member's
// "Contact Us" form reach the dojo (writes supportMessages via Admin SDK with
// per-IP rate limiting, since that collection is auth-gated for direct writes).
export { submitContactInquiry } from './submitContactInquiry';

// Stripe PaymentIntent creation for in-app Apple Pay / card checkout
// (clothing store + drink tab). Bearer-token auth + per-UID rate limiting.
export { createPaymentIntent } from './createPaymentIntent';

// Senpai AI chat endpoint — Daria-meets-DDLC chibi mascot powered by Sonnet 4.6.
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
  /** Optional free-form user hint, only honored by `recognizeFood`. Sanitized
   *  + length-clamped server-side before being included in the model prompt. */
  userHint?: string;
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
      const userPrompt = buildFoodRecognitionUserPrompt(req.body.userHint);
      const text = await callClaude(
        FOOD_RECOGNITION_PROMPT.system,
        userPrompt,
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

      // Shape guard + clamp (mirrors recognizeFood). The model occasionally
      // returns string numbers ("22.5"), which pass the client's review UI
      // untouched and then crash `.toFixed()` renders in DexaScansScreen.
      // Number-coerce every metric, drop non-finite values, and whitelist
      // the known keys so the client only ever sees clean shapes.
      const num = (v: unknown): number | undefined => {
        if (v == null || v === '') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const region = (r: any): { leanKg?: number; fatKg?: number } | undefined => {
        if (!r || typeof r !== 'object') return undefined;
        const leanKg = num(r.leanKg);
        const fatKg = num(r.fatKg);
        if (leanKg === undefined && fatKg === undefined) return undefined;
        return {
          ...(leanKg !== undefined ? { leanKg } : {}),
          ...(fatKg !== undefined ? { fatKg } : {}),
        };
      };
      const clean: Record<string, unknown> = {};
      if (typeof parsed.scanDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.scanDate)) {
        clean.scanDate = parsed.scanDate;
      }
      const NUM_FIELDS = [
        'totalBodyFatPct', 'fatMassKg', 'leanMassKg', 'bmc',
        'vatCm2', 'fmi', 'ffmi', 'androidGynoidRatio',
      ] as const;
      for (const key of NUM_FIELDS) {
        const n = num(parsed[key]);
        if (n !== undefined) clean[key] = n;
      }
      const regional: Record<string, unknown> = {};
      for (const part of ['arms', 'legs', 'trunk'] as const) {
        const r = region(parsed.regional?.[part]);
        if (r) regional[part] = r;
      }
      if (Object.keys(regional).length > 0) clean.regional = regional;
      if (typeof parsed.notes === 'string' && parsed.notes.trim()) {
        clean.notes = parsed.notes.slice(0, 500);
      }

      res.json(clean);
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
      const parsed = safeParseJson<{ testDate?: unknown; labName?: unknown; biomarkers: any[] }>(text);
      if (!parsed || !Array.isArray(parsed.biomarkers)) {
        res.status(502).send('Invalid model output');
        return;
      }

      // Shape guard + clamp (mirrors recognizeFood): Number-coerce values,
      // drop biomarkers without a finite value (the prompt already asks the
      // model to drop them), and whitelist status/category enums so an
      // off-enum string can't hide rows in the client's grouped detail view.
      const num = (v: unknown): number | undefined => {
        if (v == null || v === '') return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const STATUSES = ['optimal', 'sufficient', 'out_of_range', 'unknown'];
      const CATEGORIES = ['CBC', 'Lipid', 'Metabolic', 'Thyroid', 'Hormone', 'Vitamin', 'Other'];
      const biomarkers = parsed.biomarkers.slice(0, 100).flatMap((b: any) => {
        const value = num(b?.value);
        if (value === undefined) return [];
        const referenceLow = num(b?.referenceLow);
        const referenceHigh = num(b?.referenceHigh);
        return [{
          name: String(b?.name ?? 'Unknown').slice(0, 80),
          ...(typeof b?.displayName === 'string' && b.displayName.trim()
            ? { displayName: b.displayName.slice(0, 80) }
            : {}),
          value,
          unit: String(b?.unit ?? '').slice(0, 24),
          ...(referenceLow !== undefined ? { referenceLow } : {}),
          ...(referenceHigh !== undefined ? { referenceHigh } : {}),
          status: STATUSES.includes(b?.status) ? b.status : 'unknown',
          category: CATEGORIES.includes(b?.category) ? b.category : 'Other',
        }];
      });
      const out: Record<string, unknown> = { biomarkers };
      if (typeof parsed.testDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.testDate)) {
        out.testDate = parsed.testDate;
      }
      if (typeof parsed.labName === 'string' && parsed.labName.trim()) {
        out.labName = parsed.labName.slice(0, 80);
      }
      res.json(out);
    } catch (e: any) {
      logger.error('parseBloodwork failed', e);
      res.status(500).send('Processing failed');
    }
  },
);
