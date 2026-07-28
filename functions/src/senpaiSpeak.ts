/**
 * Firebase Cloud Function — Senpai TTS endpoint.
 *
 * Wraps the ElevenLabs Text-to-Speech API so the API key stays server-side.
 *
 * Flow per request:
 *   1. Verify Firebase Auth ID token (Authorization: Bearer ...).
 *   2. Validate body { text: string, signature?: string }. A client-sent
 *      voiceId is deliberately IGNORED — see the security note at
 *      DEFAULT_VOICE_ID below.
 *   3. Verify the HMAC signature senpaiChat minted over the text (audit E3):
 *      only text the chat model actually returned — same uid, fresh — gets
 *      voiced. Unsigned/invalid text is rejected with 400 when
 *      SENPAI_TTS_REQUIRE_SIGNATURE is on (see senpaiTtsSigning.ts).
 *   4. Rate-limit per UID via enforceRateLimit('senpaiSpeak').
 *   5. Reserve characters against the GLOBAL daily budget (audit E3) —
 *      Firestore counter senpaiTtsBudget/{YYYY-MM-DD}, atomic transaction.
 *      Fail-open if the counter can't be read; fail-closed past the budget.
 *      Default DAILY_CHAR_BUDGET_DEFAULT, overridable via the Firestore doc
 *      config/senpaiTts { dailyCharBudget: number } (no redeploy needed).
 *   6. POST to ElevenLabs /v1/text-to-speech/{voice_id} with model
 *      `eleven_flash_v2_5` — half the credit cost and ~75ms latency,
 *      well-suited for chat replies that are short and need to feel snappy.
 *   7. Return the MP3 bytes as base64 in JSON so the iOS client can decode
 *      and play via expo-audio without a separate file download step.
 *   8. Log usage to Firestore senpaiUsage for cost tracking.
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
import { defineBoolean, defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from './rateLimit';
import {
  SENPAI_TTS_SIGNING_SECRET,
  canonicalTtsText,
  verifySpeakSignature,
} from './senpaiTtsSigning';

const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY');

// E3 HMAC enforcement switch. When true, text without a valid fresh
// signature from senpaiChat is rejected with 400. ROLLOUT LANDMINE:
// clients already in the wild (App Store build ≤47) don't send signatures —
// enforcing before the signed client ships mutes their voice (two 400s trip
// the client's tts_error auto-disable, which PERSISTS voice-off). The
// default is therefore FALSE: `.env` files are gitignored, so a default of
// true would silently re-arm enforcement in every deploy environment that
// lacks the override. Flip to true via `SENPAI_TTS_REQUIRE_SIGNATURE=true`
// in functions/.env ONLY once the signed client is the installed floor.
// While false, invalid/missing signatures are logged (loudly) but synthesis
// proceeds.
const SENPAI_TTS_REQUIRE_SIGNATURE = defineBoolean('SENPAI_TTS_REQUIRE_SIGNATURE', {
  default: false,
  description:
    'Reject senpaiSpeak text that lacks a valid HMAC signature from senpaiChat. ' +
    'Keep false until all shipped clients pass speakSignature through.',
});

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
// Per-request hard cap (300 chars) lives in senpaiTtsSigning.ts
// (MAX_TTS_TEXT_CHARS) — shared with senpaiChat so the signature is minted
// over the exact same truncation the synthesis path applies. SPEAK lines are
// 1–2 short Japanese sentences (~80 chars typical, prompt-capped to ~6s of
// audio) — 300 gives generous headroom while keeping the worst case at
// 60 req/day/uid from burning the ElevenLabs quota (audit E3; was 1500).

// ─────────────────────────────────────────────
// Global daily character budget (audit E3)
//
// A cost circuit-breaker across ALL users: a Firestore counter doc per UTC
// day, incremented atomically BEFORE the ElevenLabs call (reserve-first — a
// failed synthesis still counts its characters; conservative beats racy).
// Semantics per the audit: fail-OPEN when the counter/config can't be read
// (a Firestore blip must not mute the mascot), fail-CLOSED once the budget
// is spent (429 → the client's 'rate_limit' path).
//
// Default: 2,000 chars/day ≈ 25 typical (~80-char) replies/day across the
// whole dozen-person userbase, worst case 60K chars/mo — 2× the Starter
// plan's 30K/mo quota, so one runaway day can't torch the month. Raise it
// without a redeploy via Firestore: config/senpaiTts { dailyCharBudget: N }.
// ─────────────────────────────────────────────
const DAILY_CHAR_BUDGET_DEFAULT = 2000;
const TTS_BUDGET_COLLECTION = 'senpaiTtsBudget';
const BUDGET_CONFIG_DOC = 'config/senpaiTts';
const BUDGET_CONFIG_TTL_MS = 60_000;

// Module-level cache so warm instances don't re-read the config doc on
// every request. Also serves as a stale fallback if a later read fails.
let cachedBudget: { value: number; fetchedAtMs: number } | null = null;

async function readDailyCharBudget(): Promise<number> {
  const now = Date.now();
  if (cachedBudget && now - cachedBudget.fetchedAtMs < BUDGET_CONFIG_TTL_MS) {
    return cachedBudget.value;
  }
  try {
    const snap = await admin.firestore().doc(BUDGET_CONFIG_DOC).get();
    const raw = snap.data()?.dailyCharBudget;
    const value =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : DAILY_CHAR_BUDGET_DEFAULT;
    cachedBudget = { value, fetchedAtMs: now };
    return value;
  } catch (e: any) {
    logger.warn('[senpaiSpeak] budget config read failed — using fallback', {
      error: e?.message,
    });
    // Stale cache beats the default if we have one (fail-open).
    return cachedBudget?.value ?? DAILY_CHAR_BUDGET_DEFAULT;
  }
}

/**
 * Atomically reserve `chars` against today's global budget.
 * ok:false = budget exhausted (fail-closed). Infra errors resolve ok:true
 * (fail-open) — only an explicit over-budget read blocks synthesis.
 */
async function reserveTtsBudget(chars: number): Promise<{ ok: true } | { ok: false; reason: string }> {
  const budget = await readDailyCharBudget();
  const day = new Date().toISOString().slice(0, 10); // UTC date, e.g. 2026-07-06
  const ref = admin.firestore().collection(TTS_BUDGET_COLLECTION).doc(day);
  try {
    return await admin.firestore().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const used = typeof snap.data()?.characters === 'number' ? (snap.data()!.characters as number) : 0;
      if (used + chars > budget) {
        return {
          ok: false as const,
          reason: `daily TTS budget exhausted (${used}/${budget} chars) — resets at midnight UTC`,
        };
      }
      tx.set(
        ref,
        {
          characters: used + chars,
          requests: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { ok: true as const };
    });
  } catch (e: any) {
    logger.warn('[senpaiSpeak] budget transaction failed — failing open', { error: e?.message });
    return { ok: true };
  }
}

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
  // HMAC signature minted by senpaiChat over this exact text (audit E3).
  // Verified below; without it (and enforcement on) synthesis is refused.
  signature?: string;
}

export const senpaiSpeak = onRequest(
  {
    secrets: [ELEVENLABS_API_KEY, SENPAI_TTS_SIGNING_SECRET],
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
    // Over-cap text is TRUNCATED, not rejected: nothing upstream bounds the
    // model's SPEAK line (parseSenpaiResponse has no length cap and the
    // client sends it verbatim), so a verbose reply used to 400 here — and
    // the client maps any 4xx to 'tts_error', one of the E2 strike codes
    // that auto-disable voice after two hits. canonicalTtsText applies the
    // same trim + 300-char surrogate-safe cap the signature was minted over
    // (senpaiTtsSigning.ts), so truncation and verification can't disagree.
    const text = canonicalTtsText(typeof body.text === 'string' ? body.text : '');
    if (!text) {
      res.status(400).json({ error: 'text required (non-empty string)' });
      return;
    }
    // Deliberately ignore body.voiceId (audit E3): honoring it made this an
    // open proxy for any ElevenLabs voice on the app's key.
    const voiceId = DEFAULT_VOICE_ID;

    // 2b. HMAC binding (audit E3): only voice text senpaiChat actually
    // returned. The signature binds canonical text + uid + issue time; see
    // senpaiTtsSigning.ts. When enforcement is off (rollout transition for
    // unsigned clients in the wild), failures are logged but let through.
    let signatureOk = false;
    let signingSecret = '';
    try {
      signingSecret = SENPAI_TTS_SIGNING_SECRET.value();
    } catch {
      /* unbound/unset secret — handled below */
    }
    if (signingSecret) {
      const check = verifySpeakSignature(text, uid, body.signature, signingSecret);
      signatureOk = check.ok;
      if (!check.ok) {
        if (SENPAI_TTS_REQUIRE_SIGNATURE.value()) {
          logger.warn('[senpaiSpeak] rejecting unsigned/invalid text', {
            uid,
            reason: check.reason,
            chars: text.length,
          });
          res.status(400).json({ error: `speak signature invalid: ${check.reason}` });
          return;
        }
        logger.warn('[senpaiSpeak] signature check failed (enforcement OFF — allowing)', {
          uid,
          reason: check.reason,
        });
      }
    } else {
      // Misconfiguration, not an attack: the secret should exist wherever
      // this code is deployed (senpaiChat can't mint signatures without it
      // either). Fail open so the mascot doesn't go mute, but say so loudly.
      logger.error('[senpaiSpeak] SENPAI_TTS_SIGNING_SECRET unavailable — signature check skipped');
    }

    // 3. Per-uid rate limit AND the global daily character budget, run
    // CONCURRENTLY. They read disjoint documents (aiRateLimits/{uid}/... vs
    // senpaiTtsBudget/{day}) and neither feeds the other, but running them in
    // sequence put ~120-400ms of blocking Firestore latency directly between
    // "reply text is on screen" and "audio starts". The old ordering comment
    // ("per-uid first so one user's spam burns their own allowance") was
    // cosmetic accounting, not a correctness invariant: the budget is already
    // reserve-first by design (a failed synthesis still counts its
    // characters), so reserving for a request the limiter then rejects is the
    // same conservative-over-racy trade this module already documents.
    const [limit, budgetResult] = await Promise.all([
      enforceRateLimit(uid, 'senpaiSpeak'),
      reserveTtsBudget(text.length),
    ]);
    if (!limit.ok) {
      res.status(429).json({ error: limit.reason });
      return;
    }

    // 3b. Global daily character budget (audit E3). Reserved BEFORE the
    // ElevenLabs call; fail-closed past the budget, fail-open on infra
    // errors (inside reserveTtsBudget). 429 maps to the client's
    // 'rate_limit' handling, same as the per-uid limiter above.
    if (!budgetResult.ok) {
      logger.warn('[senpaiSpeak] global daily budget exhausted', { uid, chars: text.length });
      res.status(429).json({ error: budgetResult.reason });
      return;
    }

    // 4. Call ElevenLabs
    const apiKey = ELEVENLABS_API_KEY.value();
    let audioBuffer: Buffer;
    try {
      const elResp = await fetch(
        // mp3_22050_32, not mp3_44100_128: a ~6s voice line drops from
        // ~80-110KB to ~20-28KB of MP3 (and ~4x less base64 to transfer,
        // JSON-parse, and write to disk on the phone). Through a phone
        // speaker the difference is inaudible; on LTE it saves ~100ms, more
        // on a weak connection.
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_22050_32`,
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
        // Observability for the E3 rollout: how much traffic is still
        // unsigned (old clients) before flipping enforcement on.
        signed: signatureOk,
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
