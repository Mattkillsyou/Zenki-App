// Zenki Dojo — 1714 Hillhurst Ave, Los Angeles, CA 90027
export const DOJO_COORDS = {
  latitude: 34.1050,
  longitude: -118.2920,
};

export const GEOFENCE_RADIUS_METERS = 100;
export const POLLING_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Haversine formula — distance in meters between two lat/lng points.
 */
export function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Is this point within the geofence radius of the dojo?
 */
export function isWithinDojo(latitude: number, longitude: number): boolean {
  return (
    getDistanceMeters(latitude, longitude, DOJO_COORDS.latitude, DOJO_COORDS.longitude) <=
    GEOFENCE_RADIUS_METERS
  );
}

/**
 * Today's date as YYYY-MM-DD in the local timezone.
 */
export function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}
