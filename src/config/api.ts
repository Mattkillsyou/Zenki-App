/**
 * External API configuration.
 *
 * Replace these placeholders with real keys when available.
 * For security, production keys should eventually move to a backend —
 * but USDA's free key is rate-limited per IP and safe to ship client-side
 * for this non-commercial fitness app.
 */

/**
 * USDA FoodData Central.
 * Free: https://fdc.nal.usda.gov/api-key-signup/
 * Rate limit: 1000 req/hour/IP. DEMO_KEY is much lower.
 */
export const USDA_API_KEY = 'DEMO_KEY'; // TODO(owner): replace with your own key
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
 * Replace this with your real Firebase project URL after deployment.
 * Format: https://{region}-{projectId}.cloudfunctions.net
 */
export const AI_FUNCTION_BASE_URL =
  'https://us-central1-zenki-dojo.cloudfunctions.net'; // TODO(owner): replace after deploy

/**
 * Maximum image side length sent to the AI. We downscale client-side to keep
 * both latency and cost low — Claude Vision accepts up to 8000px but charges
 * per token-equivalent, so 1024px is the practical sweet spot for food photos
 * and medical-report scans alike.
 */
export const AI_IMAGE_MAX_DIMENSION = 1024;
