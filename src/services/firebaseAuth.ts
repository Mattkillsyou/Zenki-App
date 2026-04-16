import { auth, db, FIREBASE_CONFIGURED } from '../config/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { Member } from '../data/members';

export async function firebaseSignIn(member: Member): Promise<string> {
  if (!FIREBASE_CONFIGURED || !auth || !db) return '';
  const email = member.email || `${member.username}@zenkidojo.app`;
  const password = `zenki_${member.id}_${member.username}`;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await updateUserProfile(cred.user.uid, member);
    return cred.user.uid;
  } catch (error: any) {
    if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateUserProfile(cred.user.uid, member);
      return cred.user.uid;
    }
    console.error('[FirebaseAuth] Error:', error.message);
    return '';
  }
}

async function updateUserProfile(uid: string, member: Member) {
  if (!db) return;
  const userRef = doc(db, 'users', uid);
  const existing = await getDoc(userRef);
  if (!existing.exists()) {
    await setDoc(userRef, {
      displayName: `${member.firstName} ${member.lastName}`.trim(),
      avatar: null,
      bio: '',
      isPrivate: false,
      memberId: member.id,
      createdAt: new Date().toISOString(),
    });
  }
}

export async function firebaseSignOut() {
  if (!auth) return;
  try { await fbSignOut(auth); } catch (e) { /* ignore */ }
}

export function getCurrentUid(): string | null {
  return auth?.currentUser?.uid || null;
}
