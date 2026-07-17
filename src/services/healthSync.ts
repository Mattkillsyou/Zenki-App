/**
 * Health-data sync — DEXA scans + bloodwork reports (the clinical datasets),
 * plus the member's trainer-sharing CONSENT flag.
 *
 * These were AsyncStorage-only (@zenki_dexa_scans, @zenki_bloodwork_reports) and
 * died with the app. They now live under /nutrition/{uid}/… (so the existing
 * purgeUserData step('nutrition') erases them for free) as per-record docs,
 * mirroring the weight/macro subcollections.
 *
 * PRIVACY MODEL (owner's decision): health data is OWNER-ONLY by default. A
 * member OPTS IN to trainer/admin visibility via a per-member switch — the
 * /nutrition/{uid}/consents/health doc's shareWithTrainers flag. The Firestore
 * rules gate every health read on `isOwner(uid) || ((trainer|admin) && that flag
 * is true)`, so nothing sensitive (bodyfat, biomarkers) is visible to staff
 * until the member turns it on, and they can turn it back off.
 *
 * Uses the generic syncCore primitives; keep this thin so the remaining health
 * datasets (medications, cycle, HR, GPS) follow the same shape.
 */

import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import {
  pushRecord, flushQueue, migrateRecords, deleteRecord, subscribeCollection,
  type SyncableRecord, type CollectionDelta,
} from './syncCore';
import type { DexaScan } from '../types/dexa';
import type { BloodworkReport } from '../types/bloodwork';

export type SyncedDexaScan = DexaScan & SyncableRecord;
export type SyncedBloodworkReport = BloodworkReport & SyncableRecord;

const NUTRITION_ROOT = 'nutrition';
export const dexaPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/dexaScans`;
export const bloodworkPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/bloodworkReports`;
export const consentDocPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/consents`;
const CONSENT_ID = 'health';

const TAG = '[healthSync]';
const nonEmptyStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Best-effort coerce a date to YYYY-MM-DD so the trainer view's date math works,
 * but NEVER reject: the /nutrition health rules only require the date `is
 * string`, so a shape our sanitizer doesn't recognize must still sync verbatim
 * rather than be silently stranded on-device (the exact loss this migration
 * exists to end). Handles the common hand-typed forms; leaves anything else.
 */
function normDate(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);        // YYYY-M-D
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);          // M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return s;
}

// A record can satisfy the rules IFF it has an id, a string memberId, a NON-EMPTY
// STRING date (matching the rule's `is string`, NOT a stricter shape — a stricter
// client check would strand records the server accepts), and a known source. The
// date is normalized on write, not gated on.
export const isSyncableDexa = (s: SyncedDexaScan) =>
  !!s.id && typeof s.memberId === 'string' && nonEmptyStr(s.scanDate) && (s.source === 'ai' || s.source === 'manual');
export const isSyncableBloodwork = (b: SyncedBloodworkReport) =>
  !!b.id && typeof b.memberId === 'string' && nonEmptyStr(b.testDate) && (b.source === 'ai' || b.source === 'manual')
  && Array.isArray(b.biomarkers);

const sanitizeDexa = (s: SyncedDexaScan): SyncedDexaScan => ({ ...s, scanDate: normDate(s.scanDate), memberId: String(s.memberId ?? '') });
const sanitizeBloodwork = (b: SyncedBloodworkReport): SyncedBloodworkReport => ({ ...b, testDate: normDate(b.testDate), memberId: String(b.memberId ?? '') });

// ── DEXA ────────────────────────────────────────────────────────────────
export const pushDexa = (uid: string, s: SyncedDexaScan) =>
  isSyncableDexa(s) ? pushRecord(dexaPath(uid), sanitizeDexa(s), TAG) : Promise.resolve(false);
export const deleteDexa = (uid: string, id: string) => deleteRecord(dexaPath(uid), id, TAG);
export const flushDexa = (uid: string, rows: readonly SyncedDexaScan[]) =>
  flushQueue(dexaPath(uid), rows.filter(isSyncableDexa).map(sanitizeDexa), TAG);
export const migrateDexa = (uid: string, rows: readonly SyncedDexaScan[]) =>
  migrateRecords(dexaPath(uid), rows.filter(isSyncableDexa).map(sanitizeDexa), TAG);
export const subscribeDexa = (uid: string, onDelta: (d: CollectionDelta<SyncedDexaScan>) => void) =>
  subscribeCollection<SyncedDexaScan>(dexaPath(uid), (data, id) => ({ ...(data as unknown as DexaScan), id }), onDelta, TAG);

// ── Bloodwork ───────────────────────────────────────────────────────────
export const pushBloodwork = (uid: string, b: SyncedBloodworkReport) =>
  isSyncableBloodwork(b) ? pushRecord(bloodworkPath(uid), sanitizeBloodwork(b), TAG) : Promise.resolve(false);
export const deleteBloodwork = (uid: string, id: string) => deleteRecord(bloodworkPath(uid), id, TAG);
export const flushBloodwork = (uid: string, rows: readonly SyncedBloodworkReport[]) =>
  flushQueue(bloodworkPath(uid), rows.filter(isSyncableBloodwork).map(sanitizeBloodwork), TAG);
export const migrateBloodwork = (uid: string, rows: readonly SyncedBloodworkReport[]) =>
  migrateRecords(bloodworkPath(uid), rows.filter(isSyncableBloodwork).map(sanitizeBloodwork), TAG);
export const subscribeBloodwork = (uid: string, onDelta: (d: CollectionDelta<SyncedBloodworkReport>) => void) =>
  subscribeCollection<SyncedBloodworkReport>(bloodworkPath(uid), (data, id) => ({ ...(data as unknown as BloodworkReport), id }), onDelta, TAG);

// ── Consent (the member's trainer-sharing switch) ─────────────────────────

/** Turn trainer/admin visibility of THIS member's health data on or off. */
export async function setHealthSharing(uid: string, shareWithTrainers: boolean): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  return serverConfirmedSetDoc(
    consentDocPath(uid),
    CONSENT_ID,
    stripUndefined({ shareWithTrainers: !!shareWithTrainers, updatedAt: new Date().toISOString() }),
    `${TAG} consent`,
  );
}

/** Live value of the switch (false when the doc is absent). */
export function subscribeHealthSharing(uid: string, onValue: (share: boolean) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;
  return onSnapshot(
    doc(db, consentDocPath(uid), CONSENT_ID),
    (snap) => onValue(snap.exists() ? snap.data()?.shareWithTrainers === true : false),
    (e) => console.warn(`${TAG} consent listener error:`, e),
  );
}
