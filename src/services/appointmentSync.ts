import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  where,
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
  // PRESERVE the booking member's uid through admin edits — fall back to the
  // current writer only when creating a brand-new appointment. Without this, an
  // admin confirming a booking overwrote firebaseUid with the admin's uid, which
  // then hid the appointment from the member once reads are owner-scoped.
  const firebaseUid = appt.firebaseUid ?? auth?.currentUser?.uid;
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

export function subscribeToAppointments(
  uid: string | null,
  isAdmin: boolean,
  cb: (appts: Appointment[]) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  if (!uid) return noopUnsubscribe;
  try {
    // Admins stream the whole collection (rule allows via isAdmin()); a regular
    // member streams only their own (rule: firebaseUid == auth.uid). Scoping the
    // query is REQUIRED — a full-collection listener that includes denied docs
    // fails the entire query with permission-denied, so a member would see none.
    const q = isAdmin
      ? collection(db, 'appointments')
      : query(collection(db, 'appointments'), where('firebaseUid', '==', uid));
    return onSnapshot(
      q,
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
