import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, stripUndefined, serverConfirmedSetDoc } from './firestoreUtils';
import { safeStorageGetJSON } from '../utils/safeStorage';
import {
  WeightEntry,
  MacroEntry,
  MacroGoals,
  NutritionProfile,
} from '../types/nutrition';

// ─────────────────────────────────────────────────────────────
// Nutrition Firestore sync — weight log, macro/food log, macro goals,
// BMR/TDEE profile.
//
// Everything is partitioned by Firebase Auth uid in the PATH
// (/nutrition/{uid}/…), NOT by the app's internal memberId — so security
// rules are a plain isOwner(uid) check and the server (Admin SDK) can write
// the same paths using the uid from a verified ID token. The on-device
// NutritionContext stamps memberId onto each record for its in-memory
// filters, but memberId is denormalized only; the path uid is authoritative.
//
// See NUTRITION_FIRESTORE_SCHEMA.md for the full contract.
// ─────────────────────────────────────────────────────────────

const ROOT = 'nutrition';
const WEIGHT_SUB = 'weightEntries';
const MACRO_SUB = 'macroEntries';
const GOALS_SUB = 'macroGoals';
const PROFILE_SUB = 'nutritionProfile';
/** Fixed doc id for the two singletons (goals + profile) — keeps upserts idempotent. */
const SINGLETON_ID = 'current';

/** Current on-disk schema version; bumped if the doc shapes change. */
export const NUTRITION_SCHEMA_VERSION = 1;

const TAG = '[Nutrition Firestore]';

/** The full nutrition state for one user, assembled from the live listeners. */
export interface NutritionSnapshot {
  weights: WeightEntry[];
  macros: MacroEntry[];
  goals: MacroGoals | null;
  profile: NutritionProfile | null;
}

/**
 * Incremental update from the live listeners. The time-series subcollections
 * report per-doc CHANGES (added/modified → `upserts`, removed → `removedIds`)
 * rather than the full set, so the consumer can merge BY ID and never wipe
 * local rows that simply aren't represented in an empty/offline snapshot. The
 * singletons report their whole value (or null when the doc is absent). A given
 * callback invocation carries only the slice(s) that changed.
 */
export interface NutritionDelta {
  weights?: { upserts: WeightEntry[]; removedIds: string[] };
  macros?: { upserts: MacroEntry[]; removedIds: string[] };
  goals?: MacroGoals | null;
  profile?: NutritionProfile | null;
}


// ── Audit 2.0.5: rule-bound sanitizers ──────────────────────────────────
// firestore.rules validates /nutrition writes (calories < 20000, macros
// < 5000, weight 0..2000). Out-of-range local values used to be written
// as-is, rejected server-side, warn-swallowed — the entry existed locally
// and silently NEVER synced (other devices + Senpai diverged forever).
// Clamp to the rule bounds at the write boundary and say so in the log.
function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(Math.max(n, min), max);
}
export function sanitizeWeightEntry(e: WeightEntry): WeightEntry {
  const weight = clampNum(e.weight, 0.1, 1999.9, 0.1);
  if (weight !== e.weight) console.warn(`${TAG} weight clamped to rule bounds:`, e.weight, '->', weight);
  return { ...e, weight, unit: e.unit === 'kg' ? 'kg' : 'lb' };
}
export function sanitizeMacroEntry(e: MacroEntry): MacroEntry {
  const out = {
    ...e,
    name: typeof e.name === 'string' && e.name.trim() ? e.name : 'Food',
    calories: clampNum(e.calories, 0, 19999, 0),
    protein: clampNum(e.protein, 0, 4999, 0),
    carbs: clampNum(e.carbs, 0, 4999, 0),
    fat: clampNum(e.fat, 0, 4999, 0),
  };
  if (out.calories !== e.calories || out.protein !== e.protein || out.carbs !== e.carbs || out.fat !== e.fat) {
    console.warn(`${TAG} macro entry clamped to rule bounds:`, e.id);
  }
  return out;
}
function sanitizeGoals<T extends { calories?: number; protein?: number; carbs?: number; fat?: number }>(g: T): T {
  return {
    ...g,
    calories: clampNum(g.calories, 0, 19999, 2200),
    protein: clampNum(g.protein, 0, 4999, 160),
    carbs: clampNum(g.carbs, 0, 4999, 220),
    fat: clampNum(g.fat, 0, 4999, 70),
  };
}

// ── Durable retry queue ───────────────────────────────────────────────────
//
// NutritionContext calls the mutators below fire-and-forget — `if (uid)
// upsertWeightEntry(uid, full);`, unawaited, boolean discarded. Combined with the
// run-once `@zenki_nutrition_migrated_v1:{uid}` flag (set once, never
// re-examined), a write that failed AFTER migration was never retried and never
// re-uploaded: that weigh-in existed only on that phone, forever, and died with
// the app. Nutrition was the LEAST durable sync path despite being the newest.
//
// Rather than restructure the 700-line context, the durability lives here: a
// failed write parks the record in a device-local queue that is flushed on the
// next launch / auth change. The queue stores the RECORD BODY, not just an id —
// so it cannot drift away from a separate history list, and cannot be defeated
// by a cap the way orderSync's id-list queue was.
//
// Idempotent: every entry replays through the same id-keyed merge:true write.

const PENDING_KEY = '@zenki_nutrition_pending_v1';
/**
 * Backstop only. Ops are keyed by record (opKey), so the queue is bounded by the
 * number of DISTINCT unsynced records, not by write count — it can only get here
 * after months offline. Trimming evicts the OLDEST unsynced records, i.e. real
 * data loss (the same cap-evicts-unsynced bug orderSync was just fixed for), so
 * it is set high and shouts when it ever bites.
 */
const PENDING_CAP = 2000;

type PendingOp =
  | { kind: 'weight'; uid: string; record: WeightEntry }
  | { kind: 'macro'; uid: string; record: MacroEntry }
  | { kind: 'goals'; uid: string; record: MacroGoals }
  | { kind: 'profile'; uid: string; record: NutritionProfile };

/** Identity of an op — replacing by key keeps only the newest state per record. */
const opKey = (op: PendingOp) =>
  `${op.kind}:${op.uid}:${'id' in (op.record as any) ? (op.record as any).id : SINGLETON_ID}`;

async function readPending(): Promise<PendingOp[]> {
  return safeStorageGetJSON<PendingOp[]>(PENDING_KEY, [], (v) => Array.isArray(v));
}

async function writePending(ops: PendingOp[]): Promise<void> {
  if (ops.length > PENDING_CAP) {
    console.warn(
      `${TAG} pending queue exceeded ${PENDING_CAP} — dropping the ${ops.length - PENDING_CAP} OLDEST ` +
      `unsynced record(s). These never reached the server and are now local-only.`,
    );
  }
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(ops.slice(-PENDING_CAP))).catch(() => {});
}

/**
 * Serialises every queue mutation. queuePending/clearPending/flush all do a
 * read-modify-write of one AsyncStorage key; interleaving them loses ops (a
 * concurrent writer's snapshot is stale by the time it writes back).
 */
let queueLock: Promise<unknown> = Promise.resolve();
function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueLock.then(fn, fn);
  queueLock = next.catch(() => {});
  return next;
}

/** Park a write for retry, replacing any earlier op for the same record. */
async function queuePending(op: PendingOp): Promise<void> {
  try {
    await withQueueLock(async () => {
      const existing = await readPending();
      const k = opKey(op);
      await writePending([...existing.filter((o) => opKey(o) !== k), op]);
    });
  } catch {
    /* queue bookkeeping is best-effort; the local record still stands */
  }
}

async function clearPending(op: PendingOp): Promise<void> {
  try {
    await withQueueLock(async () => {
      const existing = await readPending();
      const k = opKey(op);
      const next = existing.filter((o) => opKey(o) !== k);
      if (next.length !== existing.length) await writePending(next);
    });
  } catch { /* best-effort */ }
}

/**
 * Drop any queued op for a record the member has since DELETED. Without this a
 * queued upsert replays after the delete and resurrects the record.
 */
async function clearPendingById(kind: PendingOp['kind'], uid: string, id: string): Promise<void> {
  try {
    await withQueueLock(async () => {
      const existing = await readPending();
      const k = `${kind}:${uid}:${id}`;
      const next = existing.filter((o) => opKey(o) !== k);
      if (next.length !== existing.length) await writePending(next);
    });
  } catch { /* best-effort */ }
}

/**
 * Replay every queued nutrition write. Safe to call repeatedly; call on app
 * launch (post-hydrate) and on auth change, like flushUnsyncedOrders.
 *
 * Does NOT stop at the first failure: one permanently rule-rejected legacy
 * record would otherwise be a poison pill blocking every write behind it. Ops
 * that fail stay queued; ops that land are cleared.
 */
export async function flushPendingNutrition(): Promise<number> {
  if (!FIREBASE_CONFIGURED || !db) return 0;
  const ops = await readPending();
  if (ops.length === 0) return 0;
  let landed = 0;
  for (const op of ops) {
    // replayOp routes back through writeConfirmed, which owns the queue for this
    // op (clearPending on success, already-queued otherwise). Deliberately does
    // NOT write a `survivors` snapshot back at the end: that snapshot is taken
    // before a long await loop, so it would erase any op the member queued
    // DURING the flush — dropping a brand-new weigh-in permanently.
    const ok = await replayOp(op).catch(() => false);
    if (ok) landed += 1;
  }
  if (landed) console.log(`${TAG} flushed ${landed} queued write(s)`);
  return landed;
}

function replayOp(op: PendingOp): Promise<boolean> {
  switch (op.kind) {
    case 'weight': return upsertWeightEntry(op.uid, op.record);
    case 'macro': return upsertMacroEntry(op.uid, op.record);
    case 'goals': return setMacroGoals(op.uid, op.record);
    case 'profile': return setNutritionProfile(op.uid, op.record);
    default: return Promise.resolve(true);
  }
}

/**
 * Write one nutrition doc, server-confirmed, durably queued.
 *
 * QUEUE BEFORE THE WRITE, CLEAR ONLY ON CONFIRMED SUCCESS. This ordering is the
 * whole point and is easy to get backwards — an earlier version of this function
 * queued only AFTER the write returned false, which meant it could never capture
 * the one case the queue exists for: an OFFLINE write hangs and never returns,
 * so control never reached the queueing branch, and a process death (swipe-away,
 * iOS reclaim) lost the record with no trace and no retry. Queueing first costs
 * one AsyncStorage write and makes the record durable across process death.
 * queuePending is idempotent by opKey, so re-queueing the same record is a no-op.
 */
async function writeConfirmed(pathSegs: [string, string, string, string], op: PendingOp): Promise<boolean> {
  const [root, uid, sub, id] = pathSegs;
  await queuePending(op);
  const ok = await serverConfirmedSetDoc(
    `${root}/${uid}/${sub}`,
    id,
    stripUndefined({ ...(op.record as unknown as Record<string, unknown>) }),
    TAG,
  );
  if (ok) await clearPending(op);
  return ok;
}

// ── Writes — single records (called by NutritionContext mutators) ──

export async function upsertWeightEntry(uid: string, entry: WeightEntry): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  const record = sanitizeWeightEntry(entry);
  return writeConfirmed([ROOT, uid, WEIGHT_SUB, entry.id], { kind: 'weight', uid, record });
}

export async function deleteWeightEntry(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  // Drop any queued upsert for this record FIRST — otherwise the next flush
  // replays it and resurrects the entry the member just deleted.
  await clearPendingById('weight', uid, id);
  try {
    await deleteDoc(doc(db, ROOT, uid, WEIGHT_SUB, id));
    return true;
  } catch (err) {
    console.warn(`${TAG} deleteWeightEntry failed:`, err);
    return false;
  }
}

export async function upsertMacroEntry(uid: string, entry: MacroEntry): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  const record = sanitizeMacroEntry(entry);
  return writeConfirmed([ROOT, uid, MACRO_SUB, entry.id], { kind: 'macro', uid, record });
}

export async function deleteMacroEntry(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  // See deleteWeightEntry — clear the queued upsert or the flush resurrects it.
  await clearPendingById('macro', uid, id);
  try {
    await deleteDoc(doc(db, ROOT, uid, MACRO_SUB, id));
    return true;
  } catch (err) {
    console.warn(`${TAG} deleteMacroEntry failed:`, err);
    return false;
  }
}

export async function setMacroGoals(uid: string, goals: MacroGoals): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  return writeConfirmed([ROOT, uid, GOALS_SUB, SINGLETON_ID], { kind: 'goals', uid, record: goals });
}

export async function setNutritionProfile(uid: string, profile: NutritionProfile): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  return writeConfirmed([ROOT, uid, PROFILE_SUB, SINGLETON_ID], { kind: 'profile', uid, record: profile });
}

/** Write the container doc — a one-read "has this user set up nutrition" marker + migration stamp. */
export async function writeNutritionMeta(
  uid: string,
  meta: { memberId: string; migratedAt?: string },
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  try {
    await setDoc(
      doc(db, ROOT, uid),
      stripUndefined({ uid, schemaVersion: NUTRITION_SCHEMA_VERSION, ...meta }),
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn(`${TAG} writeNutritionMeta failed:`, err);
    return false;
  }
}

// ── One-time migration — legacy AsyncStorage → Firestore ──

/** Firestore caps a batch at 500 writes; stay comfortably under. */
const BATCH_LIMIT = 450;

/**
 * Idempotently push a user's existing (AsyncStorage) nutrition data up to
 * Firestore. Every entry is written by its existing id with merge:true, so
 * re-running is safe and never duplicates. The caller passes records already
 * filtered to the signed-in user and is responsible for the run-once guard.
 *
 * Returns true only if every batch committed.
 */
export async function migrateNutritionToFirestore(
  uid: string,
  records: NutritionSnapshot,
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  const database = db;

  // Flatten every write into (ref, data) pairs, then commit in <=450 chunks.
  const ops: { ref: ReturnType<typeof doc>; data: Record<string, unknown> }[] = [];
  for (const w of records.weights) {
    ops.push({ ref: doc(database, ROOT, uid, WEIGHT_SUB, w.id), data: stripUndefined({ ...sanitizeWeightEntry(w) }) });
  }
  for (const m of records.macros) {
    ops.push({ ref: doc(database, ROOT, uid, MACRO_SUB, m.id), data: stripUndefined({ ...sanitizeMacroEntry(m) }) });
  }
  if (records.goals) {
    ops.push({ ref: doc(database, ROOT, uid, GOALS_SUB, SINGLETON_ID), data: stripUndefined({ ...sanitizeGoals(records.goals) }) });
  }
  if (records.profile) {
    ops.push({ ref: doc(database, ROOT, uid, PROFILE_SUB, SINGLETON_ID), data: stripUndefined({ ...records.profile }) });
  }

  // Audit 2.0.5: batches are ATOMIC — one rule-rejected legacy row used to
  // poison its whole 450-write chunk, the migrated flag never set, and the
  // migration re-ran and re-failed every launch forever. On a failed chunk,
  // fall back to per-doc writes and SKIP (loudly) only the poisoned rows —
  // same strategy memberSync's backfill uses. Sanitizers above make genuine
  // rejections rare; this is the backstop.
  let skipped = 0;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    try {
      const batch = writeBatch(database);
      for (const op of chunk) batch.set(op.ref, op.data, { merge: true });
      await batch.commit();
    } catch (batchErr) {
      console.warn(`${TAG} migrate chunk failed — retrying per-doc:`, batchErr);
      for (const op of chunk) {
        try {
          await setDoc(op.ref, op.data, { merge: true });
        } catch (docErr) {
          skipped++;
          console.warn(`${TAG} migrate: skipping poisoned row`, op.ref.path, docErr);
        }
      }
    }
  }
  if (skipped > 0) console.warn(`${TAG} migrate completed with ${skipped} skipped row(s)`);
  return true;
}

// ── Live subscription — Firestore is the source of truth when signed in ──

/**
 * Subscribe to a user's full nutrition subtree (two time-series subcollections
 * + two singleton docs) and emit incremental deltas as each part changes.
 *
 * The time-series listeners report per-doc CHANGES via `docChanges()`:
 *   - added / modified → `upserts`
 *   - removed          → `removedIds`
 * so the consumer merges BY ID. This is the key safety property: an empty or
 * offline first snapshot yields ZERO changes, so it can never wipe rows the
 * consumer loaded from its offline cache (the wholesale-replace approach did).
 * Real deletes (from another device / a server tool) still arrive as `removed`.
 *
 * Singletons emit their whole value (or null when absent). Queries carry no
 * orderBy/where, so NO composite index is required — the consumer sorts in
 * memory (a single user's data is small and bounded).
 */
export function subscribeNutrition(uid: string, cb: (delta: NutritionDelta) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;
  const database = db;

  const unsubs: Unsubscribe[] = [];
  try {
    unsubs.push(
      onSnapshot(
        collection(database, ROOT, uid, WEIGHT_SUB),
        (snap) => {
          const upserts: WeightEntry[] = [];
          const removedIds: string[] = [];
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') removedIds.push(ch.doc.id);
            else upserts.push(ch.doc.data() as WeightEntry);
          });
          cb({ weights: { upserts, removedIds } });
        },
        (err) => console.warn(`${TAG} weight subscribe failed:`, err),
      ),
    );
    unsubs.push(
      onSnapshot(
        collection(database, ROOT, uid, MACRO_SUB),
        (snap) => {
          const upserts: MacroEntry[] = [];
          const removedIds: string[] = [];
          snap.docChanges().forEach((ch) => {
            if (ch.type === 'removed') removedIds.push(ch.doc.id);
            else upserts.push(ch.doc.data() as MacroEntry);
          });
          cb({ macros: { upserts, removedIds } });
        },
        (err) => console.warn(`${TAG} macro subscribe failed:`, err),
      ),
    );
    unsubs.push(
      onSnapshot(
        doc(database, ROOT, uid, GOALS_SUB, SINGLETON_ID),
        (snap) => cb({ goals: snap.exists() ? (snap.data() as MacroGoals) : null }),
        (err) => console.warn(`${TAG} goals subscribe failed:`, err),
      ),
    );
    unsubs.push(
      onSnapshot(
        doc(database, ROOT, uid, PROFILE_SUB, SINGLETON_ID),
        (snap) => cb({ profile: snap.exists() ? (snap.data() as NutritionProfile) : null }),
        (err) => console.warn(`${TAG} profile subscribe failed:`, err),
      ),
    );
  } catch (err) {
    console.warn(`${TAG} subscribe init failed:`, err);
    return () => { unsubs.forEach((u) => u()); };
  }

  return () => { unsubs.forEach((u) => u()); };
}
