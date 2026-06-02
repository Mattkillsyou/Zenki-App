/**
 * Cloud Function — POST /banUser
 *
 * Admin-only. Ejects an abusive user from the community, as required by Apple
 * Guideline 1.2 ("a mechanism … to eject offending users"). The previous
 * moderation flow only blocked an offender FOR THE ONE REPORTER, so they could
 * keep posting to everyone else. This disables their Firebase Auth account
 * (they can no longer sign in or refresh a token — the real enforcement) and
 * flags users/{uid}.banned for display/audit.
 *
 * Auth: Bearer Firebase ID token; caller must be an admin (custom claim or
 * /admins/{uid} doc).
 *
 * Body: { targetUid: string, reason?: string }
 * Returns: { ok: true, targetUid, disabled: true }
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
  { cors: true, memory: '256MiB', timeoutSeconds: 30, invoker: 'public' },
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

      res.json({ ok: true, targetUid, disabled: true });
    } catch (e: any) {
      logger.error('banUser failed for targetUid=' + targetUid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
