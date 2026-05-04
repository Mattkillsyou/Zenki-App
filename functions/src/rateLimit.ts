/**
 * Per-user rate limiting backed by Firestore.
 * Prevents a single user from burning all AI credits in one afternoon.
 *
 * Tunable via the LIMITS table below. Rolling 24-hour window.
 */

import * as admin from 'firebase-admin';

type Endpoint = 'recognizeFood' | 'extractDexa' | 'parseBloodwork' | 'senpaiChat' | 'senpaiSpeak';

const LIMITS: Record<Endpoint, number> = {
  recognizeFood: 30,  // up to 30 food photos/day
  extractDexa: 3,     // 3 DEXA uploads/day (usually 1)
  parseBloodwork: 5,  // 5 bloodwork uploads/day
  senpaiChat: 50,     // 50 chat turns/day with Senpai (~$0.05/user/day worst case on Haiku)
  senpaiSpeak: 60,    // a little headroom over senpaiChat (cap ≠ chat cap so rage-tapping replay doesn't burn ElevenLabs chars)
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  ok: boolean;
  reason?: string;
  remaining?: number;
}

export async function enforceRateLimit(uid: string, endpoint: Endpoint): Promise<RateLimitResult> {
  const db = admin.firestore();
  const ref = db.collection('aiRateLimits').doc(uid).collection('endpoints').doc(endpoint);
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const snap = await ref.get();
  const data = snap.data() ?? {};
  const timestamps: number[] = Array.isArray(data.hits) ? data.hits : [];
  const recent = timestamps.filter((t) => t >= cutoff);

  const limit = LIMITS[endpoint];
  if (recent.length >= limit) {
    return {
      ok: false,
      reason: `Daily limit reached (${limit}). Resets 24h after your first use today.`,
    };
  }

  recent.push(now);
  await ref.set({ hits: recent, lastHit: now }, { merge: true });

  return { ok: true, remaining: limit - recent.length };
}
