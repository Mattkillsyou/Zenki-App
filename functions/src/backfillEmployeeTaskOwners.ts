/**
 * Cloud Function — POST /backfillEmployeeTaskOwners   (admin, run ONCE with
 * the 1-P2.32 rules deploy)
 *
 * The tightened /employeeTasks read rule scopes personal tasks to
 * `resource.data.firebaseUid == request.auth.uid`. Legacy personal tasks were
 * written before upsertTaskInFirestore stamped `firebaseUid` — without this
 * backfill they vanish from their owners' lists the moment the rule lands.
 *
 * Resolves each unstamped personal task's `ownerMemberId` (app-internal id)
 * to the owner's Firebase uid via /members/{ownerMemberId}.firebaseUid and
 * stamps it. Tasks whose owner has no uid yet (member never signed in) are
 * counted as `unresolved` and left untouched — re-run after they sign in.
 *
 * Idempotent — already-stamped docs are skipped, so safe to re-run.
 *
 * Auth: Bearer ID token, admin only.
 * Returns { ok, scanned, updated, unresolved }.
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

export const backfillEmployeeTaskOwners = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const db = admin.firestore();
    // ownerMemberId → firebaseUid (null when the member doc has no stamp yet).
    const uidCache = new Map<string, string | null>();

    async function uidForMember(memberId: string): Promise<string | null> {
      if (uidCache.has(memberId)) return uidCache.get(memberId)!;
      let uid: string | null = null;
      try {
        const snap = await db.doc(`members/${memberId}`).get();
        const stamped = snap.exists ? snap.data()?.firebaseUid : undefined;
        uid = typeof stamped === 'string' && stamped ? stamped : null;
      } catch { uid = null; }
      uidCache.set(memberId, uid);
      return uid;
    }

    let scanned = 0;
    let updated = 0;
    let unresolved = 0;
    try {
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collection('employeeTasks')
          .where('source', '==', 'personal')
          .orderBy('__name__')
          .limit(300);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let batchCount = 0;
        for (const d of snap.docs) {
          scanned++;
          const data = d.data();
          if (typeof data.firebaseUid === 'string' && data.firebaseUid) continue; // already stamped
          const ownerMemberId = data.ownerMemberId as string | undefined;
          const uid = ownerMemberId ? await uidForMember(ownerMemberId) : null;
          if (!uid) { unresolved++; continue; }
          batch.update(d.ref, { firebaseUid: uid });
          batchCount++;
          updated++;
        }
        if (batchCount > 0) await batch.commit();

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 300) break;
      }
      res.json({ ok: true, scanned, updated, unresolved });
    } catch (e: any) {
      logger.error('backfillEmployeeTaskOwners failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, updated, unresolved });
    }
  },
);
