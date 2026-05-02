import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, Auth, Persistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────
// React Native AsyncStorage persistence shim
//
// Firebase JS SDK 12+ removed `getReactNativePersistence` from the public
// `firebase/auth` exports (only browser/inMemory/indexedDB persistence
// remain). Without RN persistence, every app launch starts unauthenticated:
// accounts and posts appear to "not stick" because `getCurrentUid()` is
// null on relaunch. This shim implements the same internal Persistence
// contract the removed function used.
// ─────────────────────────────────────────────────
function asyncStoragePersistence(): Persistence {
  return {
    type: 'LOCAL',
    async _isAvailable() { return true; },
    async _set(key: string, value: unknown) {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async _get<T>(key: string): Promise<T | null> {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async _remove(key: string) {
      await AsyncStorage.removeItem(key);
    },
    _addListener() {},
    _removeListener() {},
  } as unknown as Persistence;
}

// ─────────────────────────────────────────────────
// Firebase Configuration
//
// To set up:
// 1. Go to https://console.firebase.google.com
// 2. Create project "zenki-dojo"
// 3. Add a Web app → copy the config
// 4. Replace the values below
// 5. Enable Authentication (Email/Password)
// 6. Create Firestore Database (production mode — rules in firestore.rules)
// 7. Enable Cloud Storage (rules in storage.rules)
// ─────────────────────────────────────────────────

const firebaseConfig = {
  apiKey: 'AIzaSyALHuiCPe3wjcKYeqrx90DHcT6bu-Wn_Fo',
  authDomain: 'zenki-dojo.firebaseapp.com',
  projectId: 'zenki-dojo',
  storageBucket: 'zenki-dojo.firebasestorage.app',
  messagingSenderId: '277160279219',
  appId: '1:277160279219:web:4b04763265c86d17a484c6',
};

const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== 'YOUR_API_KEY';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (FIREBASE_CONFIGURED) {
  try {
    app = initializeApp(firebaseConfig);

    // Use AsyncStorage persistence on native so users stay signed in across
    // app launches. On web, use default (in-memory + IndexedDB).
    if (Platform.OS === 'web') {
      auth = getAuth(app);
    } else {
      auth = initializeAuth(app, {
        persistence: asyncStoragePersistence(),
      });
    }

    db = getFirestore(app);
    storage = getStorage(app);
  } catch (e) {
    console.warn('[Firebase] Init failed:', e);
  }
}

export { app, auth, db, storage, FIREBASE_CONFIGURED };
