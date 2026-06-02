/**
 * Cloud Function — POST /backfillFollowCounts   (admin, run ONCE after deploy)
 *
 * Wave 1 denormalized followerCount/followingCount onto /users, maintained by
 * the followerCounters triggers via FieldValue.increment. But increment() on an
 * ABSENT field initializes it to ±1 (not currentCount ± 1). Users who already
 * had follow edges on main therefore have no count field, and their first
 * follow/unfollow after deploy would set the count to 1 instead of their true
 * total (and getFollowerCount/getFollowingCount prefer the denormalized field,
 * so the wrong value sticks).
 *
 * This seeds users.followerCount / followingCount from the actual subcollection
 * counts for every user, so the triggers increment from a correct base.
 * Idempotent — safe to re-run (it overwrites with the freshly-counted value).
 *
 * Auth: Bearer ID token, admin only. Returns { ok, scanned, updated }.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

async function verifyAdmin(req: any): Promise<string | { error: string; status: number }> {
  const hdr = req.get?.('Authorization') || req.headers?.authorization;
  if (!hdr?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  let uid: string;
  try {
    const decoded = await admin.auth().verifyIdToken(hdr.substring(7));
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

export const backfillFollowCounts = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 540, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const db = admin.firestore();
    let scanned = 0;
    let updated = 0;
    try {
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collection('users').orderBy('__name__').limit(200);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        for (const d of snap.docs) {
          const uid = d.id;
          scanned++;
          const [fc, gc] = await Promise.all([
            db.collection('followers').doc(uid).collection('followers').count().get(),
            db.collection('following').doc(uid).collection('follows').count().get(),
          ]);
          await d.ref
            .update({ followerCount: fc.data().count, followingCount: gc.data().count })
            .then(() => { updated++; })
            .catch((e) => logger.warn('backfillFollowCounts: update failed for ' + uid, e));
        }

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 200) break;
      }
      res.json({ ok: true, scanned, updated });
    } catch (e: any) {
      logger.error('backfillFollowCounts failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, updated });
    }
  },
);
