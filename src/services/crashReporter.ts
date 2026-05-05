import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────────────
// Crash reporter — pluggable.
//
// Currently a stub that logs to console (the same channel ErrorBoundary
// uses on every build since the production-logging fix). To swap in a
// real reporter:
//
//   1. `npm install --save @sentry/react-native` (or `@bugsnag/react-native`,
//      `@react-native-firebase/crashlytics`, etc.)
//   2. `npx @sentry/wizard@latest -i reactNative` (or the equivalent setup
//      for whatever vendor you choose)
//   3. Add the DSN to app.json's `extra.SENTRY_DSN` or an env var read by
//      Constants.expoConfig at build time
//   4. Replace the body of `initCrashReporter` and `reportError` below
//      with calls to the chosen SDK
//
// The shape of this module — `initCrashReporter`, `reportError`,
// `setUser`, `addBreadcrumb` — is intentionally a near-1:1 match for the
// Sentry / Bugsnag / Crashlytics public APIs so the swap is mechanical.
// ─────────────────────────────────────────────────────────────────────

interface CrashUser {
  id: string;
  username?: string;
}

interface ReportOptions {
  /** Free-form key/value tags attached to the event. */
  tags?: Record<string, string>;
  /** Larger structured payload (component stack, network state, etc.). */
  extras?: Record<string, unknown>;
}

let initialized = false;
let currentUser: CrashUser | null = null;

/**
 * Wire this once at app boot, before any other code can throw. Idempotent.
 * Call from App.tsx after FIREBASE_CONFIGURED is checked but before the
 * provider tree mounts.
 */
export function initCrashReporter(): void {
  if (initialized) return;
  initialized = true;
  // STUB — no SDK to init. When Sentry is wired:
  //   import * as Sentry from '@sentry/react-native';
  //   Sentry.init({ dsn: SENTRY_DSN, environment: __DEV__ ? 'dev' : 'prod' });
  console.log(
    `[crashReporter] initialized (stub, ${Platform.OS}). ` +
    `Plug in Sentry/Bugsnag/Crashlytics in src/services/crashReporter.ts.`,
  );
}

/**
 * Report a caught error. Used by `ErrorBoundary.onError` and any
 * service-layer try/catch that wants to surface a non-fatal failure.
 */
export function reportError(error: unknown, options: ReportOptions = {}): void {
  if (!initialized) {
    // Don't drop on the floor — at least log so the dev sees it.
    console.warn('[crashReporter] reportError before init:', error, options);
    return;
  }
  const payload = {
    user: currentUser,
    tags: options.tags ?? {},
    extras: options.extras ?? {},
  };
  // STUB — when Sentry is wired:
  //   Sentry.captureException(error, { tags: payload.tags, extras: payload.extras });
  console.error('[crashReporter]', error, payload);
}

/**
 * Tag the active user so reports can be correlated. Pass `null` on sign-out.
 * Avoid PII beyond uid/username — emails/phone are intentionally not part
 * of this shape.
 */
export function setUser(user: CrashUser | null): void {
  currentUser = user;
  // STUB — when Sentry is wired:
  //   Sentry.setUser(user ? { id: user.id, username: user.username } : null);
}

/**
 * Drop a breadcrumb so the next captured exception has context. Useful
 * around significant user actions (navigation, expensive network calls,
 * permission requests).
 */
export function addBreadcrumb(message: string, data?: Record<string, unknown>): void {
  if (!initialized) return;
  // STUB — when Sentry is wired:
  //   Sentry.addBreadcrumb({ message, data, level: 'info' });
  if (__DEV__) console.log('[crashReporter:breadcrumb]', message, data);
}
