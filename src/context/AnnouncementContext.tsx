import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { generateId } from '../utils/generateId';
import { safeStorageGetJSON, safeStorageSet } from '../utils/safeStorage';
import {
  subscribeToAnnouncements,
  upsertAnnouncementInFirestore,
  deleteAnnouncementFromFirestore,
} from '../services/announcementSync';

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

const AnnouncementContext = createContext<AnnouncementContextValue>({
  announcements: [],
  addAnnouncement: () => {},
  updateAnnouncement: () => {},
  removeAnnouncement: () => {},
});

export function AnnouncementProvider({ children }: { children: React.ReactNode }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // AsyncStorage cache hydrate — covers offline cold-boot. Firestore
  // subscription overwrites this as soon as it fires.
  useEffect(() => {
    safeStorageGetJSON<Announcement[]>(STORAGE_KEY, [], Array.isArray).then((cached) => {
      if (cached.length > 0) setAnnouncements(cached);
    });
  }, []);

  // Live Firestore subscription — source of truth for all clients. The
  // subscription callback persists to AsyncStorage on every fire, including
  // for optimistic updates (Firestore reflects pending writes locally), so
  // a second `useEffect([announcements])` would just write the same value
  // again — pure thrash.
  useEffect(() => {
    const unsub = subscribeToAnnouncements((items) => {
      setAnnouncements(items);
      safeStorageSet(STORAGE_KEY, items, '[Announcements]');
    });
    return () => { unsub(); };
  }, []);

  const addAnnouncement = useCallback((a: Omit<Announcement, 'id' | 'createdAt'>) => {
    const next: Announcement = {
      ...a,
      id: generateId('ann'),
      createdAt: new Date().toISOString(),
    };
    setAnnouncements((prev) => [next, ...prev]);
    upsertAnnouncementInFirestore(next).catch(() => {});
  }, []);

  const updateAnnouncement = useCallback((id: string, patch: Partial<Announcement>) => {
    setAnnouncements((prev) => {
      const nextList = prev.map((a) => (a.id === id ? { ...a, ...patch } : a));
      const merged = nextList.find((a) => a.id === id);
      if (merged) upsertAnnouncementInFirestore(merged).catch(() => {});
      return nextList;
    });
  }, []);

  const removeAnnouncement = useCallback((id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    deleteAnnouncementFromFirestore(id).catch(() => {});
  }, []);

  // Memoize the provider value so consumers don't re-render every time
  // an unrelated parent re-renders the tree.
  const value = useMemo(
    () => ({ announcements, addAnnouncement, updateAnnouncement, removeAnnouncement }),
    [announcements, addAnnouncement, updateAnnouncement, removeAnnouncement],
  );

  return <AnnouncementContext.Provider value={value}>{children}</AnnouncementContext.Provider>;
}

export function useAnnouncements() {
  return useContext(AnnouncementContext);
}
