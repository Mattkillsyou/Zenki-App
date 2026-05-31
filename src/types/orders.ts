/** A store order placed at checkout. Persisted locally (receipt/history) and,
 *  best-effort, to Firestore so the dojo/admin can see + fulfill it. */

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  selectedSize?: string;
  /** Per-unit price charged (member price), USD. */
  unitPrice: number;
}

export type OrderStatus = 'reserved' | 'paid';

export interface Order {
  id: string;
  /** Local Member.id. */
  memberId: string;
  /** Firebase Auth uid — stamped on the cloud write for rules ownership. */
  firebaseUid?: string;
  items: OrderItem[];
  /** Cart subtotal before discounts, USD. */
  subtotal: number;
  /** Dojo Points redeemed. */
  pointsUsed: number;
  /** USD value of the points redeemed. */
  pointsValueUsd: number;
  /** Promo label applied, if any. */
  promoLabel?: string;
  /** USD value of the promo discount. */
  promoDiscountUsd: number;
  /** Balance due at pickup, USD (0 = paid in full with points). */
  balanceDueUsd: number;
  status: OrderStatus;
  /** How the order was paid. */
  paymentMethod: 'apple_pay' | 'pay_at_dojo';
  /** Stripe PaymentIntent id, when paid in-app via Apple Pay. */
  paymentIntentId?: string;
  /** ISO timestamp. */
  createdAt: string;
}
