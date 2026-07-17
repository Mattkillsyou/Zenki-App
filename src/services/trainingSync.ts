/**
 * Training sync — workout logs + personal records.
 *
 * The first dataset moved online by the "nothing lives only on-device" migration.
 * Until now these were AsyncStorage-only (`@zenki_workout_logs`,
 * `@zenki_personal_records`) and were destroyed by an app delete, a lost phone,
 * or a new device — LAUNCH_READINESS_REPORT.md already conceded it: "Local-only
 * by design: no cross-device/server backup; lost on reinstall." This is a
 * member's entire training history, so it is the highest-value thing to rescue.
 *
 * SHAPE (mirrors /nutrition/{uid}/… exactly — one pattern, one mental model):
 *   /training/{uid}/logs/{logId}              logId = the existing `log_<uuid>`
 *   /training/{uid}/personalRecords/{prId}    prId  = the existing `pr_<uuid>`
 *
 * uid is the FIREBASE AUTH UID, not the app's internal memberId ('1','2',…).
 * uid-in-path keeps the rules a plain isOwner(uid) and lets the Admin SDK reach
 * the same path. `memberId` stays denormalized inside each doc so the existing
 * memberId-keyed selectors in WorkoutContext keep working unchanged.
 *
 * SUBCOLLECTIONS, not one blob-doc per user, because: a 5-year log array is
 * ~900KB of JSON and Firestore's 1MiB doc limit (plus per-array-element field
 * overhead) would silently stop a member from logging; a single doc caps
 * sustained writes at ~1/sec and rebills a full rewrite for one 240-byte log;
 * per-doc rules can validate bounds that are unenforceable inside an opaque
 * array; and incremental docChanges() hydration needs per-doc granularity, or an
 * empty snapshot replaces (i.e. wipes) everything.
 *
 * The sanitizers below and the /training rules in firestore.rules are a MATCHED
 * PAIR — the clamps here mirror the bounds the rules enforce. Change one and you
 * must change the other, or over-length rows write locally, get rejected by the
 * server, and silently never sync.
 */

import { doc, deleteDoc, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe } from './firestoreUtils';
import {
  pushRecord, flushQueue, migrateRecords, subscribeCollection, type SyncableRecord,
} from './syncCore';
import type { WorkoutLog, PersonalRecord, WorkoutFormat, WodResult } from '../types/workout';

/** Local-only sync bookkeeping; stripped by forWire() before any write. */
export type SyncedWorkoutLog = WorkoutLog & SyncableRecord;
export type SyncedPersonalRecord = PersonalRecord & SyncableRecord;

export const logsPath = (uid: string) => `training/${uid}/logs`;
export const prsPath = (uid: string) => `training/${uid}/personalRecords`;

const LOG_TAG = '[trainingSync]';

// Bounds — MUST match the /training rules in firestore.rules.
const TITLE_MAX = 60;
const NOTES_MAX = 200;
const RESULT_MAX = 60;
const FORMATS: readonly WorkoutFormat[] = ['AMRAP', 'EMOM', 'FOR_TIME', 'TABATA', 'CHIPPER', 'STRENGTH', 'OTHER'];
const isDateString = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Clamp a log to what the rules will accept. Applied at the WRITE boundary only
 * — local state keeps whatever it had, and the server value wins on the next
 * hydrate, so the two converge on the rule-legal form.
 */
export function sanitizeLog(l: SyncedWorkoutLog): SyncedWorkoutLog {
  return {
    ...l,
    memberId: String(l.memberId ?? ''),
    date: isDateString(l.date) ? l.date : String(l.date ?? '').slice(0, 10),
    title: String(l.title ?? '').slice(0, TITLE_MAX),
    result: String(l.result ?? '').slice(0, RESULT_MAX),
    notes: String(l.notes ?? '').slice(0, NOTES_MAX),
    format: FORMATS.includes(l.format) ? l.format : ('OTHER' as WorkoutFormat),
    rxOrScaled: (l.rxOrScaled === 'Rx' ? 'Rx' : 'Scaled') as WodResult,
  };
}

export function sanitizePR(p: SyncedPersonalRecord): SyncedPersonalRecord {
  return {
    ...p,
    memberId: String(p.memberId ?? ''),
    exerciseKey: String(p.exerciseKey ?? ''),
    value: Number(p.value),
    date: isDateString(p.date) ? p.date : String(p.date ?? '').slice(0, 10),
    ...(p.reps !== undefined ? { reps: Number(p.reps) } : {}),
    ...(p.notes !== undefined ? { notes: String(p.notes).slice(0, NOTES_MAX) } : {}),
  };
}

/**
 * True if the record can EVER satisfy the rules. A row that can't is a poison
 * pill: it would be retried on every flush forever and never land. Better to
 * skip it loudly than to retry it silently until the end of time.
 *
 * These mirror the rules' HARD predicates and nothing more. Do NOT tighten them
 * past the rules: an earlier version required a strict YYYY-MM-DD date here
 * while the rule only asks for `date is string` — since the date field is
 * free-text, any member who typed a non-ISO date had that record judged
 * unsyncable and silently stranded on-device forever. A record the server would
 * happily accept must never be withheld by a client-side opinion.
 */
export function isSyncableLog(l: SyncedWorkoutLog): boolean {
  const s = sanitizeLog(l);
  return !!l.id && typeof s.memberId === 'string' && typeof s.date === 'string';
}
export function isSyncablePR(p: SyncedPersonalRecord): boolean {
  const s = sanitizePR(p);
  const v = Number(s.value);
  // value > 0 and the string fields are genuinely enforced by the rule; the date
  // only has to be A STRING, exactly as the rule says.
  return !!p.id && Number.isFinite(v) && v > 0
    && typeof s.exerciseKey === 'string' && s.exerciseKey.length > 0
    && typeof s.date === 'string'
    && (s.reps === undefined || (Number.isFinite(Number(s.reps)) && Number(s.reps) > 0));
}

function reportSkipped<T extends { id: string }>(kind: string, skipped: readonly T[]) {
  if (skipped.length) {
    console.warn(
      `${LOG_TAG} ${skipped.length} ${kind} cannot satisfy the sync rules and were skipped ` +
      `(they remain on-device): ${skipped.map((s) => s.id).join(', ')}`,
    );
  }
}

// ── Write-through ─────────────────────────────────────────────────────────
// Callers MUST have queued the record locally (synced:false) BEFORE awaiting
// these — an offline write hangs rather than failing, so a process death here
// must leave the record queued for the next flush. See syncCore's header.

export async function pushLog(uid: string, log: SyncedWorkoutLog): Promise<boolean> {
  if (!isSyncableLog(log)) { reportSkipped('workout logs', [log]); return false; }
  return pushRecord(logsPath(uid), sanitizeLog(log), LOG_TAG);
}

export async function pushPR(uid: string, pr: SyncedPersonalRecord): Promise<boolean> {
  if (!isSyncablePR(pr)) { reportSkipped('personal records', [pr]); return false; }
  return pushRecord(prsPath(uid), sanitizePR(pr), LOG_TAG);
}

/**
 * Delete server-side. MUST be called whenever a record is removed locally: the
 * live listener re-adds anything still on the server, so a local-only delete
 * would RESURRECT the record on the next snapshot.
 *
 * A failed delete leaves the server copy, which the listener then restores —
 * visible and self-correcting, rather than silent. Deliberately not queued:
 * replaying a delete against a record the member later re-created would destroy
 * the new one.
 */
export async function deleteLog(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid || !id) return false;
  try {
    await deleteDoc(doc(db, logsPath(uid), id));
    return true;
  } catch (e) {
    console.warn(`${LOG_TAG} deleteLog failed (server copy remains):`, e);
    return false;
  }
}

export async function deletePR(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid || !id) return false;
  try {
    await deleteDoc(doc(db, prsPath(uid), id));
    return true;
  } catch (e) {
    console.warn(`${LOG_TAG} deletePR failed (server copy remains):`, e);
    return false;
  }
}

/** Push everything still queued. Returns the ids confirmed landed. */
export async function flushLogs(uid: string, logs: readonly SyncedWorkoutLog[]): Promise<Set<string>> {
  const ok = logs.filter(isSyncableLog);
  reportSkipped('workout logs', logs.filter((l) => !isSyncableLog(l)));
  return flushQueue(logsPath(uid), ok.map(sanitizeLog), LOG_TAG);
}

export async function flushPRs(uid: string, prs: readonly SyncedPersonalRecord[]): Promise<Set<string>> {
  const ok = prs.filter(isSyncablePR);
  reportSkipped('personal records', prs.filter((p) => !isSyncablePR(p)));
  return flushQueue(prsPath(uid), ok.map(sanitizePR), LOG_TAG);
}

// ── One-time migration of what's already on this device ───────────────────

/**
 * Upload the training history already sitting in AsyncStorage. This is the
 * entire point of the migration: write-through only protects data created AFTER
 * the update — everything logged before it is stranded on the phone and still
 * dies with an app delete unless this runs.
 *
 * Idempotent: every record is written under its own existing `log_`/`pr_` id
 * with merge:true, so re-running (the migrated flag is device-local, so this
 * runs once per device) is a no-op rather than a duplicate.
 *
 * `logs`/`prs` must ALREADY be filtered to this member — the legacy AsyncStorage
 * arrays are device-global and hold every member who ever signed in on the
 * handset. Uploading them unfiltered would put another member's history in this
 * member's tree.
 */
export async function migrateTrainingToFirestore(
  uid: string,
  logs: readonly SyncedWorkoutLog[],
  prs: readonly SyncedPersonalRecord[],
): Promise<{ logIds: Set<string>; prIds: Set<string> }> {
  const goodLogs = logs.filter(isSyncableLog).map(sanitizeLog);
  const goodPRs = prs.filter(isSyncablePR).map(sanitizePR);
  reportSkipped('workout logs', logs.filter((l) => !isSyncableLog(l)));
  reportSkipped('personal records', prs.filter((p) => !isSyncablePR(p)));
  const [logIds, prIds] = await Promise.all([
    migrateRecords(logsPath(uid), goodLogs, `${LOG_TAG} logs`),
    migrateRecords(prsPath(uid), goodPRs, `${LOG_TAG} prs`),
  ]);
  return { logIds, prIds };
}

// ── Hydration ─────────────────────────────────────────────────────────────

export interface TrainingDelta {
  logUpserts: SyncedWorkoutLog[];
  logRemovedIds: string[];
  prUpserts: SyncedPersonalRecord[];
  prRemovedIds: string[];
  /**
   * The COMPLETE server id set, emitted only on the first snapshot of each
   * listener. docChanges() can only report a delete it witnessed, so a record
   * deleted on another device while this one was closed produces no 'removed'
   * event ever — a fresh listener just never sees the doc. The consumer uses
   * this to reconcile: a local row marked synced whose id is absent from the
   * server was deleted elsewhere and must go. (Rows still queued — synced
   * falsy — are pending uploads and must be kept.)
   */
  logAllIds?: string[];
  prAllIds?: string[];
}

/**
 * Live-subscribe to this member's training tree, emitting INCREMENTAL deltas
 * (docChanges), never whole-collection replacements. The consumer merges by id
 * so an empty or partial snapshot can never wipe local rows — and a row that
 * hasn't flushed yet survives a hydrate.
 */
export function subscribeTraining(
  uid: string,
  onDelta: (d: TrainingDelta) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;

  // Delegates to syncCore.subscribeCollection so the server-confirmed allIds gate
  // (an offline cache snapshot must NOT drive a delete-reconcile) lives in one
  // place rather than being re-implemented — and correctly — per dataset.
  const unsubLogs = subscribeCollection<SyncedWorkoutLog>(
    logsPath(uid),
    (data, id) => ({ ...(data as unknown as WorkoutLog), id }),
    (d) => onDelta({ logUpserts: d.upserts, logRemovedIds: d.removedIds, logAllIds: d.allIds, prUpserts: [], prRemovedIds: [] }),
    LOG_TAG,
  );
  const unsubPRs = subscribeCollection<SyncedPersonalRecord>(
    prsPath(uid),
    (data, id) => ({ ...(data as unknown as PersonalRecord), id }),
    (d) => onDelta({ logUpserts: [], logRemovedIds: [], prUpserts: d.upserts, prRemovedIds: d.removedIds, prAllIds: d.allIds }),
    LOG_TAG,
  );

  return () => { unsubLogs(); unsubPRs(); };
}
