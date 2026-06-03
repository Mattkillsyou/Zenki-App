/**
 * Cloud Function — POST /deletePostCascade
 *
 * Deletes a post AND everything under it. Firestore does NOT auto-delete
 * subcollections, and a client cannot delete other users' like/comment docs,
 * so the previous client-side `deleteDoc(posts/{id})` orphaned every like, every
 * comment, and the Storage media forever. This does the full cascade with the
 * Admin SDK.
 *
 * Auth: Bearer Firebase ID token. Allowed if the caller is the post's author
 * OR an admin (custom claim or /admins/{uid} doc).
 *
 * Body: { postId: string }
 * Returns: { ok: true, deleted: { post, likes, comments, media } }
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

async function authUid(req: any): Promise<string | { error: string; status: number }> {
  const hdr = req.get?.('Authorization') || req.headers?.authorization;
  if (!hdr?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(hdr.substring(7));
    return decoded.uid;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

async function isAdmin(uid: string): Promise<boolean> {
  try {
    const snap = await admin.firestore().doc(`admins/${uid}`).get();
    return snap.exists;
  } catch {
    return false;
  }
}

/**
 * Best-effort: turn a Firebase Storage download URL into the storage object
 * path so we can delete it. Returns null if the URL isn't a recognizable
 * firebasestorage.googleapis.com media URL (e.g. a local URI fallback).
 */
function storagePathFromUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  // …/o/{URL-encoded-path}?alt=media&token=…
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

export const deletePostCascade = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 120, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const auth = await authUid(req);
    if (typeof auth !== 'string') { res.status(auth.status).send(auth.error); return; }
    const uid = auth;

    const { postId } = req.body ?? {};
    if (typeof postId !== 'string' || !postId) { res.status(400).send('postId required'); return; }

    const db = admin.firestore();
    const postRef = db.doc(`posts/${postId}`);

    try {
      const snap = await postRef.get();
      if (!snap.exists) { res.json({ ok: true, deleted: { post: 0, note: 'already-gone' } }); return; }
      const post = snap.data() as { userId?: string; mediaUrl?: string };

      // Authorize: author or admin only.
      if (post.userId !== uid && !(await isAdmin(uid))) {
        res.status(403).send('Not authorized to delete this post');
        return;
      }

      // Count subcollection docs for the response (before delete).
      const [likesSnap, commentsSnap] = await Promise.all([
        postRef.collection('likes').get(),
        postRef.collection('comments').get(),
      ]);

      // recursiveDelete removes the post doc + all subcollections (likes,
      // comments) atomically from the client's perspective.
      await db.recursiveDelete(postRef);

      // Delete the Storage media object (best-effort, non-fatal).
      let mediaDeleted = 0;
      const path = storagePathFromUrl(post.mediaUrl);
      if (path) {
        try {
          await admin.storage().bucket().file(path).delete();
          mediaDeleted = 1;
        } catch (e) {
          logger.warn('deletePostCascade: media delete failed (non-fatal)', e);
        }
      }

      res.json({
        ok: true,
        deleted: { post: 1, likes: likesSnap.size, comments: commentsSnap.size, media: mediaDeleted },
      });
    } catch (e: any) {
      logger.error('deletePostCascade failed for postId=' + postId, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error' });
    }
  },
);
