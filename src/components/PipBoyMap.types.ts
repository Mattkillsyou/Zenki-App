/**
 * Shared prop type for the Pip-Boy map. Lives in a non-`.tsx` file so Metro
 * platform resolution doesn't try to pick `.web.ts` / `.native.ts` variants
 * for this (there's only one).
 */

export interface PipBoyMapProps {
  routeCoords: { lat: number; lng: number }[];
  userLat: number;
  userLng: number;
}
