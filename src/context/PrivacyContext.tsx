import React, { createContext, useContext, useCallback, useMemo } from 'react';
import { useSyncedState } from '../hooks/useSyncedState';

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
  const [settings, setSettings] = useSyncedState<PrivacySettings>(STORAGE_KEY, DEFAULTS, {
    // Spread-merge stored value into defaults so older saves missing newer
    // fields still get reasonable defaults instead of `undefined`.
    hydrate: (parsed) => ({ ...DEFAULTS, ...parsed }),
    validate: (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
  });

  const setVisibleInFeed = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, isVisibleInFeed: v }));
  }, [setSettings]);

  const setMessagingEnabled = useCallback((v: boolean) => {
    setSettings((prev) => ({ ...prev, messagingEnabled: v }));
  }, [setSettings]);

  const value = useMemo(
    () => ({ settings, setVisibleInFeed, setMessagingEnabled }),
    [settings, setVisibleInFeed, setMessagingEnabled],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
