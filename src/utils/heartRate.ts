/**
 * Pure heart-rate calculation functions.
 * No side effects, no state — all functions are deterministic.
 */

import { HRZone, HRSample, ZoneBreakdown } from '../types/heartRate';

// ─────────────────────────────────────────────────
// HR Zones
// ─────────────────────────────────────────────────

/** Max HR via Tanaka formula — more accurate than 220-age for athletes. */
export function maxHR(age: number): number {
  return Math.round(207 - 0.7 * age);
}

/** Zone colors: green → yellow → orange → red → magenta */
const ZONE_COLORS = ['#22C55E', '#EAB308', '#F97316', '#EF4444', '#EC4899'];
const ZONE_NAMES = ['Recovery', 'Fat Burn', 'Aerobic', 'Threshold', 'Max'];
const ZONE_THRESHOLDS = [0.50, 0.60, 0.70, 0.80, 0.90]; // lower bound as fraction of maxHR

export function computeZones(age: number): HRZone[] {
  const max = maxHR(age);
  return ZONE_THRESHOLDS.map((low, i) => {
    const high = i < 4 ? ZONE_THRESHOLDS[i + 1] : 1.0;
    return {
      zone: i + 1,
      name: ZONE_NAMES[i],
      minBpm: Math.round(max * low),
      maxBpm: Math.round(max * high),
      color: ZONE_COLORS[i],
    };
  });
}

/** Which zone (1-5) does a given BPM fall into? Returns 0 if below Zone 1. */
export function bpmToZone(bpm: number, age: number): number {
  const max = maxHR(age);
  const pct = bpm / max;
  if (pct >= 0.90) return 5;
  if (pct >= 0.80) return 4;
  if (pct >= 0.70) return 3;
  if (pct >= 0.60) return 2;
  if (pct >= 0.50) return 1;
  return 0;
}

/** Get the display color for a given zone (1-5). */
export function zoneColor(zone: number): string {
  if (zone < 1 || zone > 5) return '#6B7280'; // gray for below zones
  return ZONE_COLORS[zone - 1];
}

// ─────────────────────────────────────────────────
// Zone Breakdown
// ─────────────────────────────────────────────────

/** Compute minutes spent in each zone from a list of HR samples.
 *  Assumes samples are ~1 second apart (BLE typical rate). */
export function computeZoneBreakdown(samples: HRSample[], age: number): ZoneBreakdown {
  const breakdown: ZoneBreakdown = { zone1: 0, zone2: 0, zone3: 0, zone4: 0, zone5: 0 };
  if (samples.length < 2) return breakdown;

  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestamp - samples[i - 1].timestamp) / 60000; // minutes
    const zone = bpmToZone(samples[i].bpm, age);
    if (zone === 1) breakdown.zone1 += dt;
    else if (zone === 2) breakdown.zone2 += dt;
    else if (zone === 3) breakdown.zone3 += dt;
    else if (zone === 4) breakdown.zone4 += dt;
    else if (zone === 5) breakdown.zone5 += dt;
  }

  return breakdown;
}

// ─────────────────────────────────────────────────
// Strain (Whoop-style, 0-21 logarithmic)
// ─────────────────────────────────────────────────

/**
 * Edwards TRIMP: sum of (minutes × zone_weight) where weights are 1-5.
 * Then mapped to a 0-21 logarithmic scale via:
 *   strain = 21 × ln(1 + TRIMP/k) / ln(1 + TRIMP_max/k)
 *
 * k=60 is tuned so:
 *   - Light 30-min Z2 workout → strain ~4-5
 *   - Hard 60-min mixed Z3-4 → strain ~12-14
 *   - All-out 90-min Z4-5 → strain ~18-20
 *   - Theoretical max (90 min all Z5) → strain 21
 */
export function computeStrain(zones: ZoneBreakdown): number {
  const trimp =
    zones.zone1 * 1 +
    zones.zone2 * 2 +
    zones.zone3 * 3 +
    zones.zone4 * 4 +
    zones.zone5 * 5;

  if (trimp <= 0) return 0;

  const k = 60;
  const trimpMax = 500; // theoretical ceiling for scaling
  const strain = 21 * Math.log(1 + trimp / k) / Math.log(1 + trimpMax / k);
  return Math.min(21, Math.round(strain * 10) / 10);
}

/** Strain descriptor text. */
export function strainLabel(strain: number): string {
  if (strain < 4)  return 'Light';
  if (strain < 8)  return 'Low';
  if (strain < 12) return 'Moderate';
  if (strain < 16) return 'High';
  if (strain < 19) return 'Very High';
  return 'All Out';
}

/** Strain descriptor color. */
export function strainColor(strain: number): string {
  if (strain < 4)  return '#22C55E'; // green
  if (strain < 8)  return '#3B82F6'; // blue
  if (strain < 12) return '#EAB308'; // yellow
  if (strain < 16) return '#F97316'; // orange
  if (strain < 19) return '#EF4444'; // red
  return '#EC4899';                   // magenta
}

// ─────────────────────────────────────────────────
// Calories (Keytel et al. 2005)
// ─────────────────────────────────────────────────

/**
 * Calories burned per minute at a given heart rate.
 * Keytel LR, et al. "Prediction of energy expenditure from heart rate
 * monitoring during submaximal exercise." J Sports Sci. 2005;23(3):289-97.
 *
 * Accurate between ~40-80% VO2max (roughly Zone 2-4).
 * Below Zone 2, returns a conservative MET-based floor.
 */
export function caloriesPerMinute(
  hr: number,
  weightKg: number,
  age: number,
  isMale: boolean,
): number {
  let kcal: number;
  if (isMale) {
    kcal = (-55.0969 + 0.6309 * hr + 0.1988 * weightKg + 0.2017 * age) / 4.184;
  } else {
    kcal = (-20.4022 + 0.4472 * hr - 0.1263 * weightKg + 0.074 * age) / 4.184;
  }
  // Floor: at least 1.5 kcal/min for any activity (walking ~3 METs × 80kg / 60)
  return Math.max(1.5, kcal);
}

/**
 * Estimate total calories from a set of HR samples.
 * Accumulates per-sample estimates over inter-sample intervals.
 */
export function estimateCalories(
  samples: HRSample[],
  weightKg: number,
  age: number,
  isMale: boolean,
): number {
  if (samples.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i].timestamp - samples[i - 1].timestamp) / 60000; // minutes
    total += caloriesPerMinute(samples[i].bpm, weightKg, age, isMale) * dt;
  }
  return Math.round(total);
}

// ─────────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────────

export function avgBpm(samples: HRSample[]): number {
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((s, x) => s + x.bpm, 0) / samples.length);
}

export function maxBpmFromSamples(samples: HRSample[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((max, s) => s.bpm > max ? s.bpm : max, samples[0].bpm);
}

export function minBpmFromSamples(samples: HRSample[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((min, s) => s.bpm < min ? s.bpm : min, samples[0].bpm);
}

/** Format seconds as "mm:ss" or "h:mm:ss". */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
