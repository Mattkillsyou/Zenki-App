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
 * Firestore rejects writes containing `undefined` values — anywhere in the
 * payload, not just at the top level (an order item's `selectedSize:
 * undefined` inside the `items` array fails the whole setDoc). Strip them
 * recursively before sending so optional fields (e.g. `notificationId`)
 * don't blow up the call. Only plain objects/arrays are walked; class
 * instances (Date, Timestamp, FieldValue…) pass through untouched.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = stripUndefinedDeep(obj[k]) as T[keyof T];
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) &&
    (v.constructor === Object || Object.getPrototypeOf(v) === null);
}

function stripUndefinedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value)) {
      if (value[k] !== undefined) out[k] = stripUndefinedDeep(value[k]);
    }
    return out;
  }
  return value;
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
  /**
   * merge:true (the default, and what every pre-existing caller relies on) only
   * writes the fields present in `data`. Pass merge:false when `data` is the
   * COMPLETE document: with merge:true a field the user CLEARED is simply absent
   * from the payload (stripUndefined removes it), so the server keeps its old
   * value and the live listener echoes the stale value back — the user's delete
   * silently un-does itself. Full-record writers must use merge:false.
   */
  opts?: { merge?: boolean },
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const ref = doc(db, collectionName, docId);
  try {
    await setDoc(ref, data as Record<string, unknown>, { merge: opts?.merge !== false });
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
