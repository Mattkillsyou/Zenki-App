/**
 * Apple HealthKit service wrapper.
 *
 * iOS-only. All exports are no-ops on Android / web so the rest of the app
 * doesn't need to branch on Platform.
 *
 * The native module (`react-native-health`) is loaded lazily via `require()`
 * so importing this file from a non-iOS bundle is safe (no resolver crash,
 * no startup cost).
 *
 * Requires a development build (Expo Go cannot link HealthKit). Run:
 *   npx expo prebuild
 *   eas build --profile development --platform ios
 *
 * The config plugin in app.json adds the HealthKit entitlement and Info.plist
 * usage descriptions automatically.
 */

import { Platform } from 'react-native';

// ─────────────────────────────────────────────────
// Types we expose to the rest of the app.
// ─────────────────────────────────────────────────

export interface HKWorkoutSample {
  /** Apple HealthKit activity-type constant (numeric). */
  activityType: number;
  startDate: string;        // ISO
  endDate: string;          // ISO
  durationMinutes: number;
  energyBurnedKcal?: number;
  distanceMeters?: number;
  metadata?: Record<string, any>;
}

export interface HKHeartRateSample {
  bpm: number;
  /** ISO timestamp. */
  date: string;
}

export interface HKWeightSample {
  kg: number;
  date: string;
}

export interface HKFoodSample {
  name: string;
  date: string;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  mealType?: string;
}

export interface HKDailyTotals {
  /** ISO date "YYYY-MM-DD" */
  date: string;
  steps: number;
  activeEnergyKcal: number;
  /** Apple Watch "exercise minutes" (Active Minutes ring). */
  activeMinutes: number;
}

// ─────────────────────────────────────────────────
// Lazy native-module loader.
// ─────────────────────────────────────────────────

let _AppleHealthKit: any = null;
let _loadAttempted = false;

function getAppleHealthKit(): any {
  if (Platform.OS !== 'ios') return null;
  if (_loadAttempted) return _AppleHealthKit;
  _loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-health');
    // The package exports default + named (Constants). We accept either shape.
    const HK = mod?.default ?? mod;
    // Verify the native bridge actually registered its methods. On RN 0.80+
    // bridgeless / hybrid builds, react-native-health@1.19.0's JS shim can
    // load while NativeModules.AppleHealthKit is undefined — the package
    // surface is then just `{ Constants }` with no callable methods. Treat
    // that as "native bridge unavailable" so callers degrade cleanly instead
    // of throwing 'HK.initHealthKit is not a function' at first use.
    if (typeof HK?.initHealthKit !== 'function') {
      console.warn('[HealthKit] Native bridge not registered — running without HealthKit sync');
      _AppleHealthKit = null;
      return null;
    }
    _AppleHealthKit = HK;
  } catch (err) {
    console.warn('[HealthKit] Native module unavailable — running without HealthKit sync:', err);
    _AppleHealthKit = null;
  }
  return _AppleHealthKit;
}

/** True only when running on iOS with the native module successfully linked. */
export function isHealthKitAvailable(): boolean {
  return getAppleHealthKit() != null;
}

// ─────────────────────────────────────────────────
// Permission setup.
// ─────────────────────────────────────────────────

interface PermissionSet {
  read: string[];
  write: string[];
}

/**
 * The five user-facing categories the onboarding flow exposes. Each
 * category bundles the underlying HealthKit permission constants we
 * need for the Zenki feature it powers.
 */
export type HealthCategory = 'workouts' | 'heartRate' | 'weight' | 'nutrition' | 'activity';

export const ALL_HEALTH_CATEGORIES: HealthCategory[] =
  ['workouts', 'heartRate', 'weight', 'nutrition', 'activity'];

function buildPermissions(categories: HealthCategory[] = ALL_HEALTH_CATEGORIES): PermissionSet {
  const HK = getAppleHealthKit();
  if (!HK) return { read: [], write: [] };
  const C = HK.Constants?.Permissions ?? {};
  const set = new Set(categories);
  const read: string[] = [];
  const write: string[] = [];

  if (set.has('workouts')) {
    read.push(C.Workout, C.ActiveEnergyBurned, C.AppleExerciseTime);
    write.push(C.Workout, C.ActiveEnergyBurned);
  }
  if (set.has('heartRate')) {
    read.push(C.HeartRate, C.RestingHeartRate);
    write.push(C.HeartRate);
  }
  if (set.has('weight')) {
    read.push(C.Weight);
    write.push(C.Weight);
  }
  if (set.has('nutrition')) {
    read.push(C.EnergyConsumed, C.Protein, C.Carbohydrates, C.FatTotal);
    write.push(C.EnergyConsumed, C.Protein, C.Carbohydrates, C.FatTotal);
  }
  if (set.has('activity')) {
    read.push(C.Steps);
  }

  return {
    read: read.filter(Boolean),
    write: write.filter(Boolean),
  };
}

let _initPromise: Promise<boolean> | null = null;

/**
 * Initialize HealthKit + request permissions. Idempotent.
 *
 * `categories` lets onboarding restrict which permission groups to
 * request. Defaults to the full set when called from runtime code
 * (so things like context auto-init still work). iOS will show the
 * native consent sheet listing only the requested categories — users
 * can still toggle each one off inside that sheet.
 */
export function initHealthKit(categories: HealthCategory[] = ALL_HEALTH_CATEGORIES): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  if (_initPromise) return _initPromise;
  const HK = getAppleHealthKit();
  if (!HK) return Promise.resolve(false);

  const permissions = buildPermissions(categories);
  if (permissions.read.length === 0 && permissions.write.length === 0) {
    return Promise.resolve(false);
  }

  _initPromise = new Promise<boolean>((resolve) => {
    HK.initHealthKit({ permissions } as any, (err: any) => {
      if (err) {
        console.warn('[HealthKit] init failed:', err);
        _initPromise = null; // allow retry
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
  return _initPromise;
}

// ─────────────────────────────────────────────────
// Helpers.
// ─────────────────────────────────────────────────

function nodeBackCallback<T>(
  fn: (cb: (err: any, res: T) => void) => void,
): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      fn((err, res) => {
        if (err) {
          // Common: no permission or no data — log at debug and resolve null
          resolve(null);
          return;
        }
        resolve(res);
      });
    } catch (e) {
      console.warn('[HealthKit] call threw:', e);
      resolve(null);
    }
  });
}

function lbsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─────────────────────────────────────────────────
// PUSH (write to HealthKit)
// ─────────────────────────────────────────────────

/** Save a weight sample. Accepts kg or lb (auto-converts to kg). */
export async function pushWeight(weight: number, unit: 'kg' | 'lb', whenIso?: string): Promise<boolean> {
  const HK = getAppleHealthKit();
  if (!HK) return false;
  const kg = unit === 'lb' ? lbsToKg(weight) : weight;
  const opts = {
    value: kg,
    unit: HK.Constants?.Units?.gram ? 'gram' : 'pound',
    metadata: { source: 'Zenki Dojo' },
    date: whenIso ?? new Date().toISOString(),
  };
  // react-native-health expects pounds when unit='pound', kilograms otherwise.
  // We send pounds directly to avoid float drift.
  if (unit === 'lb') {
    opts.value = weight;
    (opts as any).unit = 'pound';
  } else {
    (opts as any).unit = 'kg';
  }
  const ok = await nodeBackCallback<any>((cb) => HK.saveWeight(opts as any, cb));
  return ok != null;
}

/** Save a workout (HKWorkout). Activity type defaults to "Other" if unmapped. */
export async function pushWorkout(params: {
  startIso: string;
  endIso: string;
  activityType?: number;     // pass HK.Constants.Activities.* if known
  energyBurnedKcal?: number;
  distanceMeters?: number;
  metadata?: Record<string, any>;
}): Promise<boolean> {
  const HK = getAppleHealthKit();
  if (!HK) return false;
  const Activities = HK.Constants?.Activities ?? {};
  const activity = params.activityType ?? Activities.Other ?? 3000;
  const opts: any = {
    type: activity,
    startDate: params.startIso,
    endDate: params.endIso,
    energyBurned: params.energyBurnedKcal,
    distance: params.distanceMeters,
    metadata: { source: 'Zenki Dojo', ...(params.metadata ?? {}) },
  };
  const ok = await nodeBackCallback<any>((cb) => HK.saveWorkout(opts, cb));
  return ok != null;
}

/** Save a single heart-rate sample. */
export async function pushHeartRate(bpm: number, whenIso?: string): Promise<boolean> {
  const HK = getAppleHealthKit();
  if (!HK) return false;
  const opts: any = {
    value: bpm,
    startDate: whenIso ?? new Date().toISOString(),
    metadata: { source: 'Zenki Dojo' },
  };
  const ok = await nodeBackCallback<any>((cb) => HK.saveHeartRateSample(opts, cb));
  return ok != null;
}

/**
 * Save a food entry. Writes one combined sample with calories + macros so
 * Apple Health can aggregate them into your daily nutrition totals.
 */
export async function pushFood(food: HKFoodSample): Promise<boolean> {
  const HK = getAppleHealthKit();
  if (!HK) return false;
  if (!HK.saveFood) {
    // Some package versions only expose individual setters
    return pushFoodSplit(food);
  }
  const opts: any = {
    foodName: food.name,
    mealType: food.mealType ?? 'Snack',
    date: food.date,
    energy: food.calories,
    energyUnit: 'calorie',
    protein: food.proteinG,
    carbohydrates: food.carbsG,
    fatTotal: food.fatG,
    metadata: { source: 'Zenki Dojo' },
  };
  const ok = await nodeBackCallback<any>((cb) => HK.saveFood(opts, cb));
  return ok != null;
}

/** Fallback: write each macro as its own sample. */
async function pushFoodSplit(food: HKFoodSample): Promise<boolean> {
  const HK = getAppleHealthKit();
  if (!HK) return false;
  const date = food.date;
  const tasks: Promise<any>[] = [];
  if (food.calories != null && HK.saveEnergyConsumed) {
    tasks.push(nodeBackCallback((cb) => HK.saveEnergyConsumed({ value: food.calories, date, metadata: { source: 'Zenki Dojo' } }, cb)));
  }
  if (food.proteinG != null && HK.saveProtein) {
    tasks.push(nodeBackCallback((cb) => HK.saveProtein({ value: food.proteinG, date, metadata: { source: 'Zenki Dojo' } }, cb)));
  }
  if (food.carbsG != null && HK.saveCarbohydrates) {
    tasks.push(nodeBackCallback((cb) => HK.saveCarbohydrates({ value: food.carbsG, date, metadata: { source: 'Zenki Dojo' } }, cb)));
  }
  if (food.fatG != null && HK.saveFatTotal) {
    tasks.push(nodeBackCallback((cb) => HK.saveFatTotal({ value: food.fatG, date, metadata: { source: 'Zenki Dojo' } }, cb)));
  }
  const results = await Promise.all(tasks);
  return results.some((r) => r != null);
}

// ─────────────────────────────────────────────────
// PULL (read from HealthKit)
// ─────────────────────────────────────────────────

export async function pullSteps(sinceIso?: string): Promise<number> {
  const HK = getAppleHealthKit();
  if (!HK) return 0;
  const startDate = sinceIso ?? startOfTodayIso();
  const res = await nodeBackCallback<any>((cb) =>
    HK.getStepCount({ startDate } as any, cb),
  );
  return Number(res?.value ?? 0);
}

export async function pullActiveEnergyKcal(sinceIso?: string): Promise<number> {
  const HK = getAppleHealthKit();
  if (!HK) return 0;
  const startDate = sinceIso ?? startOfTodayIso();
  const samples = await nodeBackCallback<any[]>((cb) =>
    HK.getActiveEnergyBurned({ startDate } as any, cb),
  );
  if (!samples || !Array.isArray(samples)) return 0;
  return samples.reduce((acc, s) => acc + Number(s?.value ?? 0), 0);
}

export async function pullActiveMinutes(sinceIso?: string): Promise<number> {
  const HK = getAppleHealthKit();
  if (!HK) return 0;
  const startDate = sinceIso ?? startOfTodayIso();
  if (!HK.getAppleExerciseTime) return 0;
  const samples = await nodeBackCallback<any[]>((cb) =>
    HK.getAppleExerciseTime({ startDate } as any, cb),
  );
  if (!samples || !Array.isArray(samples)) return 0;
  return samples.reduce((acc, s) => acc + Number(s?.value ?? 0), 0);
}

export async function pullLatestHeartRate(): Promise<HKHeartRateSample | null> {
  const HK = getAppleHealthKit();
  if (!HK) return null;
  const startDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const samples = await nodeBackCallback<any[]>((cb) =>
    HK.getHeartRateSamples({ startDate, ascending: false, limit: 1 } as any, cb),
  );
  if (!samples || samples.length === 0) return null;
  const s = samples[0];
  return { bpm: Number(s.value), date: s.startDate ?? s.endDate };
}

export async function pullLatestWeight(): Promise<HKWeightSample | null> {
  const HK = getAppleHealthKit();
  if (!HK) return null;
  const startDate = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const samples = await nodeBackCallback<any[]>((cb) =>
    HK.getWeightSamples({ startDate, unit: 'kg', ascending: false, limit: 1 } as any, cb),
  );
  if (!samples || samples.length === 0) return null;
  const s = samples[0];
  return { kg: Number(s.value), date: s.startDate ?? s.endDate };
}

export async function pullDailyTotals(dateIso?: string): Promise<HKDailyTotals> {
  const date = dateIso ?? startOfTodayIso();
  const [steps, active, exMin] = await Promise.all([
    pullSteps(date),
    pullActiveEnergyKcal(date),
    pullActiveMinutes(date),
  ]);
  return {
    date: date.slice(0, 10),
    steps,
    activeEnergyKcal: active,
    activeMinutes: exMin,
  };
}

// ─────────────────────────────────────────────────
// Activity-type mapping for our app's enum → HK.
// ─────────────────────────────────────────────────

export function mapActivityTypeToHK(activity: string): number {
  const HK = getAppleHealthKit();
  const A = HK?.Constants?.Activities ?? {};
  switch (activity) {
    case 'martial_arts': return A.MartialArts ?? A.Other ?? 3000;
    case 'strength':     return A.TraditionalStrengthTraining ?? A.FunctionalStrengthTraining ?? A.Other ?? 3000;
    case 'cardio':       return A.Cardio ?? A.MixedCardio ?? A.Other ?? 3000;
    case 'hiit':         return A.HighIntensityIntervalTraining ?? A.Other ?? 3000;
    case 'yoga':         return A.Yoga ?? A.MindAndBody ?? A.Other ?? 3000;
    case 'open_mat':     return A.MartialArts ?? A.Other ?? 3000;
    default:             return A.Other ?? 3000;
  }
}
