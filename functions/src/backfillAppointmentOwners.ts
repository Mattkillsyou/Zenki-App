/**
 * Cloud Function — POST /backfillAppointmentOwners   (admin, run ONCE after deploy)
 *
 * The appointments read rule was tightened to owner-or-admin keyed on
 * `firebaseUid` (the booking member's auth uid). Legacy appointment docs may
 * have `firebaseUid` set to whoever last wrote them (often an admin who
 * confirmed the booking) or unset — so without this, members would lose
 * visibility of their own existing bookings once the rule is tightened.
 *
 * This re-stamps every appointment's `firebaseUid` from the booking member's
 * record: appointment.memberId → members/{memberId}.firebaseUid. Idempotent.
 *
 * Auth: Bearer ID token, admin only. Returns { ok, scanned, updated, skipped }.
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

export const backfillAppointmentOwners = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const db = admin.firestore();
    const ownerCache = new Map<string, string | null>(); // memberId -> firebaseUid

    async function ownerUidFor(memberId: string): Promise<string | null> {
      if (ownerCache.has(memberId)) return ownerCache.get(memberId)!;
      let owner: string | null = null;
      try {
        const m = await db.doc(`members/${memberId}`).get();
        const fu = m.exists ? (m.data()?.firebaseUid as string | undefined) : undefined;
        owner = typeof fu === 'string' && fu ? fu : null;
      } catch { owner = null; }
      ownerCache.set(memberId, owner);
      return owner;
    }

    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    try {
      let last: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collection('appointments').orderBy('__name__').limit(300);
        if (last) q = q.startAfter(last);
        const snap = await q.get();
        if (snap.empty) break;

        for (const d of snap.docs) {
          scanned++;
          const data = d.data();
          const memberId = data.memberId as string | undefined;
          if (!memberId) { skipped++; continue; }
          const owner = await ownerUidFor(memberId);
          if (!owner) { skipped++; continue; } // member never signed in — can't read anyway
          if (data.firebaseUid === owner) { skipped++; continue; } // already correct
          await d.ref.update({ firebaseUid: owner })
            .then(() => { updated++; })
            .catch((e) => { skipped++; logger.warn('backfillAppointmentOwners: update failed for ' + d.id, e); });
        }

        last = snap.docs[snap.docs.length - 1];
        if (snap.size < 300) break;
      }
      res.json({ ok: true, scanned, updated, skipped });
    } catch (e: any) {
      logger.error('backfillAppointmentOwners failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', scanned, updated, skipped });
    }
  },
);
