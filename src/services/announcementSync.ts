import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import type { Announcement } from '../context/AnnouncementContext';
import { noopUnsubscribe, serverConfirmedSetDoc } from './firestoreUtils';

export async function upsertAnnouncementInFirestore(ann: Announcement): Promise<boolean> {
  const { id, ...rest } = ann;
  return serverConfirmedSetDoc('announcements', id, rest, '[Announcements Firestore]');
}

export async function deleteAnnouncementFromFirestore(id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'announcements', id));
    return true;
  } catch (err) {
    console.warn('[Announcements Firestore] Delete failed:', err);
    return false;
  }
}

export function subscribeToAnnouncements(cb: (anns: Announcement[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    return onSnapshot(
      collection(db, 'announcements'),
      (snap) => {
        const items: Announcement[] = snap.docs.map((d) => {
          const data = d.data() as any;
          // Audit 2.0.5 P1 hardening: the web admin briefly wrote createdAt as
          // a Firestore Timestamp. `.localeCompare` on a Timestamp object
          // throws INSIDE this snapshot handler — cb(items) never runs and the
          // announcements pipeline freezes app-wide. Coerce to the ISO-string
          // contract so one legacy doc can't take down every client.
          let createdAt = data.createdAt;
          if (createdAt && typeof createdAt !== 'string' && typeof createdAt.toDate === 'function') {
            try { createdAt = createdAt.toDate().toISOString(); } catch { createdAt = ''; }
          } else if (typeof createdAt !== 'string') {
            createdAt = '';
          }
          return { id: d.id, ...(data as Omit<Announcement, 'id'>), createdAt };
        });
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        cb(items);
      },
      (err) => console.warn('[Announcements Firestore] Subscribe failed:', err),
    );
  } catch (err) {
    console.warn('[Announcements Firestore] Subscribe init failed:', err);
    return noopUnsubscribe;
  }
}
