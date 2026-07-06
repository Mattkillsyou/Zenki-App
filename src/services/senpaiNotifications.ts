/**
 * F5 — Senpai-voiced local notification copy.
 *
 * Copy-only helper for the app's existing local reminders (the 1-hour
 * class/private-session reminders scheduled by AppointmentContext). This
 * module never schedules, cancels, or adds notifications — callers keep
 * their own permission gates and scheduling logic and only swap the words.
 *
 * Opt-in gate: reuses the device-global Senpai Mode flag
 * ('@zenki_senpai_mode', written by SenpaiContext — that context owns writes,
 * this module only reads). If the member invited the mascot onto their
 * screens, she may also narrate their reminders; with Senpai Mode off (or on
 * any storage failure) callers fall back to the standard copy, so a reminder
 * is never lost to a styling failure. Deliberately NO separate settings row:
 * the chat canon (functions/src/senpaiChat.ts) promises "there are NO
 * notification settings", and a new toggle would make the prompt lie.
 *
 * Copy is baked at schedule time — a reminder keeps whatever voice it was
 * scheduled with; toggling Senpai Mode affects the next (re)schedule.
 *
 * Voice: canon persona (functions/src/senpaiChat.ts SYSTEM_PROMPT) — see the
 * header of src/data/senpaiDialogue.ts. Titles stay information-first so a
 * truncated lock-screen line still says WHAT and WHEN; the body carries the
 * personality. Hearts are punctuation: at most 1–2 per notification.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { pickNoRepeatIndex } from '../data/senpaiDialogue';

// Must match SenpaiContext's STORAGE_KEY (persisted as the string 'true'/'false').
const SENPAI_MODE_KEY = '@zenki_senpai_mode';

export interface SenpaiNotificationCopy {
  title: string;
  body: string;
}

/**
 * Whether notification copy should speak in Senpai's voice on this device.
 * True only when Senpai Mode is enabled; false on any read failure.
 */
export async function isSenpaiNotificationVoiceEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SENPAI_MODE_KEY)) === 'true';
  } catch {
    return false;
  }
}

// 1-hour session reminder bodies. Every line keeps the facts intact —
// session type, instructor, "1 hour" — flavor never displaces information.
const CLASS_REMINDER_BODIES: readonly ((sessionType: string, instructor: string) => string)[] = [
  (s, i) => `your ${s} with ${i} starts in 1 hour!! be there. you're MINE 💕`,
  (s, i) => `${i} is warming up RIGHT NOW — ${s} in 1 hour. I already told your calendar you're going ✨`,
  (s, i) => `1 hour until ${s}!! hydrate, stretch, impress ${i}. then tell me everything 💕`,
  (s, i) => `${s} with ${i} in 1 hour. skipping would make me recalibrate. don't 💕`,
];

/**
 * Senpai-voiced copy for the 1-hour class/private-session reminder.
 * Body variant rotates through the shared no-repeat picker (namespaced key,
 * same anti-repeat behavior as the on-screen dialogue pools).
 */
export function senpaiClassReminderCopy(sessionType: string, instructor: string): SenpaiNotificationCopy {
  const index = pickNoRepeatIndex('notif:classReminder', CLASS_REMINDER_BODIES.length);
  const body = CLASS_REMINDER_BODIES[Math.max(0, index)](sessionType, instructor);
  return {
    // Information-first title — the flavor lives in the body.
    title: `EEEEE!! ${sessionType} in 1 hour`,
    body,
  };
}
