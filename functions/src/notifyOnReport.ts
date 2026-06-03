/**
 * Cloud Function — Firestore trigger onDocumentCreated('reports/{reportId}')
 *
 * Operational backstop for Apple Guideline 1.2's "act on reports within 24
 * hours": the moderation queue is only useful if an admin actually opens it.
 * This pushes a notification to every admin the moment a report is filed, so
 * the ≤24h SLA doesn't depend on someone happening to check the screen.
 *
 * Admins are the uids in /admins/{uid}; their Expo push tokens live in
 * /pushTokens/{uid} (relocated off /members).
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const notifyOnReport = onDocumentCreated('reports/{reportId}', async (event) => {
  const report = event.data?.data() as
    | { targetType?: string; reason?: string }
    | undefined;
  if (!report) return;

  const db = admin.firestore();
  try {
    // Collect admin uids.
    const adminsSnap = await db.collection('admins').get();
    const adminUids = adminsSnap.docs.map((d) => d.id);
    if (adminUids.length === 0) {
      logger.info('notifyOnReport: no admins seeded — skipping push');
      return;
    }

    // Look up each admin's push token (pushTokens/{uid}). Keep the uid aligned
    // with its token so Expo tickets (returned in request order) can be mapped
    // back to the owning uid for stale-token cleanup below.
    const tokenSnaps = await Promise.all(
      adminUids.map((uid) => db.doc(`pushTokens/${uid}`).get()),
    );
    const recipients = adminUids
      .map((uid, i) => {
        const snap = tokenSnaps[i];
        const token = snap.exists ? (snap.data()?.token as string | undefined) : undefined;
        return { uid, token };
      })
      .filter(
        (r): r is { uid: string; token: string } =>
          typeof r.token === 'string' && r.token.startsWith('ExponentPushToken'),
      );

    if (recipients.length === 0) {
      logger.info('notifyOnReport: no admin push tokens registered — skipping');
      return;
    }

    // Parallel array of uids in the SAME order as `messages` — used to zip
    // against the Expo ticket array in the response.
    const recipientUids = recipients.map((r) => r.uid);
    const messages = recipients.map((r) => ({
      to: r.token,
      sound: 'default',
      title: 'New content report',
      body: `A ${report.targetType ?? 'item'} was reported (${report.reason ?? 'reason unknown'}). Review within 24h.`,
      data: { type: 'moderation_report' },
      priority: 'high',
    }));

    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) {
      logger.warn('notifyOnReport: Expo push returned', resp.status, await resp.text().catch(() => ''));
    } else {
      // Expo returns HTTP 200 even when individual tickets carry per-token
      // errors (e.g. DeviceNotRegistered). Inspect the ticket array and prune
      // dead tokens; best-effort — never throw, never block the trigger.
      try {
        const body = (await resp.json().catch(() => null)) as
          | { data?: Array<{ status?: string; message?: string; details?: { error?: string } }> }
          | null;
        const tickets = body?.data;
        if (Array.isArray(tickets)) {
          for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket?.status === 'error') {
              const uid = recipientUids[i];
              logger.warn('notifyOnReport: Expo ticket error', {
                uid,
                message: ticket.message,
                error: ticket.details?.error,
              });
              // Stale token — remove it so this dead recipient stops being targeted.
              if (ticket.details?.error === 'DeviceNotRegistered' && uid) {
                await db.doc(`pushTokens/${uid}`).delete().catch(() => {});
              }
            }
          }
        }
      } catch (ticketErr) {
        logger.warn('notifyOnReport: ticket inspection failed (non-fatal)', ticketErr);
      }
    }
  } catch (e) {
    logger.error('notifyOnReport failed', e);
  }
});
