/**
 * Cloud Function — POST /adminActionReport
 *
 * Admin-only moderation action applied to a single /reports/{reportId} doc.
 *
 * Auth:
 *   1. Caller must present a valid Firebase ID token.
 *   2. Caller must either:
 *      - have an admin custom claim (token.admin === true), OR
 *      - have a doc at /admins/{uid} (Admin SDK bypasses rules)
 *   Falls through to a hardcoded allowlist if neither is set. See
 *   ADMIN_SETUP.md for how to seed an admin.
 *
 * Body:
 *   { reportId: string, action: 'dismiss' | 'removeAndBlock' }
 *
 * Behavior:
 *   - 'dismiss' → update report.status = 'dismissed'
 *   - 'removeAndBlock' →
 *       1. Delete target content (post / message / comment) if applicable
 *       2. Add a block doc: /blocks/{reporterId}/blocked/{targetUserId}
 *       3. Update report.status = 'actioned'
 *
 * Returns { ok: true, action, target, affected }.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

// Fallback if the admin hasn't seeded the /admins collection yet.
// Empty by default — seed a /admins/{uid} doc in Firestore console instead.
const HARDCODED_ADMIN_UIDS: string[] = [];

interface Report {
  reporterId: string;
  targetType: 'post' | 'message' | 'user' | 'comment';
  targetId: string;
  targetUserId: string;
  reason: string;
  context?: string;
  /** For 'comment': the parent postId. For 'message': the conversationId. */
  parentId?: string;
  status: 'open' | 'dismissed' | 'actioned';
}

async function verifyAdmin(req: any): Promise<string | { error: string; status: number }> {
  const authHdr = req.get?.('Authorization') || req.headers?.authorization;
  if (!authHdr?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  let uid: string;
  let hasAdminClaim = false;
  try {
    const decoded = await admin.auth().verifyIdToken(authHdr.substring(7));
    uid = decoded.uid;
    hasAdminClaim = decoded.admin === true;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }

  if (hasAdminClaim) return uid;
  if (HARDCODED_ADMIN_UIDS.includes(uid)) return uid;

  // Check /admins/{uid} doc exists
  try {
    const snap = await admin.firestore().doc(`admins/${uid}`).get();
    if (snap.exists) return uid;
  } catch {
    /* ignore — fall through to 403 */
  }

  return { error: 'Not authorized', status: 403 };
}

export const adminActionReport = onRequest(
  { cors: true, memory: '256MiB', timeoutSeconds: 30, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const auth = await verifyAdmin(req);
    if (typeof auth !== 'string') {
      res.status(auth.status).send(auth.error);
      return;
    }
    const adminUid = auth;

    const { reportId, action } = req.body ?? {};
    if (typeof reportId !== 'string' || !reportId) {
      res.status(400).send('reportId required');
      return;
    }
    if (action !== 'dismiss' && action !== 'removeAndBlock') {
      res.status(400).send('action must be dismiss or removeAndBlock');
      return;
    }

    const db = admin.firestore();
    const reportRef = db.doc(`reports/${reportId}`);
    const reportSnap = await reportRef.get();
    if (!reportSnap.exists) {
      res.status(404).send('Report not found');
      return;
    }
    const report = reportSnap.data() as Report;
    if (report.status !== 'open') {
      res.status(409).send(`Report already ${report.status}`);
      return;
    }

    const affected: Record<string, boolean> = {};

    if (action === 'dismiss') {
      await reportRef.update({
        status: 'dismissed',
        resolvedBy: adminUid,
        resolvedAt: new Date().toISOString(),
      });
      res.json({ ok: true, action, affected });
      return;
    }

    // ── removeAndBlock ──

    // 1. Delete target content if we know how
    try {
      if (report.targetType === 'post') {
        // Cascade: post doc + likes/comments subcollections.
        await db.recursiveDelete(db.doc(`posts/${report.targetId}`));
        affected.postDeleted = true;
      } else if (report.targetType === 'comment') {
        // Real comments live at posts/{parentId}/comments/{commentId}. The
        // report carries parentId (the postId) so we can delete the right doc.
        if (report.parentId) {
          await db.doc(`posts/${report.parentId}/comments/${report.targetId}`).delete();
          affected.commentDeleted = true;
        }
      } else if (report.targetType === 'message') {
        // Messages live under conversations/{conversationId}/messages/{msgId}.
        // The report's parentId carries the conversationId.
        if (report.parentId) {
          const msgRef = db.doc(`conversations/${report.parentId}/messages/${report.targetId}`);
          const msgSnap = await msgRef.get();
          if (msgSnap.exists) {
            await msgRef.update({ text: '', redacted: true, redactedReason: 'moderator_action' });
            affected.messageRedacted = true;
          }
        }
      }
      // 'user' targets — no content to delete; block + mark actioned (use the
      // separate banUser function to eject the user entirely).
    } catch (e) {
      logger.warn('Removal of target content failed — continuing with block', e);
    }

    // 2. Block the target user from the reporter.
    // Guard against an empty targetUserId — clients store it as `?? ''`, and an
    // empty path segment makes db.doc() throw INVALID_ARGUMENT, which the
    // try/catch would silently swallow (the auto-block would never happen).
    if (typeof report.targetUserId === 'string' && report.targetUserId !== '') {
      try {
        await db
          .doc(`blocks/${report.reporterId}/blocked/${report.targetUserId}`)
          .set({
            blockedAt: new Date().toISOString(),
            reason: `auto_block_from_report_${reportId}`,
          });
        affected.blockAdded = true;
      } catch (e) {
        logger.warn('Auto-block failed', e);
      }
    } else {
      affected.blockSkipped = true;
    }

    // 3. Mark report actioned
    await reportRef.update({
      status: 'actioned',
      resolvedBy: adminUid,
      resolvedAt: new Date().toISOString(),
    });

    res.json({ ok: true, action, affected });
  },
);
