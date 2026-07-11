import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../config/firebase';
import { Order } from '../types/orders';
import { DrinkType } from '../types/drinks';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import { safeStorageGetJSON } from '../utils/safeStorage';
import { generateId } from '../utils/generateId';

const ORDERS_KEY = '@zenki_orders';

/** Newest-first local order history — the receipt source of truth (offline-safe). */
export async function getLocalOrders(): Promise<Order[]> {
  return safeStorageGetJSON<Order[]>(ORDERS_KEY, [], (v) => Array.isArray(v));
}

/** Append an order to local history. Throws on failure so the caller can abort
 *  BEFORE deducting points (keeps points and the order record consistent). */
export async function appendLocalOrder(order: Order): Promise<void> {
  const existing = await getLocalOrders();
  const next = [order, ...existing].slice(0, 100);
  await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
}

/**
 * Best-effort cloud persist so the dojo/admin can see + fulfill the order.
 * Mirrors the appointmentSync pattern (serverConfirmedSetDoc + firebaseUid
 * stamp). Returns false on rule rejection / offline / unconfigured Firebase —
 * the local record still stands, so no order is ever silently lost.
 *
 * Audit 2.0.5 P1 (paid-order data loss): a failed cloud sync is no longer
 * fire-and-forget — the order id is recorded in an unsynced queue and
 * re-pushed by flushUnsyncedOrders() when a session lands (App.tsx), so a
 * PAID order that missed Firestore reaches the dojo on the next launch
 * instead of living only on the buyer's device.
 */
const UNSYNCED_ORDERS_KEY = '@zenki_orders_unsynced';

async function readUnsyncedIds(): Promise<string[]> {
  return safeStorageGetJSON<string[]>(UNSYNCED_ORDERS_KEY, [], (v) => Array.isArray(v));
}

async function setUnsyncedIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(UNSYNCED_ORDERS_KEY, JSON.stringify(ids)).catch(() => {});
}

export async function saveOrderToFirestore(order: Order): Promise<boolean> {
  const { id, ...rest } = order;
  const firebaseUid = auth?.currentUser?.uid;
  const payload = firebaseUid ? { ...rest, firebaseUid } : rest;
  const ok = await serverConfirmedSetDoc(
    'orders',
    id,
    stripUndefined(payload as Record<string, unknown>),
    '[Orders Firestore]',
  );
  try {
    const ids = await readUnsyncedIds();
    if (ok && ids.includes(id)) {
      await setUnsyncedIds(ids.filter((x) => x !== id));
    } else if (!ok && !ids.includes(id)) {
      await setUnsyncedIds([...ids, id]);
    }
  } catch {
    /* queue bookkeeping is best-effort */
  }
  return ok;
}

/** Re-push local orders whose cloud sync failed. Safe to call repeatedly. */
export async function flushUnsyncedOrders(): Promise<void> {
  const ids = await readUnsyncedIds();
  if (ids.length === 0) return;
  const local = await getLocalOrders();
  for (const id of ids) {
    const order = local.find((o) => o.id === id);
    if (!order) {
      // Rotated out of local history — nothing left to push; drop the marker.
      const now = await readUnsyncedIds();
      await setUnsyncedIds(now.filter((x) => x !== id));
      continue;
    }
    await saveOrderToFirestore(order); // clears/re-adds its own queue marker
  }
}

/**
 * Persist a durable receipt for a SUCCESSFUL Apple Pay drink-tab charge.
 *
 * The drink tab itself lives in device-local AsyncStorage (DrinkTrackerContext),
 * so an Apple Pay charge there previously left NO server-side trace and discarded
 * the Stripe paymentIntentId entirely (audit finding F20). This records the charge
 * as a `kind:'drinks'` order — locally (shows in OrderHistory) and best-effort to
 * Firestore (so the dojo/admin can reconcile it) — keyed by paymentIntentId-derived
 * id and stamped with firebaseUid for the orders rule.
 *
 * Line items are re-priced from DRINK_DEFINITIONS (the trusted menu) so the saved
 * receipt reflects real prices, not anything the caller passed for the total.
 * Returns true once the LOCAL record is written (the receipt of record); cloud
 * sync is best-effort and never blocks. Throws only if local persistence fails,
 * so the caller can surface an honest error instead of a fake success.
 */
export async function saveDrinkChargeOrder(params: {
  /** Local Member.id, if known. Falls back to the Firebase uid. */
  memberId?: string;
  /** Buyer display name. Falls back to the Auth displayName, then 'Member'. */
  memberName?: string;
  /** Aggregated unpaid tab by drink type. */
  drinks: Array<{ type: string; count: number }>;
  /** Total actually charged, USD. */
  amountUsd: number;
  /** Stripe PaymentIntent id from the successful charge. */
  paymentIntentId?: string;
}): Promise<boolean> {
  const current = auth?.currentUser;
  const memberId = params.memberId ?? current?.uid ?? 'unknown';
  const memberName = params.memberName ?? current?.displayName ?? 'Member';

  const items: Order['items'] = params.drinks
    .filter((d) => d.count > 0)
    .map((d) => {
      const def = DRINK_DEFINITIONS.find((x) => x.type === (d.type as DrinkType));
      return {
        productId: `drink_${d.type}`,
        productName: def?.label ?? d.type,
        quantity: d.count,
        unitPrice: def?.price ?? 0,
      };
    });

  // Prefer a deterministic id from the PaymentIntent so a retried write upserts
  // the same doc rather than duplicating the receipt.
  const id = params.paymentIntentId ? `drink_${params.paymentIntentId}` : generateId('drink-order');

  const order: Order = {
    id,
    kind: 'drinks',
    memberId,
    memberName,
    items,
    subtotal: params.amountUsd,
    pointsUsed: 0,
    pointsValueUsd: 0,
    promoDiscountUsd: 0,
    balanceDueUsd: 0,
    status: 'paid',
    paymentMethod: 'apple_pay',
    paymentIntentId: params.paymentIntentId,
    createdAt: new Date().toISOString(),
  };

  // Local first — this is the receipt of record. Throw on failure so the caller
  // doesn't report a charge as fully captured when nothing was persisted.
  await appendLocalOrder(order);
  // Best-effort cloud sync; the local record stands regardless of network.
  saveOrderToFirestore(order).then((ok) => {
    if (!ok) console.warn('[Orders] drink charge kept locally; cloud sync pending:', order.id);
  });
  return true;
}
