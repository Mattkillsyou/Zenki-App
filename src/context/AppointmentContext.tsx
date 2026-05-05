import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { generateId } from '../utils/generateId';
import { safeStorageGetJSON, safeStorageSet } from '../utils/safeStorage';
import {
  subscribeToAppointments,
  upsertAppointmentInFirestore,
  deleteAppointmentFromFirestore,
} from '../services/appointmentSync';

const STORAGE_KEY = '@zenki_appointments';

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
  notificationId?: string; // ID of scheduled local notification
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
  if (Platform.OS === 'web') {
    // Web fallback: setTimeout-based reminder while the tab is open
    const remindAt = new Date(appointment.startsAt).getTime() - 60 * 60 * 1000;
    const delay = remindAt - Date.now();
    if (delay <= 0) return undefined;
    const timeoutId = setTimeout(() => {
      // Browser notification API (best-effort)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Zenki Dojo · ${appointment.sessionType}`, {
          body: `Your session with ${appointment.instructor} is in 1 hour.`,
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
        title: `Upcoming: ${appointment.sessionType}`,
        body: `Your session with ${appointment.instructor} starts in 1 hour.`,
        sound: 'default',
      },
      trigger: { seconds: Math.max(1, Math.floor((remindAt - Date.now()) / 1000)) } as any,
    });
    return id;
  } catch {
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
  const [loaded, setLoaded] = useState(false);

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

  // Live Firestore subscription — source of truth across devices.
  useEffect(() => {
    const unsub = subscribeToAppointments((items) => {
      setAppointments(items);
      safeStorageSet(STORAGE_KEY, items, '[Appointments]');
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (loaded) safeStorageSet(STORAGE_KEY, appointments, '[Appointments]');
  }, [appointments, loaded]);

  const requestAppointment = useCallback(async (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => {
    const next: Appointment = {
      ...a,
      id: generateId('appt'),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setAppointments((prev) => [...prev, next]);
    upsertAppointmentInFirestore(next).catch(() => {});
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

    const tentative: Appointment = { ...target, status: 'confirmed' as AppointmentStatus };
    const notificationId = await scheduleNotification(tentative);
    const finalAppt: Appointment = notificationId
      ? { ...tentative, notificationId }
      : tentative;

    // Single state update + single Firestore upsert. Avoids the dual-set
    // race where a concurrent snapshot could clobber the in-flight
    // notificationId patch.
    setAppointments((prev) => prev.map((a) => (a.id === id ? finalAppt : a)));
    upsertAppointmentInFirestore(finalAppt).catch(() => {});
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
    if (updated) upsertAppointmentInFirestore(updated).catch(() => {});
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
    if (updated) upsertAppointmentInFirestore(updated).catch(() => {});
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
      myAppointments: appointments,
      pendingForAdmin,
      requestAppointment,
      confirmAppointment,
      cancelAppointment,
      completeAppointment,
    }),
    [appointments, pendingForAdmin, requestAppointment, confirmAppointment, cancelAppointment, completeAppointment],
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
