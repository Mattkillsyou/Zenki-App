/**
 * Cloud Function — POST /listSupportMessages
 *
 * Admin read (and status flip) for /supportMessages. The collection is
 * deliberately write-only from clients (`allow read: if false` — messages can
 * carry contact PII), which meant NOTHING ever surfaced them: the app promises
 * "instant alert + 24h response" while messages sat invisible outside the
 * Firebase console (audit 2.0.5 P2 "support black hole"). The web admin's
 * Support tab reads through this endpoint instead; the Admin SDK bypasses
 * rules, and the admin gate mirrors broadcastPush.
 *
 * Body: { action?: 'list' | 'markHandled', id?: string }
 *   list        (default) → { ok, messages: [...] } newest 100
 *   markHandled + id      → { ok } sets status:'handled'
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

export const listSupportMessages = onRequest(
  { cors: true, memory: '256MiB', timeoutSeconds: 30, invoker: 'public' },
  async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }

    const hdr = req.get('Authorization') || '';
    if (!hdr.startsWith('Bearer ')) { res.status(401).json({ ok: false, error: 'missing-token' }); return; }
    let decoded: admin.auth.DecodedIdToken;
    try { decoded = await admin.auth().verifyIdToken(hdr.substring(7)); }
    catch { res.status(401).json({ ok: false, error: 'invalid-token' }); return; }

    const db = admin.firestore();
    let isAdmin = decoded.admin === true;
    if (!isAdmin) {
      try { isAdmin = (await db.doc(`admins/${decoded.uid}`).get()).exists; } catch { isAdmin = false; }
    }
    if (!isAdmin) { res.status(403).json({ ok: false, error: 'not-admin' }); return; }

    const { action = 'list', id } = (req.body ?? {}) as { action?: string; id?: string };

    try {
      if (action === 'markHandled') {
        if (typeof id !== 'string' || !id) { res.status(400).json({ ok: false, error: 'id-required' }); return; }
        await db.doc(`supportMessages/${id}`).set(
          { status: 'handled', handledBy: decoded.uid, handledAt: new Date().toISOString() },
          { merge: true },
        );
        res.json({ ok: true });
        return;
      }

      const snap = await db
        .collection('supportMessages')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();
      const messages = snap.docs.map((d) => {
        const data = d.data();
        // createdAt is a server Timestamp — serialize to ISO for the browser.
        const createdAt =
          data.createdAt && typeof data.createdAt.toDate === 'function'
            ? data.createdAt.toDate().toISOString()
            : data.timestamp ?? null;
        return { id: d.id, ...data, createdAt };
      });
      res.json({ ok: true, messages });
    } catch (e: any) {
      logger.error('listSupportMessages failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'unknown' });
    }
  },
);
