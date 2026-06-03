/**
 * Cloud Function — POST /backfillPostPrivacy   (admin, run ONCE after deploy)
 *
 * Wave 1 added a denormalized `authorIsPrivate` flag to posts and made the feed
 * query `where('authorIsPrivate','==',false)`. Firestore `==` does NOT match
 * documents missing the field, so without this backfill every PRE-EXISTING post
 * (created before the flag existed) would silently disappear from the feed.
 *
 * This stamps `authorIsPrivate` on every post that lacks it, derived from the
 * author's current `users/{uid}.isPrivate` (cached per author). Idempotent —
 * posts that already have the field are skipped, so it's safe to re-run.
 *
 * Auth: Bearer ID token, admin only.
 * Returns { ok, scanned, updated }.
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

export const backfillPostPrivacy = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const db = admin.firestore();
    const privacyCache = new Map<string, boolean>();

    async function isAuthorPrivate(userId: string): Promise<boolean> {
      if (privacyCache.has(userId)) return privacyCache.get(userId)!;
      let priv = false;
      try {
        const u = await db.doc(`users/${userId}`).get();
        priv = u.exists ? u.data()?.isPrivate === true : false;
      } catch { priv = false; }
      privacyCache.set(userId, priv);
      return priv;
    }

    let scanned = 0;
    let updated = 0;
    try {
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collection('posts').orderBy('__name__').limit(300);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let batchCount = 0;
        for (const d of snap.docs) {
          scanned++;
          const data = d.data();
          if (typeof data.authorIsPrivate === 'boolean') continue; // already set
          const userId = data.userId as string | undefined;
          const priv = userId ? await isAuthorPrivate(userId) : false;
          batch.update(d.ref, { authorIsPrivate: priv });
          batchCount++;
          updated++;
        }
        if (batchCount > 0) await batch.commit();

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 300) break;
      }
      res.json({ ok: true, scanned, updated });
    } catch (e: any) {
      logger.error('backfillPostPrivacy failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, updated });
    }
  },
);
