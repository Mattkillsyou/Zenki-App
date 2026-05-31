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
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      res.status(400).json({ error: 'invalid-amount' });
      return;
    }

    try {
      const stripe = new Stripe(STRIPE_SECRET_KEY.value());
      const intent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: { uid, kind },
      });
      logger.info('[createPaymentIntent] created', { uid, amountCents, kind, id: intent.id });
      res.status(200).json({ clientSecret: intent.client_secret, paymentIntentId: intent.id });
    } catch (e) {
      logger.error('[createPaymentIntent] stripe error', e);
      res.status(500).json({ error: 'payment-intent-failed' });
    }
  },
);
