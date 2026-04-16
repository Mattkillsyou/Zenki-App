import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// ─────────────────────────────────────────────────
// Firebase Configuration
//
// To set up:
// 1. Go to https://console.firebase.google.com
// 2. Create project "zenki-dojo"
// 3. Add a Web app → copy the config
// 4. Replace the values below
// 5. Enable Authentication (Email/Password)
// 6. Create Firestore Database (test mode)
// 7. Enable Cloud Storage
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
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (e) {
    console.warn('[Firebase] Init failed:', e);
  }
}

export { app, auth, db, storage, FIREBASE_CONFIGURED };
