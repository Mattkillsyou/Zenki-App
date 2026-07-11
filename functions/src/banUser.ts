/**
 * Cloud Function — POST /banUser
 *
 * Admin-only. Ejects an abusive user from the community, as required by Apple
 * Guideline 1.2 ("a mechanism … to eject offending users"). The previous
 * moderation flow only blocked an offender FOR THE ONE REPORTER, so they could
 * keep posting to everyone else. This disables their Firebase Auth account
 * (they can no longer sign in or refresh a token — the real enforcement) and
 * flags users/{uid}.banned for display/audit. It also PURGES the offender's
 * public content (their posts + comments) so banning actually removes the
 * objectionable UGC, not just freezes the account (Apple 1.2 "remove … content").
 *
 * Auth: Bearer Firebase ID token; caller must be an admin (custom claim or
 * /admins/{uid} doc).
 *
 * Body: { targetUid: string, reason?: string }
 * Returns: { ok: true, targetUid, disabled: true, purged: { posts, comments },
 *            errors: {step: msg} } — `errors` is empty when the purge was clean;
 * a non-empty entry means the ban (auth disable) succeeded but that purge step
 * failed and its content may still be visible.
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

export const banUser = onRequest(
  // Higher timeout than a plain disable — the content purge below can touch many
  // posts/comments for a prolific offender.
  { cors: true, memory: '256MiB', timeoutSeconds: 120, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }
    const adminUid = auth;

    const { targetUid, reason } = req.body ?? {};
    if (typeof targetUid !== 'string' || !targetUid) { res.status(400).send('targetUid required'); return; }
    if (targetUid === adminUid) { res.status(400).send('Refusing to ban self'); return; }

    try {
      // Real enforcement: disable the auth account. Disabled users can't sign
      // in and their existing ID tokens stop being refreshable.
      await admin.auth().updateUser(targetUid, { disabled: true });
      // Revoke outstanding refresh tokens so existing sessions die promptly.
      await admin.auth().revokeRefreshTokens(targetUid).catch((e) =>
        logger.warn('banUser: revokeRefreshTokens failed (non-fatal)', e),
      );

      // Flag the profile for display/audit (best-effort).
      await admin.firestore().doc(`users/${targetUid}`).set(
        {
          banned: true,
          bannedAt: new Date().toISOString(),
          bannedBy: adminUid,
          bannedReason: typeof reason === 'string' ? reason.slice(0, 300) : null,
        },
        { merge: true },
      ).catch((e) => logger.warn('banUser: users flag write failed (non-fatal)', e));

      // Purge the offender's public UGC (Apple 1.2 "remove offending content"):
      // their posts (+ likes/comments subcollections via recursiveDelete) and any
      // comments they left on OTHER users' posts. Best-effort and AFTER the
      // auth-disable — a purge hiccup must never fail the ban (the disable above is
      // the real enforcement). NOTE: collection-group queries are NOT auto-indexed
      // — the comments query needs the comments.userId COLLECTION_GROUP fieldOverride
      // in firestore.indexes.json (it FAILED_PRECONDITION'd in prod without it).
      // Purge failures are recorded in `errors` so the caller sees that content
      // may still be live, instead of a silent ok/purged:0.
      const purged: { posts: number; comments: number } = { posts: 0, comments: 0 };
      const errors: Record<string, string> = {};
      try {
        const myPosts = await admin.firestore()
          .collection('posts').where('userId', '==', targetUid).get();
        for (const p of myPosts.docs) {
          await admin.firestore().recursiveDelete(p.ref);
          purged.posts++;
        }
      } catch (e: any) {
        errors.posts = e?.message ?? String(e);
        logger.error('banUser: post purge failed for targetUid=' + targetUid + ' — posts may still be visible', e);
      }
      try {
        const myComments = await admin.firestore()
          .collectionGroup('comments').where('userId', '==', targetUid).get();
        const BATCH = 400;
        for (let i = 0; i < myComments.docs.length; i += BATCH) {
          const batch = admin.firestore().batch();
          myComments.docs.slice(i, i + BATCH).forEach((c) => batch.delete(c.ref));
          await batch.commit();
        }
        purged.comments = myComments.docs.length;
      } catch (e: any) {
        errors.comments = e?.message ?? String(e);
        logger.error('banUser: comment purge failed for targetUid=' + targetUid + ' — comments may still be visible', e);
      }

      res.json({ ok: true, targetUid, disabled: true, purged, errors });
    } catch (e: any) {
      logger.error('banUser failed for targetUid=' + targetUid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
