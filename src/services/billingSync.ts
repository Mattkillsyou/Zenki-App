/**
 * Billing / payroll sync — drink-tab charges and staff time-clock entries.
 *
 * The last two datasets of the "nothing lives only on-device" migration, and the
 * only two that are MONEY rather than member training data:
 *   - drink tab  → /drinkTabs/{uid}/entries/{id}   (money OWED to the dojo)
 *   - time clock → /users/{uid}/timeEntries/{id}    (STAFF payroll — hours worked)
 *
 * Both are flat per-record collections keyed by the Firebase Auth uid, so they
 * reuse the generic syncCore primitives. Neither is health data, so neither uses
 * the health consent gate; the rules make them owner-write + owner/admin-read
 * (the dojo owner needs to reconcile a tab and run payroll).
 *
 * PURGE: /users/{uid} is already erased recursively by purgeUserData's users
 * step, so timeEntries come for free; /drinkTabs is a NEW top-level collection
 * and needs its own explicit purge step.
 */

import { writeBatch, doc, collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import type { DrinkEntry } from '../types/drinks';
import type { TimeEntry } from '../types/timeclock';
import {
  pushRecord, flushQueue, migrateRecords, deleteRecord, subscribeCollection, deleteRecord as _del,
  type SyncableRecord, type CollectionDelta,
} from './syncCore';

export type SyncedDrinkEntry = DrinkEntry & SyncableRecord;

export const drinkEntriesPath = (uid: string) => `drinkTabs/${uid}/entries`;
export const timeEntriesPath = (uid: string) => `users/${uid}/timeEntries`;

const DRINK_TAG = '[drinkSync]';
const TIME_TAG = '[timeclockSync]';
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// ── Drink tab ─────────────────────────────────────────────────────────────
// Mirrors the /drinkTabs rules field-for-field (NOT stricter — a stricter client
// check would strand a charge the server accepts). `paid` is a bool the member
// flips; `price` is trusted from the local record (it was set from the trusted
// DRINK_DEFINITIONS menu at commit time, not user input).
export const isSyncableDrink = (d: SyncedDrinkEntry) =>
  !!d.id && nonEmpty(d.type) && typeof d.price === 'number'
  && nonEmpty(d.timestamp) && nonEmpty(d.date) && typeof d.paid === 'boolean';

export const pushDrink = (uid: string, d: SyncedDrinkEntry) =>
  isSyncableDrink(d) ? pushRecord(drinkEntriesPath(uid), d, DRINK_TAG) : Promise.resolve(false);
export const deleteDrink = (uid: string, id: string) => deleteRecord(drinkEntriesPath(uid), id, DRINK_TAG);
export const flushDrinks = (uid: string, rows: readonly SyncedDrinkEntry[]) =>
  flushQueue(drinkEntriesPath(uid), rows.filter(isSyncableDrink), DRINK_TAG);
export const migrateDrinks = (uid: string, rows: readonly SyncedDrinkEntry[]) =>
  migrateRecords(drinkEntriesPath(uid), rows.filter(isSyncableDrink), DRINK_TAG);
export const subscribeDrinks = (uid: string, onDelta: (d: CollectionDelta<SyncedDrinkEntry>) => void) =>
  subscribeCollection<SyncedDrinkEntry>(drinkEntriesPath(uid), (data, id) => ({ ...(data as unknown as DrinkEntry), id }), onDelta, DRINK_TAG);

// ── Time clock ──────────────────────────────────────────────────────────────
//
// BESPOKE (not the generic syncCore path) because TimeEntry.synced is a REAL
// domain field — "pushed to the Google Sheets timesheet" — NOT syncCore's
// local-only SyncableRecord marker. Routing it through forWire (which strips
// `synced`) / subscribeCollection (which hard-sets `synced:true` on every server
// row) would corrupt that field. So we write the WHOLE entry, `synced` and all,
// and the CONTEXT tracks Firestore-sync separately via a signature-diff ref.
//
// An open shift (clockOut === null) is written on clock-in, so a crash before
// clock-out never loses the fact the employee is on the clock.

export const isSyncableTimeEntry = (t: TimeEntry) =>
  !!t.id && nonEmpty(t.date) && nonEmpty(t.clockIn) && typeof t.synced === 'boolean';

/**
 * TimeEntry.synced means "pushed to the Google Sheets timesheet" — a DEVICE
 * concern (that Sheets push is not idempotent; its payload carries no entry id,
 * so a re-push appends a DUPLICATE payroll row). Never persist it to Firestore:
 * otherwise a restore hands back synced:false and flushUnsynced double-pays. On
 * read it defaults to `true` (assume already handled — a missing Sheets row is
 * far better than paying an employee twice; the in-app total is unaffected).
 */
const forFirestore = (t: TimeEntry): Record<string, unknown> => {
  const { synced: _sheets, ...rest } = t;
  return stripUndefined(rest as unknown as Record<string, unknown>);
};

/** Write one full time entry (server-confirmed, merge:false — it's complete). */
export async function pushTimeEntryFs(uid: string, t: TimeEntry): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid || !isSyncableTimeEntry(t)) return false;
  return serverConfirmedSetDoc(timeEntriesPath(uid), t.id, forFirestore(t), TIME_TAG, { merge: false });
}

export const deleteTimeEntryFs = (uid: string, id: string) => _del(timeEntriesPath(uid), id, TIME_TAG);

/** One-time bulk upload of existing shifts. Batched with per-record fallback. */
export async function migrateTimeEntries(uid: string, entries: readonly TimeEntry[]): Promise<Set<string>> {
  const written = new Set<string>();
  if (!FIREBASE_CONFIGURED || !db) return written;
  const good = entries.filter(isSyncableTimeEntry);
  const CHUNK = 450;
  for (let i = 0; i < good.length; i += CHUNK) {
    const chunk = good.slice(i, i + CHUNK);
    try {
      const batch = writeBatch(db);
      for (const t of chunk) batch.set(doc(db, timeEntriesPath(uid), t.id), forFirestore(t));
      await batch.commit();
      chunk.forEach((t) => written.add(t.id));
    } catch (e) {
      console.warn(`${TIME_TAG} migrate chunk failed, per-record fallback:`, e);
      for (const t of chunk) { if (await pushTimeEntryFs(uid, t).catch(() => false)) written.add(t.id); }
    }
  }
  return written;
}

/**
 * Subscribe to the full time-entry set. Emits the complete entry array plus a
 * `fromServer` flag (true only once the server, not the offline cache, has
 * answered) so the context can safely rebuild its blob from server state.
 */
export function subscribeTimeEntries(uid: string, onEntries: (entries: TimeEntry[], fromServer: boolean) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;
  return onSnapshot(
    collection(db, timeEntriesPath(uid)),
    { includeMetadataChanges: true },
    (snap) => onEntries(
      // synced isn't stored server-side (see forFirestore) — default to true so a
      // restored shift is never re-pushed to Sheets and double-paid.
      snap.docs.map((d) => { const data = d.data() as TimeEntry; return { ...data, id: d.id, synced: (data as { synced?: boolean }).synced ?? true }; }),
      !snap.metadata.fromCache,
    ),
    (e) => console.warn(`${TIME_TAG} listener error:`, e),
  );
}
