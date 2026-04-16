import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@zenki_privacy';

export interface PrivacySettings {
  isVisibleInFeed: boolean;     // shown in community feed when posting
  messagingEnabled: boolean;    // accepts DMs from other members
}

const DEFAULTS: PrivacySettings = {
  isVisibleInFeed: true,
  messagingEnabled: true,
};

interface PrivacyContextValue {
  settings: PrivacySettings;
  setVisibleInFeed: (v: boolean) => void;
  setMessagingEnabled: (v: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextValue>({
  settings: DEFAULTS,
  setVisibleInFeed: () => {},
  setMessagingEnabled: () => {},
});

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setSettings({ ...DEFAULTS, ...JSON.parse(raw) }); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, loaded]);

  const setVisibleInFeed = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, isVisibleInFeed: v }));
  }, []);

  const setMessagingEnabled = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, messagingEnabled: v }));
  }, []);

  return (
    <PrivacyContext.Provider value={{ settings, setVisibleInFeed, setMessagingEnabled }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
