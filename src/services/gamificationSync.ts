/**
 * Gamification sync — XP, level, streaks, achievements, counters, AND the
 * spendable balances (Dojo Points 💎 / Flames), as a single blob doc.
 *
 * DURABILITY-FIRST (owner's call, 2026-07): the balance is kept CLIENT-computed
 * for now, so the whole GamificationState blob rides one owner-writable doc and
 * the delicate client-side reward engine (recordSession's streak bonuses,
 * achievement→flame grants) is left completely untouched. The pointsLedger Cloud
 * Function + the immutable-balance rules already exist, dormant; a later
 * hardening pass flips /gamification's balance fields back to CF-only and routes
 * earns through the ledger, WITHOUT any data migration. This is safe today
 * because nothing has been purchased, so the fraud surface is theoretical.
 *
 * ONE DOC, not a subcollection: GamificationState is a single bounded blob
 * (~40 scalars + a 49-entry achievements array, a few KB) that is always read
 * and written whole, so it maps to one /gamification/{uid} doc, keyed by the
 * Firebase Auth uid (NOT the app's internal member id — the AsyncStorage key is
 * member-id-namespaced, so the context maps across when it calls us).
 *
 * The doc changes far more often than a per-record dataset (every XP tick), so
 * the context DEBOUNCES the write-through — Firestore caps a single doc at about
 * one write/second, and AsyncStorage remains the immediate local cache. A newer
 * cross-device write is adopted via an `updatedAt` stamp; our own echoed
 * snapshots are ignored so there is no write feedback loop.
 */

import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { noopUnsubscribe, serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import type { GamificationState } from '../types/gamification';

const ROOT = 'gamification';
const TAG = '[Gamification Firestore]';

/** Wall-clock stamp the sync layer adds; NOT part of GamificationState. */
export interface CloudGamification extends GamificationState {
  updatedAt?: string;
}

export const gamificationDocPath = (uid: string) => `${ROOT}/${uid}`;

/**
 * Write the whole blob, server-confirmed, stamping updatedAt so other devices
 * (and our own echo guard) can order writes. Returns the stamp on success so the
 * caller can record it as its last-pushed marker, or null on failure.
 *
 * Offline this HANGS rather than failing (memory-only Firestore cache — see
 * syncCore's header), so the caller must not treat a slow return as loss: the
 * blob is already in AsyncStorage, and the next launch/auth flush re-pushes.
 */
export async function pushGamification(uid: string, state: GamificationState): Promise<string | null> {
  if (!FIREBASE_CONFIGURED || !db || !uid) return null;
  const updatedAt = new Date().toISOString();
  const ok = await serverConfirmedSetDoc(
    ROOT,
    uid,
    stripUndefined({ ...state, updatedAt } as unknown as Record<string, unknown>),
    TAG,
  );
  return ok ? updatedAt : null;
}

/** What one server snapshot carries. `state` is null when the doc doesn't exist. */
export interface GamificationSnapshot {
  exists: boolean;
  state: CloudGamification | null;
}

/**
 * Live-subscribe to this member's gamification doc, forwarding EVERY snapshot
 * (existence included) so the caller can implement its own reconcile policy —
 * crucially, it must learn that a FIRST snapshot arrived even when the doc
 * doesn't exist (a brand-new user), or it can't safely decide when to create it.
 * All the echo-guard / adopt-vs-push decisions live in the context, not here.
 */
export function subscribeGamification(
  uid: string,
  onSnap: (snap: GamificationSnapshot) => void,
): Unsubscribe {
  if (!FIREBASE_CONFIGURED || !db || !uid) return noopUnsubscribe;
  return onSnapshot(
    doc(db, gamificationDocPath(uid)),
    (snap) => onSnap({ exists: snap.exists(), state: snap.exists() ? (snap.data() as CloudGamification) : null }),
    (e) => console.warn(`${TAG} listener error:`, e),
  );
}
