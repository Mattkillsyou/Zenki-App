/**
 * Cloud Function — POST /deleteAccount
 *
 * Self-service account deletion (App Store 5.1.1(v) + GDPR right-to-erasure):
 * the CALLER erases their OWN account. The target uid comes from the verified
 * ID token, never from the body, so this endpoint can only ever delete the
 * signed-in user. The actual cascade lives in purgeUserData (shared with the
 * admin-initiated adminDeleteUser path) — see purgeUserData.ts for the full
 * list of what's erased and the best-effort semantics.
 *
 * Requires Firebase Auth ID token in the Authorization header. The Auth user is
 * deleted server-side as the final cascade step; the client just signs out
 * after this returns.
 *
 * Returns { ok: true, uid, deleted: {collection: count}, errors: {step: msg} }.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { purgeUserData } from './purgeUserData';

async function authenticate(req: any): Promise<string | { error: string; status: number }> {
  const auth = req.get?.('Authorization') || req.headers?.authorization;
  if (!auth?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(auth.substring(7));
    return decoded.uid;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

export const deleteAccount = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const authResult = await authenticate(req);
    if (typeof authResult !== 'string') { res.status(authResult.status).send(authResult.error); return; }
    const uid = authResult;

    try {
      const { deleted, errors } = await purgeUserData(uid);
      res.json({ ok: true, uid, deleted, errors });
    } catch (e: any) {
      // purgeUserData is best-effort and shouldn't throw, but guard anyway.
      logger.error('deleteAccount failed for uid=' + uid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
