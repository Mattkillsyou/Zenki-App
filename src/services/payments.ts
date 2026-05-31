/**
 * Apple Pay (Stripe) payment helper for the clothing store + drink tab.
 *
 * All Stripe SDK access is lazy + guarded by STRIPE_CONFIGURED, so an
 * unconfigured build (no publishable key) never touches the native module and
 * the stores fall back to reserve / settle-in-person. See APPLE_PAY_SETUP.md.
 */
import { STRIPE_CONFIGURED } from '../config/env';
import { AI_FUNCTION_BASE_URL } from '../config/api';
import { getCurrentIdToken } from './firebaseAuth';

export interface ApplePayResult {
  ok: boolean;
  paymentIntentId?: string;
  /** True when the user dismissed the sheet (not an error to surface loudly). */
  canceled?: boolean;
  /** Human-facing error message when ok is false and not canceled. */
  error?: string;
}

/** True only when Stripe is configured AND Apple Pay is usable on this device. */
export async function isApplePayAvailable(): Promise<boolean> {
  if (!STRIPE_CONFIGURED) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isPlatformPaySupported } = require('@stripe/stripe-react-native');
    return await isPlatformPaySupported();
  } catch {
    return false;
  }
}

/**
 * Charge `amountCents` via Apple Pay: create a PaymentIntent server-side
 * (createPaymentIntent function, Bearer-authed), then confirm it with the
 * Apple Pay sheet. Returns { ok, paymentIntentId } on success, { ok:false,
 * canceled:true } when dismissed, or { ok:false, error } on failure.
 */
export async function payWithApplePay(params: {
  amountCents: number;
  label: string;
  kind: 'order' | 'drinks';
  /** Order line items — for the server's amount validation + audit trail. */
  items?: Array<{ name: string; unitPrice: number; quantity: number }>;
  /** Drink-tab breakdown — the server fully re-validates the amount from this. */
  drinks?: Array<{ type: string; count: number }>;
}): Promise<ApplePayResult> {
  if (!STRIPE_CONFIGURED) return { ok: false, error: 'Payments are not configured yet.' };
  const amountCents = Math.round(params.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < 50) {
    return { ok: false, error: 'Amount is too small to charge.' };
  }

  let stripe: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    stripe = require('@stripe/stripe-react-native');
  } catch {
    return { ok: false, error: 'Apple Pay is unavailable on this build.' };
  }

  // 1) Server creates the PaymentIntent (secret key stays server-side).
  let clientSecret: string | undefined;
  let paymentIntentId: string | undefined;
  try {
    const token = await getCurrentIdToken();
    if (!token) return { ok: false, error: 'Please sign in to pay.' };
    const res = await fetch(`${AI_FUNCTION_BASE_URL}/createPaymentIntent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        amountCents, currency: 'usd', kind: params.kind,
        items: params.items, drinks: params.drinks,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as any));
      return { ok: false, error: body?.error ? `Payment setup failed (${body.error}).` : 'Payment setup failed.' };
    }
    const json = await res.json();
    clientSecret = json?.clientSecret;
    paymentIntentId = json?.paymentIntentId;
    if (!clientSecret) return { ok: false, error: 'Payment setup failed.' };
  } catch {
    return { ok: false, error: "Couldn't reach the payment server. Check your connection." };
  }

  // 2) Present the Apple Pay sheet + confirm the PaymentIntent.
  try {
    const { error } = await stripe.confirmPlatformPayPayment(clientSecret, {
      applePay: {
        cartItems: [
          {
            label: params.label,
            amount: (amountCents / 100).toFixed(2),
            paymentType: stripe.PlatformPay.PaymentType.Immediate,
          },
        ],
        merchantCountryCode: 'US',
        currencyCode: 'USD',
      },
    });
    if (error) {
      const canceled = error.code === 'Canceled' || /cancel/i.test(error.message ?? '');
      return { ok: false, canceled, error: canceled ? undefined : (error.message ?? 'Payment failed.') };
    }
    return { ok: true, paymentIntentId };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Payment failed.' };
  }
}
