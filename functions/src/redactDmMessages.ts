/**
 * Cloud Function — POST /redactDmMessages   (admin only)
 *
 * Removes the offending user's messages from a reported conversation. DM reports
 * are thread-level (targetId = conversationId, targetUserId = offender), and a
 * client can't redact another user's messages (rules forbid it), so the admin
 * "Remove & Block" action on a message report routes here. Redacts every message
 * in the conversation sent by targetUserId (text → '', redacted: true).
 *
 * Auth: Bearer ID token, admin only.
 * Body: { conversationId: string, targetUserId: string }
 * Returns: { ok, redacted }.
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

export const redactDmMessages = onRequest(
  { cors: true, memory: '256MiB', timeoutSeconds: 60, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }

    const { conversationId, targetUserId } = req.body ?? {};
    if (typeof conversationId !== 'string' || !conversationId) { res.status(400).send('conversationId required'); return; }
    if (typeof targetUserId !== 'string' || !targetUserId) { res.status(400).send('targetUserId required'); return; }

    const db = admin.firestore();
    try {
      const msgs = await db
        .collection('conversations').doc(conversationId)
        .collection('messages').where('senderId', '==', targetUserId).get();

      let redacted = 0;
      const BATCH = 400;
      for (let i = 0; i < msgs.docs.length; i += BATCH) {
        const batch = db.batch();
        msgs.docs.slice(i, i + BATCH).forEach((m) =>
          batch.update(m.ref, { text: '', redacted: true, redactedReason: 'moderator_action' }),
        );
        await batch.commit();
        redacted += Math.min(BATCH, msgs.docs.length - i);
      }
      res.json({ ok: true, redacted });
    } catch (e: any) {
      logger.error('redactDmMessages failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
