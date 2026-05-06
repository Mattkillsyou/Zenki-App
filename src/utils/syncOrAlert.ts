import { Alert } from 'react-native';

// ─────────────────────────────────────────────────────────────────────
// Surface silent Firestore write failures to the user.
//
// Many admin context methods used to fire-and-forget the cloud write:
//   upsertXInFirestore(item).catch(() => {});
//
// When the write was rejected by the rules (e.g. /admins/{uid} missing),
// the local optimistic state stayed but a later live `onSnapshot` would
// clobber it with the unchanged remote, and the user saw "my change just
// disappeared." Replacing those `.catch` handlers with `syncOrAlert` lets
// the user know SOMETHING went wrong so they don't think the app is
// broken at random.
//
// Debounced — Firestore can return multiple failures in fast succession
// (sign-in races, batch writes); we don't want a queue of identical alerts.
// ─────────────────────────────────────────────────────────────────────

let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 4000;

export async function syncOrAlert(
  promise: Promise<boolean>,
  label: string,
): Promise<boolean> {
  try {
    const ok = await promise;
    if (!ok) {
      const now = Date.now();
      if (now - lastAlertAt > ALERT_COOLDOWN_MS) {
        lastAlertAt = now;
        Alert.alert(
          `${label} not synced`,
          "Saved locally but the cloud rejected the write. If you're an admin, your /admins entry may be missing in Firestore. The change will revert on next reload until this is fixed.",
        );
      }
      return false;
    }
    return true;
  } catch (err: any) {
    console.warn(`[syncOrAlert] ${label}:`, err);
    return false;
  }
}
