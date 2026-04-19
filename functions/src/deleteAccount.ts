/**
 * Cloud Function — POST /deleteAccount
 *
 * Required for App Store Rule 5.1.1(v): account deletion must be in-app.
 *
 * Requires Firebase Auth ID token in Authorization header.
 * Cascade-deletes all Firestore docs owned by the caller, plus any files
 * under users/{uid}/ in Cloud Storage. The client then calls
 * currentUser.delete() to remove the Firebase Auth record itself.
 *
 * Collections purged:
 *   users/{uid}
 *   posts where userId == uid
 *   follows where followerId == uid OR followingId == uid
 *   attendance where memberId == uid (if we keep retention flag off)
 *   waivers where memberId == uid
 *   supportMessages where senderId == uid
 *   pushTokens where uid == uid
 *   bloodworkReports where memberId == uid
 *   dexaScans where memberId == uid
 *   aiRateLimits/{uid} (all subcollections)
 *   threads where participants contains uid (messages + thread metadata)
 *
 * Returns { ok: true, deleted: { collection: count } } on success.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const BATCH_SIZE = 400; // under Firestore's 500-per-batch cap

async function authenticate(req: any): Promise<string | { error: string; status: number }> {
  const auth = req.get?.('Authorization') || req.headers?.authorization;
  if (!auth?.startsWith?.('Bearer ')) return { error: 'Missing token', status: 401 };
  try {
    const decoded = await admin.auth().verifyIdToken(auth.substring(7));
    return decoded.uid;
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

/**
 * Delete every document matching a query, in batches. Returns the total deleted.
 */
async function deleteByQuery(query: FirebaseFirestore.Query): Promise<number> {
  const db = admin.firestore();
  let total = 0;
  while (true) {
    const snap = await query.limit(BATCH_SIZE).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;
    if (snap.size < BATCH_SIZE) break;
  }
  return total;
}

/** Delete a single doc + all of its subcollections recursively. */
async function deleteDocDeep(docRef: FirebaseFirestore.DocumentReference): Promise<number> {
  const subs = await docRef.listCollections();
  let total = 0;
  for (const sub of subs) {
    total += await deleteByQuery(sub);
  }
  const exists = (await docRef.get()).exists;
  if (exists) {
    await docRef.delete();
    total++;
  }
  return total;
}

export const deleteAccount = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method not allowed');
      return;
    }

    const authResult = await authenticate(req);
    if (typeof authResult !== 'string') {
      res.status(authResult.status).send(authResult.error);
      return;
    }
    const uid = authResult;

    const db = admin.firestore();
    const deleted: Record<string, number> = {};

    try {
      // 1. User profile
      const userRef = db.collection('users').doc(uid);
      deleted.users = await deleteDocDeep(userRef);

      // 2. Posts authored by this user
      deleted.posts = await deleteByQuery(
        db.collection('posts').where('userId', '==', uid),
      );

      // 3. Follows — both directions
      deleted.followsAsFollower = await deleteByQuery(
        db.collection('follows').where('followerId', '==', uid),
      );
      deleted.followsAsFollowing = await deleteByQuery(
        db.collection('follows').where('followingId', '==', uid),
      );

      // 4. Attendance — personal records only
      deleted.attendance = await deleteByQuery(
        db.collection('attendance').where('memberId', '==', uid),
      );

      // 5. Waivers
      deleted.waivers = await deleteByQuery(
        db.collection('waivers').where('memberId', '==', uid),
      );

      // 6. Support messages
      deleted.supportMessages = await deleteByQuery(
        db.collection('supportMessages').where('senderId', '==', uid),
      );

      // 7. Push tokens
      deleted.pushTokens = await deleteByQuery(
        db.collection('pushTokens').where('uid', '==', uid),
      );

      // 8. Health data — bloodwork + DEXA
      deleted.bloodworkReports = await deleteByQuery(
        db.collection('bloodworkReports').where('memberId', '==', uid),
      );
      deleted.dexaScans = await deleteByQuery(
        db.collection('dexaScans').where('memberId', '==', uid),
      );

      // 9. AI rate limit state (subcollection structure)
      deleted.aiRateLimits = await deleteDocDeep(
        db.collection('aiRateLimits').doc(uid),
      );

      // 10. DM threads the user participates in — redact user's messages
      //     rather than delete whole threads (preserves context for other users).
      //     We do delete thread-level metadata for 1:1 threads where this user
      //     is the only remaining participant.
      const threadSnap = await db
        .collection('threads')
        .where('participants', 'array-contains', uid)
        .get();
      let redactedMessages = 0;
      let threadsDeleted = 0;
      for (const doc of threadSnap.docs) {
        const participants: string[] = doc.data().participants ?? [];
        const others = participants.filter((p) => p !== uid);

        // Redact messages this user sent
        const msgs = await doc.ref
          .collection('messages')
          .where('senderId', '==', uid)
          .get();
        const batch = db.batch();
        msgs.docs.forEach((m) =>
          batch.update(m.ref, {
            body: '',
            redacted: true,
            redactedReason: 'account_deleted',
          }),
        );
        if (msgs.size > 0) await batch.commit();
        redactedMessages += msgs.size;

        if (others.length === 0) {
          // This user was the only participant — safe to delete thread entirely
          threadsDeleted += await deleteDocDeep(doc.ref);
        } else {
          // Remove self from participants array
          await doc.ref.update({
            participants: others,
            deletedParticipants: admin.firestore.FieldValue.arrayUnion(uid),
          });
        }
      }
      deleted.threadsFullyDeleted = threadsDeleted;
      deleted.messagesRedacted = redactedMessages;

      // 11. Cloud Storage — users/{uid}/**
      try {
        const bucket = admin.storage().bucket();
        const [files] = await bucket.getFiles({ prefix: `users/${uid}/` });
        let filesDeleted = 0;
        for (const file of files) {
          await file.delete().catch(() => {});
          filesDeleted++;
        }
        deleted.storageFiles = filesDeleted;
      } catch (e) {
        logger.warn('Storage cleanup failed (non-fatal)', e);
      }

      res.json({ ok: true, uid, deleted });
    } catch (e: any) {
      logger.error('deleteAccount failed for uid=' + uid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', deleted });
    }
  },
);
