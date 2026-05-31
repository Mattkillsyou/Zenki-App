/**
 * createPaymentIntent — server-side Stripe PaymentIntent for in-app Apple Pay /
 * card checkout (clothing store + drink tab). Bearer-token auth + per-UID rate
 * limiting, mirroring the AI endpoints. The Stripe secret key lives in Functions
 * Secret Manager (STRIPE_SECRET_KEY) — the client never sees it.
 *
 * HARDENING TODO (see APPLE_PAY_SETUP.md): recompute the charge amount
 * server-side from a trusted cart/tab instead of trusting client `amountCents`,
 * and add a Stripe webhook (payment_intent.succeeded) to reconcile fulfillment.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { enforceRateLimit } from './rateLimit';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');

/** Server-authoritative drink prices (mirror of src/data/drinks.ts). Drinks have
 *  no points/promo discounts, so a drink-tab charge is FULLY validated against
 *  this map. Keep in sync with the client catalog. */
const DRINK_PRICES: Record<string, number> = {
  water: 2.0, protein: 5.0, electrolytes: 3.0, bcaa: 4.0, coffee: 3.0,
  energy: 4.0, kombucha: 4.5, juice: 5.5, tea: 3.5,
};

const MAX_CHARGE_CENTS = 1_000_00; // $1,000 hard ceiling (abuse/typo guard)

export const createPaymentIntent = onRequest(
  { secrets: [STRIPE_SECRET_KEY], cors: true, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    // Verify the Firebase Auth ID token.
    const authHdr = req.get('Authorization') || req.headers?.authorization;
    if (!authHdr?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'missing-token' });
      return;
    }
    let uid: string;
    try {
      const decoded = await admin.auth().verifyIdToken(authHdr.substring(7));
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: 'invalid-token' });
      return;
    }

    const rate = await enforceRateLimit(uid, 'createPaymentIntent');
    if (!rate.ok) {
      res.status(429).json({ error: rate.reason ?? 'rate-limited' });
      return;
    }

    const amountCents = Math.round(Number(req.body?.amountCents));
    const currency = String(req.body?.currency ?? 'usd').toLowerCase();
    const kind = String(req.body?.kind ?? 'order').slice(0, 32);
    const items: any[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const drinks: any[] = Array.isArray(req.body?.drinks) ? req.body.drinks : [];
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      res.status(400).json({ error: 'invalid-amount' });
      return;
    }

    // ── Amount validation ──
    // chargeCents is what we actually charge. We make it server-authoritative
    // where we can (drinks); for orders we bound it (see note) and keep an
    // audit trail in metadata.
    let chargeCents = amountCents;
    const metadata: Record<string, string> = { uid, kind };

    if (kind === 'drinks') {
      // Fully server-validated: recompute from the server price map.
      let total = 0;
      for (const d of drinks) {
        const price = DRINK_PRICES[String(d?.type)];
        if (price == null) { res.status(400).json({ error: 'unknown-drink' }); return; }
        total += price * Math.max(0, Math.floor(Number(d?.count) || 0));
      }
      const serverCents = Math.round(total * 100);
      if (serverCents < 50) { res.status(400).json({ error: 'invalid-amount' }); return; }
      if (Math.abs(serverCents - amountCents) > 1) {
        logger.warn('[createPaymentIntent] drink amount mismatch', { uid, amountCents, serverCents });
        res.status(400).json({ error: 'amount-mismatch' });
        return;
      }
      chargeCents = serverCents; // authoritative
      metadata.drinks = drinks.map((d) => `${d?.type}x${d?.count}`).join(',').slice(0, 450);
    } else {
      // Orders: built-in product prices + points/promo discounts live on the
      // CLIENT (see APPLE_PAY_SETUP.md "server-side amount validation"), so we
      // can't fully recompute the total here yet. Guard against gross tampering:
      // the charge may not EXCEED the client-sent item subtotal (discounts only
      // reduce it), and record the line items for the dojo's audit trail.
      const subtotalCents = Math.round(
        items.reduce((s, it) =>
          s + (Number(it?.unitPrice) || 0) * Math.max(0, Math.floor(Number(it?.quantity) || 0)), 0) * 100,
      );
      if (items.length > 0 && subtotalCents > 0 && amountCents > subtotalCents + 1) {
        logger.warn('[createPaymentIntent] order amount exceeds items', { uid, amountCents, subtotalCents });
        res.status(400).json({ error: 'amount-exceeds-items' });
        return;
      }
      metadata.items = items.map((it) => `${it?.quantity}x ${String(it?.name ?? '').slice(0, 24)}`).join('; ').slice(0, 450);
    }

    if (!Number.isFinite(chargeCents) || chargeCents < 50 || chargeCents > MAX_CHARGE_CENTS) {
      res.status(400).json({ error: 'invalid-amount' });
      return;
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const intent = await stripe.paymentIntents.create({
        amount: chargeCents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata,
      });
      logger.info('[createPaymentIntent] created', { uid, chargeCents, kind, id: intent.id });
      res.status(200).json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    } catch (e) {
      logger.error('[createPaymentIntent] stripe error', e);
      res.status(500).json({ error: 'payment-intent-failed' });
    }
  },
);
