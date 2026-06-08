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
// Cloud Function helpers (Admin-SDK power: cascade delete, ban)
// ─────────────────────────────────────────────

/** POST to a Cloud Function with the caller's Firebase ID token. */
async function callFunction(name: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; data?: any }> {
  const token = await getCurrentIdToken();
  if (!token) return { ok: false, error: 'not-signed-in' };
  try {
    const res = await fetch(`${AI_FUNCTION_BASE_URL}/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error || `http-${res.status}` };
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'network-error' };
  }
}

/**
 * Delete a post WITH its likes/comments subcollections and Storage media via
 * the deletePostCascade Cloud Function. Firestore doesn't cascade subcollections
 * and a client can't delete other users' like/comment docs, so this must run
 * server-side. Used by both the author's own delete and admin moderation.
 */
export async function deletePostCascadeViaFunction(postId: string): Promise<{ ok: boolean; error?: string }> {
  return callFunction('deletePostCascade', { postId });
}

/**
 * Ban (eject) a user — admin only. Disables their Firebase Auth account so
 * they can no longer sign in or mint tokens, and flags users/{uid}.banned.
 * Required for Apple 1.2 "eject offending users".
 */
export async function banUserViaFunction(targetUid: string): Promise<{ ok: boolean; error?: string }> {
  return callFunction('banUser', { targetUid });
}

/**
 * Redact an offender's messages in a reported conversation (DM "Remove & Block").
 * A client can't redact another user's messages (rules forbid it), so this runs
 * server-side with the Admin SDK.
 */
export async function redactDmMessagesViaFunction(conversationId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  return callFunction('redactDmMessages', { conversationId, targetUserId });
}

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

/** Fetch the set of UIDs who have blocked the current user, from the /blockedBy
 *  mirror maintained server-side by the blockMirror Cloud Function. Lets the
 *  client hide the blocker bidirectionally (feed/search/profile/inbox). Returns
 *  an empty set if the mirror isn't populated yet (pre-backfill) or the read
 *  fails — block then degrades to one-directional, never errors the UI. */
export async function getUsersWhoBlockedMe(): Promise<Set<string>> {
  if (!FIREBASE_CONFIGURED || !db) return new Set();
  const uid = getCurrentUid();
  if (!uid) return new Set();
  try {
    const snap = await getDocs(collection(db, 'blockedBy', uid, 'by'));
    return new Set(snap.docs.map((d) => d.id));
  } catch (e) {
    console.warn('[Moderation] getUsersWhoBlockedMe failed:', e);
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
// Mutes — soft-hide a user's content from your feed/comments without blocking.
// Lighter than block: the muted user is never notified and can still interact;
// you simply stop seeing them. Stored at /mutes/{uid}/muted/{mutedUid}.
// ─────────────────────────────────────────────

/** Mute another user. Idempotent. */
export async function muteUser(mutedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid || uid === mutedUid) return false;
  try {
    await setDoc(doc(db, 'mutes', uid, 'muted', mutedUid), { mutedAt: new Date().toISOString() });
    return true;
  } catch (e) {
    console.warn('[Moderation] muteUser failed:', e);
    return false;
  }
}

/** Unmute a user. */
export async function unmuteUser(mutedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  try {
    await deleteDoc(doc(db, 'mutes', uid, 'muted', mutedUid));
    return true;
  } catch (e) {
    console.warn('[Moderation] unmuteUser failed:', e);
    return false;
  }
}

/** Fetch the set of UIDs this user has muted. */
export async function getMutedUserIds(): Promise<Set<string>> {
  if (!FIREBASE_CONFIGURED || !db) return new Set();
  const uid = getCurrentUid();
  if (!uid) return new Set();
  try {
    const snap = await getDocs(collection(db, 'mutes', uid, 'muted'));
    return new Set(snap.docs.map((d) => d.id));
  } catch (e) {
    console.warn('[Moderation] getMutedUserIds failed:', e);
    return new Set();
  }
}

/** Whether the current user has muted {uid}. */
export async function isUserMuted(mutedUid: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, 'mutes', uid, 'muted', mutedUid));
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
  /**
   * For a `comment` report, the parent post id — so an admin can delete
   * posts/{parentId}/comments/{targetId}. For a `message` report, the
   * conversation id. Ignored for post/user targets.
   */
  parentId?: string;
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
      // Only include parentId when present — Firestore rejects `undefined`.
      ...(input.parentId ? { parentId: input.parentId } : {}),
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
 * Admin-only action on a report. Runs entirely client-side against Firestore
 * — the deployed firestore.rules grant admins (members of /admins/{uid})
 * the privileges needed to update the report, delete the target content,
 * and add a block on behalf of the reporter.
 *
 *   'dismiss'         — mark the report resolved, leave content untouched
 *   'removeAndBlock'  — delete target content (when supported), auto-block
 *                       the offender for the reporter, mark report actioned
 *
 * Per-target behavior:
 *   - 'post'    : deleted WITH its likes/comments subcollections + Storage media
 *                 via the deletePostCascade Cloud Function.
 *   - 'comment' : deleted at posts/{parentId}/comments/{targetId} (the report
 *                 carries parentId). Admins have delete rights via the rule.
 *   - 'message' : left in place here; the block + status flip is the action.
 *                 (Server-side redaction needs a structured conversation id.)
 *   - 'user'    : nothing to delete; the block is the action. To fully eject a
 *                 user, use the Ban action (banUserViaFunction).
 */
export async function adminActionReport(
  reportId: string,
  action: 'dismiss' | 'removeAndBlock',
): Promise<{ ok: boolean; error?: string }> {
  if (!FIREBASE_CONFIGURED || !db) return { ok: false, error: 'firebase-unavailable' };
  const adminUid = getCurrentUid();
  if (!adminUid) return { ok: false, error: 'no-auth' };

  try {
    const reportRef = doc(db, 'reports', reportId);
    const reportSnap = await getDoc(reportRef);
    if (!reportSnap.exists()) return { ok: false, error: 'report-not-found' };
    const r = reportSnap.data() as Report;

    if (action === 'dismiss') {
      await setDoc(
        reportRef,
        { status: 'dismissed', resolvedBy: adminUid, resolvedAt: new Date().toISOString() },
        { merge: true },
      );
      return { ok: true };
    }

    // 'removeAndBlock' — delete the target content + always block + mark actioned.
    let deleteWarning: string | undefined;
    if (r.targetType === 'post' && r.targetId) {
      // Cascade via Cloud Function so the post's likes/comments subcollections
      // and Storage media are removed too (not just the top-level doc).
      const res = await deletePostCascadeViaFunction(r.targetId);
      if (!res.ok) {
        deleteWarning = `Couldn't delete post (${res.error ?? 'unknown'}); offender still blocked.`;
        console.warn('[Moderation] post cascade delete failed:', res.error);
      }
    } else if (r.targetType === 'comment' && r.targetId && r.parentId) {
      // Real comments live at posts/{parentId}/comments/{commentId}; the report
      // now carries parentId so we can actually remove it (admins have delete
      // rights via the comment rule).
      try {
        await deleteDoc(doc(db, 'posts', r.parentId, 'comments', r.targetId));
      } catch (e: any) {
        deleteWarning = `Couldn't delete comment (${e?.code ?? 'unknown'}); offender still blocked.`;
        console.warn('[Moderation] comment delete failed:', e);
      }
    } else if (r.targetType === 'message' && r.targetId) {
      // DM report is thread-level: targetId is the conversationId, targetUserId
      // the offender. Redact their messages in that conversation via Cloud
      // Function (a client can't redact another user's messages).
      const res = await redactDmMessagesViaFunction(r.targetId, r.targetUserId);
      if (!res.ok) {
        deleteWarning = `Couldn't redact messages (${res.error ?? 'unknown'}); offender still blocked.`;
        console.warn('[Moderation] DM redaction failed:', res.error);
      }
    }
    // 'user' targets have no content to delete — the block + status flip is the
    // action; use Ban to eject the user entirely.

    let blockWarning: string | undefined;
    if (r.reporterId && r.targetUserId && r.reporterId !== r.targetUserId) {
      try {
        await setDoc(
          doc(db, 'blocks', r.reporterId, 'blocked', r.targetUserId),
          { blockedAt: new Date().toISOString(), via: 'admin-report', reportId },
          { merge: true },
        );
      } catch (e: any) {
        blockWarning = `User actioned but the block could not be applied (${e?.code ?? 'unknown'}).`;
        console.warn('[Moderation] block write failed:', e);
      }
    }

    await setDoc(
      reportRef,
      { status: 'actioned', resolvedBy: adminUid, resolvedAt: new Date().toISOString() },
      { merge: true },
    );

    const warning = [deleteWarning, blockWarning].filter(Boolean).join(' ');
    return warning ? { ok: true, error: warning } : { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || e?.code || 'unknown' };
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
