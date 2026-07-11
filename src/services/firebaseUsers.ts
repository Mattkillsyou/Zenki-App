import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { getCurrentUid } from './firebaseAuth';

export interface MemberProfile {
  id: string;
  displayName: string;
  avatar: string | null;
  bio?: string;
  isPrivate?: boolean;
}

/**
 * Fetch up to N members from Firestore. Excludes the current user.
 *
 * No server-side orderBy: `orderBy('displayName')` silently EXCLUDES /users
 * docs that lack the field — the `|| 'Member'` default below expects docs the
 * ordered query could never return. The fetch is bounded and small, so sort
 * client-side instead. Failures PROPAGATE (no swallow-to-[]) so callers can
 * distinguish a real error from an empty community (audit P3).
 */
export async function getAllMembers(max = 100): Promise<MemberProfile[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  const me = getCurrentUid();
  const q = query(collection(db, 'users'), limit(max));
  const snap = await getDocs(q);
  const list: MemberProfile[] = [];
  snap.forEach((d) => {
    if (d.id === me) return;
    const data = d.data() as any;
    list.push({
      id: d.id,
      displayName: data.displayName || 'Member',
      avatar: data.avatar || null,
      bio: data.bio,
      isPrivate: !!data.isPrivate,
    });
  });
  return list.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Case-insensitive name search. Runs client-side over a bounded fetch. */
export async function searchMembers(queryText: string, max = 100): Promise<MemberProfile[]> {
  const all = await getAllMembers(max);
  const q = queryText.trim().toLowerCase();
  if (!q) return all;
  return all.filter((m) => m.displayName.toLowerCase().includes(q));
}
