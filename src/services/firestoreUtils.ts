import {
  doc,
  setDoc,
  getDocFromServer,
  Unsubscribe,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';

/**
 * No-op `Unsubscribe` returned when Firestore isn't configured. Lets callers
 * subscribe without branching on `FIREBASE_CONFIGURED` — they always get a
 * function they can call in cleanup.
 */
export const noopUnsubscribe: Unsubscribe = () => {};

/**
 * Firestore rejects writes containing `undefined` values. Strip them before
 * sending so optional fields (e.g. `notificationId`) don't blow up the call.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/**
 * setDoc(merge:true) followed by a server-confirmed read. Without the
 * confirm step, an offline-cached optimistic write looks identical to a
 * real write — exactly the failure mode that causes silent rule rejections
 * to vanish into thin air. Returns true only when the doc actually exists
 * on the server after the write. The pattern was first applied in
 * `memberSync.ts:upsertMemberInFirestore`; this is the shared version.
 *
 * Caller is responsible for stripping undefineds and including any
 * ownership fields the rules require (e.g. `firebaseUid`).
 */
export async function serverConfirmedSetDoc<T extends object>(
  collectionName: string,
  docId: string,
  data: T,
  logTag: string,
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const ref = doc(db, collectionName, docId);
  try {
    await setDoc(ref, data as Record<string, unknown>, { merge: true });
  } catch (err) {
    console.warn(`${logTag} write failed:`, err);
    return false;
  }
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) {
      console.warn(`${logTag} server-confirm: doc missing after write — rule likely rejected.`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`${logTag} server-confirm failed:`, err);
    return false;
  }
}
