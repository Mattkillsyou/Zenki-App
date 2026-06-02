/**
 * Cloud Function triggers — maintain denormalized follower/following counts.
 *
 * The client can't keep these counts on the /users doc itself: the /users rule
 * is owner-only-write, so a follower can't bump the followee's followerCount.
 * And letting anyone ±1 someone else's count (the /posts.likes pattern) invites
 * the same vandalism we just closed there. So the counts are derived
 * server-side from the single source of truth — the follower edge
 * /followers/{followedUid}/followers/{followerUid} — which is written on follow
 * and on accept-request, and deleted on unfollow.
 *
 *   create edge → followedUid.followerCount +1,  followerUid.followingCount +1
 *   delete edge → followedUid.followerCount -1,  followerUid.followingCount -1
 *
 * `update()` (not set-merge) is used so a trigger firing during account
 * deletion can't resurrect a just-deleted user doc — it throws NOT_FOUND and we
 * swallow it. Reads prefer this denormalized count and fall back to a
 * getCountFromServer() on the subcollection (see firebaseFollow.ts) when the
 * field hasn't been initialized yet.
 */

import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

async function bump(uid: string, field: 'followerCount' | 'followingCount', delta: number): Promise<void> {
  try {
    await admin.firestore().doc(`users/${uid}`).update({
      [field]: admin.firestore.FieldValue.increment(delta),
    });
  } catch (e: any) {
    // NOT_FOUND (code 5) is expected when the user doc was deleted (e.g. account
    // deletion racing the edge cleanup) — never recreate it.
    if (e?.code !== 5) logger.warn(`bump ${field} ${delta} for ${uid} failed`, e);
  }
}

export const onFollowerEdgeCreated = onDocumentCreated(
  'followers/{followedUid}/followers/{followerUid}',
  async (event) => {
    const { followedUid, followerUid } = event.params as { followedUid: string; followerUid: string };
    await Promise.all([
      bump(followedUid, 'followerCount', 1),
      bump(followerUid, 'followingCount', 1),
    ]);
  },
);

export const onFollowerEdgeDeleted = onDocumentDeleted(
  'followers/{followedUid}/followers/{followerUid}',
  async (event) => {
    const { followedUid, followerUid } = event.params as { followedUid: string; followerUid: string };
    await Promise.all([
      bump(followedUid, 'followerCount', -1),
      bump(followerUid, 'followingCount', -1),
    ]);
  },
);
