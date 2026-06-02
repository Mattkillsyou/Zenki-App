import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  collection, addDoc, doc, getDoc, getDocFromServer, getDocs,
  query, where, orderBy, limit, startAfter, runTransaction,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { getCurrentUid } from './firebaseAuth';
import { uploadMedia } from './firebaseStorage';
import { assertCleanText } from './contentFilter';
import { deletePostCascadeViaFunction } from './firebaseModeration';

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

  // Proactive objectionable-content gate (Apple 1.2). Throws
  // Error('content-blocked: <reason>') before any upload/write happens.
  assertCleanText(caption);

  const mediaUrl = await uploadMedia(mediaUri, mediaType);
  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  const postData = {
    userId: uid,
    displayName: userData?.displayName || 'Member',
    avatar: userData?.avatar || null,
    // Denormalized author-privacy flag so the feed list-query can be satisfied
    // by the public branch of the posts rule (see SOCIAL_CONTRACT §10).
    authorIsPrivate: !!userData?.isPrivate,
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

  // Proactive objectionable-content gate (Apple 1.2). Throws
  // Error('content-blocked: <reason>') before the write.
  assertCleanText(caption);

  const userDoc = await getDoc(doc(db, 'users', uid));
  const userData = userDoc.data();

  const postData = {
    userId: uid,
    displayName: userData?.displayName || 'Member',
    avatar: userData?.avatar || null,
    // Denormalized author-privacy flag — see createPost / SOCIAL_CONTRACT §10.
    authorIsPrivate: !!userData?.isPrivate,
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

export interface FeedPage {
  posts: Post[];
  /** `createdAt` (ISO) of the last returned post, or null. Pass back as
   *  `opts.cursor` to fetch the next page via startAfter. */
  cursor: string | null;
  /** True when this page came back full (returned count === pageSize), i.e.
   *  there may be more to load. */
  hasMore: boolean;
}

export async function getFeed(
  opts?: { cursor?: string | null; pageSize?: number },
): Promise<FeedPage> {
  const pageSize = opts?.pageSize ?? 15;
  const cursor = opts?.cursor ?? null;
  const empty: FeedPage = { posts: [], cursor: null, hasMore: false };
  if (!FIREBASE_CONFIGURED || !db) return empty;
  // Capture `db` as a non-null local so TypeScript preserves narrowing
  // inside Promise.all closures below.
  const firestore = db;
  const uid = getCurrentUid();
  if (!uid) return empty;

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
  // the whole feed render. Resolved in parallel for the returned page only.
  const safeIsLiked = async (postId: string): Promise<boolean> => {
    try { return await isLiked(postId); } catch { return false; }
  };

  // Resolve `liked` for an already-filtered, already-paged set of docs in
  // parallel (never N sequential gets) and drop malformed docs so a single
  // bad doc can't crash FlatList.
  const hydrate = async (
    docs: QueryDocumentSnapshot[],
  ): Promise<Post[]> => {
    const posts = await Promise.all(docs.map(async (d) => {
      const liked = await safeIsLiked(d.id);
      return { id: d.id, ...d.data(), liked } as Post;
    }));
    return posts.filter(
      (p) => typeof p.createdAt === 'string' && typeof p.displayName === 'string',
    );
  };

  const makePage = (posts: Post[]): FeedPage => ({
    posts,
    cursor: posts.length > 0 ? posts[posts.length - 1].createdAt : null,
    // hasMore is keyed off the raw page fill (returned count === pageSize),
    // not the post-filter count, so a page that's entirely malformed/private
    // still advances rather than dead-ending pagination.
    hasMore: posts.length === pageSize,
  });

  // If the user follows nobody, querying only their own posts gives an empty
  // feed for new accounts — bad first impression. Fall back to "all recent
  // posts" so the feed is populated and the user has something to scroll
  // through right away. Once they follow someone, the followed-only query
  // takes over. The public-author filter (authorIsPrivate == false) is
  // required so the feed list-query is satisfied by the rule's public branch
  // (SOCIAL_CONTRACT §10).
  if (followedIds.length === 0) {
    const constraints = [
      where('authorIsPrivate', '==', false),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ];
    const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
    const posts = await hydrate(snap.docs);
    return { ...makePage(posts), hasMore: snap.docs.length === pageSize };
  }

  followedIds.push(uid);

  const batches: string[][] = [];
  for (let i = 0; i < followedIds.length; i += 30) {
    batches.push(followedIds.slice(i, i + 30));
  }

  // Run batch queries in parallel. Each batch is a separate page-sized
  // window starting after the cursor; the union is then sorted desc and the
  // top `pageSize` taken, which is the correct next global page because
  // startAfter guarantees no batch returns anything newer-or-equal to the
  // cursor. The public-author filter keeps every branch on the rule's public
  // path (SOCIAL_CONTRACT §10).
  const batchSnaps = await Promise.all(batches.map((batch) => {
    const constraints = [
      where('userId', 'in', batch),
      where('authorIsPrivate', '==', false),
      orderBy('createdAt', 'desc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(pageSize),
    ];
    return getDocs(query(collection(firestore, 'posts'), ...constraints));
  }));

  // Merge, sort desc, take the page window BEFORE hydrating like-state so we
  // only resolve `liked` for the posts we actually return.
  const merged = batchSnaps
    .flatMap((snap) => snap.docs)
    .filter((d) => typeof (d.data() as any).createdAt === 'string')
    .sort((a, b) => (b.data() as any).createdAt.localeCompare((a.data() as any).createdAt))
    .slice(0, pageSize);

  const posts = await hydrate(merged);
  return { ...makePage(posts), hasMore: merged.length === pageSize };
}

export async function getUserPosts(userId: string, max = 30): Promise<Post[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  const q = query(
    collection(db, 'posts'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
}

export async function likePost(postId: string) {
  if (!db) return;
  const firestore = db;
  const uid = getCurrentUid();
  if (!uid) return;
  // Atomic + idempotent: only count the like if the like-doc doesn't already
  // exist, so a double-tap / retry can't double-count. We write an explicit
  // `likes = current + 1` (not increment()) because the rule constrains a
  // non-owner update to exactly oldLikes ± 1. `uid` is stored on the like-doc
  // so deleteAccount can find it via collectionGroup.
  await runTransaction(firestore, async (tx) => {
    const likeRef = doc(firestore, 'posts', postId, 'likes', uid);
    const postRef = doc(firestore, 'posts', postId);
    const likeSnap = await tx.get(likeRef);
    if (likeSnap.exists()) return; // already liked — no-op, no double count
    const postSnap = await tx.get(postRef);
    if (!postSnap.exists()) return;
    const current = (postSnap.data()?.likes as number) || 0;
    tx.set(likeRef, { at: new Date().toISOString(), uid });
    tx.update(postRef, { likes: current + 1 });
  });
}

export async function unlikePost(postId: string) {
  if (!db) return;
  const firestore = db;
  const uid = getCurrentUid();
  if (!uid) return;
  // Atomic + idempotent: only decrement when the like-doc actually exists, and
  // clamp at 0 so the counter can never go negative. Explicit `current - 1`
  // (not increment()) for the same rule reason as likePost.
  await runTransaction(firestore, async (tx) => {
    const likeRef = doc(firestore, 'posts', postId, 'likes', uid);
    const postRef = doc(firestore, 'posts', postId);
    const likeSnap = await tx.get(likeRef);
    if (!likeSnap.exists()) return; // not liked — no-op
    const postSnap = await tx.get(postRef);
    const current = postSnap.exists() ? ((postSnap.data()?.likes as number) || 0) : 0;
    tx.delete(likeRef);
    if (postSnap.exists()) {
      tx.update(postRef, { likes: Math.max(0, current - 1) });
    }
  });
}

async function isLiked(postId: string): Promise<boolean> {
  if (!db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  const snap = await getDoc(doc(db, 'posts', postId, 'likes', uid));
  return snap.exists();
}

/**
 * Delete a post AND its likes/comments subcollections + Storage media. A
 * shallow deleteDoc orphans all of those (Firestore doesn't cascade, and a
 * client can't delete other users' like/comment docs), so this goes through
 * the deletePostCascade Cloud Function and surfaces its {ok,error}.
 */
export async function deletePost(postId: string): Promise<{ ok: boolean; error?: string }> {
  if (!FIREBASE_CONFIGURED || !db) return { ok: false, error: 'firebase-not-configured' };
  return deletePostCascadeViaFunction(postId);
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

  // Proactive objectionable-content gate (Apple 1.2). Throws
  // Error('content-blocked: <reason>') before the write.
  assertCleanText(trimmed);

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
