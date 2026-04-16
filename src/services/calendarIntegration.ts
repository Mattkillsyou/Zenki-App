/**
 * Add events to the user's native calendar (Apple Calendar on iOS, Google
 * Calendar on Android) via expo-calendar. Falls back to a web Google Calendar
 * link when the native module isn't available.
 */

import { Platform, Linking, Alert } from 'react-native';

export interface CalendarEventInput {
  title: string;
  startsAt: Date;
  durationMinutes: number;
  location?: string;
  notes?: string;
}

function fmtGoogleDate(d: Date): string {
  // Google Calendar render URL expects YYYYMMDDTHHmmssZ (UTC)
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

/** Web fallback — opens a Google Calendar "add event" page. Works everywhere. */
function googleCalendarUrl(e: CalendarEventInput): string {
  const end = new Date(e.startsAt.getTime() + e.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmtGoogleDate(e.startsAt)}/${fmtGoogleDate(end)}`,
    details: e.notes || '',
    location: e.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Save event to native calendar. On iOS this creates an entry in Apple Calendar.
 * On Android creates it in the default calendar. On web (or if expo-calendar
 * isn't installed), opens a Google Calendar add-event page in the browser.
 */
export async function addEventToCalendar(input: CalendarEventInput): Promise<{ ok: boolean; method: 'native' | 'web' | 'none' }> {
  // Web: straight to Google Calendar link
  if (Platform.OS === 'web') {
    try {
      await Linking.openURL(googleCalendarUrl(input));
      return { ok: true, method: 'web' };
    } catch {
      return { ok: false, method: 'none' };
    }
  }

  // Native: try expo-calendar
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Calendar = require('expo-calendar');
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Calendar access needed',
        'Enable calendar permission in Settings to save events.',
      );
      return { ok: false, method: 'none' };
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    // Prefer the default calendar on iOS; first writable on Android
    let targetCal = calendars.find((c: any) => c.isPrimary) || calendars.find((c: any) => c.allowsModifications) || calendars[0];
    if (!targetCal) {
      return { ok: false, method: 'none' };
    }

    const end = new Date(input.startsAt.getTime() + input.durationMinutes * 60_000);
    await Calendar.createEventAsync(targetCal.id, {
      title: input.title,
      startDate: input.startsAt,
      endDate: end,
      location: input.location,
      notes: input.notes,
      alarms: [{ relativeOffset: -60 }], // 60 min reminder
    });
    return { ok: true, method: 'native' };
  } catch (e) {
    // expo-calendar not installed or failed — fall through to web
    try {
      await Linking.openURL(googleCalendarUrl(input));
      return { ok: true, method: 'web' };
    } catch {
      return { ok: false, method: 'none' };
    }
  }
}
