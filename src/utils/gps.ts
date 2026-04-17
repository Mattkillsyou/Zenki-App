/**
 * GPS utility functions — distance, pace, elevation, splits.
 * All pure functions, no side effects.
 */

import { GpsPoint, GpsActivity, SplitData } from '../types/activity';

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

/* ═══════════════════════════════════════════════════════════════════════════
 * NEW FUNCTIONS — Step 2 expansion
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Total elevation loss (only downhill segments) in meters. */
export function totalElevationLoss(route: GpsPoint[]): number {
  let loss = 0;
  for (let i = 1; i < route.length; i++) {
    const prev = route[i - 1].altitude;
    const curr = route[i].altitude;
    if (prev != null && curr != null && curr < prev) {
      loss += prev - curr;
    }
  }
  return loss;
}

/** Average speed (m/s) from distance (m) and duration (s). */
export function avgSpeedMps(distanceMeters: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return distanceMeters / durationSeconds;
}

/** Max speed (m/s) from route points using their .speed field, with fallback to distance/time. */
export function maxSpeedFromRoute(route: GpsPoint[]): number {
  let max = 0;
  for (let i = 0; i < route.length; i++) {
    // Use point speed if available
    if (route[i].speed != null && route[i].speed! > max) {
      max = route[i].speed!;
    }
  }
  // Fallback: compute from adjacent points
  if (max === 0 && route.length >= 2) {
    for (let i = 1; i < route.length; i++) {
      const dt = (route[i].timestamp - route[i - 1].timestamp) / 1000;
      if (dt <= 0) continue;
      const d = haversineMeters(
        route[i - 1].latitude, route[i - 1].longitude,
        route[i].latitude, route[i].longitude,
      );
      const speed = d / dt;
      if (speed > max) max = speed;
    }
  }
  return max;
}

/** Convert m/s to km/h. */
export function mpsToKmh(mps: number): number {
  return mps * 3.6;
}

/** Convert m/s to mph. */
export function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

/** Format speed for display. */
export function formatSpeed(mps: number, useMiles: boolean = true): string {
  const val = useMiles ? mpsToMph(mps) : mpsToKmh(mps);
  return val.toFixed(1);
}

/** Speed unit label. */
export function speedUnit(useMiles: boolean = true): string {
  return useMiles ? 'mph' : 'km/h';
}

/** Format elevation for display. */
export function formatElevation(meters: number, useMiles: boolean = true): string {
  if (useMiles) {
    // Convert to feet
    return Math.round(meters * 3.28084).toLocaleString();
  }
  return Math.round(meters).toLocaleString();
}

/** Elevation unit label. */
export function elevationUnit(useMiles: boolean = true): string {
  return useMiles ? 'ft' : 'm';
}

/** Convert meters to feet. */
export function metersToFeet(meters: number): number {
  return meters * 3.28084;
}

/** Convert feet to meters. */
export function feetToMeters(feet: number): number {
  return feet / 3.28084;
}

/** Bounding box of a route for map fitting. */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  centerLat: number;
  centerLng: number;
}

export function routeBoundingBox(route: GpsPoint[]): BoundingBox | null {
  if (route.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const p of route) {
    if (p.latitude < minLat) minLat = p.latitude;
    if (p.latitude > maxLat) maxLat = p.latitude;
    if (p.longitude < minLng) minLng = p.longitude;
    if (p.longitude > maxLng) maxLng = p.longitude;
  }
  return {
    minLat,
    maxLat,
    minLng,
    maxLng,
    centerLat: (minLat + maxLat) / 2,
    centerLng: (minLng + maxLng) / 2,
  };
}

/** Compute per-mile splits (same logic as computeSplits but defaults to 1609.34m). */
export function computeMileSplits(route: GpsPoint[]): SplitData[] {
  return computeSplits(route, 1609.34);
}

/** Average pace per km across multiple activities. */
export function averagePace(activities: GpsActivity[]): number {
  if (activities.length === 0) return 0;
  let totalDist = 0;
  let totalDur = 0;
  for (const a of activities) {
    totalDist += a.distanceMeters;
    totalDur += a.durationSeconds;
  }
  return paceSecsPerKm(totalDist, totalDur);
}

/** Total stats across multiple activities. */
export interface ActivityTotals {
  totalActivities: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalElevationGainMeters: number;
  totalCalories: number;
  avgPaceSecsPerKm: number;
  longestDistanceMeters: number;
  longestDurationSeconds: number;
  fastestPaceSecsPerKm: number;
  activitiesByType: Record<string, number>;
}

export function computeActivityTotals(activities: GpsActivity[]): ActivityTotals {
  const totals: ActivityTotals = {
    totalActivities: activities.length,
    totalDistanceMeters: 0,
    totalDurationSeconds: 0,
    totalElevationGainMeters: 0,
    totalCalories: 0,
    avgPaceSecsPerKm: 0,
    longestDistanceMeters: 0,
    longestDurationSeconds: 0,
    fastestPaceSecsPerKm: Infinity,
    activitiesByType: {},
  };

  if (activities.length === 0) {
    totals.fastestPaceSecsPerKm = 0;
    return totals;
  }

  for (const a of activities) {
    totals.totalDistanceMeters += a.distanceMeters;
    totals.totalDurationSeconds += a.durationSeconds;
    totals.totalElevationGainMeters += a.elevationGainMeters;
    totals.totalCalories += a.calories;

    if (a.distanceMeters > totals.longestDistanceMeters) {
      totals.longestDistanceMeters = a.distanceMeters;
    }
    if (a.durationSeconds > totals.longestDurationSeconds) {
      totals.longestDurationSeconds = a.durationSeconds;
    }
    if (a.avgPaceSecsPerKm > 0 && a.avgPaceSecsPerKm < totals.fastestPaceSecsPerKm) {
      totals.fastestPaceSecsPerKm = a.avgPaceSecsPerKm;
    }

    const key = a.type;
    totals.activitiesByType[key] = (totals.activitiesByType[key] || 0) + 1;
  }

  totals.avgPaceSecsPerKm = paceSecsPerKm(totals.totalDistanceMeters, totals.totalDurationSeconds);
  if (!Number.isFinite(totals.fastestPaceSecsPerKm)) totals.fastestPaceSecsPerKm = 0;

  return totals;
}

/** Filter activities to a time window. */
export function filterActivitiesByDateRange(
  activities: GpsActivity[],
  startDate: Date,
  endDate: Date,
): GpsActivity[] {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  return activities.filter((a) => {
    const ts = new Date(a.startedAt).getTime();
    return ts >= startMs && ts <= endMs;
  });
}

/** Get activities for a specific week (Mon-Sun). */
export function activitiesThisWeek(activities: GpsActivity[], refDate: Date = new Date()): GpsActivity[] {
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return filterActivitiesByDateRange(activities, monday, sunday);
}

/** Compute moving time by excluding segments with speed < threshold (m/s). */
export function movingTime(route: GpsPoint[], minSpeedMps: number = 0.5): number {
  if (route.length < 2) return 0;
  let moving = 0;
  for (let i = 1; i < route.length; i++) {
    const dt = (route[i].timestamp - route[i - 1].timestamp) / 1000;
    if (dt <= 0) continue;
    const d = haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
    const speed = d / dt;
    if (speed >= minSpeedMps) {
      moving += dt;
    }
  }
  return moving;
}

/** Elapsed time = total activity time (including pauses). */
export function elapsedTime(route: GpsPoint[]): number {
  if (route.length < 2) return 0;
  return (route[route.length - 1].timestamp - route[0].timestamp) / 1000;
}

/** Format duration as "HH:MM:SS" or "MM:SS" if under an hour. */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Format duration as human-readable "1h 23m" or "45m 12s". */
export function formatDurationHuman(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = Math.floor(seconds % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** Encode a route as a simplified polyline string for compact storage. */
export function encodeRoute(route: GpsPoint[]): string {
  // Simple JSON-based encoding — 5 decimal places for lat/lng is ~1m precision
  return JSON.stringify(route.map((p) => ({
    la: Math.round(p.latitude * 1e5) / 1e5,
    lo: Math.round(p.longitude * 1e5) / 1e5,
    al: p.altitude != null ? Math.round(p.altitude) : null,
    sp: p.speed != null ? Math.round(p.speed * 10) / 10 : null,
    t: p.timestamp,
  })));
}

/** Decode a route from the compact format back to GpsPoint[]. */
export function decodeRoute(encoded: string): GpsPoint[] {
  try {
    const arr = JSON.parse(encoded);
    return arr.map((p: any) => ({
      latitude: p.la,
      longitude: p.lo,
      altitude: p.al,
      speed: p.sp,
      timestamp: p.t,
    }));
  } catch {
    return [];
  }
}

/** Smooth a route by averaging adjacent points (simple moving window). */
export function smoothRoute(route: GpsPoint[], windowSize: number = 3): GpsPoint[] {
  if (route.length < windowSize) return [...route];
  const half = Math.floor(windowSize / 2);
  return route.map((_, i) => {
    const start = Math.max(0, i - half);
    const end = Math.min(route.length - 1, i + half);
    const count = end - start + 1;
    let sumLat = 0, sumLng = 0, sumAlt = 0;
    let altCount = 0;
    for (let j = start; j <= end; j++) {
      sumLat += route[j].latitude;
      sumLng += route[j].longitude;
      if (route[j].altitude != null) {
        sumAlt += route[j].altitude!;
        altCount++;
      }
    }
    return {
      latitude: sumLat / count,
      longitude: sumLng / count,
      altitude: altCount > 0 ? sumAlt / altCount : route[i].altitude,
      speed: route[i].speed,
      timestamp: route[i].timestamp,
    };
  });
}

/** Generate elevation profile data from a route. Returns array of {distance, altitude}. */
export interface ElevationPoint {
  distanceMeters: number;
  altitudeMeters: number;
}

export function elevationProfile(route: GpsPoint[]): ElevationPoint[] {
  const points: ElevationPoint[] = [];
  let cumulativeDist = 0;
  for (let i = 0; i < route.length; i++) {
    if (i > 0) {
      cumulativeDist += haversineMeters(
        route[i - 1].latitude, route[i - 1].longitude,
        route[i].latitude, route[i].longitude,
      );
    }
    points.push({
      distanceMeters: cumulativeDist,
      altitudeMeters: route[i].altitude ?? 0,
    });
  }
  return points;
}

/** Speed profile data — speed at distance intervals. */
export interface SpeedPoint {
  distanceMeters: number;
  speedMps: number;
}

export function speedProfile(route: GpsPoint[]): SpeedPoint[] {
  const points: SpeedPoint[] = [];
  let cumulativeDist = 0;
  for (let i = 1; i < route.length; i++) {
    const d = haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
    const dt = (route[i].timestamp - route[i - 1].timestamp) / 1000;
    cumulativeDist += d;
    const speed = dt > 0 ? d / dt : 0;
    points.push({
      distanceMeters: cumulativeDist,
      speedMps: speed,
    });
  }
  return points;
}

/** Detect pauses in a route (segments where speed < threshold for > duration). */
export interface PauseSegment {
  startIndex: number;
  endIndex: number;
  durationSeconds: number;
  location: { latitude: number; longitude: number };
}

export function detectPauses(
  route: GpsPoint[],
  minSpeedMps: number = 0.3,
  minDurationSecs: number = 30,
): PauseSegment[] {
  const pauses: PauseSegment[] = [];
  let pauseStart: number | null = null;

  for (let i = 1; i < route.length; i++) {
    const dt = (route[i].timestamp - route[i - 1].timestamp) / 1000;
    if (dt <= 0) continue;
    const d = haversineMeters(
      route[i - 1].latitude, route[i - 1].longitude,
      route[i].latitude, route[i].longitude,
    );
    const speed = d / dt;

    if (speed < minSpeedMps) {
      if (pauseStart === null) pauseStart = i - 1;
    } else {
      if (pauseStart !== null) {
        const dur = (route[i - 1].timestamp - route[pauseStart].timestamp) / 1000;
        if (dur >= minDurationSecs) {
          pauses.push({
            startIndex: pauseStart,
            endIndex: i - 1,
            durationSeconds: dur,
            location: {
              latitude: route[pauseStart].latitude,
              longitude: route[pauseStart].longitude,
            },
          });
        }
        pauseStart = null;
      }
    }
  }

  // Handle trailing pause
  if (pauseStart !== null) {
    const dur = (route[route.length - 1].timestamp - route[pauseStart].timestamp) / 1000;
    if (dur >= minDurationSecs) {
      pauses.push({
        startIndex: pauseStart,
        endIndex: route.length - 1,
        durationSeconds: dur,
        location: {
          latitude: route[pauseStart].latitude,
          longitude: route[pauseStart].longitude,
        },
      });
    }
  }

  return pauses;
}

/** Compute pace trend — average pace for last N activities. */
export function paceTrend(activities: GpsActivity[], count: number = 5): {
  current: number;
  previous: number;
  improving: boolean;
} {
  if (activities.length < 2) {
    return { current: 0, previous: 0, improving: false };
  }
  const sorted = [...activities].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const recent = sorted.slice(0, count);
  const older = sorted.slice(count, count * 2);

  const recentPace = averagePace(recent);
  const olderPace = older.length > 0 ? averagePace(older) : recentPace;

  return {
    current: recentPace,
    previous: olderPace,
    improving: recentPace < olderPace, // lower pace = faster
  };
}

/** Distance trend — weekly distance comparison. */
export function weeklyDistanceTrend(activities: GpsActivity[]): {
  thisWeek: number;
  lastWeek: number;
  deltaPercent: number;
} {
  const now = new Date();
  const thisWeek = activitiesThisWeek(activities, now);
  const lastWeekDate = new Date(now);
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeek = activitiesThisWeek(activities, lastWeekDate);

  const thisTotal = thisWeek.reduce((sum, a) => sum + a.distanceMeters, 0);
  const lastTotal = lastWeek.reduce((sum, a) => sum + a.distanceMeters, 0);

  const delta = lastTotal > 0 ? ((thisTotal - lastTotal) / lastTotal) * 100 : 0;

  return {
    thisWeek: thisTotal,
    lastWeek: lastTotal,
    deltaPercent: Math.round(delta),
  };
}
