import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
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

export function subscribeToTasks(cb: (tasks: EmployeeTask[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    return onSnapshot(
      collection(db, 'employeeTasks'),
      (snap) => {
        const items: EmployeeTask[] = snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<EmployeeTask, 'id'>) }),
        );
        items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        cb(items);
      },
      (err) => console.warn('[Tasks Firestore] Subscribe failed:', err),
    );
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

export function subscribeToCompletions(cb: (cs: TaskCompletion[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) return noopUnsubscribe;
  try {
    return onSnapshot(
      collection(db, 'taskCompletions'),
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
