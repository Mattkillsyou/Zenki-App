import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore';
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
// ─────────────────────────────────────────────────

/**
 * Write a new member to the Firestore 'members' collection.
 */
export async function pushMemberToFirestore(member: Member): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) {
    console.log('[Members Firestore] Not configured — skipping sync');
    return false;
  }

  try {
    await addDoc(collection(db, 'members'), {
      ...member,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('[Members Firestore] Write failed:', err);
    return false;
  }
}

/**
 * Fetch all members from Firestore (admin-only read).
 * Returned ordered by memberSince descending (newest first).
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
