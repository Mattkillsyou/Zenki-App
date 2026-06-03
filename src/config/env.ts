/**
 * Environment configuration — reads from Expo constants or falls back to defaults.
 * Sensitive values should be set in app.config.js extra field or EAS secrets.
 */

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

/** Google OAuth Client ID for calendar integration */
export const GOOGLE_CLIENT_ID: string =
  extra.GOOGLE_CLIENT_ID || process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';

/** Google Apps Script URL for Sheets integration */
export const GOOGLE_SHEETS_SCRIPT_URL: string =
  extra.GOOGLE_SHEETS_SCRIPT_URL || process.env.EXPO_PUBLIC_SHEETS_URL || '';

/**
 * Shared secret sent with every timeclock payroll write so the Apps Script can
 * reject anonymous POSTs (the deployment URL is otherwise an unauthenticated
 * public write into the master timesheet — see APP_AUDIT.md F43).
 *
 * MUST be provisioned via EAS (never hardcoded here, or it ships in the bundle):
 *   eas secret:create --name EXPO_PUBLIC_SHEETS_PROXY_TOKEN --value "<random>"
 * and the Apps Script must compare `e.parameter`/body `token` against the same
 * value stored in a Script Property, rejecting mismatches. Empty until set —
 * `pushTimeEntry` still sends the field (blank) so the script can fail closed.
 */
export const SHEETS_PROXY_TOKEN: string =
  extra.SHEETS_PROXY_TOKEN || process.env.EXPO_PUBLIC_SHEETS_PROXY_TOKEN || '';

/** USDA FoodData Central API key */
export const USDA_API_KEY: string =
  extra.USDA_API_KEY || process.env.EXPO_PUBLIC_USDA_API_KEY || '';

/** Stripe publishable key (client-side). Set in app.json `extra` or as the
 *  EAS/EXPO_PUBLIC env var. Empty until configured — see APPLE_PAY_SETUP.md. */
export const STRIPE_PUBLISHABLE_KEY: string =
  extra.STRIPE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

/** Apple Pay / Stripe merchant identifier (must match the app.json entitlement
 *  and an Apple Merchant ID you create in the Apple Developer portal). */
export const STRIPE_MERCHANT_ID: string =
  extra.STRIPE_MERCHANT_ID || process.env.EXPO_PUBLIC_STRIPE_MERCHANT_ID || 'merchant.com.zenkidojo.app';

/** True once Stripe has a publishable key. Gates the whole Apple Pay flow —
 *  when false the stores fall back to reserve / settle-in-person (mirrors
 *  FIREBASE_CONFIGURED). */
export const STRIPE_CONFIGURED: boolean = Boolean(STRIPE_PUBLISHABLE_KEY.trim());
