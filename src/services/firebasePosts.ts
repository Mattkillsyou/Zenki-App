import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  collection, addDoc, doc, getDoc, getDocFromServer, getDocs,
  query, where, orderBy, limit, startAfter, runTransaction, documentId,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { getCurrentUid, getCurrentIdToken } from './firebaseAuth';
import { uploadMedia } from './firebaseStorage';
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

  // A token-attach race right after sign-in can make the first addDoc throw
  // permission-denied (the fresh ID token hasn't attached to the Firestore
  // channel yet). Re-prime the token and retry once before failing; the happy
  // path is untouched and a genuine rule rejection still throws.
  const docRef = await addDoc(collection(db!, 'posts'), postData).catch(async (e: any) => {
    if (e?.code === 'permission-denied' || /permission-denied/i.test(String(e?.message || ''))) {
      await getCurrentIdToken(true).catch(() => null);
      return addDoc(collection(db!, 'posts'), postData);
    }
    throw e;
  });
  // Best-effort server-confirm (non-fatal). experimentalForceLongPolling
  // (config/firebase.ts) already forces addDoc to round-trip to the server, so a
  // failed/slow confirming READ no longer means the write was lost — it usually
  // means the verify read itself timed out on a flaky link. Throwing here turned a
  // post that actually SAVED into a false "couldn't post". Warn, don't fail.
  try {
    const verify = await getDocFromServer(docRef);
    if (!verify.exists()) {
      console.warn('[createPost] server verify did not see the doc yet (eventual consistency):', docRef.id);
    }
  } catch (verifyErr: any) {
    console.warn('[createPost] server verify read failed (non-fatal):', verifyErr?.code || verifyErr?.message || 'unknown');
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
    // Denormalized author-privacy flag — see createPost / SOCIAL_CONTRACT §10.
    authorIsPrivate: !!userData?.isPrivate,
    mediaUrl: null,
    mediaType: null,
    caption: caption.trim(),
    likes: 0,
    createdAt: new Date().toISOString(),
  };

  // A token-attach race right after sign-in can make the first addDoc throw
  // permission-denied (the fresh ID token hasn't attached to the Firestore
  // channel yet). Re-prime the token and retry once before failing; the happy
  // path is untouched and a genuine rule rejection still throws.
  const docRef = await addDoc(collection(db!, 'posts'), postData).catch(async (e: any) => {
    if (e?.code === 'permission-denied' || /permission-denied/i.test(String(e?.message || ''))) {
      await getCurrentIdToken(true).catch(() => null);
      return addDoc(collection(db!, 'posts'), postData);
    }
    throw e;
  });
  // Best-effort server-confirm (non-fatal). experimentalForceLongPolling
  // (config/firebase.ts) already forces addDoc to round-trip to the server, so a
  // failed/slow confirming READ no longer implies the write was lost — it usually
  // means the verify read timed out. Throwing turned a SAVED post into a false
  // "couldn't post". Warn, don't fail the post.
  try {
    const verify = await getDocFromServer(docRef);
    if (!verify.exists()) {
      console.warn('[createTextPost] server verify did not see the doc yet (eventual consistency):', docRef.id);
    }
  } catch (verifyErr: any) {
    console.warn('[createTextPost] server verify read failed (non-fatal):', verifyErr?.code || verifyErr?.message || 'unknown');
  }
  return { id: docRef.id, ...postData };
}

export interface FeedPage {
  posts: Post[];
  /** Opaque pagination token ("<createdAt>|<docId>") for the last returned post,
   *  or null. Pass back as `opts.cursor` to fetch the next page. */
  cursor: string | null;
  /** True when this page came back full (returned count === pageSize), i.e.
   *  there may be more to load. */
  hasMore: boolean;
}

/**
 * Coerce a Firestore `createdAt` value to an ISO string. Posts are written with
 * `new Date().toISOString()`, but a legacy/seed doc could carry a Firestore
 * Timestamp (or epoch-millis number). Returns null ONLY when the value is truly
 * unusable — callers drop those (and log) rather than silently vanish them.
 */
function coerceCreatedAt(v: any): string | null {
  if (typeof v === 'string') return v;
  // Firestore Timestamp (client SDK) — has toDate()/seconds.
  if (v && typeof v.toDate === 'function') {
    try { return v.toDate().toISOString(); } catch { /* fall through */ }
  }
  if (v && typeof v.seconds === 'number') {
    try { return new Date(v.seconds * 1000).toISOString(); } catch { /* fall through */ }
  }
  if (typeof v === 'number' && isFinite(v)) {
    try { return new Date(v).toISOString(); } catch { /* fall through */ }
  }
  return null;
}

/** Coerce a `displayName` to a non-empty string, defaulting to 'Member'. */
function coerceDisplayName(v: any): string {
  return typeof v === 'string' && v.trim() ? v : 'Member';
}

// The feed paginates by (createdAt DESC, __name__ DESC). The cursor is an opaque
// "<createdAtISO>|<docId>" token. Without the docId tiebreaker, a value-only
// startAfter(createdAt) EXCLUDES every doc sharing that exact createdAt
// millisecond — so a tie group straddling a page boundary is silently skipped.
// ISO timestamps never contain '|', so it's a safe separator.
function encodeCursor(p: Post): string { return `${p.createdAt}|${p.id}`; }
function decodeCursor(c: string | null | undefined): { createdAt: string; id: string } | null {
  if (!c) return null;
  const i = c.indexOf('|');
  // Tolerate a legacy value-only cursor (no separator) by pairing it with the
  // lowest possible id so the page boundary is still well-defined.
  return i < 0 ? { createdAt: c, id: '' } : { createdAt: c.slice(0, i), id: c.slice(i + 1) };
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
  // parallel (never N sequential gets). We COERCE legacy shapes (Timestamp/
  // number createdAt, missing displayName) into the canonical string form
  // instead of silently dropping them, so pre-`authorIsPrivate`/seed posts
  // still render. A doc is dropped ONLY when `createdAt` is genuinely
  // uncoercible (can't be sorted/paginated) — and that drop is logged so a
  // vanishing post is observable instead of a mystery.
  const hydrate = async (
    docs: QueryDocumentSnapshot[],
  ): Promise<Post[]> => {
    const hydrated = await Promise.all(docs.map(async (d) => {
      const liked = await safeIsLiked(d.id);
      const data = d.data() as any;
      const createdAt = coerceCreatedAt(data.createdAt);
      if (createdAt === null) {
        console.warn(`[getFeed] dropping post ${d.id}: uncoercible createdAt`, data?.createdAt);
        return null;
      }
      return {
        ...data,
        id: d.id,
        createdAt,
        displayName: coerceDisplayName(data.displayName),
        liked,
      } as Post;
    }));
    return hydrated.filter((p): p is Post => p !== null);
  };

  const makePage = (posts: Post[]): FeedPage => ({
    posts,
    cursor: posts.length > 0 ? encodeCursor(posts[posts.length - 1]) : null,
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
    const cur = decodeCursor(cursor);
    const constraints = [
      where('authorIsPrivate', '==', false),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(cur ? [startAfter(cur.createdAt, cur.id)] : []),
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

  // Run batch queries in parallel. Each batch is a separate page-sized window
  // starting after the EXACT (createdAt, docId) cursor; the union is then sorted
  // by the same total order and the top `pageSize` taken — the correct next
  // global page, because startAfter on the composite cursor guarantees no batch
  // returns anything newer-or-equal to the cursor (and never skips a createdAt
  // tie). Items past `pageSize` in this page's union are OLDER than the new
  // cursor, so the next page re-fetches them — nothing is lost. The public-author
  // filter keeps every branch on the rule's public path (SOCIAL_CONTRACT §10).
  const cur = decodeCursor(cursor);
  const batchSnaps = await Promise.all(batches.map((batch) => {
    const constraints = [
      where('userId', 'in', batch),
      where('authorIsPrivate', '==', false),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      ...(cur ? [startAfter(cur.createdAt, cur.id)] : []),
      limit(pageSize),
    ];
    return getDocs(query(collection(firestore, 'posts'), ...constraints));
  }));

  // Merge, sort desc, take the page window BEFORE hydrating like-state so we
  // only resolve `liked` for the posts we actually return. Sort on the COERCED
  // ISO timestamp so a legacy Timestamp-typed createdAt is included here (hydrate
  // coerces again — the two stay consistent) rather than silently excluded.
  const merged = batchSnaps
    .flatMap((snap) => snap.docs)
    .map((d) => ({ d, createdAt: coerceCreatedAt((d.data() as any).createdAt) }))
    .filter((x): x is { d: QueryDocumentSnapshot; createdAt: string } => x.createdAt !== null)
    .sort((a, b) => {
      const c = b.createdAt.localeCompare(a.createdAt);
      return c !== 0 ? c : b.d.id.localeCompare(a.d.id); // tiebreak by docId DESC — matches the query order
    })
    .slice(0, pageSize)
    .map((x) => x.d);

  const posts = await hydrate(merged);
  return { ...makePage(posts), hasMore: merged.length === pageSize };
}

export async function getUserPosts(userId: string, max = 30): Promise<Post[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  try {
    const q = query(
      collection(db, 'posts'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(max),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Post));
  } catch (err) {
    // A private author's posts are rule-denied to non-approved-followers (the
    // single-author query can't satisfy the per-doc authorIsPrivate branch), so
    // getDocs throws permission-denied. Treat it as "no visible posts" rather
    // than letting it reject the caller's profile load.
    console.warn('[getUserPosts] read failed (likely private/not-following):', err);
    return [];
  }
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
    // Only touch the post counter when it actually decreases. If the counter has
    // drifted to 0, writing `likes: 0` is a no-op that the non-owner posts rule
    // rejects (it requires new likes === old±1), which would fail the whole tx and
    // leave the like-doc undeleted — stranding the user as "liked".
    if (postSnap.exists() && current > 0) {
      tx.update(postRef, { likes: current - 1 });
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
