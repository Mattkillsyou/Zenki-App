/**
 * Pip-Boy map — shared TS-visible entry.
 *
 * Metro replaces this with the platform-specific sibling at bundle time:
 *   - PipBoyMap.web.tsx    (real Leaflet implementation)
 *   - PipBoyMap.native.tsx (lightweight placeholder)
 */

export type { PipBoyMapProps } from './PipBoyMap.types';
export { PipBoyMap } from './PipBoyMap.native';
