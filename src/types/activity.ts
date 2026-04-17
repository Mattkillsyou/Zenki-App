/** GPS coordinate point with timestamp. */
export interface GpsPoint {
  latitude: number;
  longitude: number;
  altitude: number | null;    // meters above sea level
  speed: number | null;       // m/s
  timestamp: number;          // Date.now()
}

/** A completed GPS-tracked activity. */
export interface GpsActivity {
  id: string;
  memberId: string;
  type: GpsActivityType;
  startedAt: string;          // ISO
  endedAt: string;            // ISO
  durationSeconds: number;
  distanceMeters: number;
  elevationGainMeters: number;
  avgPaceSecsPerKm: number;   // seconds per km
  maxSpeedMps: number;        // m/s
  route: GpsPoint[];          // downsampled for storage
  splits: SplitData[];        // per-km or per-mile
  calories: number;           // estimated
}

export type GpsActivityType = 'run' | 'walk' | 'bike' | 'hike';

export const GPS_ACTIVITY_LABELS: Record<GpsActivityType, string> = {
  run: 'Run',
  walk: 'Walk',
  bike: 'Bike',
  hike: 'Hike',
};

export const GPS_ACTIVITY_ICONS: Record<GpsActivityType, string> = {
  run: 'walk-outline',       // Ionicons doesn't have a run icon; walk is closest
  walk: 'footsteps-outline',
  bike: 'bicycle-outline',
  hike: 'trail-sign-outline',
};

/** MET values by activity type for calorie estimation. */
export const GPS_ACTIVITY_METS: Record<GpsActivityType, number> = {
  run: 9.8,
  walk: 3.5,
  bike: 7.5,
  hike: 6.0,
};

export interface SplitData {
  splitNumber: number;       // 1-indexed
  distanceMeters: number;    // should be ~1000 (1 km)
  durationSeconds: number;
  paceSecsPerKm: number;
  elevationDelta: number;    // meters gained in this split
}
