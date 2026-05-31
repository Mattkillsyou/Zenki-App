import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from '../config/firebase';
import { Order } from '../types/orders';
import { serverConfirmedSetDoc, stripUndefined } from './firestoreUtils';
import { safeStorageGetJSON } from '../utils/safeStorage';

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
 */
export async function saveOrderToFirestore(order: Order): Promise<boolean> {
  const { id, ...rest } = order;
  const firebaseUid = auth?.currentUser?.uid;
  const payload = firebaseUid ? { ...rest, firebaseUid } : rest;
  return serverConfirmedSetDoc(
    'orders',
    id,
    stripUndefined(payload as Record<string, unknown>),
    '[Orders Firestore]',
  );
}
