import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { generateId } from '../utils/generateId';
import { safeStorageGetJSON, safeStorageSet } from '../utils/safeStorage';
import {
  subscribeToAppointments,
  upsertAppointmentInFirestore,
  deleteAppointmentFromFirestore,
} from '../services/appointmentSync';
import { syncOrAlert } from '../utils/syncOrAlert';
import {
  isSenpaiNotificationVoiceEnabled,
  senpaiClassReminderCopy,
} from '../services/senpaiNotifications';
import { useAuth } from './AuthContext';
import { getCurrentUid } from '../services/firebaseAuth';
import { auth, FIREBASE_CONFIGURED } from '../config/firebase';

const STORAGE_KEY = '@zenki_appointments';
// Device-local map of appointment id → scheduled notification id. Kept OUT of
// the shared Firestore doc: a notification id is only meaningful on the device
// that scheduled it.
const REMINDERS_KEY = '@zenki_appointment_reminders';

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Appointment {
  id: string;
  memberId: string;
  memberName: string;
  instructor: string;
  sessionType: string;
  startsAt: string;       // ISO 8601
  durationMinutes: number;
  price: number;
  status: AppointmentStatus;
  createdAt: string;
  /** Legacy — reminder ids now live device-local under REMINDERS_KEY (a
   *  notification id is meaningless on any other device). Kept so old docs
   *  still parse and their on-device notifications still cancel cleanly. */
  notificationId?: string;
  /** Auth uid of the booking member — stamped at creation and PRESERVED through
   *  admin edits (so the rule can scope reads to the owner). Not the admin who
   *  last wrote. Backfilled for legacy docs via backfillAppointmentOwners. */
  firebaseUid?: string;
}

interface AppointmentContextValue {
  appointments: Appointment[];
  myAppointments: Appointment[];
  pendingForAdmin: Appointment[];
  requestAppointment: (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => Promise<Appointment>;
  confirmAppointment: (id: string) => Promise<void>;
  cancelAppointment: (id: string) => Promise<void>;
  completeAppointment: (id: string) => void;
}

const AppointmentContext = createContext<AppointmentContextValue>({
  appointments: [],
  myAppointments: [],
  pendingForAdmin: [],
  requestAppointment: async () => ({} as Appointment),
  confirmAppointment: async () => {},
  cancelAppointment: async () => {},
  completeAppointment: () => {},
});

// Lazy import to keep web bundling simple
async function scheduleNotification(appointment: Appointment): Promise<string | undefined> {
  // F5: opt-in Senpai-voiced reminder copy — same trigger, same facts,
  // different narrator. Gated on the device-global Senpai Mode flag, read at
  // schedule time (toggling takes effect on the next (re)schedule); null (off
  // or storage failure) keeps the standard copy so a reminder is never lost.
  const senpaiCopy = (await isSenpaiNotificationVoiceEnabled())
    ? senpaiClassReminderCopy(appointment.sessionType, appointment.instructor)
    : null;

  if (Platform.OS === 'web') {
    // Web fallback: setTimeout-based reminder while the tab is open
    const remindAt = new Date(appointment.startsAt).getTime() - 60 * 60 * 1000;
    const delay = remindAt - Date.now();
    if (delay <= 0) return undefined;
    const timeoutId = setTimeout(() => {
      // Browser notification API (best-effort)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(senpaiCopy?.title ?? `Zenki Dojo · ${appointment.sessionType}`, {
          body: senpaiCopy?.body ?? `Your session with ${appointment.instructor} is in 1 hour.`,
        });
      }
    }, delay);
    return String(timeoutId);
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    const remindAt = new Date(appointment.startsAt).getTime() - 60 * 60 * 1000;
    if (remindAt <= Date.now()) return undefined;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: senpaiCopy?.title ?? `Upcoming: ${appointment.sessionType}`,
        body: senpaiCopy?.body ?? `Your session with ${appointment.instructor} starts in 1 hour.`,
        sound: 'default',
      },
      // Audit 2.0.5 P1: expo-notifications SDK 55 triggers are strictly typed
      // and REQUIRE a `type` — the legacy bare `{ seconds }` shape threw a
      // TypeError (swallowed below), so no booking reminder ever fired.
      // Same migration medicationNotifications.ts got; enum read off the
      // lazily-required module (web guard above), literal as fallback.
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL ?? 'timeInterval',
        seconds: Math.max(1, Math.floor((remindAt - Date.now()) / 1000)),
        repeats: false,
      } as any,
    });
    return id;
  } catch (err) {
    // Was a bare catch — the exact swallow that hid the dead-trigger P1.
    console.warn('[Appointments] reminder scheduling failed:', err);
    return undefined;
  }
}

async function cancelNotification(id?: string) {
  if (!id) return;
  if (Platform.OS === 'web') {
    clearTimeout(Number(id));
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications');
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch { /* ignore */ }
}

export function AppointmentProvider({ children }: { children: React.ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const { user } = useAuth();
  const [loaded, setLoaded] = useState(false);
  // Firebase session uid held in STATE and fed by onAuthStateChanged: the
  // persistence restore is async, so getCurrentUid() sampled once inside the
  // subscription effect could be null forever — the listener then never
  // started for the whole session.
  const [authUid, setAuthUid] = useState<string | null>(() => getCurrentUid());

  useEffect(() => {
    safeStorageGetJSON<Appointment[]>(STORAGE_KEY, [], Array.isArray).then((cached) => {
      if (cached.length > 0) setAppointments(cached);
      setLoaded(true);
    });

    // Request browser notification permission on web
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
  }, []);

  // Reconcile device-local 1-hour reminders against the live snapshot. Runs on
  // the MEMBER's own device (via their Firestore subscription), so the member
  // gets the reminder — scheduling in confirmAppointment put it on the
  // confirming ADMIN's phone instead.
  const remindersRef = useRef<Record<string, string> | null>(null);
  const syncReminders = useCallback(async (items: Appointment[]) => {
    const memberId = user?.id;
    if (!memberId) return;
    if (!remindersRef.current) {
      remindersRef.current = await safeStorageGetJSON<Record<string, string>>(
        REMINDERS_KEY,
        {},
        (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      );
    }
    const reminders = remindersRef.current;
    let changed = false;

    // Cancel reminders whose appointment is gone, not ours, or no longer confirmed.
    const byId = new Map(items.map((a) => [a.id, a]));
    for (const [apptId, notifId] of Object.entries(reminders)) {
      const appt = byId.get(apptId);
      if (appt && appt.memberId === memberId && appt.status === 'confirmed') continue;
      cancelNotification(notifId).catch(() => {});
      delete reminders[apptId];
      changed = true;
    }

    // Schedule for our own confirmed, still-future appointments not yet
    // scheduled on this device (scheduleNotification no-ops within 1h of start).
    for (const appt of items) {
      if (appt.memberId !== memberId || appt.status !== 'confirmed') continue;
      if (reminders[appt.id]) continue;
      const notifId = await scheduleNotification(appt);
      if (notifId) {
        reminders[appt.id] = notifId;
        changed = true;
      }
    }

    if (changed) safeStorageSet(REMINDERS_KEY, reminders, '[Appointments]');
  }, [user?.id]);

  // Serialize reminder syncs so back-to-back snapshots can't interleave their
  // await points and double-schedule the same appointment.
  const reminderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queueReminderSync = useCallback((items: Appointment[]) => {
    reminderQueueRef.current = reminderQueueRef.current
      .then(() => syncReminders(items))
      .catch(() => {});
  }, [syncReminders]);

  // Live Firestore subscription — source of truth across devices.
  useEffect(() => {
    // Scope the listener: members stream only their own appointments (rule
    // denies others), admins stream all. Re-subscribes on auth change.
    const unsub = subscribeToAppointments(authUid, !!user?.isAdmin, (items) => {
      setAppointments(items);
      safeStorageSet(STORAGE_KEY, items, '[Appointments]');
      queueReminderSync(items);
    });
    return () => { unsub(); };
  }, [authUid, user?.isAdmin, queueReminderSync]);

  useEffect(() => {
    if (loaded) safeStorageSet(STORAGE_KEY, appointments, '[Appointments]');
  }, [appointments, loaded]);

  const requestAppointment = useCallback(async (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => {
    // Without a Firebase session the write is rules-rejected and the optimistic
    // local insert lingers as a phantom "pending" the admin never sees — fail
    // fast so the caller can surface a retry instead.
    if (FIREBASE_CONFIGURED && !getCurrentUid()) {
      throw new Error('no-auth-session');
    }
    const next: Appointment = {
      ...a,
      id: generateId('appt'),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setAppointments((prev) => [...prev, next]);
    syncOrAlert(upsertAppointmentInFirestore(next), 'Appointment');
    return next;
  }, []);

  const confirmAppointment = useCallback(async (id: string) => {
    // Read latest state via a no-op functional update so the closure is
    // never stale (useCallback deps are []).
    let target: Appointment | undefined;
    setAppointments((prev) => {
      target = prev.find((a) => a.id === id);
      return prev;
    });
    if (!target) return;

    // Status change only — the member's 1-hour reminder is scheduled on the
    // MEMBER's device by syncReminders when this transition arrives through
    // their subscription. Scheduling here fired the reminder on the confirming
    // admin's phone about someone else's booking.
    const finalAppt: Appointment = { ...target, status: 'confirmed' as AppointmentStatus };
    setAppointments((prev) => prev.map((a) => (a.id === id ? finalAppt : a)));
    syncOrAlert(upsertAppointmentInFirestore(finalAppt), 'Appointment');
  }, []);

  const cancelAppointment = useCallback(async (id: string) => {
    let updated: Appointment | undefined;
    setAppointments((prev) => {
      const existing = prev.find((a) => a.id === id);
      if (existing?.notificationId) {
        cancelNotification(existing.notificationId).catch(() => {});
      }
      return prev.map((a) => {
        if (a.id !== id) return a;
        updated = { ...a, status: 'cancelled' as const, notificationId: undefined };
        return updated;
      });
    });
    if (updated) syncOrAlert(upsertAppointmentInFirestore(updated), 'Appointment');
  }, []);

  const completeAppointment = useCallback((id: string) => {
    let updated: Appointment | undefined;
    setAppointments((prev) => {
      const existing = prev.find((a) => a.id === id);
      if (existing?.notificationId) {
        cancelNotification(existing.notificationId).catch(() => {});
      }
      return prev.map((a) => {
        if (a.id !== id) return a;
        updated = { ...a, status: 'completed' as const, notificationId: undefined };
        return updated;
      });
    });
    if (updated) syncOrAlert(upsertAppointmentInFirestore(updated), 'Appointment');
  }, []);

  // Filtered views (memberId / admin filters happen at the screen level).
  // Memoized so consumers reading just `pendingForAdmin` don't re-render
  // whenever any other context-state field changes.
  const pendingForAdmin = useMemo(
    () => appointments.filter((a) => a.status === 'pending'),
    [appointments],
  );

  const value = useMemo(
    () => ({
      appointments,
      // Actually the signed-in member's own appointments (was the full
      // collection — a misnomer that invited a future consumer to render every
      // member's bookings). Admin views use `appointments`/`pendingForAdmin`.
      myAppointments: appointments.filter((a) => a.memberId === user?.id),
      pendingForAdmin,
      requestAppointment,
      confirmAppointment,
      cancelAppointment,
      completeAppointment,
    }),
    [appointments, user?.id, pendingForAdmin, requestAppointment, confirmAppointment, cancelAppointment, completeAppointment],
  );

  return (
    <AppointmentContext.Provider value={value}>
      {children}
    </AppointmentContext.Provider>
  );
}

export function useAppointments() {
  return useContext(AppointmentContext);
}
