/**
 * Cloud Function — POST /adminDeleteUser
 *
 * Admin-only, HARD account deletion. Lets an admin fully erase another user's
 * account (profile, posts, comments, likes, follow graph, DMs, personal
 * records, Storage, and the Firebase Auth login) — e.g. clearing out test
 * accounts, or a stronger action than banUser (which only disables sign-in and
 * purges public posts/comments). Runs the SAME cascade as self-service
 * deleteAccount via the shared purgeUserData, so nothing is left behind.
 *
 * This is irreversible and powerful, so it is guarded:
 *   - caller must be an admin (custom claim `admin:true` OR an /admins/{uid} doc);
 *   - refuses to delete the caller themselves (use the app's own delete for that);
 *   - refuses to delete another admin (an admin can't nuke a fellow admin).
 *
 * Auth: Bearer Firebase ID token (the ADMIN's).
 * Body: { targetUid: string }
 * Returns: { ok: true, targetUid, deleted: {collection: count}, errors: {step: msg} }
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { purgeUserData } from './purgeUserData';

/** Resolve the caller's uid IFF they are an admin; else an error tuple. */
async function verifyAdmin(req: any): Promise<string | { error: string; status: number }> {
  const hdr = req.get?.('Authorization') || req.headers?.authorization;
  if (!hdr?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  let uid: string;
  try {
    // checkRevoked=true: this endpoint is irreversibly destructive, so reject a
    // caller whose account was disabled or whose sessions were revoked since the
    // token was minted (otherwise a just-removed admin keeps delete power for the
    // token's ~1h TTL). Costs one extra getUser round-trip — acceptable here.
    const decoded = await admin.auth().verifyIdToken(hdr.substring(7), true);
    uid = decoded.uid;
    if (decoded.admin === true) return uid;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
  try {
    const snap = await admin.firestore().doc(`admins/${uid}`).get();
    if (snap.exists) return uid;
  } catch { /* fall through */ }
  return { error: 'Not authorized', status: 403 };
}

/**
 * True if `uid` is an admin (custom claim OR /admins/{uid} doc).
 * FAILS CLOSED: this is only ever used to PROTECT an admin from deletion, so an
 * indeterminate result (a transient Auth/Firestore read error) must report the
 * target as an admin and thereby refuse the irreversible delete — the opposite
 * of the caller gate (verifyAdmin), which correctly denies on error.
 */
async function isAdmin(uid: string): Promise<boolean> {
  try {
    const user = await admin.auth().getUser(uid);
    if ((user.customClaims as any)?.admin === true) return true;
  } catch (e: any) {
    // Only "no such Auth user" is a genuine not-an-admin signal (there's no
    // account to hold a claim) — fall through to the doc check. Any OTHER error
    // is indeterminate → fail closed.
    if (e?.code !== 'auth/user-not-found') {
      logger.warn(`isAdmin: getUser failed for ${uid} — failing closed (treating as admin)`, e);
      return true;
    }
  }
  try {
    const snap = await admin.firestore().doc(`admins/${uid}`).get();
    return snap.exists;
  } catch (e) {
    logger.warn(`isAdmin: admins doc read failed for ${uid} — failing closed (treating as admin)`, e);
    return true;
  }
}

export const adminDeleteUser = onRequest(
  // Full cascade can touch many docs for a prolific account — match deleteAccount.
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }
    const adminUid = auth;

    const { targetUid } = req.body ?? {};
    if (typeof targetUid !== 'string' || !targetUid.trim()) {
      res.status(400).json({ ok: false, error: 'targetUid required' }); return;
    }
    if (targetUid === adminUid) {
      res.status(400).json({ ok: false, error: 'Refusing to delete yourself — use in-app account deletion.' }); return;
    }
    if (await isAdmin(targetUid)) {
      res.status(403).json({ ok: false, error: 'Refusing to delete another admin.' }); return;
    }

    try {
      logger.info(`adminDeleteUser: admin=${adminUid} deleting targetUid=${targetUid}`);
      const { deleted, errors } = await purgeUserData(targetUid);
      logger.info(`adminDeleteUser: done targetUid=${targetUid}`, { deleted, errors });
      res.json({ ok: true, targetUid, deleted, errors });
    } catch (e: any) {
      logger.error('adminDeleteUser failed for targetUid=' + targetUid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
