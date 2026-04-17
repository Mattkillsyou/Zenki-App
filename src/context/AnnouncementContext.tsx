import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateId } from '../utils/generateId';

const STORAGE_KEY = '@zenki_announcements';

export interface Announcement {
  id: string;
  title: string;
  description: string;
  pinned: boolean;
  createdAt: string; // ISO
}

interface AnnouncementContextValue {
  announcements: Announcement[];
  addAnnouncement: (a: Omit<Announcement, 'id' | 'createdAt'>) => void;
  updateAnnouncement: (id: string, a: Partial<Announcement>) => void;
  removeAnnouncement: (id: string) => void;
}

const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'default-1',
    title: 'Mat Cleaning — Saturday 8AM',
    description: 'Weekly deep clean. Open mat from 10 AM.',
    pinned: true,
    createdAt: new Date().toISOString(),
  },
];

const AnnouncementContext = createContext<AnnouncementContextValue>({
  announcements: DEFAULT_ANNOUNCEMENTS,
  addAnnouncement: () => {},
  updateAnnouncement: () => {},
  removeAnnouncement: () => {},
});

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(DEFAULT_ANNOUNCEMENTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setAnnouncements(JSON.parse(raw)); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(announcements));
  }, [announcements, loaded]);

  const addAnnouncement = useCallback((a: Omit<Announcement, 'id' | 'createdAt'>) => {
    const next: Announcement = {
      ...a,
      id: generateId('ann'),
      createdAt: new Date().toISOString(),
    };
    setAnnouncements((prev) => [next, ...prev]);
  }, []);

  const updateAnnouncement = useCallback((id: string, patch: Partial<Announcement>) => {
    setAnnouncements((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const removeAnnouncement = useCallback((id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return (
    <AnnouncementContext.Provider value={{ announcements, addAnnouncement, updateAnnouncement, removeAnnouncement }}>
      {children}
    </AnnouncementContext.Provider>
  );
}

export function useAnnouncements() {
  return useContext(AnnouncementContext);
}
