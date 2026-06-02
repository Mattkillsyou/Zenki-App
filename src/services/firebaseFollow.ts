import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  doc, setDoc, deleteDoc, getDoc, getDocs, collection, updateDoc,
  writeBatch, getCountFromServer, query, where,
} from 'firebase/firestore';
import { getCurrentUid } from './firebaseAuth';

export interface UserProfile {
  uid: string;
  displayName: string;
  avatar: string | null;
  bio: string;
  isPrivate: boolean;
  memberId: string;
  createdAt: string;
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as UserProfile;
}

export async function updateProfile(updates: Partial<Pick<UserProfile, 'displayName' | 'bio' | 'isPrivate' | 'avatar'>>) {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;

  // When the privacy flag actually changes, keep the denormalized feed-privacy
  // flag (`authorIsPrivate`) on this user's existing posts in sync so the toggle
  // takes effect immediately (contract §10 / P0-3). Compare against the current
  // value first so we don't fan out a batch on no-op updates.
  let privacyChanged = false;
  if (typeof updates.isPrivate === 'boolean') {
    const meSnap = await getDoc(doc(db, 'users', uid));
    const current = meSnap.exists() ? (meSnap.data().isPrivate as boolean | undefined) : undefined;
    privacyChanged = current !== updates.isPrivate;
  }

  await updateDoc(doc(db, 'users', uid), updates);

  if (privacyChanged) {
    const nextPrivate = updates.isPrivate as boolean;
    const postsSnap = await getDocs(query(collection(db, 'posts'), where('userId', '==', uid)));
    const CHUNK = 400; // Firestore batch op limit is 500; chunk defensively.
    const allDocs = postsSnap.docs;
    for (let i = 0; i < allDocs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const d of allDocs.slice(i, i + CHUNK)) {
        batch.update(d.ref, { authorIsPrivate: nextPrivate });
      }
      await batch.commit();
    }
  }
}

export async function followUser(targetId: string): Promise<'followed' | 'requested' | ''> {
  if (!db) return '';
  const uid = getCurrentUid();
  if (!uid || uid === targetId) return '';

  const targetProfile = await getUserProfile(targetId);
  const at = new Date().toISOString();
  if (targetProfile?.isPrivate) {
    await setDoc(doc(db, 'followRequests', targetId, 'requests', uid), { at });
    return 'requested';
  }

  // Atomic: both edges land together (or neither). The follower edge drives the
  // server-side `followerCounters` CF — we never write the count fields here.
  const batch = writeBatch(db);
  batch.set(doc(db, 'following', uid, 'follows', targetId), { at });
  batch.set(doc(db, 'followers', targetId, 'followers', uid), { at });
  await batch.commit();
  return 'followed';
}

export async function unfollowUser(targetId: string): Promise<void> {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'following', uid, 'follows', targetId));
  batch.delete(doc(db, 'followers', targetId, 'followers', uid));
  await batch.commit();
}

export async function acceptFollowRequest(requesterId: string): Promise<void> {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  // Atomic: clear the request and write both edges in one batch. The follower
  // edge drives the server-side count CF — no count writes here.
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.delete(doc(db, 'followRequests', uid, 'requests', requesterId));
  batch.set(doc(db, 'following', requesterId, 'follows', uid), { at });
  batch.set(doc(db, 'followers', uid, 'followers', requesterId), { at });
  await batch.commit();
}

export async function listFollowRequests(): Promise<{ requesterId: string; at: string }[]> {
  if (!db) return [];
  const uid = getCurrentUid();
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'followRequests', uid, 'requests'));
  return snap.docs.map((d) => ({ requesterId: d.id, at: (d.data().at as string) ?? '' }));
}

export async function declineFollowRequest(requesterId: string): Promise<void> {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  await deleteDoc(doc(db, 'followRequests', uid, 'requests', requesterId));
}

export async function isFollowing(targetId: string): Promise<boolean> {
  if (!db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'following', uid, 'follows', targetId));
  return snap.exists();
}

export async function getFollowerCount(userId: string): Promise<number> {
  if (!db) return 0;
  // Prefer the denormalized field (maintained server-side by the followerCounters
  // CF). Fall back to an aggregate count (never read the whole subcollection).
  const userSnap = await getDoc(doc(db, 'users', userId));
  const denorm = userSnap.exists() ? userSnap.data().followerCount : undefined;
  if (typeof denorm === 'number' && Number.isFinite(denorm)) return denorm;
  const agg = await getCountFromServer(collection(db, 'followers', userId, 'followers'));
  return agg.data().count;
}

export async function getFollowingCount(userId: string): Promise<number> {
  if (!db) return 0;
  const userSnap = await getDoc(doc(db, 'users', userId));
  const denorm = userSnap.exists() ? userSnap.data().followingCount : undefined;
  if (typeof denorm === 'number' && Number.isFinite(denorm)) return denorm;
  const agg = await getCountFromServer(collection(db, 'following', userId, 'follows'));
  return agg.data().count;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}
