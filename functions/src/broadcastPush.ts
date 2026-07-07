/**
 * Cloud Function — POST /broadcastPush
 *
 * Sends a push notification to every member with a registered push token.
 * The mobile app calls Expo's push API directly (native has no CORS), but a
 * BROWSER cannot — Expo's endpoint blocks cross-origin requests — so the web
 * admin routes broadcasts through this function instead. Admin-gated: a valid
 * Firebase ID token (Bearer) whose uid is an admin (custom claim token.admin,
 * or an /admins/{uid} doc). Mirrors the Expo send + stale-token pruning that
 * notifyOnReport already does server-side.
 *
 * Body: { title: string, body: string }
 * Returns: { ok: true, sent, errors, recipients } — `sent` counts pushes ACCEPTED
 * by Expo (synchronous ticket status 'ok'), not confirmed device delivery; final
 * delivery is only knowable via Expo's async receipts (not polled here).
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const broadcastPush = onRequest(
  { cors: true, memory: '256MiB', timeoutSeconds: 120, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const hdr = req.get('Authorization') || '';
    if (!hdr.startsWith('Bearer ')) { res.status(401).json({ ok: false, error: 'missing-token' }); return; }
    let decoded: admin.auth.DecodedIdToken;
    try { decoded = await admin.auth().verifyIdToken(hdr.substring(7)); }
    catch { res.status(401).json({ ok: false, error: 'invalid-token' }); return; }

    const db = admin.firestore();

    // Authorize: custom claim OR /admins/{uid} doc (same model as the rules' isAdmin()).
    let isAdmin = decoded.admin === true;
    if (!isAdmin) {
      try { isAdmin = (await db.doc(`admins/${decoded.uid}`).get()).exists; } catch { isAdmin = false; }
    }
    if (!isAdmin) { res.status(403).json({ ok: false, error: 'not-admin' }); return; }

    const { title, body } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
      res.status(400).json({ ok: false, error: 'title-and-body-required' });
      return;
    }
    const t = title.trim().slice(0, 100);
    const b = body.trim().slice(0, 400);

    try {
      const snap = await db.collection('pushTokens').get();
      const recipients = snap.docs
        .map((d) => ({ uid: d.id, token: d.data()?.token as string | undefined }))
        .filter((r): r is { uid: string; token: string } =>
          typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'));

      if (recipients.length === 0) { res.json({ ok: true, sent: 0, errors: 0, recipients: 0 }); return; }

      let sent = 0, errors = 0;
      for (let i = 0; i < recipients.length; i += 100) {
        const batch = recipients.slice(i, i + 100);
        const messages = batch.map((r) => ({ to: r.token, sound: 'default', title: t, body: b, priority: 'high' }));
        try {
          const resp = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
          });
          if (!resp.ok) {
            errors += batch.length;
            logger.warn('broadcastPush: Expo returned', resp.status, await resp.text().catch(() => ''));
            continue;
          }
          const json = (await resp.json().catch(() => null)) as
            | { data?: Array<{ status?: string; details?: { error?: string } }> } | null;
          const tickets = json?.data;
          if (Array.isArray(tickets) && tickets.length > 0) {
            for (let j = 0; j < batch.length; j++) {
              const ticket = tickets[j];
              if (ticket?.status === 'ok') { sent += 1; continue; }
              errors += 1;
              if (ticket?.details?.error === 'DeviceNotRegistered') {
                await db.doc(`pushTokens/${batch[j].uid}`).delete().catch(() => {});
              }
            }
          } else {
            sent += batch.length; // no ticket detail — count optimistically
          }
        } catch (e) {
          errors += batch.length;
          logger.warn('broadcastPush: batch send failed', e);
        }
      }

      logger.info(`broadcastPush by ${decoded.uid}: sent=${sent} errors=${errors} recipients=${recipients.length}`);
      res.json({ ok: true, sent, errors, recipients: recipients.length });
    } catch (e: any) {
      logger.error('broadcastPush failed', e);
      res.status(500).json({ ok: false, error: e?.message ?? 'unknown' });
    }
  },
);
