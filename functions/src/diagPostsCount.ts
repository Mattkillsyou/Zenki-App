/**
 * DEBUG ONLY — Returns the count of documents in /posts and a sample of the
 * most recent. No auth required. Called once during incident triage; remove
 * this file + the export before next production cut.
 */

import { onRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

export const diagPostsCount = onRequest(
  { cors: true, region: 'us-central1' },
  async (_req, res) => {
    try {
      const snap = await db
        .collection('posts')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();
      res.status(200).json({
        count: snap.size,
        recent: snap.docs.map((d) => ({
          id: d.id,
          userId: d.data().userId,
          mediaType: d.data().mediaType,
          caption: (d.data().caption || '').slice(0, 60),
          createdAt: d.data().createdAt,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'unknown' });
    }
  },
);
