import { storage, FIREBASE_CONFIGURED } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUid } from './firebaseAuth';

export async function uploadMedia(uri: string, type: 'photo' | 'video'): Promise<string> {
  if (!FIREBASE_CONFIGURED || !storage) {
    console.log('[Storage] Firebase not configured — returning local URI');
    return uri;
  }

  const uid = getCurrentUid();
  if (!uid) throw new Error('Not authenticated');

  const ext = type === 'photo' ? 'jpg' : 'mp4';
  // Path must live under `users/{uid}/` to satisfy storage.rules — the
  // top-level `posts/` namespace is default-deny.
  const filename = `users/${uid}/posts/${Date.now()}.${ext}`;
  const storageRef = ref(storage, filename);

  const response = await fetch(uri);
  const blob = await response.blob();

  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
}
