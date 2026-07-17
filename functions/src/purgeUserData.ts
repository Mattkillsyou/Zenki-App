/**
 * Shared user-erasure cascade.
 *
 * Extracted from deleteAccount.ts so BOTH the self-service account deletion
 * (deleteAccount — the caller erases themselves, App Store 5.1.1(v) / GDPR) and
 * the admin-initiated deletion (adminDeleteUser — an admin erases a member, e.g.
 * clearing out test accounts) run the EXACT same cascade against the real
 * Firestore schema the live client writes. Keeping one implementation means the
 * two paths can never drift.
 *
 * Cascade (in order — ordering matters where noted):
 *   users/{uid}                                  (+ subcollections)   [read memberId FIRST]
 *   members where firebaseUid == uid  (+ members/{memberId})
 *   posts where userId == uid                    (recursive: likes + comments)  + Storage media
 *   following/{uid}/follows/*                     (+ followers mirror; counts via trigger)
 *   followers/{uid}/followers/*                   (+ following mirror; counts via trigger)
 *   followRequests/{uid}/requests/*  +  collectionGroup requests authored by uid
 *   mutes/{uid}/*   blocks/{uid}/*
 *   collectionGroup likes where uid == uid        (+ decrement each liked post's counter)
 *   collectionGroup comments where userId == uid
 *   conversations where participants contains uid (redact messages; drop self / delete if alone)
 *   pushTokens/{uid}
 *   attendance / waivers / appointments / taskCompletions / supportMessages / aiRateLimits/{uid}
 *   senpaiUsage where uid == uid                  (per-turn AI usage logs)
 *   nutrition/{uid}                              (recursive: weight/macro/goals/profile,
 *                                                 dexaScans, bloodworkReports, medications,
 *                                                 medicationLogs, cycleEntries, consents)
 *   training/{uid}                               (recursive: logs + personalRecords)
 *   gamification/{uid}                           (recursive: + grants ledger)
 *   Storage users/{uid}/**  and  postMedia/{uid}/**
 *   Firebase Auth user (admin.auth().deleteUser)
 *
 * Never throws for a post-destruction step: erasure is irreversible, so a hiccup
 * partway through must not abort the rest (that was the original bug — it 500'd
 * on an un-indexed collection-group query AFTER destroying posts/follows/blocks,
 * leaving half-deleted accounts). Every best-effort step records into `errors`
 * and the cascade always runs to completion, including the Auth-user delete.
 */

import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const BATCH_SIZE = 400; // under Firestore's 500-per-batch cap

export interface PurgeResult {
  uid: string;
  /** Per-collection counts of what was removed. */
  deleted: Record<string, number>;
  /** Per-step error messages for anything that failed best-effort (empty = clean). */
  errors: Record<string, string>;
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

/**
 * Erase every trace of `uid` from Firestore, Storage, and Firebase Auth.
 * Best-effort per step — see file header. Returns a full report; does not throw.
 */
export async function purgeUserData(uid: string): Promise<PurgeResult> {
  const db = admin.firestore();
  const deleted: Record<string, number> = {};
  const errors: Record<string, string> = {};
  // Run one best-effort step; record its error rather than aborting the cascade.
  const step = async (key: string, fn: () => Promise<number>): Promise<void> => {
    try { deleted[key] = await fn(); }
    catch (e: any) {
      deleted[key] = deleted[key] ?? 0;
      errors[key] = e?.message ?? String(e);
      logger.warn(`purgeUserData: step "${key}" failed for uid=${uid} (non-fatal)`, e);
    }
  };

  // 0. Resolve the member doc id from the user profile BEFORE deleting it.
  let memberId: string | undefined;
  try {
    const userSnap = await db.doc(`users/${uid}`).get();
    memberId = userSnap.exists ? (userSnap.data()?.memberId as string | undefined) : undefined;
  } catch (e: any) {
    errors['memberIdLookup'] = e?.message ?? String(e);
  }

  // 1. Posts authored by this user — recursive (likes + comments) + media.
  await step('posts', async () => {
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
    deleted.postMedia = mediaDeleted;
    return postsDeleted;
  });

  // 2. Following edges (people this user follows): delete each + the
  //    follower-side mirror. Deleting the followers/* mirror fires the
  //    followerCounters trigger, which adjusts the OTHER user's count; we must
  //    NOT also decrement here or counts would double-drop.
  await step('following', async () => {
    let n = 0;
    const followingSnap = await db.collection('following').doc(uid).collection('follows').get();
    for (const d of followingSnap.docs) {
      const targetId = d.id;
      const batch = db.batch();
      batch.delete(d.ref);
      batch.delete(db.doc(`followers/${targetId}/followers/${uid}`));
      await batch.commit().catch((e) => logger.warn('following cleanup batch failed', e));
      n++;
    }
    return n;
  });

  // 3. Follower edges (people who follow this user): delete each + the
  //    following-side mirror. Same trigger handles the count adjustment.
  await step('followers', async () => {
    let n = 0;
    const followersSnap = await db.collection('followers').doc(uid).collection('followers').get();
    for (const d of followersSnap.docs) {
      const followerId = d.id;
      const batch = db.batch();
      batch.delete(d.ref);
      batch.delete(db.doc(`following/${followerId}/follows/${uid}`));
      await batch.commit().catch((e) => logger.warn('followers cleanup batch failed', e));
      n++;
    }
    return n;
  });

  // 4. Follow requests — to this user (their queue) and authored by them.
  await step('followRequestsIncoming', () => deleteDocDeep(db.collection('followRequests').doc(uid)));
  // Outgoing: this user's pending requests live at followRequests/{target}/requests/{uid}.
  // PAGE the 'requests' collection-group (bounded memory) and delete only ours.
  await step('followRequestsOutgoing', async () => {
    let outgoing = 0;
    let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
    while (true) {
      let q = db.collectionGroup('requests').orderBy('__name__').limit(BATCH_SIZE);
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      const mine = snap.docs.filter((d) => d.id === uid && d.ref.path.startsWith('followRequests/'));
      if (mine.length) {
        const batch = db.batch();
        mine.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        outgoing += mine.length;
      }
      if (snap.size < BATCH_SIZE) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
    return outgoing;
  });

  // 5. Mutes + blocks owned by this user.
  await step('mutes', () => deleteDocDeep(db.collection('mutes').doc(uid)));
  await step('blocks', () => deleteDocDeep(db.collection('blocks').doc(uid)));

  // 6. The user's likes on OTHER people's posts (+ fix each post's counter).
  await step('likes', async () => {
    const myLikes = await db.collectionGroup('likes').where('uid', '==', uid).get();
    let likesDeleted = 0;
    for (let i = 0; i < myLikes.docs.length; i += BATCH_SIZE) {
      const slice = myLikes.docs.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      slice.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      likesDeleted += slice.length;
    }
    // Decrement each liked post's denormalized `likes` counter. `update` throws
    // NOT_FOUND for an already-deleted post, which we swallow.
    for (const d of myLikes.docs) {
      const postRef = d.ref.parent.parent;
      if (postRef) {
        await postRef.update({ likes: admin.firestore.FieldValue.increment(-1) }).catch(() => {});
      }
    }
    return likesDeleted;
  });
  // 6b. The user's comments on OTHER people's posts.
  await step('comments', () => deleteByQuery(db.collectionGroup('comments').where('userId', '==', uid)));

  // 7. Conversations the user participates in — redact their messages, then drop
  //    them from participants (or delete the conversation if they were alone).
  await step('conversationsDeleted', async () => {
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
    deleted.messagesRedacted = redactedMessages;
    return conversationsDeleted;
  });

  // 8. Push token (keyed by uid).
  await step('pushTokens', () => deleteDocDeep(db.doc(`pushTokens/${uid}`)));

  // 9. Other personal collections. attendance/waivers/appointments/taskCompletions
  //    are stamped with the auth uid as `firebaseUid` (the app's `memberId` is an
  //    INTERNAL id, not the auth uid), so query by firebaseUid.
  await step('attendance', () => deleteByQuery(db.collection('attendance').where('firebaseUid', '==', uid)));
  await step('waivers', () => deleteByQuery(db.collection('waivers').where('firebaseUid', '==', uid)));
  await step('appointments', () => deleteByQuery(db.collection('appointments').where('firebaseUid', '==', uid)));
  await step('taskCompletions', () => deleteByQuery(db.collection('taskCompletions').where('firebaseUid', '==', uid)));
  await step('supportMessages', () => deleteByQuery(db.collection('supportMessages').where('senderId', '==', uid)));
  // Nutrition is server-persisted health PII: /nutrition/{uid}/{weightEntries,
  // macroEntries,macroGoals,nutritionProfile} — uid in the PATH. recursiveDelete
  // covers all four subcollections even though the parent doc is never written.
  await step('nutrition', () => deleteDocDeep(db.collection('nutrition').doc(uid)));
  // Training tree — /training/{uid}/{logs,personalRecords}. recursiveDelete
  // covers both subcollections even though the parent doc is never written.
  // Owner-only rules make this unreadable AND undeletable once the Auth user is
  // gone, so it MUST be purged here (GDPR Art. 17).
  await step('training', () => deleteDocDeep(db.collection('training').doc(uid)));
  // Gamification state + its /grants audit ledger. recursiveDelete covers the
  // subcollection; the doc itself is client-undeletable by rule, so this
  // Admin-SDK path is the ONLY way it ever goes away (GDPR Art. 17).
  await step('gamification', () => deleteDocDeep(db.collection('gamification').doc(uid)));
  await step('aiRateLimits', () => deleteDocDeep(db.collection('aiRateLimits').doc(uid)));
  // Senpai usage logs: senpaiChat + senpaiSpeak write uid-keyed per-turn docs
  // (ts, model, mood, characters, …) to the top-level /senpaiUsage collection —
  // an interaction trail that must not outlive the account (GDPR erasure).
  await step('senpaiUsage', () => deleteByQuery(db.collection('senpaiUsage').where('uid', '==', uid)));

  // 10. Member doc(s). Prefer the id resolved from the profile; also sweep by
  //     firebaseUid in case the profile pointer was missing.
  await step('members', async () => {
    let membersDeleted = 0;
    if (memberId) membersDeleted += await deleteDocDeep(db.doc(`members/${memberId}`));
    membersDeleted += await deleteByQuery(db.collection('members').where('firebaseUid', '==', uid));
    return membersDeleted;
  });

  // 11. User profile last (so step 0's memberId lookup worked).
  await step('users', () => deleteDocDeep(db.doc(`users/${uid}`)));

  // 12. Cloud Storage — users/{uid}/** and postMedia/{uid}/**.
  await step('storageFiles', async () => {
    const bucket = admin.storage().bucket();
    let filesDeleted = 0;
    for (const prefix of [`users/${uid}/`, `postMedia/${uid}/`]) {
      const [files] = await bucket.getFiles({ prefix });
      for (const file of files) { await file.delete().catch(() => {}); filesDeleted++; }
    }
    return filesDeleted;
  });

  // 13. Finally, delete the Firebase Auth user itself. The Admin SDK has no
  //     recent-login requirement, so doing it server-side can't strand a
  //     still-loginable account whose data is already gone.
  await step('authUser', async () => {
    await admin.auth().deleteUser(uid);
    return 1;
  });

  return { uid, deleted, errors };
}
