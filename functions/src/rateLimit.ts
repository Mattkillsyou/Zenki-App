/**
 * Per-key rate limiting backed by Firestore.
 * Prevents a single user/email/IP from burning all AI credits, brute-forcing
 * the invite gate, or email-bombing the password-reset endpoint.
 *
 * Tunable via the LIMITS table below. Rolling 24-hour window. The read +
 * write happen inside a TRANSACTION so two concurrent calls can't both read
 * the same count and each write count+1 (which previously let bursts exceed
 * the cap).
 */

import * as admin from 'firebase-admin';

type Endpoint =
  | 'recognizeFood' | 'extractDexa' | 'parseBloodwork'
  | 'senpaiChat' | 'senpaiSpeak' | 'createPaymentIntent'
  | 'sendPasswordReset' | 'validateInviteCode';

const LIMITS: Record<Endpoint, number> = {
  recognizeFood: 30,  // up to 30 food photos/day
  extractDexa: 3,     // 3 DEXA uploads/day (usually 1)
  parseBloodwork: 5,  // 5 bloodwork uploads/day
  senpaiChat: 50,     // 50 chat turns/day with Senpai (~$0.05/user/day worst case on Haiku)
  senpaiSpeak: 60,    // a little headroom over senpaiChat
  createPaymentIntent: 30, // up to 30 checkout/payment attempts per day (abuse guard)
  sendPasswordReset: 8,    // per EMAIL/day — anti email-bomb (silently dropped over cap)
  validateInviteCode: 40,  // per IP/day — invite-code brute-force deterrent
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  ok: boolean;
  reason?: string;
  remaining?: number;
}

/** `key` is a stable identifier to throttle by — a uid for authed endpoints, or
 *  a normalized email / client IP for pre-auth endpoints. */
export async function enforceRateLimit(key: string, endpoint: Endpoint): Promise<RateLimitResult> {
  const db = admin.firestore();
  const safeKey = (key || 'unknown').replace(/[^a-zA-Z0-9_.@:-]/g, '_').slice(0, 200) || 'unknown';
  const ref = db.collection('aiRateLimits').doc(safeKey).collection('endpoints').doc(endpoint);
  const now = Date.now();
  const cutoff = now - WINDOW_MS;
  const limit = LIMITS[endpoint];

  // Atomic read-modify-write so concurrent requests can't each slip under the cap.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const timestamps: number[] = Array.isArray(data.hits) ? data.hits : [];
    const recent = timestamps.filter((t) => t >= cutoff);

    if (recent.length >= limit) {
      return {
        ok: false,
        reason: `Daily limit reached (${limit}). Resets 24h after your first use today.`,
      };
    }

    recent.push(now);
    // Cap the stored array so it can't grow unbounded within a window.
    const trimmed = recent.slice(-Math.max(limit, 1) * 2);
    tx.set(ref, { hits: trimmed, lastHit: now }, { merge: true });
    return { ok: true, remaining: limit - recent.length };
  });
}
