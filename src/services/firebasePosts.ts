import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs,
  query, where, orderBy, limit, updateDoc, increment,
  setDoc,
} from 'firebase/firestore';
import { getCurrentUid } from './firebaseAuth';
import { uploadMedia } from './firebaseStorage';

export interface Post {
  id: string;
  userId: string;
  displayName: string;
  avatar: string | null;
  /** Optional for text-only (tweet-style) posts. */
  mediaUrl?: string | null;
  mediaType?: 'photo' | 'video' | null;
  caption: string;
  likes: number;
  liked?: boolean;
  createdAt: string;
}

/** Photo/video post — uploads media then creates doc. */
export async function createPost(mediaUri: string, mediaType: 'photo' | 'video', caption: string): Promise<Post | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  const uid = getCurrentUid();
  if (!uid) return null;

  const mediaUrl = await uploadMedia(mediaUri, mediaType);
  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  const postData = {
    userId: uid,
    displayName: userData?.displayName || 'Member',
    avatar: userData?.avatar || null,
    mediaUrl,
    mediaType,
    caption,
    likes: 0,
    createdAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, 'posts'), postData);
  return { id: docRef.id, ...postData };
}

/** Text-only (tweet-style) post. No media upload. */
export async function createTextPost(caption: string): Promise<Post | null> {
  if (!FIREBASE_CONFIGURED || !db) return null;
  const uid = getCurrentUid();
  if (!uid) return null;
  if (!caption.trim()) return null;

  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  const postData = {
    userId: uid,
    displayName: userData?.displayName || 'Member',
    avatar: userData?.avatar || null,
    mediaUrl: null,
    mediaType: null,
    caption: caption.trim(),
    likes: 0,
    createdAt: new Date().toISOString(),
  };

  const docRef = await addDoc(collection(db, 'posts'), postData);
  return { id: docRef.id, ...postData };
}

export async function getFeed(maxPosts = 50): Promise<Post[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  const uid = getCurrentUid();
  if (!uid) return [];

  const followingSnap = await getDocs(collection(db, 'following', uid, 'follows'));
  const followedIds = followingSnap.docs.map((d) => d.id);

  // If the user follows nobody, querying only their own posts gives an empty
  // feed for new accounts — bad first impression. Fall back to "all recent
  // posts" so the feed is populated and the user has something to scroll
  // through right away. Once they follow someone, the followed-only query
  // takes over.
  if (followedIds.length === 0) {
    const q = query(
      collection(db, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(maxPosts),
    );
    const snap = await getDocs(q);
    const out: Post[] = [];
    for (const d of snap.docs) {
      const liked = await isLiked(d.id);
      out.push({ id: d.id, ...d.data(), liked } as Post);
    }
    return out;
  }

  followedIds.push(uid);

  const batches: string[][] = [];
  for (let i = 0; i < followedIds.length; i += 30) {
    batches.push(followedIds.slice(i, i + 30));
  }

  const allPosts: Post[] = [];
  for (const batch of batches) {
    const q = query(
      collection(db, 'posts'),
      where('userId', 'in', batch),
      orderBy('createdAt', 'desc'),
      limit(maxPosts),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const liked = await isLiked(d.id);
      allPosts.push({ id: d.id, ...d.data(), liked } as Post);
    }
  }

  return allPosts.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, maxPosts);
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  const q = query(
    collection(db, 'posts'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
}

export async function likePost(postId: string) {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  await setDoc(doc(db, 'posts', postId, 'likes', uid), { at: new Date().toISOString() });
  await updateDoc(doc(db, 'posts', postId), { likes: increment(1) });
}

export async function unlikePost(postId: string) {
  if (!db) return;
  const uid = getCurrentUid();
  if (!uid) return;
  await deleteDoc(doc(db, 'posts', postId, 'likes', uid));
  await updateDoc(doc(db, 'posts', postId), { likes: increment(-1) });
}

async function isLiked(postId: string): Promise<boolean> {
  if (!db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
  return snap.exists();
}

export async function deletePost(postId: string) {
  if (!db) return;
  await deleteDoc(doc(db, 'posts', postId));
}
