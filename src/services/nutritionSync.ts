import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, stripUndefined } from './firestoreUtils';
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

// ── Writes — single records (called by NutritionContext mutators) ──

export async function upsertWeightEntry(uid: string, entry: WeightEntry): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  try {
    await setDoc(doc(db, ROOT, uid, WEIGHT_SUB, entry.id), stripUndefined({ ...sanitizeWeightEntry(entry) }), { merge: true });
    return true;
  } catch (err) {
    console.warn(`${TAG} upsertWeightEntry failed:`, err);
    return false;
  }
}

export async function deleteWeightEntry(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
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
  try {
    await setDoc(doc(db, ROOT, uid, MACRO_SUB, entry.id), stripUndefined({ ...sanitizeMacroEntry(entry) }), { merge: true });
    return true;
  } catch (err) {
    console.warn(`${TAG} upsertMacroEntry failed:`, err);
    return false;
  }
}

export async function deleteMacroEntry(uid: string, id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
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
  try {
    await setDoc(doc(db, ROOT, uid, GOALS_SUB, SINGLETON_ID), stripUndefined({ ...goals }), { merge: true });
    return true;
  } catch (err) {
    console.warn(`${TAG} setMacroGoals failed:`, err);
    return false;
  }
}

export async function setNutritionProfile(uid: string, profile: NutritionProfile): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  try {
    await setDoc(doc(db, ROOT, uid, PROFILE_SUB, SINGLETON_ID), stripUndefined({ ...profile }), { merge: true });
    return true;
  } catch (err) {
    console.warn(`${TAG} setNutritionProfile failed:`, err);
    return false;
  }
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
