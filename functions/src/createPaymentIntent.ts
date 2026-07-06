/**
 * createPaymentIntent — server-side Stripe PaymentIntent for in-app Apple Pay /
 * card checkout (clothing store + drink tab). Bearer-token auth + per-UID rate
 * limiting, mirroring the AI endpoints. The Stripe secret key lives in Functions
 * Secret Manager (STRIPE_SECRET_KEY) — the client never sees it.
 *
 * Amount validation: drink-tab charges are FULLY recomputed from DRINK_PRICES;
 * order subtotals are now recomputed from a trusted catalog too (PRODUCT_PRICES
 * mirror + live /customProducts lookup, keyed by name — the client payload
 * carries no productId) and each claimed unitPrice must match the trusted
 * price. Residual gap: points/promo discounts still live client-side, so the
 * amount may legitimately sit anywhere between $0.50 and the (now trusted)
 * subtotal; extreme discounts are warn-logged for reconciliation rather than
 * rejected. Stripe webhook (payment_intent.succeeded) reconciles fulfillment.
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

/** Server-authoritative built-in product prices (mirror of
 *  src/data/products.ts § PRODUCTS), keyed by normalized product NAME — the
 *  client's order payload carries { name, unitPrice, quantity } with no
 *  productId. The buyer is always a signed-in member, so `memberPrice` is the
 *  authoritative unit price. Admin-added products are validated against the
 *  live /customProducts collection as well (a claimed price matching ANY
 *  trusted source is accepted — names can collide across the two). Keep in
 *  sync with the client catalog (same contract as DRINK_PRICES above). */
const PRODUCT_PRICES: Record<string, { price: number; memberPrice: number }> = {
  'zenkimono [gi respect edition]':          { price: 200.0,  memberPrice: 170.0 },
  'in zenki dojo we trust hoodie':           { price: 100.0,  memberPrice: 85.0 },
  'helio gracie shirt':                      { price: 30.0,   memberPrice: 25.0 },
  'musashi samurai shirt':                   { price: 30.0,   memberPrice: 25.0 },
  'yoga pants':                              { price: 55.0,   memberPrice: 47.0 },
  '"make jiu jitsu helio gracie again" hat': { price: 29.99,  memberPrice: 24.99 },
  'zenkizeeys':                              { price: 40.0,   memberPrice: 34.0 },
  'zenki dojo samurai handwraps':            { price: 20.0,   memberPrice: 17.0 },
  'zenki dojo water holder':                 { price: 20.0,   memberPrice: 17.0 },
};

function normalizeName(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

const MAX_CHARGE_CENTS = 1_000_00; // $1,000 hard ceiling (abuse/typo guard)

export const createPaymentIntent = onRequest(
  { secrets: [STRIPE_SECRET_KEY], cors: true, region: 'us-central1', invoker: 'public' },
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
    // Pin to USD — all price math (DRINK_PRICES, MAX_CHARGE_CENTS, the order
    // subtotal bound) is USD-denominated, so honoring a client-supplied currency
    // would let a zero-decimal currency like 'jpy' decouple the charged value
    // from the validated amount. The real client always sends 'usd'.
    const currency = 'usd';
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
      // Orders: recompute the subtotal from TRUSTED prices — built-in items
      // from the PRODUCT_PRICES mirror, admin-added items from the live
      // /customProducts collection (was: client-supplied unitPrice, which a
      // tampered client could set to $0.005 and pay $0.50 for a $200 gi).
      // Each claimed unitPrice must match the trusted price; unknown names
      // are rejected. Require line items so the bound below ALWAYS applies —
      // an order with no items would otherwise skip validation entirely.
      //
      // Residual (documented): points/promo discounts still live client-side,
      // so amountCents may legitimately be anywhere from $0.50 up to the
      // trusted subtotal. Extreme discounts are warn-logged for the dojo's
      // reconciliation, not rejected — a heavy-points member's checkout is a
      // legitimate near-100% discount.
      if (items.length === 0) {
        res.status(400).json({ error: 'items-required' });
        return;
      }
      const db = admin.firestore();
      let serverSubtotal = 0;
      for (const it of items) {
        const qty = Math.max(0, Math.floor(Number(it?.quantity) || 0));
        if (qty === 0) continue;
        const name = String(it?.name ?? '');
        const claimedUnit = Number(it?.unitPrice);
        // Names are NOT unique across the two trusted sources: an admin can
        // add a /customProducts doc whose name collides with a built-in (or
        // with another custom product) at a different price. Collect EVERY
        // trusted candidate for the name and accept the claimed unitPrice iff
        // it matches ANY of them — all candidates are server-side prices, so
        // this cannot under-charge, and it stops legitimate checkouts from
        // 400-ing on a name collision (previously the built-in mirror
        // shadowed customs, and limit(1) picked one duplicate arbitrarily).
        const trustedUnits: number[] = [];
        const builtIn = PRODUCT_PRICES[normalizeName(name)];
        if (builtIn && Number.isFinite(builtIn.memberPrice)) {
          trustedUnits.push(builtIn.memberPrice);
        }
        const matchesTrusted = () =>
          Number.isFinite(claimedUnit) &&
          trustedUnits.some((u) => Math.abs(claimedUnit - u) <= 0.01);
        if (!matchesTrusted()) {
          // Admin-added product — look it up by the exact catalog name the
          // client displays (ProductContext streams /customProducts live, so
          // client and server should agree except during an admin edit race,
          // where the safe outcome is rejection).
          try {
            const snap = await db.collection('customProducts')
              .where('name', '==', name).limit(10).get();
            for (const docSnap of snap.docs) {
              const d = docSnap.data();
              const unit = Number.isFinite(Number(d?.memberPrice))
                ? Number(d?.memberPrice)
                : Number.isFinite(Number(d?.price))
                  ? Number(d?.price)
                  : null;
              if (unit != null) trustedUnits.push(unit);
            }
          } catch (e) {
            logger.error('[createPaymentIntent] customProducts lookup failed', e);
          }
        }
        if (trustedUnits.length === 0) {
          logger.warn('[createPaymentIntent] unknown order item', { uid, name: name.slice(0, 60) });
          res.status(400).json({ error: 'unknown-item' });
          return;
        }
        const matchedUnit = Number.isFinite(claimedUnit)
          ? trustedUnits.find((u) => Math.abs(claimedUnit - u) <= 0.01)
          : undefined;
        if (matchedUnit == null) {
          logger.warn('[createPaymentIntent] item price mismatch', {
            uid, name: name.slice(0, 60), claimedUnit, trustedUnits,
          });
          res.status(400).json({ error: 'amount-mismatch' });
          return;
        }
        serverSubtotal += matchedUnit * qty;
      }
      const subtotalCents = Math.round(serverSubtotal * 100);
      if (subtotalCents <= 0) {
        res.status(400).json({ error: 'invalid-items' });
        return;
      }
      if (amountCents > subtotalCents + 1) {
        logger.warn('[createPaymentIntent] order amount exceeds items', { uid, amountCents, subtotalCents });
        res.status(400).json({ error: 'amount-exceeds-items' });
        return;
      }
      if (amountCents < Math.round(subtotalCents * 0.1)) {
        // >90% discount — legal (points), but rare enough to audit-log.
        logger.warn('[createPaymentIntent] heavy order discount', { uid, amountCents, subtotalCents });
      }
      metadata.serverSubtotalCents = String(subtotalCents);
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
