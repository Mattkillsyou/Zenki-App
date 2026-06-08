/**
 * Cloud Function — POST /deleteAccount
 *
 * Required for App Store Rule 5.1.1(v) (in-app account deletion) and GDPR
 * right-to-erasure. Cascade-deletes everything the caller owns, against the
 * REAL Firestore schema the live client writes — the previous version targeted
 * dead collections (`follows`, `threads`, flat `pushTokens`) and never touched
 * `following`/`followers`/`followRequests`/`conversations`/`members`, so a
 * "deleted" user kept their follow graph, DMs, push token, and member profile.
 *
 * Requires Firebase Auth ID token in Authorization header. The client then
 * deletes the Firebase Auth record itself server-side (admin.auth().deleteUser)
 * as the final step — the client just signs out after this returns.
 *
 * Purged:
 *   users/{uid}                                  (+ subcollections)
 *   members where firebaseUid == uid
 *   posts where userId == uid                    (recursive: likes + comments)  + Storage media
 *   following/{uid}/follows/*                     (+ followers/{target}/followers/{uid} mirror, decrement target.followerCount)
 *   followers/{uid}/followers/*                   (+ following/{follower}/follows/{uid} mirror, decrement follower.followingCount)
 *   followRequests/{uid}/requests/*  +  collectionGroup requests authored by uid
 *   mutes/{uid}/*   blocks/{uid}/*
 *   conversations where participants contains uid (redact messages; drop self / delete if alone)
 *   pushTokens/{uid}
 *   collectionGroup likes where uid == uid       (the user's likes on others' posts)
 *   collectionGroup comments where userId == uid (the user's comments on others' posts)
 *   attendance / waivers / supportMessages / aiRateLimits/{uid}
 *   Storage users/{uid}/**  and  postMedia/{uid}/**
 *
 * Returns { ok: true, deleted: { collection: count } }.
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

/** Delete every document matching a query, in batches. Returns total deleted. */
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
  const db = admin.firestore();
  const exists = (await docRef.get()).exists;
  await db.recursiveDelete(docRef);
  return exists ? 1 : 0;
}

function storagePathFromUrl(url: unknown): string | null {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

export const deleteAccount = onRequest(
  { cors: true, memory: '512MiB', timeoutSeconds: 300, invoker: 'public' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const authResult = await authenticate(req);
    if (typeof authResult !== 'string') { res.status(authResult.status).send(authResult.error); return; }
    const uid = authResult;

    const db = admin.firestore();
    const deleted: Record<string, number> = {};

    try {
      // 0. Resolve the member doc id from the user profile BEFORE deleting it.
      const userSnap = await db.doc(`users/${uid}`).get();
      const memberId = userSnap.exists ? (userSnap.data()?.memberId as string | undefined) : undefined;

      // 1. Posts authored by this user — recursive (likes + comments) + media.
      let postsDeleted = 0;
      let mediaDeleted = 0;
      while (true) {
        const snap = await db.collection('posts').where('userId', '==', uid).limit(50).get();
        if (snap.empty) break;
        for (const d of snap.docs) {
          const path = storagePathFromUrl(d.data()?.mediaUrl);
          if (path) {
            await admin.storage().bucket().file(path).delete().then(() => { mediaDeleted++; }).catch(() => {});
          }
          await db.recursiveDelete(d.ref);
          postsDeleted++;
        }
        if (snap.size < 50) break;
      }
      deleted.posts = postsDeleted;
      deleted.postMedia = mediaDeleted;

      // 2. Following edges (people this user follows): delete each + the
      //    follower-side mirror. Deleting the followers/* mirror fires the
      //    followerCounters trigger, which adjusts the OTHER user's count; we
      //    must NOT also decrement here or counts would double-drop.
      let followingDeleted = 0;
      const followingSnap = await db.collection('following').doc(uid).collection('follows').get();
      for (const d of followingSnap.docs) {
        const targetId = d.id;
        const batch = db.batch();
        batch.delete(d.ref);
        batch.delete(db.doc(`followers/${targetId}/followers/${uid}`));
        await batch.commit().catch((e) => logger.warn('following cleanup batch failed', e));
        followingDeleted++;
      }
      deleted.following = followingDeleted;

      // 3. Follower edges (people who follow this user): delete each + the
      //    following-side mirror. Same trigger handles the count adjustment.
      let followersDeleted = 0;
      const followersSnap = await db.collection('followers').doc(uid).collection('followers').get();
      for (const d of followersSnap.docs) {
        const followerId = d.id;
        const batch = db.batch();
        batch.delete(d.ref);
        batch.delete(db.doc(`following/${followerId}/follows/${uid}`));
        await batch.commit().catch((e) => logger.warn('followers cleanup batch failed', e));
        followersDeleted++;
      }
      deleted.followers = followersDeleted;

      // 4. Follow requests — to this user (their queue) and authored by them.
      deleted.followRequestsIncoming = await deleteDocDeep(db.collection('followRequests').doc(uid));
      // Outgoing: this user's pending requests live at
      // followRequests/{target}/requests/{uid}. PAGE the 'requests'
      // collection-group (bounded memory) and delete only ours, instead of
      // buffering every user's requests in memory at once — the unbounded
      // .get() would inflate memory/timeout as the user base grows, and account
      // deletion must reliably succeed (Apple 5.1.1(v)).
      let outgoingRequests = 0;
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
      while (true) {
        let q = db.collectionGroup('requests').orderBy('__name__').limit(BATCH_SIZE);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get().catch(() => null);
        if (!snap || snap.empty) break;
        const mine = snap.docs.filter((d) => d.id === uid && d.ref.path.startsWith('followRequests/'));
        if (mine.length) {
          const batch = db.batch();
          mine.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          outgoingRequests += mine.length;
        }
        if (snap.size < BATCH_SIZE) break;
        cursor = snap.docs[snap.docs.length - 1];
      }
      deleted.followRequestsOutgoing = outgoingRequests;

      // 5. Mutes + blocks owned by this user.
      deleted.mutes = await deleteDocDeep(db.collection('mutes').doc(uid));
      deleted.blocks = await deleteDocDeep(db.collection('blocks').doc(uid));

      // 6. The user's likes + comments on OTHER people's posts.
      const myLikes = await db.collectionGroup('likes').where('uid', '==', uid).get().catch(() => null);
      let likesDeleted = 0;
      if (myLikes) {
        // Delete the like-docs in batches...
        for (let i = 0; i < myLikes.docs.length; i += BATCH_SIZE) {
          const slice = myLikes.docs.slice(i, i + BATCH_SIZE);
          const batch = db.batch();
          slice.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          likesDeleted += slice.length;
        }
        // ...and decrement each liked post's denormalized `likes` counter so it
        // isn't left inflated. `update` (not set-merge) throws NOT_FOUND for an
        // already-deleted post, which we swallow — never resurrect a dead post.
        for (const d of myLikes.docs) {
          const postRef = d.ref.parent.parent;
          if (postRef) {
            await postRef.update({ likes: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
          }
        }
      }
      deleted.likes = likesDeleted;
      deleted.comments = await deleteByQuery(db.collectionGroup('comments').where('userId', '==', uid));

      // 7. Conversations the user participates in — redact their messages, then
      //    drop them from participants (or delete the conversation if alone).
      const convSnap = await db.collection('conversations').where('participants', 'array-contains', uid).get();
      let redactedMessages = 0;
      let conversationsDeleted = 0;
      for (const conv of convSnap.docs) {
        const participants: string[] = conv.data().participants ?? [];
        const others = participants.filter((p) => p !== uid);

        const msgs = await conv.ref.collection('messages').where('senderId', '==', uid).get();
        for (let i = 0; i < msgs.docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          msgs.docs.slice(i, i + BATCH_SIZE).forEach((m) =>
            batch.update(m.ref, { text: '', redacted: true, redactedReason: 'account_deleted' }),
          );
          await batch.commit();
        }
        redactedMessages += msgs.size;

        if (others.length === 0) {
          await db.recursiveDelete(conv.ref);
          conversationsDeleted++;
        } else {
          await conv.ref.update({
            participants: others,
            deletedParticipants: admin.firestore.FieldValue.arrayUnion(uid),
          });
        }
      }
      deleted.conversationsDeleted = conversationsDeleted;
      deleted.messagesRedacted = redactedMessages;

      // 8. Push token (now keyed by uid).
      deleted.pushTokens = await deleteDocDeep(db.doc(`pushTokens/${uid}`));

      // 9. Other personal collections.
      // attendance + waivers are stamped with the auth uid as `firebaseUid` (the
      // app's `memberId` is an INTERNAL id, not the auth uid), so the old
      // memberId==uid query never matched and these never got erased on account
      // deletion — a GDPR gap. Query by firebaseUid.
      deleted.attendance = await deleteByQuery(db.collection('attendance').where('firebaseUid', '==', uid));
      deleted.waivers = await deleteByQuery(db.collection('waivers').where('firebaseUid', '==', uid));
      // appointments + taskCompletions are likewise firebaseUid-stamped personal
      // records (booking history; per-member shift-completion log) — same GDPR
      // sweep, else a deleted user's identifiable history survives and keeps
      // streaming to admins (firestore.rules /appointments, /taskCompletions).
      deleted.appointments = await deleteByQuery(db.collection('appointments').where('firebaseUid', '==', uid));
      deleted.taskCompletions = await deleteByQuery(db.collection('taskCompletions').where('firebaseUid', '==', uid));
      deleted.supportMessages = await deleteByQuery(db.collection('supportMessages').where('senderId', '==', uid));
      // DEXA scans + bloodwork are local-only (AsyncStorage via NutritionContext), never server-persisted — nothing to delete here.
      deleted.aiRateLimits = await deleteDocDeep(db.collection('aiRateLimits').doc(uid));

      // 10. Member doc(s). Prefer the id resolved from the profile; also sweep
      //     by firebaseUid in case the profile pointer was missing.
      let membersDeleted = 0;
      if (memberId) membersDeleted += await deleteDocDeep(db.doc(`members/${memberId}`));
      membersDeleted += await deleteByQuery(db.collection('members').where('firebaseUid', '==', uid));
      deleted.members = membersDeleted;

      // 11. User profile last (so step 0's memberId lookup worked).
      deleted.users = await deleteDocDeep(db.doc(`users/${uid}`));

      // 12. Cloud Storage — users/{uid}/** and postMedia/{uid}/**.
      try {
        const bucket = admin.storage().bucket();
        let filesDeleted = 0;
        for (const prefix of [`users/${uid}/`, `postMedia/${uid}/`]) {
          const [files] = await bucket.getFiles({ prefix });
          for (const file of files) { await file.delete().catch(() => {}); filesDeleted++; }
        }
        deleted.storageFiles = filesDeleted;
      } catch (e) {
        logger.warn('Storage cleanup failed (non-fatal)', e);
      }

      // 13. Finally, delete the Firebase Auth user itself. The Admin SDK has no
      //     recent-login requirement, so doing it server-side here can't strand
      //     a still-loginable account whose data is already gone (the bug when
      //     the client did user.delete() AFTER this cascade and hit
      //     auth/requires-recent-login). The client no longer deletes the Auth
      //     user; it just signs out after this returns ok.
      try {
        await admin.auth().deleteUser(uid);
        deleted.authUser = 1;
      } catch (e) {
        logger.error('deleteAccount: Auth user delete failed for uid=' + uid, e);
        deleted.authUser = 0;
      }

      res.json({ ok: true, uid, deleted });
    } catch (e: any) {
      logger.error('deleteAccount failed for uid=' + uid, e);
      res.status(500).json({ ok: false, error: e?.message ?? 'Unknown error', deleted });
    }
  },
);
