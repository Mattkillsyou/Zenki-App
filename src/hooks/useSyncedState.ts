import { useEffect, useRef, useState, Dispatch, SetStateAction } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';

// ─────────────────────────────────────────────────────────────────────
// useSyncedState — local React state with AsyncStorage persistence.
//
// What it solves: ~14 contexts duplicate the exact same shape:
//   1. useState(initial)
//   2. useEffect(() => { AsyncStorage.getItem → setState }, [])
//   3. useEffect(() => { if (loaded) AsyncStorage.setItem }, [state])
//   4. a `loaded` flag to gate writes during cold-boot hydrate
// This hook collapses all four into one call.
//
// When NOT to use it:
//   - Contexts that hydrate from MULTIPLE keys (Nutrition: 7 keys, Workout:
//     2 keys, etc.) — keep the per-key shape inline. Mixing them defeats
//     the abstraction.
//   - Contexts with non-trivial init logic (TimeClock period rollover,
//     Gamification achievement merge, DrinkTracker backfill).
//   - Contexts whose source of truth is Firestore — those use the
//     subscribe pattern in src/services/<thing>Sync.ts, and AsyncStorage
//     is just a cache the snapshot writes to. Don't double-manage.
//
// Returns [value, setValue, hydrated]. `hydrated` is true once the initial
// AsyncStorage read has resolved — callers can render loading UI based on it.
// ─────────────────────────────────────────────────────────────────────

interface UseSyncedStateOptions<T> {
  /**
   * Optional structural validator on the parsed value. Returning false
   * causes the hook to fall back to `initialValue` and log via safeParseJSON.
   * Use `Array.isArray` for arrays, or a custom predicate for object shapes.
   */
  validate?: (parsed: unknown) => boolean;
  /**
   * Optional transform applied to the validated parsed value before set.
   * Useful for `{ ...defaults, ...stored }` style merges so callers don't
   * have to track which fields were missing in older saves.
   */
  hydrate?: (parsed: T) => T;
}

export function useSyncedState<T>(
  storageKey: string,
  initialValue: T,
  options: UseSyncedStateOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  // Stash the optional functions in refs so updating them doesn't re-fire
  // the hydrate effect. The first-load behavior is the reading at mount.
  const validateRef = useRef(options.validate);
  const hydrateRef = useRef(options.hydrate);
  validateRef.current = options.validate;
  hydrateRef.current = options.hydrate;

  // Cold-boot hydrate.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (cancelled) return;
      const parsed = safeParseJSON<T>(raw, initialValue, validateRef.current);
      const next = hydrateRef.current ? hydrateRef.current(parsed) : parsed;
      // Avoid clobbering when the parse succeeded but yielded the same
      // initialValue reference (e.g., raw was null) — saves a render.
      if (next !== initialValue) setValue(next);
      setHydrated(true);
    }).catch((err) => {
      console.warn(`[useSyncedState] hydrate(${storageKey}) failed:`, err);
      if (!cancelled) setHydrated(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist on change. Skip until hydrated so the first-paint default
  // doesn't overwrite the saved value.
  useEffect(() => {
    if (!hydrated) return;
    safeStorageSet(storageKey, value, `[useSyncedState ${storageKey}]`);
  }, [value, hydrated, storageKey]);

  return [value, setValue, hydrated];
}
