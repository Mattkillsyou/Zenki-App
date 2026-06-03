/**
 * Cloud Function — POST /stripeWebhook   (Stripe-signed, public endpoint)
 *
 * Server-authoritative payment reconciliation (APP_AUDIT F19): a client can fail
 * to write its order record after a successful charge, leaving money received
 * with no trace. This webhook records EVERY succeeded/failed PaymentIntent in
 * `payments/{paymentIntentId}` from Stripe's own event, independent of the app.
 *
 * Owner setup (one-time):
 *   1) firebase functions:secrets:set STRIPE_WEBHOOK_SECRET   (the `whsec_…` from the dashboard)
 *   2) Stripe Dashboard → Developers → Webhooks → Add endpoint:
 *        https://us-central1-zenki-dojo.cloudfunctions.net/stripeWebhook
 *      events: payment_intent.succeeded, payment_intent.payment_failed
 *
 * Until the secret is set the endpoint safely rejects everything (signature
 * verification fails → 400), so it's inert to deploy.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false, region: 'us-central1' },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const sig = req.get('stripe-signature');
    const whSecret = STRIPE_WEBHOOK_SECRET.value();
    if (!sig || !whSecret) { res.status(400).send('Missing signature/secret'); return; }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    let event: any;
    try {
      // req.rawBody (Buffer) is required — Stripe verifies the exact bytes.
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig, whSecret);
    } catch (e: any) {
      logger.warn('[stripeWebhook] signature verification failed', e?.message);
      res.status(400).send(`Webhook Error: ${e?.message}`);
      return;
    }

    try {
      if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        const md = pi.metadata || {};
        await admin.firestore().doc(`payments/${pi.id}`).set(
          {
            paymentIntentId: pi.id,
            status: event.type === 'payment_intent.succeeded' ? 'succeeded' : 'failed',
            amountCents: pi.amount,
            currency: pi.currency,
            firebaseUid: md.uid ?? null,
            kind: md.kind ?? 'order',
            items: md.items ?? null,
            drinks: md.drinks ?? null,
            stripeCreated: pi.created,
            recordedAt: new Date().toISOString(),
            source: 'stripe-webhook',
          },
          { merge: true },
        );
        logger.info('[stripeWebhook] recorded', { id: pi.id, type: event.type, amount: pi.amount });
      }
      // Ack all other event types so Stripe doesn't retry.
      res.json({ received: true });
    } catch (e: any) {
      logger.error('[stripeWebhook] handler error', e);
      // 500 → Stripe retries with backoff (the event isn't lost).
      res.status(500).send('handler-error');
    }
  },
);
