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

/**
 * Module-private fallback for safeParseJSON. safeParseJSON returns the SAME
 * fallback reference on failure, so using `initialValue` made "key absent" and
 * "key present but corrupt" indistinguishable — and the corrupt case silently
 * armed persistence with the default. A private sentinel makes failure testable.
 */
const SENTINEL: unique symbol = Symbol('useSyncedState.parse-failed');

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
): [T, Dispatch<SetStateAction<T>>, boolean, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);
  // Hydrate SUCCEEDED (as opposed to merely completed). See below — this is the
  // flag that gates persistence, and Firestore-backed callers must gate their
  // migration on it too.
  const [hydrateOk, setHydrateOk] = useState(false);
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
      if (raw != null) {
        // A SENTINEL (not initialValue) as the fallback so an unreadable blob is
        // DETECTABLE: safeParseJSON returns the fallback reference on failure,
        // so passing initialValue made "key absent" and "key corrupt"
        // indistinguishable — and the corrupt case then armed persistence and
        // wrote [] over the stored data.
        const parsed = safeParseJSON<T>(raw, SENTINEL as unknown as T, validateRef.current);
        if ((parsed as unknown) === SENTINEL) {
          console.warn(`[useSyncedState] ${storageKey} is present but unreadable — refusing to persist over it this session.`);
          setHydrated(true);   // let UI proceed…
          return;              // …but leave hydrateOk false: never overwrite it.
        }
        const next = hydrateRef.current ? hydrateRef.current(parsed) : parsed;
        setValue(next);
      }
      setHydrateOk(true);
      setHydrated(true);
    }).catch((err) => {
      // A FAILED read must never arm persistence: doing so wrote the empty
      // default over the user's stored list on the next change — permanent loss
      // after one transient storage error. The other contexts guard this
      // explicitly (see WorkoutContext / GamificationContext hydrate-wipe
      // comments); the hook now does too, for all ~14 of its callers.
      console.warn(`[useSyncedState] hydrate(${storageKey}) failed — persist disabled this session to protect stored data:`, err);
      if (!cancelled) setHydrated(true); // UI proceeds; hydrateOk stays false.
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist on change. Gated on hydrateOk (not merely hydrated) so a failed or
  // unreadable hydrate can never overwrite what's on disk.
  useEffect(() => {
    if (!hydrateOk) return;
    safeStorageSet(storageKey, value, `[useSyncedState ${storageKey}]`).then((ok) => {
      // Surface a failing persist rather than swallowing it: under a durability
      // migration, a silently dead cache hides real data loss (e.g. blowing the
      // Android AsyncStorage size limit kills every write to the key).
      if (!ok) console.warn(`[useSyncedState] ${storageKey} PERSIST FAILED — on-device cache is not being written.`);
    }).catch(() => {});
  }, [value, hydrateOk, storageKey]);

  return [value, setValue, hydrated, hydrateOk];
}
