import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, FIREBASE_CONFIGURED } from '../config/firebase';
import type { Appointment } from '../context/AppointmentContext';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';

export async function upsertAppointmentInFirestore(appt: Appointment): Promise<boolean> {
  const { id, ...rest } = appt;
  // Stamp the Firebase Auth uid so security rules can verify ownership.
  // The app's `memberId` is an internal id ('1','2',…) — not the auth uid —
  // so rules check `firebaseUid` instead. Admin writes always pass via
  // `isAdmin()` regardless of this field.
  const firebaseUid = auth?.currentUser?.uid;
  const payload = firebaseUid ? { ...rest, firebaseUid } : rest;
  return serverConfirmedSetDoc(
    'appointments',
    id,
    stripUndefined(payload),
    '[Appointments Firestore]',
  );
}

export async function deleteAppointmentFromFirestore(id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'appointments', id));
    return true;
  } catch (err) {
    console.warn('[Appointments Firestore] Delete failed:', err);
    return false;
  }
}

export function subscribeToAppointments(cb: (appts: Appointment[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    return onSnapshot(
      collection(db, 'appointments'),
      (snap) => {
        const items: Appointment[] = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }),
        );
        items.sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''));
        cb(items);
      },
      (err) => console.warn('[Appointments Firestore] Subscribe failed:', err),
    );
  } catch (err) {
    console.warn('[Appointments Firestore] Subscribe init failed:', err);
    return noopUnsubscribe;
  }
}
