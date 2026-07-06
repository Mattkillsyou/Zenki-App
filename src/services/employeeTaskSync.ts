import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Query,
  QuerySnapshot,
  DocumentData,
  Unsubscribe,
} from 'firebase/firestore';
import { auth, db, FIREBASE_CONFIGURED } from '../config/firebase';
import type { EmployeeTask, TaskCompletion } from '../types/employeeTask';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';

// ── Tasks ──────────────────────────────────────────────────────────

export async function upsertTaskInFirestore(task: EmployeeTask): Promise<boolean> {
  const { id, ...rest } = task;
  // Stamp Firebase Auth uid for personal tasks so members can write their
  // own — `ownerMemberId` is an app-internal id, not the auth uid.
  const firebaseUid = auth?.currentUser?.uid;
  const payload = firebaseUid ? { ...rest, firebaseUid } : rest;
  return serverConfirmedSetDoc(
    'employeeTasks',
    id,
    stripUndefined(payload),
    '[Tasks Firestore]',
  );
}

export async function deleteTaskFromFirestore(id: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'employeeTasks', id));
    return true;
  } catch (err) {
    console.warn('[Tasks Firestore] Delete failed:', err);
    return false;
  }
}

export function subscribeToTasks(
  isAdmin: boolean,
  authUid: string | null,
  cb: (tasks: EmployeeTask[]) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    // Personal tasks are owner-scoped in firestore.rules (their free text is
    // private), so a whole-collection listen is permission-denied for
    // non-admins — rules are not filters. Admins stream everything; everyone
    // else gets two rule-provable queries (shared default/assigned tasks +
    // their OWN personal tasks) merged into one callback. Mirrors
    // subscribeToCompletions below.
    //
    // `authUid` is passed in from context STATE (fed by onAuthStateChanged)
    // rather than sampled from auth.currentUser here: Firebase restores the
    // session asynchronously, so a cold-start sample would be null and the
    // personal listener would silently never attach for the whole session —
    // the shared-only snapshot would then overwrite the cache and the
    // employee's personal to-dos would vanish (same race AppointmentContext /
    // NutritionContext document).
    const col = collection(db, 'employeeTasks');
    const mapDocs = (snap: QuerySnapshot<DocumentData>): EmployeeTask[] =>
      snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<EmployeeTask, 'id'>) }));
    const emitSorted = (items: EmployeeTask[]) => {
      items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      cb(items);
    };
    if (isAdmin) {
      return onSnapshot(
        col,
        (snap) => emitSorted(mapDocs(snap)),
        (err) => console.warn('[Tasks Firestore] Subscribe failed:', err),
      );
    }
    let sharedTasks: EmployeeTask[] = [];
    let personalTasks: EmployeeTask[] = [];
    const emit = () => emitSorted([...sharedTasks, ...personalTasks]);
    const unsubShared = onSnapshot(
      query(col, where('source', 'in', ['default', 'assigned'])),
      (snap) => {
        sharedTasks = mapDocs(snap);
        emit();
      },
      (err) => console.warn('[Tasks Firestore] Shared subscribe failed:', err),
    );
    let unsubPersonal: Unsubscribe = noopUnsubscribe;
    if (authUid) {
      unsubPersonal = onSnapshot(
        query(col, where('source', '==', 'personal'), where('firebaseUid', '==', authUid)),
        (snap) => {
          personalTasks = mapDocs(snap);
          emit();
        },
        (err) => console.warn('[Tasks Firestore] Personal subscribe failed:', err),
      );
    }
    return () => {
      unsubShared();
      unsubPersonal();
    };
  } catch (err) {
    console.warn('[Tasks Firestore] Subscribe init failed:', err);
    return noopUnsubscribe;
  }
}

// ── Completions ────────────────────────────────────────────────────
// Keyed by taskId_memberId_date so re-marking the same day is idempotent.

export function completionId(c: Pick<TaskCompletion, 'taskId' | 'memberId' | 'date'>): string {
  return `${c.taskId}_${c.memberId}_${c.date}`;
}

export async function upsertCompletionInFirestore(c: TaskCompletion): Promise<boolean> {
  const firebaseUid = auth?.currentUser?.uid;
  const payload = firebaseUid ? { ...c, firebaseUid } : c;
  return serverConfirmedSetDoc(
    'taskCompletions',
    completionId(c),
    payload,
    '[Completions Firestore]',
  );
}

export async function deleteCompletionFromFirestore(
  c: Pick<TaskCompletion, 'taskId' | 'memberId' | 'date'>,
): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'taskCompletions', completionId(c)));
    return true;
  } catch (err) {
    console.warn('[Completions Firestore] Delete failed:', err);
    return false;
  }
}

export function subscribeToCompletions(
  isAdmin: boolean,
  authUid: string | null,
  cb: (cs: TaskCompletion[]) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    // taskCompletions are owner-scoped (each carries firebaseUid). Admins read
    // the whole collection (the admin task view needs every member's records);
    // a regular member reads only their own — matching the security rule, which
    // would permission-deny an unfiltered collection read for non-admins.
    // `authUid` comes from context state (see subscribeToTasks above) so the
    // listener attaches once the async session restore settles.
    const col = collection(db, 'taskCompletions');
    let q: Query<DocumentData> = col;
    if (!isAdmin) {
      if (!authUid) return noopUnsubscribe; // signed out → nothing to read
      q = query(col, where('firebaseUid', '==', authUid));
    }
    return onSnapshot(
      q,
      (snap) => {
        const items: TaskCompletion[] = snap.docs.map((d) => d.data() as TaskCompletion);
        cb(items);
      },
      (err) => console.warn('[Completions Firestore] Subscribe failed:', err),
    );
  } catch (err) {
    console.warn('[Completions Firestore] Subscribe init failed:', err);
    return noopUnsubscribe;
  }
}
