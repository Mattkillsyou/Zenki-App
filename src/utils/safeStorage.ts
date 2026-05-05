import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────────────
// Safe AsyncStorage / JSON helpers.
//
// Two pain points across the app addressed here:
//
// 1. Bare `JSON.parse` inside a try/catch that just swallows everything.
//    ~23 callsites lose state silently when AsyncStorage holds a malformed
//    blob (e.g., schema migration, partial write, manually edited).
//
// 2. ~75 callsites of `AsyncStorage.setItem(...).catch(() => {})` that
//    silently lose data when disk is full or storage is corrupt — user
//    sees the in-memory state succeed and assumes it's persisted.
//
// New code should use `safeParseJSON` and `safeStorageSet` instead.
// Existing callsites can be migrated incrementally.
// ─────────────────────────────────────────────────────────────────────

/**
 * Parse a JSON string, returning `fallback` if parsing fails OR the
 * result is not the expected shape. The optional `validate` predicate
 * lets the caller assert structural shape on the parsed value before
 * accepting it.
 *
 * Usage:
 *   const parsed = safeParseJSON<Member[]>(raw, [], Array.isArray);
 *   const settings = safeParseJSON<Settings>(raw, defaultSettings);
 */
export function safeParseJSON<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (value: unknown) => boolean,
): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) {
      console.warn('[safeParseJSON] validation failed; using fallback');
      return fallback;
    }
    return parsed as T;
  } catch (err) {
    console.warn('[safeParseJSON] parse failed; using fallback:', err);
    return fallback;
  }
}

/**
 * Write a value to AsyncStorage with a logged failure path. JSON-stringifies
 * objects automatically; callers passing a string can opt out via the
 * `raw: true` option.
 *
 * Returns `true` on success, `false` on failure. Failures are logged with
 * `logTag` so the call site is identifiable in console, replacing the
 * common silent `.catch(() => {})` anti-pattern.
 */
export async function safeStorageSet(
  key: string,
  value: unknown,
  logTag: string,
): Promise<boolean> {
  try {
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    await AsyncStorage.setItem(key, payload);
    return true;
  } catch (err) {
    console.warn(`${logTag} AsyncStorage.setItem(${key}) failed:`, err);
    return false;
  }
}

/**
 * Read + parse in one call. Combines `AsyncStorage.getItem` with
 * `safeParseJSON`, returning `fallback` if the key is absent, the read
 * fails, or the parse fails.
 */
export async function safeStorageGetJSON<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => boolean,
): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return safeParseJSON<T>(raw, fallback, validate);
  } catch (err) {
    console.warn(`[safeStorageGetJSON] getItem(${key}) failed:`, err);
    return fallback;
  }
}
