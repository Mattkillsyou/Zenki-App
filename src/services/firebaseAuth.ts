import { app, auth, db, FIREBASE_CONFIGURED } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCredential,
  OAuthProvider,
  GoogleAuthProvider,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  getIdToken,
  getAuth,
  initializeAuth,
} from 'firebase/auth';
import { initializeApp, deleteApp, getApps } from 'firebase/app';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Member } from '../data/members';
import { generateId } from '../utils/generateId';

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

/**
 * Admin-side "create Firebase Auth account for a new member" without
 * disturbing the admin's current sign-in session.
 *
 * Why a secondary app: the v9 SDK's `createUserWithEmailAndPassword` always
 * promotes the new user as the *current user* on whichever Auth instance you
 * pass in. If we used the primary `auth`, calling this from AdminMembersScreen
 * would silently sign the admin out and sign the new member in. We work
 * around that by spinning up a sibling Firebase app named "admin-create-X",
 * creating the Auth user there, seeding the /users/{uid} doc against the
 * shared Firestore, then tearing the sibling down.
 *
 * Returns the new user's uid so the caller can write it onto the member
 * record (member.firebaseUid) for later linking.
 */
export async function adminCreateMemberAccount(
  email: string,
  password: string,
  member: Member,
): Promise<string> {
  if (!FIREBASE_CONFIGURED || !app || !db) {
    throw new Error('firebase-unavailable');
  }
  const siblingName = `admin-create-${Date.now()}`;
  const siblingApp = initializeApp(app.options, siblingName);
  let createdUid: string | null = null;
  try {
    const siblingAuth = getAuth(siblingApp);
    const cred = await createUserWithEmailAndPassword(siblingAuth, email, password);
    createdUid = cred.user.uid;
    // Seed the /users/{uid} profile against the shared Firestore — uses the
    // primary db so the new doc is visible to the rest of the app.
    await setDoc(doc(db, 'users', cred.user.uid), {
      displayName: `${member.firstName} ${member.lastName}`.trim(),
      avatar: null,
      bio: '',
      isPrivate: false,
      memberId: member.id,
      createdAt: new Date().toISOString(),
      seededByAdmin: true,
    });
    // Sign the sibling out so its in-memory session can't be used.
    await fbSignOut(siblingAuth).catch(() => {});
  } finally {
    await deleteApp(siblingApp).catch(() => {});
  }
  if (!createdUid) throw new Error('admin-create-failed');
  return createdUid;
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

// ─────────────────────────────────────────────────
// OAuth sign-in (Apple, Google)
// ─────────────────────────────────────────────────

export interface OAuthSignInResult {
  /** Firebase UID. */
  uid: string;
  /** Member record — either rehydrated from Firestore or freshly created. */
  member: Member;
  /** True when this OAuth login created a brand-new account (first time). */
  isNewAccount: boolean;
}

/** Email helper — builds a deterministic local-id email when OAuth provider hides the address. */
function emailForOAuthMember(realEmail: string | null | undefined, uid: string): string {
  if (realEmail && realEmail.includes('@')) return realEmail;
  return `${uid}@oauth.zenkidojo.app`;
}

/**
 * Build a fresh local Member record from OAuth profile data.
 * Used when an OAuth user signs in for the first time — they get a minimal
 * member record they can flesh out via Edit Profile / onboarding later.
 */
function buildMemberFromOAuth(params: {
  uid: string;
  email: string;
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  displayName?: string | null;
}): Member {
  const fn = params.fullName?.givenName ??
    (params.displayName?.split(' ')[0] ?? '') ?? '';
  const ln = params.fullName?.familyName ??
    (params.displayName?.split(' ').slice(1).join(' ') ?? '') ?? '';
  // Generate a stable username from email local-part
  const username = params.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  return {
    id: generateId('mem'),
    username,
    firstName: (fn || 'Member').trim(),
    lastName: (ln || '').trim(),
    email: params.email,
    belt: 'none',
    stripes: 0,
    memberSince: new Date().toISOString().split('T')[0],
    isAdmin: false,
    totalSessions: 0,
    weekStreak: 0,
  };
}

/**
 * Look up or create a Member record tied to a Firebase UID.
 * Stored under `users/{uid}` with the full Member payload so OAuth users can
 * sign back in across devices.
 */
async function rehydrateOrCreateOAuthMember(
  uid: string,
  fallback: Member,
): Promise<{ member: Member; isNewAccount: boolean }> {
  if (!db) return { member: fallback, isNewAccount: true };
  const userDoc = doc(db, 'users', uid);
  const snap = await getDoc(userDoc);
  if (snap.exists()) {
    const data = snap.data();
    // If we previously stored the full member, rehydrate it; otherwise the
    // doc has just displayName/avatar (legacy email-password format) — keep
    // the fallback but reuse the existing memberId so analytics line up.
    const existingMember = (data as any).member as Member | undefined;
    if (existingMember && existingMember.id) {
      return { member: existingMember, isNewAccount: false };
    }
  }
  // First-time OAuth — write the full member payload so future sessions can rehydrate
  await setDoc(userDoc, {
    displayName: `${fallback.firstName} ${fallback.lastName}`.trim(),
    avatar: null,
    bio: '',
    isPrivate: false,
    memberId: fallback.id,
    member: fallback,
    createdAt: new Date().toISOString(),
    authProvider: 'oauth',
  }, { merge: true });
  return { member: fallback, isNewAccount: true };
}

/**
 * Sign in to Firebase with an Apple identityToken obtained from
 * `expo-apple-authentication`. The caller passes the optional fullName the
 * first time so we can seed firstName/lastName.
 */
export async function firebaseSignInWithApple(params: {
  identityToken: string;
  /** Provided by Apple ONLY on the first sign-in. Subsequent logins return null. */
  fullName?: { givenName?: string | null; familyName?: string | null } | null;
  email?: string | null;
  /** A nonce used during the AppleAuthentication request — required by Apple+Firebase. */
  nonce?: string;
}): Promise<OAuthSignInResult> {
  if (!FIREBASE_CONFIGURED || !auth) {
    throw new Error('firebase-unavailable');
  }
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({
    idToken: params.identityToken,
    rawNonce: params.nonce,
  });
  const userCred = await signInWithCredential(auth, credential);
  const uid = userCred.user.uid;
  const email = emailForOAuthMember(params.email ?? userCred.user.email, uid);
  const fallback = buildMemberFromOAuth({
    uid,
    email,
    fullName: params.fullName,
    displayName: userCred.user.displayName,
  });
  const { member, isNewAccount } = await rehydrateOrCreateOAuthMember(uid, fallback);
  return { uid, member, isNewAccount };
}

/**
 * Sign in to Firebase with a Google id_token obtained from
 * `expo-auth-session/providers/google`.
 */
export async function firebaseSignInWithGoogle(params: {
  idToken: string;
  accessToken?: string;
}): Promise<OAuthSignInResult> {
  if (!FIREBASE_CONFIGURED || !auth) {
    throw new Error('firebase-unavailable');
  }
  const credential = GoogleAuthProvider.credential(params.idToken, params.accessToken);
  const userCred = await signInWithCredential(auth, credential);
  const uid = userCred.user.uid;
  const email = emailForOAuthMember(userCred.user.email, uid);
  const fallback = buildMemberFromOAuth({
    uid,
    email,
    displayName: userCred.user.displayName,
  });
  const { member, isNewAccount } = await rehydrateOrCreateOAuthMember(uid, fallback);
  return { uid, member, isNewAccount };
}

// Backwards compat — older call sites use this name.
export { firebaseSignInOrSeedAccount as firebaseSignIn };
