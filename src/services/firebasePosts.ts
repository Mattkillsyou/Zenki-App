import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocFromServer, getDocs,
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
  if (!FIREBASE_CONFIGURED || !db) throw new Error('firebase-not-configured');
  const uid = getCurrentUid();
  if (!uid) throw new Error('not-signed-in');

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
  // Server-confirm — see createTextPost for the why.
  try {
    const verify = await getDocFromServer(docRef);
    if (!verify.exists()) {
      throw new Error('write-not-on-server');
    }
  } catch (verifyErr: any) {
    throw new Error(`write-not-on-server: ${verifyErr?.code || verifyErr?.message || 'unknown'}`);
  }
  return { id: docRef.id, ...postData };
}

/** Text-only (tweet-style) post. No media upload. */
export async function createTextPost(caption: string): Promise<Post | null> {
  if (!FIREBASE_CONFIGURED || !db) throw new Error('firebase-not-configured');
  const uid = getCurrentUid();
  if (!uid) throw new Error('not-signed-in');
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
  // Server-confirm: bypass cache and read the doc back from the server. If
  // the doc isn't there, the addDoc resolved against the offline cache and
  // the server never saw the write — we want to surface that as a real error
  // rather than report success.
  try {
    const verify = await getDocFromServer(docRef);
    if (!verify.exists()) {
      throw new Error('write-not-on-server');
    }
  } catch (verifyErr: any) {
    throw new Error(`write-not-on-server: ${verifyErr?.code || verifyErr?.message || 'unknown'}`);
  }
  return { id: docRef.id, ...postData };
}

export async function getFeed(maxPosts = 50): Promise<Post[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  // Capture `db` as a non-null local so TypeScript preserves narrowing
  // inside Promise.all closures below.
  const firestore = db;
  const uid = getCurrentUid();
  if (!uid) return [];

  // Read the user's followed-set. If the rule rejects (e.g. no rule for
  // /following/{uid}/follows yet), treat it as an empty follow list so the
  // fallback "all recent posts" path runs — letting the user actually see
  // the feed instead of swallowing a permission-denied error and rendering
  // empty.
  let followedIds: string[] = [];
  try {
    const followingSnap = await getDocs(collection(db, 'following', uid, 'follows'));
    followedIds = followingSnap.docs.map((d) => d.id);
  } catch (err) {
    console.warn('[getFeed] following read failed; falling back to all recent posts:', err);
  }

  // Per-post liked check that never throws — defaults to false if the rule
  // for /posts/{postId}/likes/{uid} hasn't been added or the read fails for
  // any other reason. Without this, ONE missing-rule error short-circuited
  // the whole feed render.
  const safeIsLiked = async (postId: string): Promise<boolean> => {
    try { return await isLiked(postId); } catch { return false; }
  };

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
    return Promise.all(snap.docs.map(async (d) => {
      const liked = await safeIsLiked(d.id);
      return { id: d.id, ...d.data(), liked } as Post;
    }));
  }

  followedIds.push(uid);

  const batches: string[][] = [];
  for (let i = 0; i < followedIds.length; i += 30) {
    batches.push(followedIds.slice(i, i + 30));
  }

  // Run batch queries AND per-post `isLiked` lookups in parallel. The
  // previous version awaited each `safeIsLiked` sequentially inside the
  // loop — a 50-post feed meant 50 round-trips back-to-back. Under weak
  // networks that stalled the Community tab long enough to look like a
  // crash on iPad (BUG-007).
  const batchSnaps = await Promise.all(batches.map((batch) => {
    const q = query(
      collection(firestore, 'posts'),
      where('userId', 'in', batch),
      orderBy('createdAt', 'desc'),
      limit(maxPosts),
    );
    return getDocs(q);
  }));

  const allDocs = batchSnaps.flatMap((snap) => snap.docs);
  const allPosts = await Promise.all(allDocs.map(async (d) => {
    const liked = await safeIsLiked(d.id);
    return { id: d.id, ...d.data(), liked } as Post;
  }));

  // Filter out malformed posts so a single bad doc can't crash FlatList.
  const valid = allPosts.filter((p) => typeof p.createdAt === 'string' && typeof p.displayName === 'string');
  return valid.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, maxPosts);
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

// ─────────────────────────────────────────────────
// Comments — `/posts/{postId}/comments/{commentId}`
// ─────────────────────────────────────────────────

export interface Comment {
  id: string;
  userId: string;
  displayName: string;
  avatar: string | null;
  text: string;
  createdAt: string;
}

export async function listComments(postId: string, max = 100): Promise<Comment[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  try {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Comment, 'id'>) }));
  } catch (err) {
    console.warn('[listComments] failed:', err);
    return [];
  }
}

export async function addComment(postId: string, text: string): Promise<Comment | null> {
  if (!FIREBASE_CONFIGURED || !db) throw new Error('firebase-not-configured');
  const uid = getCurrentUid();
  if (!uid) throw new Error('not-signed-in');
  const trimmed = text.trim();
  if (!trimmed) return null;

  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  const data = {
    userId: uid,
    displayName: userData?.displayName || 'Member',
    avatar: userData?.avatar || null,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };

  const ref = await addDoc(collection(db, 'posts', postId, 'comments'), data);
  return { id: ref.id, ...data };
}
