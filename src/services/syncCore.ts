/**
 * Shared durable-sync core — the foundation for moving device-only data online.
 *
 * WHY THIS EXISTS (read before writing another sync service):
 *
 * Firestore's offline persistence is NOT available on this stack. `src/config/
 * firebase.ts` calls initializeFirestore() with no `localCache`, so the JS SDK
 * defaults to memoryLocalCache() — and it cannot be fixed by passing
 * persistentLocalCache, because that cache is IndexedDB-backed and IndexedDB
 * does not exist in React Native. Durable SDK-level persistence would mean
 * swapping to @react-native-firebase/firestore (a stack change, not a release
 * change). Consequences, both of which this module exists to absorb:
 *
 *   1. An offline write NEVER REJECTS — it hangs until connectivity. So
 *      `try { await setDoc(); markSynced(); } catch {}` cannot distinguish
 *      success from offline from rule-rejection, and if the process dies while
 *      the write pends, the write is gone with no trace and no retry. That is
 *      exactly the data-loss this migration exists to eliminate.
 *   2. The SDK's write queue is in-memory only and dies with the process.
 *
 * THEREFORE: every synced record carries a local `synced` flag, and the rule is
 * QUEUE BEFORE THE WRITE, CLEAR ONLY ON CONFIRMED SUCCESS. Never mark-on-failure
 * (the write hangs rather than failing, so there is no failure to catch). The
 * records ARE the queue — deliberately unlike the older `@zenki_*_unsynced`
 * id-list keys (attendanceSync, orderSync), which are a second key that can
 * drift out of sync with the records it points at and needs stale-marker
 * reaping. A flag on the record cannot drift. (orderSync shows the drift bug
 * live: its local history is capped at 100, so an id that rotates out of the cap
 * has no body left to push and the flush silently DROPS it.)
 *
 * IDEMPOTENCE IS LOAD-BEARING. The "already migrated" flag is a device-local
 * AsyncStorage key, so the one-time upload re-runs once PER DEVICE. That is only
 * safe because every write is keyed by the record's own stable, pre-existing id
 * (`log_<uuid>`, `pr_<uuid>`, …) with merge:true. A dataset that minted a fresh
 * id at upload time (addDoc, or generateId() during migration) would DUPLICATE
 * the member's entire history on their second phone. If a record has no stable
 * id, derive a deterministic one — never mint.
 *
 * Conflict policy is last-write-wins per field via merge:true, matching
 * nutritionSync. Fine for single-owner data; there is no vector clock.
 */

import { writeBatch, doc, deleteDoc, collection, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { serverConfirmedSetDoc, stripUndefined, noopUnsubscribe } from './firestoreUtils';

/** Any record durable-syncable by this module. `id` must be stable + pre-existing. */
export interface SyncableRecord {
  id: string;
  /** LOCAL ONLY — never written to Firestore. Absent/false ⇒ still queued. */
  synced?: boolean;
}

/** Firestore's per-batch cap is 500; leave headroom like nutritionSync does. */
const BATCH_CHUNK = 450;

/**
 * Strip local-only bookkeeping (and undefineds, which Firestore rejects
 * anywhere in the payload) before a record goes over the wire. `synced` is a
 * device concern and must never land in the document.
 */
export function forWire<T extends SyncableRecord>(record: T): Record<string, unknown> {
  const { synced: _synced, ...rest } = record;
  return stripUndefined(rest as Record<string, unknown>);
}

/**
 * Write one record to `<path>/<record.id>`, server-confirmed.
 *
 * Returns true ONLY when the document is confirmed present on the server after
 * the write — so a caller may mark it synced. Returns false for a rejected
 * write. NOTE: while offline this never returns at all (the underlying write
 * hangs); that is why the caller must have queued the record BEFORE calling.
 */
export async function pushRecord<T extends SyncableRecord>(
  path: string,
  record: T,
  logTag: string,
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  if (!record?.id) {
    console.warn(`${logTag} refusing to push a record with no stable id`);
    return false;
  }
  return serverConfirmedSetDoc(path, record.id, forWire(record), logTag);
}

/**
 * How many writes may fail BACK TO BACK before we conclude the backend is
 * unreachable/rejecting and stop flushing until the next trigger.
 */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Push every not-yet-synced record, oldest first, and return the ids confirmed
 * landed. Callers mark only the returned ids synced — anything else stays queued.
 *
 * Deliberately does NOT stop at the first failure (the obvious design, and what
 * TimeClockContext does). One record that rules permanently reject — a malformed
 * legacy row — would then be a poison pill: it fails forever, the loop breaks on
 * it every time, and every record behind it never syncs again. That is the exact
 * silent data-loss this module exists to prevent, so a single failure only skips
 * that record. We stop only after MAX_CONSECUTIVE_FAILURES, which is the honest
 * signal for "offline / backend down" rather than "this one row is bad".
 *
 * Order is therefore best-effort, not guaranteed. That is correct for the
 * independent, id-keyed records this module handles (a workout log does not
 * depend on the one before it). Do NOT reuse flushQueue for a dataset where
 * writes must land in order — that needs its own strictly-ordered flush.
 */
export async function flushQueue<T extends SyncableRecord>(
  path: string,
  records: readonly T[],
  logTag: string,
): Promise<Set<string>> {
  const confirmed = new Set<string>();
  if (!FIREBASE_CONFIGURED || !db) return confirmed;
  let consecutiveFailures = 0;
  for (const r of records) {
    if (r.synced) continue;
    const ok = await pushRecord(path, r, logTag).catch(() => false);
    if (ok) {
      confirmed.add(r.id);
      consecutiveFailures = 0;
      continue;
    }
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(`${logTag} ${consecutiveFailures} consecutive write failures — pausing flush until next trigger`);
      break;
    }
  }
  return confirmed;
}

/**
 * One-time bulk upload of records already sitting on this device.
 *
 * THIS IS THE POINT OF THE WHOLE MIGRATION: new write-through only protects data
 * created after the update. Everything a member logged BEFORE it is stranded
 * on-device and still dies with an app delete unless this runs.
 *
 * Batched for speed with a per-record fallback so one poisoned row (a rule
 * rejection on a malformed legacy record) can't abort an entire chunk and strand
 * the other 449. Returns the ids confirmed written.
 *
 * Every write is merge:true keyed by the record's existing id, so re-running on
 * a second device is a no-op rather than a duplicate.
 */
export async function migrateRecords<T extends SyncableRecord>(
  path: string,
  records: readonly T[],
  logTag: string,
): Promise<Set<string>> {
  const written = new Set<string>();
  if (!FIREBASE_CONFIGURED || !db || records.length === 0) return written;

  for (let i = 0; i < records.length; i += BATCH_CHUNK) {
    const chunk = records.slice(i, i + BATCH_CHUNK);
    try {
      const batch = writeBatch(db);
      for (const r of chunk) batch.set(doc(db, path, r.id), forWire(r), { merge: true });
      // commit() resolves only on backend ack (it hangs while offline rather
      // than resolving optimistically), so reaching here means the chunk landed.
      await batch.commit();
      chunk.forEach((r) => written.add(r.id));
    } catch (e) {
      // Chunk failed — retry the rows individually so one bad record doesn't
      // cost the other 449. Anything still failing stays unsynced and will be
      // retried by the normal flush on a later launch.
      console.warn(`${logTag} migrate chunk failed, falling back per-record:`, e);
      for (const r of chunk) {
        const ok = await pushRecord(path, r, logTag).catch(() => false);
        if (ok) written.add(r.id);
      }
    }
  }
  return written;
}

/**
 * Delete one record server-side. MUST accompany any local removal of a synced
 * record: a live listener re-adds anything still on the server, so a local-only
 * delete RESURRECTS the record on the next snapshot. A failed delete leaves the
 * server copy (self-correcting via the listener) rather than losing data.
 * Deliberately NOT queued — replaying a delete against a record the member later
 * re-created would destroy the new one.
 */
export async function deleteRecord(path: string, id: string, logTag: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !id) return false;
  try {
    await deleteDoc(doc(db, path, id));
    return true;
  } catch (e) {
    console.warn(`${logTag} delete failed (server copy remains):`, e);
    return false;
  }
}

/** Incremental snapshot delta for one collection. */
export interface CollectionDelta<T> {
  upserts: T[];
  removedIds: string[];
  /**
   * The COMPLETE server id set — emitted ONLY on the first snapshot. docChanges()
   * can't report a delete that happened while this device wasn't listening, so a
   * fresh listener needs the full set once to reconcile cross-device deletes.
   */
  allIds?: string[];
}

/**
 * Live-subscribe to a collection, emitting incremental deltas (docChanges) — never
 * whole-collection replacements, so an empty/partial snapshot can't wipe local
 * rows. Rows are tagged synced:true (they came from the server). `hydrate` maps a
 * raw doc payload + id into the record type.
 */
export function subscribeCollection<T extends SyncableRecord>(
  path: string,
  hydrate: (data: Record<string, unknown>, id: string) => T,
  onDelta: (d: CollectionDelta<T>) => void,
  logTag: string,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  // allIds (the full server id set, used to reconcile cross-device deletes) may
  // ONLY be taken from a SERVER-confirmed snapshot. The offline memory cache
  // raises an empty fromCache=true snapshot first; taking allIds from it would
  // drive reconcileDeletes to wipe every synced row from state AND blank the
  // on-disk cache on a routine offline launch. includeMetadataChanges ensures we
  // still receive the fromCache=false snapshot even when no doc changed, so the
  // reconcile happens as soon as the server actually answers.
  let serverSnapshotSeen = false;
  return onSnapshot(
    collection(db, path),
    { includeMetadataChanges: true },
    (snap) => {
      const upserts: T[] = [];
      const removedIds: string[] = [];
      snap.docChanges().forEach((c) => {
        if (c.type === 'removed') removedIds.push(c.doc.id);
        else upserts.push({ ...hydrate(c.doc.data() as Record<string, unknown>, c.doc.id), synced: true });
      });
      const delta: CollectionDelta<T> = { upserts, removedIds };
      if (!serverSnapshotSeen && !snap.metadata.fromCache) {
        serverSnapshotSeen = true;
        delta.allIds = snap.docs.map((d) => d.id);
      }
      if (upserts.length || removedIds.length || delta.allIds) onDelta(delta);
    },
    (e) => console.warn(`${logTag} listener error:`, e),
  );
}

/**
 * Reconcile a local list against the COMPLETE server id set (from a first
 * snapshot's allIds): drop any row that is this member's, already synced, and
 * absent from the server — it was deleted on another device. Un-synced rows
 * (pending uploads) and other members' rows are kept.
 */
export function reconcileDeletes<T extends SyncableRecord & { memberId?: string }>(
  local: readonly T[],
  serverIds: readonly string[],
  memberId: string,
): T[] {
  const server = new Set(serverIds);
  return local.filter((r) => r.memberId !== memberId || !r.synced || server.has(r.id));
}

/**
 * Merge incoming server records into a local list BY ID.
 *
 * Never replaces wholesale: an empty or partial snapshot must not be able to
 * wipe local rows (the failure nutritionSync's docChanges() hydration avoids).
 * Server state wins per record; local records the server hasn't seen are kept
 * so a not-yet-flushed row survives a hydrate.
 */
export function mergeById<T extends SyncableRecord>(
  local: readonly T[],
  upserts: readonly T[],
  removedIds: readonly string[] = [],
): T[] {
  const byId = new Map<string, T>();
  for (const r of local) byId.set(r.id, r);
  // Anything the server confirmed is, by definition, synced.
  for (const r of upserts) byId.set(r.id, { ...r, synced: true });
  for (const id of removedIds) byId.delete(id);
  return [...byId.values()];
}
