import { auth, db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  getIdToken,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Member } from '../data/members';

/** Stable email for a member — uses their real email or a fallback. */
export function emailForMember(member: Pick<Member, 'email' | 'username'>): string {
  return member.email || `${member.username}@zenkidojo.app`;
}

export interface SignInResult {
  uid: string;
  /** True when this sign-in attempt created a new Firebase Auth account (first login). */
  isNewAccount: boolean;
}

/**
 * Sign in an existing Firebase Auth user with email + password.
 * Throws on failure — callers surface the error to the user.
 */
export async function firebaseSignInWithPassword(
  email: string,
  password: string,
): Promise<string> {
  if (!FIREBASE_CONFIGURED || !auth) {
    throw new Error('firebase-unavailable');
  }
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user.uid;
}

/**
 * Create a new Firebase Auth user with email + password, then seed their
 * Firestore profile. Returns the new uid.
 */
export async function firebaseCreateAccount(
  email: string,
  password: string,
  member: Member,
): Promise<string> {
  if (!FIREBASE_CONFIGURED || !auth || !db) {
    throw new Error('firebase-unavailable');
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    displayName: `${member.firstName} ${member.lastName}`.trim(),
    avatar: null,
    bio: '',
    isPrivate: false,
    memberId: member.id,
    createdAt: new Date().toISOString(),
  });
  return cred.user.uid;
}

/**
 * Legacy convenience — sign-in-or-create for seeded demo members.
 *
 * Used when a hardcoded test account (sensei.tim, matt.b, apple) signs in for
 * the first time: the Firebase Auth record won't exist yet, so we transparently
 * create it with the password the user typed. This gives the user a real
 * Firebase account from that point on.
 *
 * Returns { uid, isNewAccount: true } when we had to create the account.
 */
export async function firebaseSignInOrSeedAccount(
  email: string,
  password: string,
  member: Member,
): Promise<SignInResult> {
  if (!FIREBASE_CONFIGURED || !auth || !db) {
    throw new Error('firebase-unavailable');
  }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { uid: cred.user.uid, isNewAccount: false };
  } catch (error: any) {
    if (
      error?.code === 'auth/user-not-found' ||
      error?.code === 'auth/invalid-credential'
    ) {
      // Seed the Firebase account on first sign-in
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        displayName: `${member.firstName} ${member.lastName}`.trim(),
        avatar: null,
        bio: '',
        isPrivate: false,
        memberId: member.id,
        createdAt: new Date().toISOString(),
        seeded: true,
      });
      return { uid: cred.user.uid, isNewAccount: true };
    }
    throw error;
  }
}

/** Clear the Firebase Auth session (local token purge + /users stream detach). */
export async function firebaseSignOut(): Promise<void> {
  if (!auth) return;
  try {
    await fbSignOut(auth);
  } catch {
    /* ignore */
  }
}

/** Send a "reset password" email through Firebase. Throws on failure. */
export async function firebaseSendPasswordReset(email: string): Promise<void> {
  if (!FIREBASE_CONFIGURED || !auth) {
    throw new Error('firebase-unavailable');
  }
  await sendPasswordResetEmail(auth, email);
}

export function getCurrentUid(): string | null {
  return auth?.currentUser?.uid || null;
}

/**
 * Returns the current user's Firebase Auth ID token, or null if not signed in.
 * Used to authenticate AI vision + deleteAccount calls to Cloud Functions.
 */
export async function getCurrentIdToken(forceRefresh = false): Promise<string | null> {
  if (!auth?.currentUser) return null;
  try {
    return await getIdToken(auth.currentUser, forceRefresh);
  } catch {
    return null;
  }
}

/**
 * Delete the current Firebase Auth user (client-side). Fires after the server
 * has cleaned up Firestore + Storage via the `deleteAccount` Cloud Function.
 */
export async function firebaseDeleteCurrentUser(): Promise<void> {
  const user = auth?.currentUser;
  if (!user) return;
  await user.delete();
}

// Backwards compat — older call sites use this name.
export { firebaseSignInOrSeedAccount as firebaseSignIn };
