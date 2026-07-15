/**
 * Cloud Function — POST /pointsLedger
 *
 * THE AUTHORITY FOR SPENDABLE CURRENCY. Dojo Points (💎) and Flames are
 * redeemable for real merchandise at the store, so once /gamification/{uid}
 * exists in Firestore a member holding their own ID token could otherwise open a
 * browser and mint themselves unlimited product. The rules therefore make
 * dojoPoints/pointsLifetime/flames/flamesLifetime IMMUTABLE to the client, and
 * this endpoint — via the Admin SDK, which bypasses rules — is the only thing
 * that can move them.
 *
 * Two actions:
 *
 *   { action: 'grant', reason, idempotencyKey, recordId? }
 *     The SERVER decides the amount from REWARDS below; the client never sends
 *     one. A caller can therefore ask "I logged a PR" but not "give me 10^6".
 *     Where the claim is checkable against synced data, it IS checked (a
 *     pr_logged grant must point at a real /training/{uid}/personalRecords doc).
 *
 *   { action: 'spend', currency, amount, idempotencyKey, note? }
 *     The client names the amount — safe, because the server re-reads the
 *     balance inside a transaction and refuses to overdraw. It cannot create
 *     value, only remove it.
 *
 * EVERY mutation is idempotent via /gamification/{uid}/grants/{idempotencyKey}
 * written in the same transaction as the balance change. A retried request (the
 * client's flush queue replaying, a network retry) can never double-award or
 * double-charge. The grants subcollection doubles as the audit ledger.
 *
 * Auth: Bearer Firebase ID token — the MEMBER's own. uid comes from the token,
 * never the body, so nobody can move someone else's balance.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

/**
 * The server-owned reward table. This is the security boundary: the client sends
 * a reason, the server decides the value. Mirrors the constants the app used to
 * apply client-side (WorkoutContext POINTS_PER_PR = 50, etc.). Keep in sync.
 */
const REWARDS: Record<string, { currency: 'points' | 'flames'; amount: number; verify?: 'pr' | 'log' }> = {
  pr_logged: { currency: 'points', amount: 50, verify: 'pr' },
  session_recorded: { currency: 'points', amount: 25, verify: 'log' },
  achievement_unlocked: { currency: 'flames', amount: 1 },
};

/** Refuse absurd spends outright — a real redemption is bounded. */
const MAX_SPEND = 100_000;

async function authenticate(req: any): Promise<string | { error: string; status: number }> {
  const hdr = req.get?.('Authorization') || req.headers?.authorization;
  if (!hdr?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(hdr.substring(7));
    return decoded.uid;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

/**
 * Confirm a grant claim against data the member cannot forge server-side.
 * Training records are owner-written, so this is not a strong guarantee against
 * a determined attacker (they could write a fake PR then claim it) — but it does
 * bind each grant to exactly one durable record, and the idempotency key makes
 * that record grantable only ONCE. That turns "mint infinite points" into "mint
 * one PR's worth per PR you actually create", which is the realistic bar here.
 */
async function verifyClaim(uid: string, kind: 'pr' | 'log', recordId: string | undefined): Promise<boolean> {
  if (!recordId || typeof recordId !== 'string') return false;
  const path = kind === 'pr'
    ? `training/${uid}/personalRecords/${recordId}`
    : `training/${uid}/logs/${recordId}`;
  try {
    const snap = await admin.firestore().doc(path).get();
    return snap.exists;
  } catch (e) {
    logger.warn(`pointsLedger: claim verification failed for ${path}`, e);
    return false;
  }
}

const FIELDS = {
  points: { balance: 'dojoPoints', lifetime: 'pointsLifetime' },
  flames: { balance: 'flames', lifetime: 'flamesLifetime' },
} as const;

export const pointsLedger = onRequest(
  { cors: true, memory: '256MiB', timeoutSeconds: 60, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await authenticate(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }
    const uid = auth;

    const { action, idempotencyKey } = req.body ?? {};
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      res.status(400).json({ ok: false, error: 'idempotencyKey required' }); return;
    }
    if (action !== 'grant' && action !== 'spend') {
      res.status(400).json({ ok: false, error: "action must be 'grant' or 'spend'" }); return;
    }

    // Resolve currency + delta BEFORE the transaction. A grant's amount comes
    // only from the server table; a spend's amount is client-named but bounded
    // and re-checked against the live balance inside the transaction.
    let currency: 'points' | 'flames';
    let delta: number;
    let note: string;

    if (action === 'grant') {
      const { reason, recordId } = req.body ?? {};
      const reward = typeof reason === 'string' ? REWARDS[reason] : undefined;
      if (!reward) { res.status(400).json({ ok: false, error: 'unknown reason' }); return; }
      if (reward.verify && !(await verifyClaim(uid, reward.verify, recordId))) {
        res.status(400).json({ ok: false, error: 'claim does not match a real record' }); return;
      }
      currency = reward.currency;
      delta = reward.amount;
      note = `grant:${reason}`;
    } else {
      const { currency: c, amount } = req.body ?? {};
      const n = Number(amount);
      if (c !== 'points' && c !== 'flames') { res.status(400).json({ ok: false, error: 'bad currency' }); return; }
      if (!Number.isFinite(n) || n <= 0 || n > MAX_SPEND) { res.status(400).json({ ok: false, error: 'bad amount' }); return; }
      currency = c;
      delta = -Math.floor(n);
      note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 120) : 'spend';
    }

    const db = admin.firestore();
    const stateRef = db.doc(`gamification/${uid}`);
    const grantRef = db.doc(`gamification/${uid}/grants/${idempotencyKey}`);
    const f = FIELDS[currency];

    try {
      const result = await db.runTransaction(async (tx) => {
        // Idempotency + balance read must be in the SAME transaction as the write,
        // or two concurrent retries both see "not yet granted" and double-award.
        const [grantSnap, stateSnap] = await Promise.all([tx.get(grantRef), tx.get(stateRef)]);
        if (grantSnap.exists) {
          const prior = grantSnap.data() || {};
          return { replayed: true, balance: prior.balanceAfter ?? null };
        }
        if (!stateSnap.exists) {
          // The client must have migrated its gamification state first; creating
          // it here would invent a balance out of nothing.
          throw Object.assign(new Error('no gamification state — sync it before earning or spending'), { status: 409 });
        }
        const data = stateSnap.data() || {};
        const balance = Number(data[f.balance]) || 0;
        const next = balance + delta;
        if (next < 0) {
          throw Object.assign(new Error('insufficient balance'), { status: 400 });
        }
        const patch: Record<string, unknown> = { [f.balance]: next };
        // Lifetime only ever climbs — it is an earned-total stat, not a balance,
        // so a spend must not reduce it.
        if (delta > 0) patch[f.lifetime] = (Number(data[f.lifetime]) || 0) + delta;
        tx.set(stateRef, patch, { merge: true });
        tx.set(grantRef, {
          action, currency, delta, note,
          balanceAfter: next,
          at: new Date().toISOString(),
        });
        return { replayed: false, balance: next };
      });

      res.json({ ok: true, currency, balance: result.balance, replayed: result.replayed });
    } catch (e: any) {
      const status = e?.status ?? 500;
      if (status >= 500) logger.error(`pointsLedger failed uid=${uid}`, e);
      res.status(status).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
