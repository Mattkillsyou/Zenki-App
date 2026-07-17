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

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import { safeStorageGetJSON } from '../utils/safeStorage';
import {
  pushRecord, flushQueue, migrateRecords, deleteRecord, subscribeCollection,
  type SyncableRecord, type CollectionDelta,
} from './syncCore';
import type { DexaScan } from '../types/dexa';
import type { BloodworkReport } from '../types/bloodwork';
import type { MedicationEntry, MedicationLog } from '../types/medication';
import type { PeriodEntry } from '../types/cycle';

export type SyncedDexaScan = DexaScan & SyncableRecord;
export type SyncedBloodworkReport = BloodworkReport & SyncableRecord;
export type SyncedMedication = MedicationEntry & SyncableRecord;
export type SyncedMedicationLog = MedicationLog & SyncableRecord;
export type SyncedPeriodEntry = PeriodEntry & SyncableRecord;

const NUTRITION_ROOT = 'nutrition';
export const dexaPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/dexaScans`;
export const bloodworkPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/bloodworkReports`;
export const medicationsPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/medications`;
export const medicationLogsPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/medicationLogs`;
export const cycleEntriesPath = (uid: string) => `${NUTRITION_ROOT}/${uid}/cycleEntries`;
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

// ── Medications + dose logs ─────────────────────────────────────────────
// The dose log is the largest health dataset by doc count and is UNCAPPED
// (3 daily meds ≈ 1,100 docs/yr), which is exactly why migrateRecords batches
// at 450 with a per-record fallback.

export const isSyncableMedication = (m: SyncedMedication) =>
  !!m.id && typeof m.memberId === 'string' && nonEmptyStr(m.name)
  && nonEmptyStr(m.category) && nonEmptyStr(m.route) && nonEmptyStr(m.frequency)
  && nonEmptyStr(m.startDate) && Array.isArray(m.timesOfDay)
  && typeof m.notificationsEnabled === 'boolean';
export const isSyncableMedLog = (l: SyncedMedicationLog) =>
  !!l.id && typeof l.memberId === 'string' && nonEmptyStr(l.medicationId)
  && nonEmptyStr(l.takenAt) && typeof l.skipped === 'boolean';

/**
 * scheduledNotificationIds are OS-local notification handles — meaningless on
 * any other device (the same precedent as appointmentSync's notificationId), and
 * actively harmful if synced: another device adopting them would try to cancel
 * ids it never scheduled. Stripped on write; the CONTEXT re-attaches the local
 * ids when merging a server upsert so this device keeps its own handles.
 */
const sanitizeMedication = (m: SyncedMedication): SyncedMedication => {
  const { scheduledNotificationIds: _local, ...rest } = m as SyncedMedication & { scheduledNotificationIds?: string[] };
  return {
    ...(rest as SyncedMedication),
    memberId: String(m.memberId ?? ''),
    startDate: normDate(m.startDate),
    ...(m.endDate !== undefined ? { endDate: normDate(m.endDate) } : {}),
  };
};
const sanitizeMedLog = (l: SyncedMedicationLog): SyncedMedicationLog => ({ ...l, memberId: String(l.memberId ?? '') });

export const pushMedication = (uid: string, m: SyncedMedication) =>
  isSyncableMedication(m) ? pushRecord(medicationsPath(uid), sanitizeMedication(m), TAG) : Promise.resolve(false);
export const deleteMedication = (uid: string, id: string) => deleteRecord(medicationsPath(uid), id, TAG);
export const flushMedications = (uid: string, rows: readonly SyncedMedication[]) =>
  flushQueue(medicationsPath(uid), rows.filter(isSyncableMedication).map(sanitizeMedication), TAG);
export const migrateMedications = (uid: string, rows: readonly SyncedMedication[]) =>
  migrateRecords(medicationsPath(uid), rows.filter(isSyncableMedication).map(sanitizeMedication), TAG);
export const subscribeMedications = (uid: string, onDelta: (d: CollectionDelta<SyncedMedication>) => void) =>
  subscribeCollection<SyncedMedication>(medicationsPath(uid), (data, id) => ({ ...(data as unknown as MedicationEntry), id }), onDelta, TAG);

export const pushMedLog = (uid: string, l: SyncedMedicationLog) =>
  isSyncableMedLog(l) ? pushRecord(medicationLogsPath(uid), sanitizeMedLog(l), TAG) : Promise.resolve(false);
export const deleteMedLog = (uid: string, id: string) => deleteRecord(medicationLogsPath(uid), id, TAG);
export const flushMedLogs = (uid: string, rows: readonly SyncedMedicationLog[]) =>
  flushQueue(medicationLogsPath(uid), rows.filter(isSyncableMedLog).map(sanitizeMedLog), TAG);
export const migrateMedLogs = (uid: string, rows: readonly SyncedMedicationLog[]) =>
  migrateRecords(medicationLogsPath(uid), rows.filter(isSyncableMedLog).map(sanitizeMedLog), TAG);
export const subscribeMedLogs = (uid: string, onDelta: (d: CollectionDelta<SyncedMedicationLog>) => void) =>
  subscribeCollection<SyncedMedicationLog>(medicationLogsPath(uid), (data, id) => ({ ...(data as unknown as MedicationLog), id }), onDelta, TAG);

// ── Cycle entries ───────────────────────────────────────────────────────
// Entries only. CycleSettings.showOnDashboard is a UI preference — losing it on
// reinstall is a non-event (it re-defaults), so it stays device-local rather
// than becoming noise in Firestore.

export const isSyncableCycleEntry = (e: SyncedPeriodEntry) =>
  !!e.id && typeof e.memberId === 'string' && nonEmptyStr(e.startDate)
  && nonEmptyStr(e.flowIntensity) && Array.isArray(e.symptoms) && nonEmptyStr(e.createdAt);

const sanitizeCycleEntry = (e: SyncedPeriodEntry): SyncedPeriodEntry => ({
  ...e, memberId: String(e.memberId ?? ''), startDate: normDate(e.startDate),
  ...(e.endDate !== undefined ? { endDate: normDate(e.endDate) } : {}),
});

export const pushCycleEntry = (uid: string, e: SyncedPeriodEntry) =>
  isSyncableCycleEntry(e) ? pushRecord(cycleEntriesPath(uid), sanitizeCycleEntry(e), TAG) : Promise.resolve(false);
export const deleteCycleEntry = (uid: string, id: string) => deleteRecord(cycleEntriesPath(uid), id, TAG);
export const flushCycleEntries = (uid: string, rows: readonly SyncedPeriodEntry[]) =>
  flushQueue(cycleEntriesPath(uid), rows.filter(isSyncableCycleEntry).map(sanitizeCycleEntry), TAG);
export const migrateCycleEntries = (uid: string, rows: readonly SyncedPeriodEntry[]) =>
  migrateRecords(cycleEntriesPath(uid), rows.filter(isSyncableCycleEntry).map(sanitizeCycleEntry), TAG);
export const subscribeCycleEntries = (uid: string, onDelta: (d: CollectionDelta<SyncedPeriodEntry>) => void) =>
  subscribeCollection<SyncedPeriodEntry>(cycleEntriesPath(uid), (data, id) => ({ ...(data as unknown as PeriodEntry), id }), onDelta, TAG);

// ── Consent (the member's trainer-sharing switches) ───────────────────────
//
// TWO independent flags, deliberately NOT one:
//   shareWithTrainers          → DEXA + bloodwork (body composition / labs)
//   shareSensitiveWithTrainers → medications + cycle
// Bundling them would force a member who wants coaching on their body-comp scan
// to also expose menstrual and medication data. Both default OFF (an absent doc
// reads false), and either can be revoked independently at any time.

export interface HealthConsent {
  share: boolean;           // DEXA + bloodwork
  shareSensitive: boolean;  // medications + cycle
}

// Pending consent intent, queued BEFORE the write. Consent is the security
// boundary: an offline write HANGS rather than failing, so without this a member
// revoking sharing on a bad connection sees the switch go OFF, the process dies,
// the write never lands — and their medication/cycle data stays shared with
// trainers, with the toggle flipping back ON at next launch, unexplained. A
// revoke that renders as succeeded while the server still shares is not
// acceptable, so the intent is durable and replayed until confirmed.
const CONSENT_PENDING_KEY = '@zenki_health_consent_pending_v1';

type PendingConsent = Record<string, Record<string, unknown>>; // uid -> field patch

async function readPendingConsent(): Promise<PendingConsent> {
  return safeStorageGetJSON<PendingConsent>(CONSENT_PENDING_KEY, {}, (v) =>
    typeof v === 'object' && v !== null && !Array.isArray(v));
}

async function queueConsent(uid: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const all = await readPendingConsent();
    // Merge per-field so a queued DEXA revoke and a queued meds revoke coexist.
    all[uid] = { ...(all[uid] ?? {}), ...patch };
    await AsyncStorage.setItem(CONSENT_PENDING_KEY, JSON.stringify(all));
  } catch { /* best-effort */ }
}

async function clearQueuedConsent(uid: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const all = await readPendingConsent();
    const cur = all[uid];
    if (!cur) return;
    // Only clear the exact fields we just confirmed — a concurrent toggle of the
    // OTHER switch must stay queued.
    for (const k of Object.keys(patch)) {
      if (cur[k] === patch[k]) delete cur[k];
    }
    if (Object.keys(cur).length === 0) delete all[uid];
    else all[uid] = cur;
    await AsyncStorage.setItem(CONSENT_PENDING_KEY, JSON.stringify(all));
  } catch { /* best-effort */ }
}

/** Replay any consent change that never reached the server. */
export async function flushPendingConsent(uid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  const all = await readPendingConsent();
  const patch = all[uid];
  if (!patch || Object.keys(patch).length === 0) return false;
  const ok = await serverConfirmedSetDoc(
    consentDocPath(uid), CONSENT_ID,
    stripUndefined({ ...patch, updatedAt: new Date().toISOString() }),
    `${TAG} consent flush`,
  );
  if (ok) await clearQueuedConsent(uid, patch);
  return ok;
}

/** The queued (not-yet-confirmed) consent intent for this uid, if any. */
export async function pendingConsentFor(uid: string): Promise<Record<string, unknown> | null> {
  const all = await readPendingConsent();
  return all[uid] ?? null;
}

async function writeConsent(uid: string, patch: Record<string, unknown>): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  // QUEUE BEFORE THE WRITE — see CONSENT_PENDING_KEY above.
  await queueConsent(uid, patch);
  // merge:true — each switch writes only its own field, so flipping one can
  // never silently clear the other. (Unlike record writes, this IS a partial
  // patch by design.)
  const ok = await serverConfirmedSetDoc(
    consentDocPath(uid),
    CONSENT_ID,
    stripUndefined({ ...patch, updatedAt: new Date().toISOString() }),
    `${TAG} consent`,
  );
  if (ok) await clearQueuedConsent(uid, patch);
  return ok;
}

/** DEXA + bloodwork visibility for trainers/admins. */
export const setHealthSharing = (uid: string, share: boolean) =>
  writeConsent(uid, { shareWithTrainers: !!share });

/** Medication + cycle visibility for trainers/admins — the more sensitive tier. */
export const setSensitiveSharing = (uid: string, share: boolean) =>
  writeConsent(uid, { shareSensitiveWithTrainers: !!share });

/** Live value of BOTH switches (both false when the doc is absent). */
export function subscribeHealthConsent(uid: string, onValue: (c: HealthConsent) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;
  return onSnapshot(
    doc(db, consentDocPath(uid), CONSENT_ID),
    (snap) => {
      const d = snap.exists() ? snap.data() : null;
      onValue({
        share: d?.shareWithTrainers === true,
        shareSensitive: d?.shareSensitiveWithTrainers === true,
      });
    },
    (e) => console.warn(`${TAG} consent listener error:`, e),
  );
}
