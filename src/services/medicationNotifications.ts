/**
 * Local notification scheduling for medication reminders.
 *
 * Uses expo-notifications calendar/daily/weekly triggers so reminders
 * fire even when the app is closed. On web we degrade to setTimeout
 * (only useful while the page is open).
 */

import { Platform } from 'react-native';
import { MedicationEntry, formatTimeLabel } from '../types/medication';

// ─────────────────────────────────────────────────
// Android channel — created lazily on first schedule
// ─────────────────────────────────────────────────
let _channelEnsured = false;
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || _channelEnsured) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    await Notifications.setNotificationChannelAsync('medications', {
      name: 'Medications',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#D4A017',
      sound: 'default',
      description: 'Reminders for scheduled medications and peptides',
    });
    _channelEnsured = true;
  } catch (err) {
    console.warn('[medNotif] channel setup failed:', err);
  }
}

/**
 * Ensure permissions; safe to call repeatedly.
 */
export async function ensureNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (err) {
    console.warn('[medNotif] permission check failed:', err);
    return false;
  }
}

interface TimeOfDay {
  hour: number;
  minute: number;
}

function parseHHMM(hhmm: string): TimeOfDay | null {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

/**
 * Build the notification content for a medication dose.
 */
function buildContent(med: MedicationEntry, hhmm: string) {
  const doseLine = `${med.dose} ${med.doseUnit} — ${med.route}`;
  return {
    title: `Time for ${med.name}`,
    body: doseLine,
    sound: 'default' as const,
    data: {
      medicationId: med.id,
      scheduledTime: hhmm,
      // Used by the notification tap handler to deep-link
      url: 'zenkidojo://MedicationTracker',
    },
  };
}

/**
 * Schedule a single repeating daily notification at a given time.
 */
async function scheduleDaily(
  Notifications: any,
  med: MedicationEntry,
  time: TimeOfDay,
  hhmm: string,
): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: buildContent(med, hhmm),
      trigger: {
        // expo-notifications SDK 52: calendar trigger with `repeats: true` and
        // `hour`/`minute` is the documented daily form.
        hour: time.hour,
        minute: time.minute,
        repeats: true,
        channelId: Platform.OS === 'android' ? 'medications' : undefined,
      } as any,
    });
    return id as string;
  } catch (err) {
    console.warn('[medNotif] scheduleDaily failed:', err);
    return null;
  }
}

/**
 * Schedule a repeating weekly notification.
 * weekday: 1=Sun..7=Sat per expo-notifications convention.
 */
async function scheduleWeekly(
  Notifications: any,
  med: MedicationEntry,
  weekday: number,
  time: TimeOfDay,
  hhmm: string,
): Promise<string | null> {
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: buildContent(med, hhmm),
      trigger: {
        weekday, // 1 (Sunday) through 7 (Saturday)
        hour: time.hour,
        minute: time.minute,
        repeats: true,
        channelId: Platform.OS === 'android' ? 'medications' : undefined,
      } as any,
    });
    return id as string;
  } catch (err) {
    console.warn('[medNotif] scheduleWeekly failed:', err);
    return null;
  }
}

/**
 * Schedule all repeating local notifications for a medication.
 * Returns array of expo notification identifiers for cancellation.
 *
 * Behavior by frequency:
 *   - daily / twice_daily / three_times_daily: one daily trigger per timesOfDay
 *   - weekly: one weekly trigger (uses startDate's weekday) per time
 *   - biweekly: one weekly trigger (best-effort — expo doesn't support 14-day
 *     cycles; user gets weekly reminder, app suppresses dose taps off-week)
 *   - custom: one weekly trigger per (customDay × time) combo
 */
export async function scheduleMedicationNotifications(
  med: MedicationEntry,
): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  if (!med.notificationsEnabled) return [];
  if (!med.timesOfDay || med.timesOfDay.length === 0) return [];

  const granted = await ensureNotificationPermissions();
  if (!granted) {
    console.log('[medNotif] permission not granted — skipping schedule');
    return [];
  }
  await ensureAndroidChannel();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Notifications = require('expo-notifications');
  const ids: string[] = [];

  for (const hhmm of med.timesOfDay) {
    const time = parseHHMM(hhmm);
    if (!time) continue;

    switch (med.frequency) {
      case 'daily':
      case 'twice_daily':
      case 'three_times_daily': {
        const id = await scheduleDaily(Notifications, med, time, hhmm);
        if (id) ids.push(id);
        break;
      }
      case 'weekly':
      case 'biweekly': {
        // Use the weekday of startDate (JS getDay: 0=Sun..6=Sat → expo: 1..7)
        const startDay = new Date(med.startDate).getDay();
        const expoWeekday = startDay + 1;
        const id = await scheduleWeekly(Notifications, med, expoWeekday, time, hhmm);
        if (id) ids.push(id);
        break;
      }
      case 'custom': {
        for (const jsDay of med.customDays ?? []) {
          if (jsDay < 0 || jsDay > 6) continue;
          const expoWeekday = jsDay + 1;
          const id = await scheduleWeekly(Notifications, med, expoWeekday, time, hhmm);
          if (id) ids.push(id);
        }
        break;
      }
    }
  }

  console.log(
    `[medNotif] scheduled ${ids.length} reminders for "${med.name}" at ${med.timesOfDay
      .map(formatTimeLabel)
      .join(', ')}`,
  );
  return ids;
}

/**
 * Cancel a list of previously-scheduled notifications.
 */
export async function cancelMedicationNotifications(
  notificationIds: string[],
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!notificationIds || notificationIds.length === 0) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    for (const id of notificationIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        /* per-id failure ignored */
      }
    }
  } catch (err) {
    console.warn('[medNotif] cancel failed:', err);
  }
}

/**
 * Cancel ALL scheduled medication notifications. Useful when toggling the
 * feature off globally or wiping data.
 */
export async function cancelAllMedicationNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all ?? []) {
      const data = n?.content?.data ?? {};
      if (data.medicationId) {
        try {
          await Notifications.cancelScheduledNotificationAsync(n.identifier);
        } catch {
          /* ignore */
        }
      }
    }
  } catch (err) {
    console.warn('[medNotif] cancelAll failed:', err);
  }
}

/**
 * Re-schedule notifications for a medication. Cancels the old IDs first
 * to avoid duplicates.
 */
export async function rescheduleMedicationNotifications(
  med: MedicationEntry,
): Promise<string[]> {
  await cancelMedicationNotifications(med.scheduledNotificationIds ?? []);
  return scheduleMedicationNotifications(med);
}
