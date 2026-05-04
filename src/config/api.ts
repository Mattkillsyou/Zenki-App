/**
 * External API configuration — non-secret URLs and sizing constants.
 *
 * Secrets (USDA key, Google OAuth client id, Sheets webhook) live in
 * `src/config/env.ts`, which reads from Expo Constants / EAS secrets.
 * Set them via EAS:
 *   eas secret:create EXPO_PUBLIC_USDA_API_KEY --value "..."
 */

/**
 * USDA FoodData Central base URL.
 * Docs: https://fdc.nal.usda.gov/api-guide/
 */
export const USDA_BASE_URL = 'https://api.nal.usda.gov/fdc/v1';

/**
 * Open Food Facts — no key required, unlimited reads.
 * Docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 */
export const OFF_BASE_URL = 'https://world.openfoodfacts.org';

/**
 * Base URL of the Firebase Cloud Functions that wrap the Anthropic Vision API.
 * The function holds the API key server-side; the app only sends image payloads.
 * See `functions/` at project root for the source code of these endpoints.
 *
 * Format: https://{region}-{projectId}.cloudfunctions.net
 * Live (verified): `recognizeFood` returns HTTP 401 to unauthenticated calls.
 */
export const AI_FUNCTION_BASE_URL =
  'https://us-central1-zenki-dojo.cloudfunctions.net';

/**
 * Maximum image side length sent to the AI. We downscale client-side to keep
 * both latency and cost low — Claude Vision accepts up to 8000px but charges
 * per token-equivalent, so 1024px is the practical sweet spot for food photos
 * and medical-report scans alike.
 */
export const AI_IMAGE_MAX_DIMENSION = 1024;

/**
 * Google Apps Script Web App that proxies timeclock entries into the
 * dojo's master timesheet Google Sheet. Rotating: redeploy the script
 * (`Deploy → New deployment`) and replace the URL here.
 *
 * Empty string disables sync (entries are logged locally only).
 */
export const SHEETS_PROXY_URL =
  'https://script.google.com/macros/s/AKfycbz1I9JhmLuJAjR16bEL1XNWRRucF4KrgYXFj-PQX7PcPetYvODd3UFsToFln2W1JDA/exec';

/**
 * Public marketing site URLs surfaced from in-app menus.
 */
export const PRIVACY_URL = 'https://zenki-dojo.web.app/privacy';
export const SUPPORT_URL = 'https://zenki-dojo.web.app/support';

/**
 * Expo push-notification batch endpoint. Standard URL for all Expo apps;
 * see https://docs.expo.dev/push-notifications/sending-notifications/.
 */
export const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Wix CDN base — used by `data/products.ts:wx()` to build high-res image URIs
 * for product detail galleries. Path template: `${WIX_CDN_BASE}/{id}/v1/fill/...`
 */
export const WIX_CDN_BASE = 'https://static.wixstatic.com/media';
