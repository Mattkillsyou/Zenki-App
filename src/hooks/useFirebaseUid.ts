/**
 * Live Firebase Auth uid — null until the session restore completes (or when
 * signed out). Firebase v12 restores the persisted session ASYNCHRONOUSLY
 * after AuthContext has already hydrated the local user from AsyncStorage, so
 * any effect that samples `getCurrentUid()` once at mount races the restore
 * and can wedge on null for the whole session (audit 2.0.5: BlocksContext
 * block/mute filters inert, inbox stuck on "Loading…", dead guest-attached
 * listeners). Key those effects on THIS value instead: it starts null, then
 * fires with the uid the moment the restore lands, and flips back to null on
 * sign-out — so subscriptions attach late and re-attach across account
 * switches instead of dying silently.
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

export function useFirebaseUid(): string | null {
  const [uid, setUid] = useState<string | null>(auth?.currentUser?.uid ?? null);
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null));
  }, []);
  return uid;
}
