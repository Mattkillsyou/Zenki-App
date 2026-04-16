import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        new Notification(`Zenki Dojo — ${appointment.sessionType}`, {
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
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setAppointments(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });

    // Request browser notification permission on web
    if (Platform.OS === 'web' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(appointments));
  }, [appointments, loaded]);

  const requestAppointment = useCallback(async (a: Omit<Appointment, 'id' | 'status' | 'createdAt'>) => {
    const next: Appointment = {
      ...a,
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setAppointments((prev) => [...prev, next]);
    return next;
  }, []);

  const confirmAppointment = useCallback(async (id: string) => {
    let appt: Appointment | undefined;
    setAppointments((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        appt = { ...a, status: 'confirmed' as AppointmentStatus };
        return appt;
      }),
    );
    if (appt) {
      const notificationId = await scheduleNotification(appt);
      if (notificationId) {
        setAppointments((prev) =>
          prev.map((a) => (a.id === id ? { ...a, notificationId } : a)),
        );
      }
    }
  }, []);

  const cancelAppointment = useCallback(async (id: string) => {
    const existing = appointments.find((a) => a.id === id);
    if (existing?.notificationId) await cancelNotification(existing.notificationId);
    setAppointments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'cancelled', notificationId: undefined } : a)),
    );
  }, [appointments]);

  const completeAppointment = useCallback((id: string) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'completed' } : a)));
  }, []);

  // Filtered views (memberId / admin filters happen at the screen level)
  const myAppointments = appointments;
  const pendingForAdmin = appointments.filter((a) => a.status === 'pending');

  return (
    <AppointmentContext.Provider
      value={{
        appointments,
        myAppointments,
        pendingForAdmin,
        requestAppointment,
        confirmAppointment,
        cancelAppointment,
        completeAppointment,
      }}
    >
      {children}
    </AppointmentContext.Provider>
  );
}

export function useAppointments() {
  return useContext(AppointmentContext);
}
