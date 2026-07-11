import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { safeStorageGetJSON, safeStorageSet } from '../utils/safeStorage';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, FIREBASE_CONFIGURED } from '../config/firebase';
import { useFirebaseUid } from '../hooks/useFirebaseUid';

const STORAGE_KEY = '@zenki_scheduling_config';

/** A single bookable session type with its admin-editable price. */
export type SessionTypeConfig = {
  id: string;
  label: string;
  duration: string;   // e.g. "60 min" — parsed by BookScreen's parseDurationMinutes
  price: number;
};

/** App-wide scheduling/booking config (single Firestore doc: config/scheduling). */
export type SchedulingConfig = {
  showPricing: boolean;
  sessionTypes: SessionTypeConfig[];
};

/**
 * Defaults. NOTE: showPricing defaults to FALSE — the owner wants booking
 * pricing hidden "for now," to be re-enabled later by an admin. The session
 * types / prices live here so they're admin-editable via the Firestore doc.
 */
const DEFAULT_CONFIG: SchedulingConfig = {
  showPricing: false,
  sessionTypes: [
    { id: 'private', label: '1:1 Private', duration: '60 min', price: 150 },
    { id: 'partner', label: 'Partner Session', duration: '60 min', price: 100 },
    { id: 'pilates', label: 'Pilates', duration: '50 min', price: 120 },
  ],
};

/** Pure helper: format a session type's display price (Partner is priced /ea). */
export function priceLabelFor(t: SessionTypeConfig): string {
  return '$' + t.price + (t.id === 'partner' ? '/ea' : '');
}

interface SchedulingConfigContextValue {
  config: SchedulingConfig;
  showPricing: boolean;
  sessionTypes: SessionTypeConfig[];
  updateConfig: (partial: Partial<SchedulingConfig>) => Promise<void>;
  isSyncing: boolean;
}

const SchedulingConfigContext = createContext<SchedulingConfigContextValue>({
  config: DEFAULT_CONFIG,
  showPricing: DEFAULT_CONFIG.showPricing,
  sessionTypes: DEFAULT_CONFIG.sessionTypes,
  updateConfig: async () => {},
  isSyncing: false,
});

/**
 * Merge a (possibly partial / untrusted) stored object over DEFAULT_CONFIG so a
 * doc with only `showPricing` still gets the default sessionTypes, and a
 * malformed/empty sessionTypes falls back to defaults.
 */
function sanitizeConfig(raw: any): SchedulingConfig {
  const showPricing =
    typeof raw?.showPricing === 'boolean' ? raw.showPricing : DEFAULT_CONFIG.showPricing;
  const sessionTypes =
    Array.isArray(raw?.sessionTypes) && raw.sessionTypes.length > 0
      ? raw.sessionTypes.map((t: any, i: number) => ({
          id: typeof t?.id === 'string' && t.id ? t.id : `type-${i}`,
          label: typeof t?.label === 'string' ? t.label : '',
          duration: typeof t?.duration === 'string' ? t.duration : '60 min',
          price: typeof t?.price === 'number' && !isNaN(t.price) ? t.price : 0,
        }))
      : DEFAULT_CONFIG.sessionTypes;
  return { showPricing, sessionTypes };
}

export function SchedulingConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<SchedulingConfig>(DEFAULT_CONFIG);
  const [isSyncing, setIsSyncing] = useState(false);
  const cloudSyncEnabled = FIREBASE_CONFIGURED && !!db;

  // ── Initial load: AsyncStorage first (fast), Firestore subscribe second
  useEffect(() => {
    safeStorageGetJSON<any>(STORAGE_KEY, null, (v) => v != null).then((parsed) => {
      if (parsed) setConfig(sanitizeConfig(parsed));
    });
  }, []);

  // ── Firestore realtime subscription — runs only if configured
  const fbUid = useFirebaseUid();
  useEffect(() => {
    if (!cloudSyncEnabled || !db) return;
    setIsSyncing(true);
    const ref = doc(db, 'config', 'scheduling');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const merged = sanitizeConfig(snap.data());
          setConfig(merged);
          void safeStorageSet(STORAGE_KEY, merged, '[SchedulingConfig]');
        }
        // No doc yet → keep DEFAULT_CONFIG (pricing hidden).
        setIsSyncing(false);
      },
      (err) => {
        console.warn('[SchedulingConfig] Firestore subscribe error:', err);
        setIsSyncing(false);
      },
    );
    return () => unsub();
    // Audit 2.0.5: fbUid in deps — under the LIVE rules /config/scheduling
    // still requires sign-in (the public-read rule is in the pending deploy),
    // so the guest-boot listener died and never re-attached after sign-in,
    // pinning Book Private to DEFAULT_CONFIG until restart.
  }, [cloudSyncEnabled, fbUid]);

  const updateConfig = useCallback(async (partial: Partial<SchedulingConfig>): Promise<void> => {
    const merged: SchedulingConfig = sanitizeConfig({ ...config, ...partial });
    // Cloud-first when configured: only mutate local state AFTER the write
    // succeeds, so a failed admin save (e.g. a non-admin, or denied write) does
    // NOT flip the on-device pricing UI while the caller surfaces "Save failed".
    // The realtime onSnapshot will also re-assert the server state. Offline /
    // no-Firebase falls back to a straight local write.
    if (cloudSyncEnabled && db) {
      await setDoc(doc(db, 'config', 'scheduling'), merged, { merge: true });
    }
    setConfig(merged);
    void safeStorageSet(STORAGE_KEY, merged, '[SchedulingConfig]');
  }, [config, cloudSyncEnabled]);

  return (
    <SchedulingConfigContext.Provider
      value={{
        config,
        showPricing: config.showPricing,
        sessionTypes: config.sessionTypes,
        updateConfig,
        isSyncing,
      }}
    >
      {children}
    </SchedulingConfigContext.Provider>
  );
}

export function useSchedulingConfig() {
  return useContext(SchedulingConfigContext);
}
