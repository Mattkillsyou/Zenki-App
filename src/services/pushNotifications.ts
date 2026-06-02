import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { EXPO_PUSH_API_URL } from '../config/api';
import { getCurrentUid } from './firebaseAuth';

// Configure how notifications are displayed when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Get the Expo push token for this device IF notification permission is
 * already granted. Does NOT prompt — safe to call from app startup paths
 * (e.g. AuthContext's user-change effect) without surprising the user with
 * an iOS permission dialog.
 *
 * To actually request the OS prompt, the caller should run their own
 * `Notifications.requestPermissionsAsync` first (e.g. from
 * PermissionsOnboardingScreen) and then invoke this to fetch the token.
 *
 * Returns the token or null when:
 *  - running on web / non-physical device
 *  - permission is denied or not yet granted
 *  - the Expo push service throws
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('[Push] Not a physical device — skipping');
    return null;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      // Silent — caller is expected to prompt elsewhere when appropriate.
      return null;
    }

    // Android needs a channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#D4A017',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (err) {
    console.warn('[Push] Registration failed:', err);
    return null;
  }
}

/**
 * Save a push token to the dedicated `pushTokens/{uid}` collection (keyed by
 * Firebase Auth uid). Relocated OFF the /members doc: /members used to be
 * world-readable to any signed-in user, so storing the Expo push token there
 * let anyone scrape every member's token and push to them via the public Expo
 * API. pushTokens is owner-write / owner-or-admin-read. The `memberId` arg is
 * kept for reference (stored as a field) but no longer used as the key.
 */
export async function savePushTokenToFirestore(memberId: string, token: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;
  const uid = getCurrentUid();
  if (!uid) return false;

  try {
    await setDoc(
      doc(db, 'pushTokens', uid),
      { uid, token, memberId, platform: Platform.OS, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn('[Push] Save token failed:', err);
    return false;
  }
}

/**
 * Fetch all push tokens from Firestore (admin-only — the rule restricts a
 * full pushTokens list to admins).
 */
export async function fetchAllPushTokens(): Promise<string[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];

  try {
    const snapshot = await getDocs(collection(db, 'pushTokens'));
    const tokens: string[] = [];
    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.token && typeof data.token === 'string') {
        tokens.push(data.token);
      }
    });
    return tokens;
  } catch (err) {
    console.warn('[Push] Fetch tokens failed:', err);
    return [];
  }
}

/**
 * Broadcast a push notification to all members.
 * Returns the number of recipients successfully delivered to.
 */
export async function broadcastPushNotification(
  title: string,
  body: string,
): Promise<{ sent: number; errors: number }> {
  const tokens = await fetchAllPushTokens();
  if (tokens.length === 0) {
    return { sent: 0, errors: 0 };
  }

  // Expo Push API accepts up to 100 per batch
  const batches: string[][] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    batches.push(tokens.slice(i, i + 100));
  }

  let sent = 0;
  let errors = 0;

  for (const batch of batches) {
    const messages = batch.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
    }));

    try {
      const response = await fetch(EXPO_PUSH_API_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (response.ok) {
        sent += batch.length;
      } else {
        errors += batch.length;
      }
    } catch (err) {
      console.warn('[Push] Send batch failed:', err);
      errors += batch.length;
    }
  }

  return { sent, errors };
}
