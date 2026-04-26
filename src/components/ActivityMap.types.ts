/**
 * Shared prop type for the theme-aware activity map. Lives in a non-`.tsx`
 * file so Metro platform resolution doesn't try to pick `.web.ts` / `.native.ts`
 * variants for this (there's only one).
 */

export interface ActivityMapProps {
  routeCoords: { lat: number; lng: number }[];
  userLat: number;
  userLng: number;
  /** CSS filter applied to map tiles (web only). Empty string = no filter. */
  tileFilter?: string;
  /** Color of the route polyline and user marker. */
  accentColor: string;
}
