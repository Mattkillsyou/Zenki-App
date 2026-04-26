import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { Member } from '../data/members';

// ─────────────────────────────────────────────────
// Google Sheets — Apps Script endpoint
// Create your Google Apps Script web app for member signups and paste the URL.
// The script should accept POST with JSON: { firstName, lastName, email, username, belt, memberSince, phone }
// ─────────────────────────────────────────────────
const MEMBER_SHEET_URL = '';

/**
 * Push a new member signup to Google Sheets.
 * Fire-and-forget — failures are logged but don't block account creation.
 */
export async function pushMemberToSheets(member: Member): Promise<boolean> {
  if (!MEMBER_SHEET_URL) {
    console.log('[Members Sheets] No URL configured — logging locally:', member.firstName, member.email);
    return true;
  }

  try {
    const payload = {
      memberId: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      username: member.username,
      belt: member.belt,
      stripes: member.stripes,
      memberSince: member.memberSince,
      phone: member.phone ?? '',
      isAdmin: !!member.isAdmin,
      isEmployee: !!member.isEmployee,
    };
    const response = await fetch(MEMBER_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    console.warn('[Members Sheets] Push failed:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────
// Firebase Firestore — 'members' collection
// Each doc id is the member's local id, so upserts replace the same record
// rather than creating duplicates.
// ─────────────────────────────────────────────────

/**
 * Write or update a member in Firestore (keyed by member.id).
 * NOTE: requires firestore.rules to allow admin writes to /members.
 * Fire-and-forget at the call site — failures are logged but not thrown.
 */
export async function upsertMemberInFirestore(member: Member): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) {
    console.log('[Members Firestore] Not configured — skipping sync');
    return false;
  }
  try {
    await setDoc(
      doc(db, 'members', member.id),
      { ...member, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[Members Firestore] Upsert failed:', err);
    return false;
  }
}

/**
 * New-signup wrapper — same as upsert today, kept for callers that want
 * "create" semantics. Re-running for an existing id is harmless (merge:true).
 */
export async function pushMemberToFirestore(member: Member): Promise<boolean> {
  return upsertMemberInFirestore(member);
}

/**
 * Delete a member doc from Firestore by id. Returns true on success.
 * Failures are logged and surfaced as `false` so callers can show feedback.
 */
export async function deleteMemberFromFirestore(memberId: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  try {
    await deleteDoc(doc(db, 'members', memberId));
    return true;
  } catch (err) {
    console.warn('[Members Firestore] Delete failed:', err);
    return false;
  }
}

/**
 * Subscribe to live updates for a single member by id. Returns the
 * unsubscribe function. Use to keep the signed-in user's role / belt /
 * stripes in sync when an admin edits them from another device.
 */
export function subscribeToMember(memberId: string, cb: (member: Member | null) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) {
    return () => {};
  }
  try {
    const ref = doc(db, 'members', memberId);
    return onSnapshot(
      ref,
      (snap) => {
        cb(snap.exists() ? (snap.data() as Member) : null);
      },
      (err) => {
        console.warn('[Members Firestore] Subscribe failed:', err);
      },
    );
  } catch (err) {
    console.warn('[Members Firestore] Subscribe init failed:', err);
    return () => {};
  }
}

/**
 * Subscribe to the entire members collection. Used by the admin members
 * screen so it shows live data including other admins' edits.
 */
export function subscribeToAllMembers(cb: (members: Member[]) => void): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db) {
    return () => {};
  }
  try {
    const ref = collection(db, 'members');
    return onSnapshot(
      ref,
      (snap) => {
        cb(snap.docs.map((d) => d.data() as Member));
      },
      (err) => {
        console.warn('[Members Firestore] Members subscribe failed:', err);
      },
    );
  } catch (err) {
    console.warn('[Members Firestore] Members subscribe init failed:', err);
    return () => {};
  }
}

/**
 * One-shot fetch of all members from Firestore (admin read).
 */
export async function fetchAllMembers(): Promise<Member[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];

  try {
    const q = query(collection(db, 'members'), orderBy('memberSince', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as Member);
  } catch (err) {
    console.warn('[Members Firestore] Fetch failed:', err);
    return [];
  }
}

export interface BackfillResult {
  ok: number;
  failed: number;
  skipped: number;
}

/**
 * Push every supplied member into Firestore so the collection holds the
 * canonical record for each one. Uses batched setDoc with merge:true so it's
 * idempotent — running it after admin edits never clobbers the latest values.
 *
 * Failures are aggregated per-member so a permission-denied on one record
 * doesn't abort the rest. Returns counts so the caller can surface progress.
 */
export async function backfillMembersToFirestore(members: Member[]): Promise<BackfillResult> {
  if (!FIREBASE_CONFIGURED || !db) {
    return { ok: 0, failed: 0, skipped: members.length };
  }
  if (members.length === 0) return { ok: 0, failed: 0, skipped: 0 };

  let ok = 0;
  let failed = 0;
  // Firestore batch limit is 500 ops; chunk defensively.
  const CHUNK = 400;
  for (let i = 0; i < members.length; i += CHUNK) {
    const slice = members.slice(i, i + CHUNK);
    try {
      const batch = writeBatch(db);
      const stamp = new Date().toISOString();
      for (const m of slice) {
        batch.set(
          doc(db, 'members', m.id),
          { ...m, updatedAt: stamp },
          { merge: true },
        );
      }
      await batch.commit();
      ok += slice.length;
    } catch (err) {
      console.warn('[Members Firestore] Batch failed, falling back to per-doc:', err);
      // If the batch failed (often a single bad doc), retry one at a time so
      // a single permission-denied doesn't abort the rest.
      for (const m of slice) {
        try {
          await setDoc(
            doc(db, 'members', m.id),
            { ...m, updatedAt: new Date().toISOString() },
            { merge: true },
          );
          ok++;
        } catch (innerErr) {
          console.warn(`[Members Firestore] Backfill failed for ${m.id}:`, innerErr);
          failed++;
        }
      }
    }
  }
  return { ok, failed, skipped: 0 };
}
