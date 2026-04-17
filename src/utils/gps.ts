/**
 * GPS utility functions — distance, pace, elevation, splits.
 * All pure functions, no side effects.
 */

import { GpsPoint, SplitData } from '../types/activity';

/** Haversine distance between two GPS coordinates (meters). */
export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Total distance of a route in meters. */
export function totalDistance(route: GpsPoint[]): number {
  let dist = 0;
  for (let i = 1; i < route.length; i++) {
    dist += haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
  }
  return dist;
}

/** Total elevation gain (only uphill segments) in meters. */
export function totalElevationGain(route: GpsPoint[]): number {
  let gain = 0;
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1].altitude;
    const curr = route[i].altitude;
    if (prev != null && curr != null && curr > prev) {
      gain += curr - prev;
    }
  }
  return gain;
}

/** Pace in seconds per kilometer from distance (m) and duration (s). */
export function paceSecsPerKm(distanceMeters: number, durationSeconds: number): number {
  if (distanceMeters <= 0) return 0;
  return (durationSeconds / distanceMeters) * 1000;
}

/** Format pace (seconds/km) as "M:SS /km". */
export function formatPace(secsPerKm: number): string {
  if (secsPerKm <= 0 || !Number.isFinite(secsPerKm)) return '--:--';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.floor(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format distance in km with 2 decimals. */
export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/** Format distance in miles with 2 decimals. */
export function formatDistanceMi(meters: number): string {
  return (meters / 1609.34).toFixed(2);
}

/** Default distance formatter — miles for US users. */
export function formatDistance(meters: number, useMiles: boolean = true): string {
  return useMiles ? formatDistanceMi(meters) : formatDistanceKm(meters);
}

/** Default distance unit label. */
export function distanceUnit(useMiles: boolean = true): string {
  return useMiles ? 'mi' : 'km';
}

/** Pace formatted for the selected unit system. */
export function formatPaceForUnit(secsPerKm: number, useMiles: boolean = true): string {
  if (useMiles) {
    // Convert secs/km → secs/mile
    return formatPace(secsPerKm * 1.60934);
  }
  return formatPace(secsPerKm);
}

/** Pace unit label. */
export function paceUnit(useMiles: boolean = true): string {
  return useMiles ? '/mi' : '/km';
}

/** Compute per-km splits from a route. */
export function computeSplits(route: GpsPoint[], splitDistanceM: number = 1000): SplitData[] {
  if (route.length < 2) return [];
  const splits: SplitData[] = [];
  let splitStart = 0;
  let accumDist = 0;
  let splitNum = 1;

  for (let i = 1; i < route.length; i++) {
    const segDist = haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
    accumDist += segDist;

    if (accumDist >= splitDistanceM) {
      const splitDuration = (route[i].timestamp - route[splitStart].timestamp) / 1000;
      const elevDelta = (route[i].altitude ?? 0) - (route[splitStart].altitude ?? 0);
      splits.push({
        splitNumber: splitNum,
        distanceMeters: accumDist,
        durationSeconds: splitDuration,
        paceSecsPerKm: paceSecsPerKm(accumDist, splitDuration),
        elevationDelta: Math.max(0, elevDelta),
      });
      splitNum++;
      splitStart = i;
      accumDist = 0;
    }
  }

  // Final partial split
  if (accumDist > 50 && splitStart < route.length - 1) {
    const splitDuration = (route[route.length - 1].timestamp - route[splitStart].timestamp) / 1000;
    splits.push({
      splitNumber: splitNum,
      distanceMeters: accumDist,
      durationSeconds: splitDuration,
      paceSecsPerKm: paceSecsPerKm(accumDist, splitDuration),
      elevationDelta: 0,
    });
  }

  return splits;
}

/** Estimate calories from MET × weight × hours. */
export function estimateCaloriesMET(met: number, weightKg: number, durationSeconds: number): number {
  return Math.round(met * weightKg * (durationSeconds / 3600));
}

/** Downsample route for storage — keep every Nth point. */
export function downsampleRoute(route: GpsPoint[], maxPoints: number = 500): GpsPoint[] {
  if (route.length <= maxPoints) return route;
  const step = route.length / maxPoints;
  const result: GpsPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(route[Math.floor(i * step)]);
  }
  if (result[result.length - 1] !== route[route.length - 1]) {
    result.push(route[route.length - 1]);
  }
  return result;
}
