/**
 * Server-side invite-code validation (launch report P2-2).
 *
 * Replaces the client-only hardcoded gate. Validates a submitted code against
 * the Firestore `inviteCodes` collection using the Admin SDK (bypasses rules,
 * so no pre-auth client read is required). Public endpoint — the invite gate
 * runs before sign-in.
 *
 * Migration-safe: while the collection is EMPTY, the legacy code is accepted so
 * the gate keeps working at launch. As soon as an admin adds any code, that
 * fallback stops and only configured codes pass.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { enforceRateLimit } from './rateLimit';

const LEGACY_FALLBACK_CODE = 'dragon';

export const validateInviteCode = onRequest(
  { cors: true, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const code = String(req.body?.code ?? '').trim().toLowerCase();
    if (!code) {
      res.status(400).json({ error: 'code-required' });
      return;
    }

    // Throttle per client IP — the gate is pre-auth and otherwise brute-forceable.
    const ip = (req.get('x-forwarded-for') || (req as any).ip || '').split(',')[0].trim() || 'unknown';
    const rl = await enforceRateLimit(ip, 'validateInviteCode');
    if (!rl.ok) {
      res.status(429).json({ error: 'rate-limited' });
      return;
    }

    try {
      const col = admin.firestore().collection('inviteCodes');
      const snap = await col.doc(code).get();

      if (snap.exists && snap.data()?.active !== false) {
        // Valid — best-effort usage tracking (never blocks the response).
        col
          .doc(code)
          .set(
            {
              usedCount: admin.firestore.FieldValue.increment(1),
              lastUsedAt: new Date().toISOString(),
            },
            { merge: true },
          )
          .catch((e) => logger.warn('[validateInviteCode] usage increment failed', e));
        res.status(200).json({ ok: true });
        return;
      }

      // Transitional: if NO codes are configured yet, accept the legacy code so
      // the gate works at launch. Once an admin adds any code, the collection
      // is no longer empty and this fallback no longer applies.
      if (!snap.exists) {
        const any = await col.limit(1).get();
        if (any.empty && code === LEGACY_FALLBACK_CODE) {
          res.status(200).json({ ok: true, legacy: true });
          return;
        }
      }

      res.status(403).json({ error: 'invalid-code' });
    } catch (e) {
      logger.error('[validateInviteCode] error', e);
      res.status(500).json({ error: 'server-error' });
    }
  },
);
