import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, FIREBASE_CONFIGURED } from '../config/firebase';
import { getCurrentUid } from './firebaseAuth';
import { generateId } from '../utils/generateId';

/**
 * Upload a local image (file:// or data: URI) to Firebase Storage and return
 * the public download URL. The path is `users/{adminUid}/products/{id}.{ext}`
 * — that path is already permitted by the existing storage.rules
 * (`/users/{uid}/{allPaths=**}: allow write if owner`), so no rule change is
 * needed. Download URLs are tokenized so any signed-in client can render the
 * image regardless of the bucket-level read rule.
 */
export async function uploadProductImage(uri: string): Promise<string> {
  if (!FIREBASE_CONFIGURED || !storage) {
    throw new Error('firebase-not-configured');
  }
  const uid = getCurrentUid();
  if (!uid) throw new Error('not-signed-in');

  const blob = await uriToBlob(uri);
  const ext = guessExtension(uri, blob.type) || 'jpg';
  const id = generateId('img');
  const path = `users/${uid}/products/${id}.${ext}`;
  const objectRef = ref(storage, path);
  const contentType = blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  await uploadBytes(objectRef, blob, { contentType });
  return getDownloadURL(objectRef);
}

async function uriToBlob(uri: string): Promise<Blob> {
  // Works for file:// (RN), content:// (Android), and data:/blob: URIs (web).
  const res = await fetch(uri);
  return res.blob();
}

function guessExtension(uri: string, mimeType?: string): string | null {
  if (mimeType) {
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    if (mimeType.includes('heic')) return 'heic';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  }
  const m = uri.match(/\.(\w{3,4})(?:\?|#|$)/);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return null;
}
