import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { doc, setDoc, deleteDoc, getDoc, getDocs, collection, updateDoc, writeBatch } from 'firebase/firestore';
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
  await updateDoc(doc(db, 'users', uid), updates);
}

export async function followUser(targetId: string): Promise<string> {
  if (!db) return '';
  const uid = getCurrentUid();
  if (!uid || uid === targetId) return '';

  const targetProfile = await getUserProfile(targetId);
  if (targetProfile?.isPrivate) {
    await setDoc(doc(db, 'followRequests', targetId, 'requests', uid), { at: new Date().toISOString() });
    return 'requested';
  }

  const batch = writeBatch(db);
  const stamp = new Date().toISOString();
  batch.set(doc(db, 'following', uid, 'follows', targetId), { at: stamp });
  batch.set(doc(db, 'followers', targetId, 'followers', uid), { at: stamp });
  await batch.commit();
  return 'followed';
}

export async function unfollowUser(targetId: string) {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, 'following', uid, 'follows', targetId));
  batch.delete(doc(db, 'followers', targetId, 'followers', uid));
  await batch.commit();
}

export async function acceptFollowRequest(requesterId: string) {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  await deleteDoc(doc(db, 'followRequests', uid, 'requests', requesterId));
  await setDoc(doc(db, 'following', requesterId, 'follows', uid), { at: new Date().toISOString() });
  await setDoc(doc(db, 'followers', uid, 'followers', requesterId), { at: new Date().toISOString() });
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
  const snap = await getDocs(collection(db, 'followers', userId, 'followers'));
  return snap.size;
}

export async function getFollowingCount(userId: string): Promise<number> {
  if (!db) return 0;
  const snap = await getDocs(collection(db, 'following', userId, 'follows'));
  return snap.size;
}

export async function getAllUsers(): Promise<UserProfile[]> {
  if (!db) return [];
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile));
}
