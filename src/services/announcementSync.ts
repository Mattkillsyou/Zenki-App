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
        const items: Announcement[] = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }),
        );
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
