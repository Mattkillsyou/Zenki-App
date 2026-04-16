import { collection, addDoc } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { WaiverSignature, renderWaiverText } from '../data/waiver';

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
export async function pushWaiverToFirestore(signature: WaiverSignature): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) {
    console.log('[Waiver Firestore] Not configured — skipping');
    return false;
  }

  try {
    await addDoc(collection(db, 'waivers'), signature);
    return true;
  } catch (err) {
    console.warn('[Waiver Firestore] Write failed:', err);
    return false;
  }
}
