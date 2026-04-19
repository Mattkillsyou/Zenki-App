/**
 * Moderation: block users + report content.
 *
 * Firestore layout:
 *   - blocks/{uid}/blocked/{blockedUid}  → { blockedAt: ISO }
 *       (one subcollection per user listing whom they've blocked)
 *   - reports/{reportId}                  → { reporterId, targetType, targetId,
 *                                             targetUserId, reason, context, createdAt,
 *                                             status: 'open' }
 *
 * Required for Apple 1.2 (user-generated content safety).
 */

import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  collection, addDoc, deleteDoc, doc, setDoc, getDocs, getDoc,
  query, where, orderBy,
} from 'firebase/firestore';
import { getCurrentUid, getCurrentIdToken } from './firebaseAuth';
import { AI_FUNCTION_BASE_URL } from '../config/api';

// ─────────────────────────────────────────────
// Blocks
// ─────────────────────────────────────────────

/** Block another user. Idempotent. */
export async function blockUser(blockedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid || uid === blockedUid) return false;
  try {
    await setDoc(doc(db, 'blocks', uid, 'blocked', blockedUid), {
      blockedAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('[Moderation] blockUser failed:', e);
    return false;
  }
}

/** Unblock a user. */
export async function unblockUser(blockedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  try {
    await deleteDoc(doc(db, 'blocks', uid, 'blocked', blockedUid));
    return true;
  } catch (e) {
    console.warn('[Moderation] unblockUser failed:', e);
    return false;
  }
}

/** Fetch the set of UIDs this user has blocked. */
export async function getBlockedUserIds(): Promise<Set<string>> {
  if (!FIREBASE_CONFIGURED || !db) return new Set();
  const uid = getCurrentUid();
  if (!uid) return new Set();
  try {
    const snap = await getDocs(collection(db, 'blocks', uid, 'blocked'));
    return new Set(snap.docs.map((d) => d.id));
  } catch (e) {
    console.warn('[Moderation] getBlockedUserIds failed:', e);
    return new Set();
  }
}

/** Whether the current user has blocked {uid}. */
export async function isUserBlocked(blockedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'blocks', uid, 'blocked', blockedUid));
    return snap.exists();
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Reports
// ─────────────────────────────────────────────

export type ReportTargetType = 'post' | 'message' | 'user' | 'comment';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'hate_speech'
  | 'violence'
  | 'self_harm'
  | 'impersonation'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam or misleading',
  harassment: 'Harassment or bullying',
  inappropriate: 'Inappropriate or explicit content',
  hate_speech: 'Hate speech or discrimination',
  violence: 'Violence or threats',
  self_harm: 'Self-harm or eating disorder promotion',
  impersonation: 'Impersonation',
  other: 'Other',
};

export interface ReportInput {
  targetType: ReportTargetType;
  /** ID of the offending content (post id, message id, user id, comment id). */
  targetId: string;
  /** UID of the user who authored the content (so admins can act quickly). */
  targetUserId: string;
  reason: ReportReason;
  /** Optional freeform detail. */
  context?: string;
}

/**
 * File a report. Admins review via /reports (AdminReportsScreen).
 * Reports cannot be read by end users — only written.
 */
export async function submitReport(input: ReportInput): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  try {
    await addDoc(collection(db, 'reports'), {
      reporterId: uid,
      targetType: input.targetType,
      targetId: input.targetId,
      targetUserId: input.targetUserId,
      reason: input.reason,
      context: (input.context ?? '').slice(0, 500),
      status: 'open',
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (e) {
    console.warn('[Moderation] submitReport failed:', e);
    return false;
  }
}

// ─────────────────────────────────────────────
// Admin-side readers + actions
// ─────────────────────────────────────────────

export type ReportStatus = 'open' | 'dismissed' | 'actioned';

export interface Report extends ReportInput {
  id: string;
  reporterId: string;
  status: ReportStatus;
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

/**
 * Load all open reports sorted newest first. Requires the caller to pass the
 * Firestore /admins/{uid} rule check (see AdminReportsScreen).
 */
export async function listOpenReports(): Promise<Report[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];
  try {
    const q = query(
      collection(db, 'reports'),
      where('status', '==', 'open'),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Report[];
  } catch (e) {
    console.warn('[Moderation] listOpenReports failed:', e);
    return [];
  }
}

/**
 * Admin-only action on a report. Calls the `adminActionReport` Cloud Function
 * so content deletion happens via the Admin SDK (bypassing Firestore rules).
 *
 *   'dismiss'         — just mark the report resolved, leave content
 *   'removeAndBlock'  — delete target content + block target user from reporter
 */
export async function adminActionReport(
  reportId: string,
  action: 'dismiss' | 'removeAndBlock',
): Promise<{ ok: boolean; error?: string }> {
  if (!FIREBASE_CONFIGURED) return { ok: false, error: 'firebase-unavailable' };
  const token = await getCurrentIdToken();
  if (!token) return { ok: false, error: 'no-auth' };
  try {
    const res = await fetch(`${AI_FUNCTION_BASE_URL}/adminActionReport`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ reportId, action }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'unknown' };
  }
}

/**
 * Fast count of open reports — used to decorate the admin dashboard badge.
 * Returns 0 if the user isn't actually an admin (rule-denied read).
 */
export async function countOpenReports(): Promise<number> {
  const list = await listOpenReports();
  return list.length;
}
