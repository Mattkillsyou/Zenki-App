import { collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { AttendanceVisit } from '../types/attendance';
import { getTodayString } from '../utils/location';

// ─────────────────────────────────────────────────
// Google Sheets — Apps Script endpoint
// Create your Google Apps Script web app and paste the URL here.
// The script should accept POST with JSON: { memberName, memberId, date, checkInTime }
// ─────────────────────────────────────────────────
const ATTENDANCE_SHEET_URL = '';

/**
 * Push a visit record to Google Sheets.
 * Fire-and-forget — failures are logged but don't block the app.
 */
export async function pushAttendanceToSheets(visit: AttendanceVisit): Promise<boolean> {
  if (!ATTENDANCE_SHEET_URL) {
    console.log('[Attendance Sheets] No URL configured — logging locally:', visit.memberName, visit.date);
    return true;
  }

  try {
    const payload = {
      memberId: visit.memberId,
      memberName: visit.memberName,
      date: visit.date,
      checkInTime: new Date(visit.checkInTime).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
    const response = await fetch(ATTENDANCE_SHEET_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    console.warn('[Attendance Sheets] Push failed:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────
// Firebase Firestore
// Collection: 'attendance'
// All writes are gated on FIREBASE_CONFIGURED.
// ─────────────────────────────────────────────────

/**
 * Write a visit to the Firestore 'attendance' collection.
 */
export async function pushAttendanceToFirestore(visit: AttendanceVisit): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) {
    console.log('[Attendance Firestore] Not configured — skipping sync');
    return false;
  }

  try {
    await addDoc(collection(db, 'attendance'), {
      ...visit,
      createdAt: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn('[Attendance Firestore] Write failed:', err);
    return false;
  }
}

/**
 * Fetch today's attendance visits from Firestore (admin-only).
 */
export async function fetchTodayAttendance(): Promise<AttendanceVisit[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];

  try {
    const today = getTodayString();
    const q = query(
      collection(db, 'attendance'),
      where('date', '==', today),
      orderBy('checkInTime', 'asc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as AttendanceVisit);
  } catch (err) {
    console.warn('[Attendance Firestore] Fetch today failed:', err);
    return [];
  }
}

/**
 * Fetch full attendance history from Firestore (admin-only).
 * Returns most recent visits first, limited to `maxResults`.
 */
export async function fetchAllAttendance(maxResults = 500): Promise<AttendanceVisit[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];

  try {
    const q = query(
      collection(db, 'attendance'),
      orderBy('checkInTime', 'desc'),
      limit(maxResults),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as AttendanceVisit);
  } catch (err) {
    console.warn('[Attendance Firestore] Fetch all failed:', err);
    return [];
  }
}
