/** Heart rate zone (1-5). */
export interface HRZone {
  zone: number;       // 1-5
  name: string;       // "Recovery", "Fat Burn", etc.
  minBpm: number;
  maxBpm: number;
  color: string;      // hex for UI
}

/** A single HR sample captured during a session. */
export interface HRSample {
  bpm: number;
  timestamp: number;  // Date.now()
}

/** Time (minutes) spent in each HR zone during a session. */
export interface ZoneBreakdown {
  zone1: number;
  zone2: number;
  zone3: number;
  zone4: number;
  zone5: number;
}

/** A completed or in-progress workout session with HR data. */
export interface HRSession {
  id: string;
  memberId: string;
  startedAt: string;          // ISO
  endedAt?: string;           // ISO (undefined if still running)
  durationMinutes: number;
  avgBpm: number;
  maxBpm: number;
  minBpm: number;
  samples: HRSample[];        // full HR trace
  zones: ZoneBreakdown;
  strain: number;             // 0-21 Whoop-style
  calories: number;           // estimated kcal
  activityType: ActivityType;
  deviceName?: string;        // BLE device name if connected
}

export type ActivityType =
  | 'martial_arts'
  | 'strength'
  | 'cardio'
  | 'hiit'
  | 'yoga'
  | 'open_mat'
  | 'other';

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  martial_arts: 'Martial Arts',
  strength: 'Strength',
  cardio: 'Cardio',
  hiit: 'HIIT',
  yoga: 'Yoga / Mobility',
  open_mat: 'Open Mat',
  other: 'Other',
};

/** BLE connection state. */
export type BLEStatus = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'unavailable';
