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

// ── Writes — single records (called by NutritionContext mutators) ──

export async function upsertWeightEntry(uid: string, entry: WeightEntry): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return false;
  try {
    await setDoc(doc(db, ROOT, uid, WEIGHT_SUB, entry.id), stripUndefined({ ...entry }), { merge: true });
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
    await setDoc(doc(db, ROOT, uid, MACRO_SUB, entry.id), stripUndefined({ ...entry }), { merge: true });
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
    ops.push({ ref: doc(database, ROOT, uid, WEIGHT_SUB, w.id), data: stripUndefined({ ...w }) });
  }
  for (const m of records.macros) {
    ops.push({ ref: doc(database, ROOT, uid, MACRO_SUB, m.id), data: stripUndefined({ ...m }) });
  }
  if (records.goals) {
    ops.push({ ref: doc(database, ROOT, uid, GOALS_SUB, SINGLETON_ID), data: stripUndefined({ ...records.goals }) });
  }
  if (records.profile) {
    ops.push({ ref: doc(database, ROOT, uid, PROFILE_SUB, SINGLETON_ID), data: stripUndefined({ ...records.profile }) });
  }

  try {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = writeBatch(database);
      for (const op of ops.slice(i, i + BATCH_LIMIT)) {
        batch.set(op.ref, op.data, { merge: true });
      }
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.warn(`${TAG} migrate failed:`, err);
    return false;
  }
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
