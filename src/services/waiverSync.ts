import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { WaiverSignature, renderWaiverText } from '../data/waiver';
import { getCurrentUid } from './firebaseAuth';
import { safeParseJSON } from '../utils/safeStorage';

// ─────────────────────────────────────────────────
// Audit 2.0.5 P1 (legal-record data loss): a signed waiver / EULA-acceptance
// write that fails (fresh-signup token race, offline) used to be a
// console.warn and PERMANENT loss. Failures now persist to a local queue and
// are re-pushed by flushPendingSignupWrites() — wired to fire whenever a
// Firebase session lands (App.tsx). Entries are stamped with the signer's
// uid at queue time and only flushed under that same uid, so a shared device
// can never attach one member's waiver to another's account.
// ─────────────────────────────────────────────────
const PENDING_WAIVERS_KEY = '@zenki_pending_waivers';
const PENDING_TERMS_KEY = '@zenki_pending_terms';

/** Firestore rejects explicit `undefined` values client-side (the app does
 *  not enable ignoreUndefinedProperties) — a blank optional field like
 *  `phone` used to make EVERY waiver write throw before reaching the server. */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

type QueuedWaiver = WaiverSignature & { firebaseUid?: string | null };

async function readWaiverQueue(): Promise<QueuedWaiver[]> {
  const raw = await AsyncStorage.getItem(PENDING_WAIVERS_KEY).catch(() => null);
  return safeParseJSON<QueuedWaiver[]>(raw, [], Array.isArray);
}

async function enqueueWaiver(sig: QueuedWaiver): Promise<void> {
  try {
    const q = await readWaiverQueue();
    q.push(sig);
    await AsyncStorage.setItem(PENDING_WAIVERS_KEY, JSON.stringify(q));
  } catch (e) {
    console.warn('[Waiver] enqueue failed:', e);
  }
}

/** Persist the EULA/guidelines acceptance proof for a later retry. */
export async function queuePendingTerms(
  uid: string,
  payload: { acceptedTermsAt: string; acceptedTermsVersion: string },
): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_TERMS_KEY, JSON.stringify({ uid, ...payload }));
  } catch (e) {
    console.warn('[Waiver] terms enqueue failed:', e);
  }
}

/** Re-push any queued waiver / terms writes for the CURRENT uid. Call when a
 *  Firebase session becomes available; safe to call repeatedly. */
export async function flushPendingSignupWrites(): Promise<void> {
  if (!FIREBASE_CONFIGURED || !db) return;
  const uid = getCurrentUid();
  if (!uid) return;

  const q = await readWaiverQueue();
  if (q.length > 0) {
    const remaining: QueuedWaiver[] = [];
    for (const sig of q) {
      // Only flush under the uid that signed it (or legacy entries with none).
      if (sig.firebaseUid && sig.firebaseUid !== uid) {
        remaining.push(sig);
        continue;
      }
      const ok = await pushWaiverToFirestore(sig, { enqueueOnFail: false });
      if (!ok) remaining.push(sig);
    }
    await AsyncStorage.setItem(PENDING_WAIVERS_KEY, JSON.stringify(remaining)).catch(() => {});
  }

  const rawTerms = await AsyncStorage.getItem(PENDING_TERMS_KEY).catch(() => null);
  if (rawTerms) {
    const payload = safeParseJSON<any>(rawTerms, null, (v) => !!v && typeof v === 'object');
    if (payload && payload.uid === uid) {
      try {
        await setDoc(
          doc(db, 'users', uid),
          { acceptedTermsAt: payload.acceptedTermsAt, acceptedTermsVersion: payload.acceptedTermsVersion },
          { merge: true },
        );
        await AsyncStorage.removeItem(PENDING_TERMS_KEY);
      } catch (e) {
        console.warn('[Waiver] pending terms flush failed (will retry):', e);
      }
    }
  }
}

// ─────────────────────────────────────────────────
// Google Sheets — Apps Script endpoint
// Your Apps Script should: (1) append signature row to sheet,
// (2) if emailCopy is true, email the member the waiver text.
// ─────────────────────────────────────────────────
const WAIVER_SHEET_URL = '';

/**
 * Push a signed waiver to Google Sheets + optionally trigger email.
 */
export async function pushWaiverToSheets(signature: WaiverSignature): Promise<boolean> {
  if (!WAIVER_SHEET_URL) {
    console.log('[Waiver Sheets] No URL configured — logging locally:', signature.memberName);
    return true;
  }

  try {
    const payload = {
      ...signature,
      // Include the waiver text so the Apps Script can email it
      waiverText: signature.emailCopy ? renderWaiverText(signature.signedName) : undefined,
    };
    const response = await fetch(WAIVER_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    console.warn('[Waiver Sheets] Push failed:', err);
    return false;
  }
}

/**
 * Write the signed waiver to Firestore 'waivers' collection.
 */
export async function pushWaiverToFirestore(
  signature: WaiverSignature,
  opts: { enqueueOnFail?: boolean } = {},
): Promise<boolean> {
  const { enqueueOnFail = true } = opts;
  if (!FIREBASE_CONFIGURED || !db) {
    console.log('[Waiver Firestore] Not configured — skipping');
    return false;
  }

  // Stamp the Firebase Auth uid so the waivers rule (firebaseUid == auth.uid)
  // accepts the write. signature.memberId is the app's INTERNAL member id, not
  // the auth uid, so the old rule rejected every waiver and none ever persisted.
  const uid = (signature as QueuedWaiver).firebaseUid ?? getCurrentUid();
  try {
    // stripUndefined: a blank optional field (phone) is an explicit-undefined
    // key that made the SDK throw locally — guaranteed silent waiver loss.
    await addDoc(collection(db, 'waivers'), stripUndefined({ ...signature, firebaseUid: uid }));
    return true;
  } catch (err) {
    console.warn('[Waiver Firestore] Write failed:', err);
    if (enqueueOnFail) await enqueueWaiver({ ...signature, firebaseUid: uid });
    return false;
  }
}
