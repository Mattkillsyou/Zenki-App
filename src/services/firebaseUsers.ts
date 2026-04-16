import { collection, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { getCurrentUid } from './firebaseAuth';

export interface MemberProfile {
  id: string;
  displayName: string;
  avatar: string | null;
  bio?: string;
  isPrivate?: boolean;
}

/** Fetch up to N members from Firestore. Excludes the current user. */
export async function getAllMembers(max = 100): Promise<MemberProfile[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  const me = getCurrentUid();
  try {
    const q = query(collection(db, 'users'), orderBy('displayName'), limit(max));
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
    return list;
  } catch {
    return [];
  }
}

/** Case-insensitive name search. Runs client-side over a bounded fetch. */
export async function searchMembers(queryText: string, max = 100): Promise<MemberProfile[]> {
  const all = await getAllMembers(max);
  const q = queryText.trim().toLowerCase();
  if (!q) return all;
  return all.filter((m) => m.displayName.toLowerCase().includes(q));
}
