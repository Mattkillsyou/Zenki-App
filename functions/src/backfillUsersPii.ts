/**
 * Cloud Function — POST /backfillUsersPii   (admin, run ONCE after deploy)
 *
 * Finding 1-P1.2: first-time OAuth sign-ins used to store the FULL Member
 * record (real email, first/last name, username) as a `member:` field on the
 * /users/{uid} doc — readable by ANY signed-in user, silently defeating the
 * /members PII lockdown. The client no longer writes the field and the /users
 * write rule now rejects it; this backfill strips it from every EXISTING doc
 * so the PII of already-registered Apple/Google accounts stops leaking.
 *
 * Idempotent — docs without a `member` field are skipped, so safe to re-run.
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

export const backfillUsersPii = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
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
        let q = db.collection('users').orderBy('__name__').limit(300);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        const batch = db.batch();
        let batchCount = 0;
        for (const d of snap.docs) {
          scanned++;
          if (!('member' in d.data())) continue; // already clean — skip (idempotent)
          batch.update(d.ref, { member: admin.firestore.FieldValue.delete() });
          batchCount++;
          updated++;
        }
        if (batchCount > 0) await batch.commit();

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 300) break;
      }
      res.json({ ok: true, scanned, updated });
    } catch (e: any) {
      logger.error('backfillUsersPii failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, updated });
    }
  },
);
