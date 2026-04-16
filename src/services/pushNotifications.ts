import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { collection, getDocs, doc, updateDoc, query, where } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';

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
 * Request permission + get the Expo push token for this device.
 * Returns the token or null.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) {
    console.log('[Push] Not a physical device — skipping');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted');
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
 * Save a push token to a member's Firestore document.
 */
export async function savePushTokenToFirestore(memberId: string, token: string): Promise<boolean> {
  if (!FIREBASE_CONFIGURED || !db) return false;

  try {
    // Find the member doc by memberId field
    const q = query(collection(db, 'members'), where('id', '==', memberId));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log('[Push] No member doc for id', memberId, '— token not saved');
      return false;
    }
    const memberDoc = snapshot.docs[0];
    await updateDoc(doc(db, 'members', memberDoc.id), { pushToken: token });
    return true;
  } catch (err) {
    console.warn('[Push] Save token failed:', err);
    return false;
  }
}

/**
 * Fetch all push tokens from Firestore (admin-only).
 */
export async function fetchAllPushTokens(): Promise<string[]> {
  if (!FIREBASE_CONFIGURED || !db) return [];

  try {
    const snapshot = await getDocs(collection(db, 'members'));
    const tokens: string[] = [];
    snapshot.docs.forEach((d) => {
      const data = d.data();
      if (data.pushToken && typeof data.pushToken === 'string') {
        tokens.push(data.pushToken);
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
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
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
