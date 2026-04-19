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
