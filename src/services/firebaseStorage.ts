import { storage, FIREBASE_CONFIGURED } from '../config/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getCurrentUid } from './firebaseAuth';

/**
 * RN's `fetch(uri).blob()` is unreliable for video-sized payloads — the
 * stream can stall or return an empty blob, and the resulting upload then
 * silently writes a 0-byte file. XHR with responseType='blob' is what the
 * Firebase RN docs recommend for media uploads.
 */
function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = () => reject(new Error('xhr-load-failed'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

function inferExtension(uri: string, type: 'photo' | 'video'): string {
  const m = uri.match(/\.(\w{3,4})(?:\?|#|$)/);
  if (m) {
    const ext = m[1].toLowerCase();
    // Common iOS video extensions: mov (camera), mp4, m4v
    if (type === 'video' && ['mov', 'mp4', 'm4v'].includes(ext)) return ext;
    if (type === 'photo' && ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext)) {
      return ext === 'jpeg' ? 'jpg' : ext;
    }
  }
  return type === 'photo' ? 'jpg' : 'mov';
}

function contentTypeFor(ext: string): string {
  switch (ext) {
    case 'jpg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'heic': return 'image/heic';
    case 'webp': return 'image/webp';
    case 'mov': return 'video/quicktime';
    case 'mp4': return 'video/mp4';
    case 'm4v': return 'video/x-m4v';
    default: return 'application/octet-stream';
  }
}

export async function uploadMedia(uri: string, type: 'photo' | 'video'): Promise<string> {
  if (!FIREBASE_CONFIGURED || !storage) {
    console.log('[Storage] Firebase not configured — returning local URI');
    return uri;
  }

  const uid = getCurrentUid();
  if (!uid) throw new Error('Not authenticated');

  const ext = inferExtension(uri, type);
  // Post media goes under `postMedia/{uid}/` which storage.rules makes readable
  // to ANY signed-in member (the community feed shows other users' media). The
  // old `users/{uid}/posts/` path was owner-only-read, so cross-user feed media
  // worked only as long as the download token survived — fragile. The owner
  // still controls writes to their own prefix.
  const filename = `postMedia/${uid}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, filename);

  const blob = await uriToBlob(uri);
  if (!blob || blob.size === 0) {
    throw new Error('uploadMedia: empty-blob');
  }

  await uploadBytes(storageRef, blob, { contentType: contentTypeFor(ext) });
  return getDownloadURL(storageRef);
}
