/**
 * Theme-aware activity map — shared TS-visible entry.
 *
 * Metro replaces this with the platform-specific sibling at bundle time:
 *   - ActivityMap.web.tsx    (real Leaflet implementation, theme-tinted)
 *   - ActivityMap.native.tsx (lightweight placeholder)
 */

export type { ActivityMapProps } from './ActivityMap.types';
export { ActivityMap } from './ActivityMap.native';
