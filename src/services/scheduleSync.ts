import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import type { ScheduleClass, DayKey } from '../context/ScheduleContext';
import { noopUnsubscribe, serverConfirmedSetDoc } from './firestoreUtils';

// Schema: one doc per day at /schedule/{dayKey}, holding the full classes
// array for that day. This mirrors the existing AsyncStorage shape (key per
// day → array) so seed-id entries can survive admin edits without the
// flat-collection model losing them. Days the admin has never touched have
// no doc and the client falls back to the in-app seed.

interface ScheduleDayDoc {
  classes: ScheduleClass[];
  updatedAt: string;
}

export async function upsertScheduleDay(day: DayKey, classes: ScheduleClass[]): Promise<boolean> {
  return serverConfirmedSetDoc(
    'schedule',
    day,
    { classes, updatedAt: new Date().toISOString() } satisfies ScheduleDayDoc,
    '[Schedule Firestore]',
  );
}

export async function clearScheduleDay(day: DayKey): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'schedule', day));
    return true;
  } catch (err) {
    console.warn('[Schedule Firestore] Clear failed:', err);
    return false;
  }
}

export function subscribeToSchedule(
  cb: (byDay: Partial<Record<DayKey, ScheduleClass[]>>) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    return onSnapshot(
      collection(db, 'schedule'),
      (snap) => {
        const byDay: Partial<Record<DayKey, ScheduleClass[]>> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as ScheduleDayDoc;
          byDay[d.id as DayKey] = Array.isArray(data.classes) ? data.classes : [];
        });
        cb(byDay);
      },
      (err) => console.warn('[Schedule Firestore] Subscribe failed:', err),
    );
  } catch (err) {
    console.warn('[Schedule Firestore] Subscribe init failed:', err);
    return noopUnsubscribe;
  }
}
