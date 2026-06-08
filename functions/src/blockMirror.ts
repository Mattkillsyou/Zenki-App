/**
 * Cloud Functions — maintain a /blockedBy mirror of the /blocks graph.
 *
 * /blocks/{uid}/blocked/{blockedUid} is OWNER-readable only (a user can see who
 * THEY blocked, never who blocked them). But to make blocking bidirectional in
 * the UI — so a blocked user also stops seeing the blocker across feed / search /
 * profile / inbox — the client needs to know "who blocked me". These triggers
 * mirror each block edge to /blockedBy/{blockedUid}/by/{blockerUid}, which is
 * readable only by the blocked user (the mirror's owner) and written EXCLUSIVELY
 * here via the Admin SDK — so a client can never forge "X blocked me".
 *
 * onBlockCreated / onBlockDeleted keep the mirror live; backfillBlockedBy seeds
 * it for blocks that already existed before this function deployed (run once).
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

export const onBlockCreated = onDocumentCreated(
  'blocks/{uid}/blocked/{blockedUid}',
  async (event) => {
    const { uid, blockedUid } = event.params as { uid: string; blockedUid: string };
    try {
      await admin.firestore().doc(`blockedBy/${blockedUid}/by/${uid}`).set({
        at: new Date().toISOString(),
      });
    } catch (e) {
      logger.warn(`blockMirror: create ${uid}->${blockedUid} failed`, e);
    }
  },
);

export const onBlockDeleted = onDocumentDeleted(
  'blocks/{uid}/blocked/{blockedUid}',
  async (event) => {
    const { uid, blockedUid } = event.params as { uid: string; blockedUid: string };
    try {
      await admin.firestore().doc(`blockedBy/${blockedUid}/by/${uid}`).delete();
    } catch (e) {
      logger.warn(`blockMirror: delete ${uid}->${blockedUid} failed`, e);
    }
  },
);

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

/**
 * POST /backfillBlockedBy (admin, run ONCE after deploy). Seeds /blockedBy for
 * every block that already existed before the triggers were live. Idempotent.
 * Returns { ok, scanned, written }.
 */
export const backfillBlockedBy = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const db = admin.firestore();
    let scanned = 0;
    let written = 0;
    try {
      // Every /blocks/{uid}/blocked/{blockedUid} doc, across all owners.
      const all = await db.collectionGroup('blocked').get();
      const BATCH = 400;
      for (let i = 0; i < all.docs.length; i += BATCH) {
        const batch = db.batch();
        all.docs.slice(i, i + BATCH).forEach((d) => {
          scanned++;
          const blockerUid = d.ref.parent.parent?.id; // /blocks/{blockerUid}/blocked/{blockedUid}
          const blockedUid = d.id;
          if (!blockerUid || !blockedUid) return;
          batch.set(db.doc(`blockedBy/${blockedUid}/by/${blockerUid}`), { at: new Date().toISOString() });
          written++;
        });
        await batch.commit();
      }
      res.json({ ok: true, scanned, written });
    } catch (e: any) {
      logger.error('backfillBlockedBy failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, written });
    }
  },
);
