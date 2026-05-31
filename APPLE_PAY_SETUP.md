# Apple Pay (Stripe) — setup checklist

The Apple Pay integration is **scaffolded and config-gated**. Until the steps below are done, `STRIPE_CONFIGURED` is `false`, so the stores keep their current behavior (clothing = reserve & pay at the dojo; drinks = mark settled in person). Nothing charges. Finish these to turn it on.

Clothing + drinks are **physical goods**, so Apple Pay / card is the correct, App-Store-compliant payment method (no In-App Purchase needed).

## 1. Stripe account + keys
1. Create a Stripe account → Dashboard.
2. Copy your **publishable key** (`pk_test_…` for testing, `pk_live_…` for production) and **secret key** (`sk_…`).
3. **Publishable key (client):** set it in `app.json` → `expo.extra.STRIPE_PUBLISHABLE_KEY`, or as an EAS env var `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`eas env:create`). Read by `src/config/env.ts`.
4. **Secret key (server):** store as a Firebase Functions secret — never in code:
   ```bash
   firebase functions:secrets:set STRIPE_SECRET_KEY
   ```
   (`functions/src/createPaymentIntent.ts` reads it via `defineSecret('STRIPE_SECRET_KEY')`.)

## 2. Apple Merchant ID + Apple Pay certificate
1. Apple Developer → Certificates, IDs & Profiles → Identifiers → **Merchant IDs** → create **`merchant.com.zenkidojo.app`** (must match `app.json`: the `@stripe/stripe-react-native` plugin `merchantIdentifier`, the `com.apple.developer.in-app-payments` entitlement, and `STRIPE_MERCHANT_ID`).
2. Stripe Dashboard → Settings → Payments → **Apple Pay** → add iOS app → follow Stripe's flow to create an **Apple Pay Payment Processing Certificate** (Stripe gives you a CSR → create the cert in Apple Developer for the Merchant ID → upload it back to Stripe).
3. The Apple Pay **capability** must be on the App ID's provisioning profile. EAS auto-manages this on build; in bare Xcode, enable "Apple Pay" under Signing & Capabilities and select the Merchant ID.

## 3. Deploy the backend
```bash
cd functions && npm run build
firebase deploy --only functions:createPaymentIntent
# (orders + inviteCodes rules, if not already deployed:)
firebase deploy --only firestore:rules
```

## 4. Rebuild the app (native — required)
`@stripe/stripe-react-native` is a native module, so a JS reload is not enough:
```bash
npx expo prebuild -p ios     # applies the Stripe plugin + Apple Pay entitlement
npx expo run:ios             # or: eas build --profile preview --platform ios
```

## 5. Test (physical device)
- Real Apple Pay requires a **physical device** with a card in Wallet. In **Stripe test mode**, add a test card to Wallet (sandbox) and use Stripe's test cards.
- Clothing: cart → checkout → the button reads "PAY $X WITH APPLE PAY" → Apple Pay sheet → success → order saved with `paymentMethod:'apple_pay'`, `status:'paid'`, `paymentIntentId`.
- Drinks: build a tab → "Settle Tab" → Apple Pay sheet for `unpaidTotal` → success → `payAllUnpaid()` marks the tab paid.
- The **simulator** can show the Apple Pay sheet but cannot complete a real charge.

## How the gate behaves
- `STRIPE_CONFIGURED = Boolean(STRIPE_PUBLISHABLE_KEY)` (`src/config/env.ts`). When false: `StripeProvider` isn't mounted, `isApplePayAvailable()` returns false, and both stores fall back to today's reserve/settle-in-person flow. When true: Apple Pay is the checkout path (with the reserve fallback if a device lacks Apple Pay).

## Follow-ups (not in this scaffold)
- **Server-side amount validation:** `createPaymentIntent` currently trusts the client `amountCents`. Recompute from a trusted cart/tab before going live (prevents tampering).
- **Stripe webhook** (`payment_intent.succeeded`) to reconcile fulfillment server-side (don't rely solely on the client confirm).
- **Refunds / order status management** (admin).
- **Google Pay** (`enableGooglePay` is currently false) if/when Android launches.
