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

    // Look up each admin's push token (pushTokens/{uid}).
    const tokenSnaps = await Promise.all(
      adminUids.map((uid) => db.doc(`pushTokens/${uid}`).get()),
    );
    const tokens = tokenSnaps
      .map((s) => (s.exists ? (s.data()?.token as string | undefined) : undefined))
      .filter((t): t is string => typeof t === 'string' && t.startsWith('ExponentPushToken'));

    if (tokens.length === 0) {
      logger.info('notifyOnReport: no admin push tokens registered — skipping');
      return;
    }

    const messages = tokens.map((to) => ({
      to,
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
    }
  } catch (e) {
    logger.error('notifyOnReport failed', e);
  }
});
