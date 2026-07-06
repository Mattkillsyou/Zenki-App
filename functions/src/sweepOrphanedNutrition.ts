/**
 * Cloud Function — POST /sweepOrphanedNutrition   (admin, run ONCE after the
 * deleteAccount nutrition-purge fix deploys; finding 1-P1.3)
 *
 * Before the fix, deleteAccount never touched /nutrition/{uid} — accounts
 * deleted under the old cascade left their health PII (weight log, macro log,
 * goals, sex/age/height profile) orphaned forever: the owner-only rule makes
 * the docs unreadable AND undeletable once the Auth user is gone. This sweep
 * finds every /nutrition/{uid} whose Firebase Auth user no longer exists and
 * recursively deletes it.
 *
 * Body: { "dryRun": true | false } — defaults to TRUE (report only, delete
 * nothing). Run with dryRun:true first, review the reported uids, then run
 * with {"dryRun": false} to actually purge.
 *
 * Auth: Bearer ID token, admin only.
 * Returns { ok, dryRun, scanned, orphaned, deleted, orphanedUids }.
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

export const sweepOrphanedNutrition = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 540, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const dryRun = req.body?.dryRun !== false; // delete ONLY on explicit false
    const db = admin.firestore();

    let scanned = 0;
    let deleted = 0;
    const orphanedUids: string[] = [];
    try {
      // listDocuments (not .get()) — the client only ever writes the
      // SUBCOLLECTIONS under /nutrition/{uid}, so the parent docs are
      // "missing" and a collection query would return nothing.
      const refs = await db.collection('nutrition').listDocuments();
      for (const ref of refs) {
        scanned++;
        const uid = ref.id;
        let authUserExists = true;
        try {
          await admin.auth().getUser(uid);
        } catch (e: any) {
          if (e?.code === 'auth/user-not-found') authUserExists = false;
          else throw e; // transient auth error — don't misclassify as orphaned
        }
        if (authUserExists) continue;
        orphanedUids.push(uid);
        if (!dryRun) {
          await db.recursiveDelete(ref);
          deleted++;
        }
      }
      res.json({ ok: true, dryRun, scanned, orphaned: orphanedUids.length, deleted, orphanedUids });
    } catch (e: any) {
      logger.error('sweepOrphanedNutrition failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', dryRun, scanned, deleted });
    }
  },
);
