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

/* ═══════════════════════════════════════════════════════════════════════════
 * EXPANDED TYPES — Step 3
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Paused segment during a GPS activity. */
export interface PausedSegment {
  pausedAt: number;           // timestamp
  resumedAt: number | null;   // null if still paused
}

/** Extended GPS activity with pause support. */
export interface GpsActivityExtended extends GpsActivity {
  pauses: PausedSegment[];
  movingTimeSeconds: number;   // total time minus pause time
  elapsedTimeSeconds: number;  // wall-clock time start to finish
  avgMovingPace: number;       // pace excluding pauses
  notes: string;               // user-added notes
  weather?: WeatherSnapshot;
  heartRateAvg?: number;       // from HR monitor if paired
  heartRateMax?: number;
  strainScore?: number;
  tags: string[];              // user tags: "race", "recovery", "tempo"
}

/** Weather snapshot at activity time. */
export interface WeatherSnapshot {
  tempCelsius: number;
  humidity: number;            // 0-100
  windSpeedMps: number;
  condition: 'clear' | 'cloudy' | 'rain' | 'snow' | 'windy';
}

/** Aggregate stats for a time period. */
export interface PeriodStats {
  period: 'week' | 'month' | 'year' | 'all';
  startDate: string;           // ISO
  endDate: string;             // ISO
  totalActivities: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalMovingTimeSeconds: number;
  totalElevationGainMeters: number;
  totalCalories: number;
  avgPaceSecsPerKm: number;
  avgDistancePerActivity: number;
  longestActivity: { id: string; distanceMeters: number; durationSeconds: number } | null;
  fastestPace: { id: string; paceSecsPerKm: number } | null;
  activeDays: number;          // unique days with at least one activity
  activitiesByType: Record<GpsActivityType, number>;
}

/** Personal best record. */
export interface PersonalBest {
  category: 'fastest_km' | 'fastest_mile' | 'fastest_5k' | 'fastest_10k' | 'longest_run' | 'highest_elevation' | 'most_calories';
  value: number;
  unit: string;
  activityId: string;
  achievedAt: string;          // ISO
}

/** Activity comparison result. */
export interface ActivityComparison {
  activityA: string;           // id
  activityB: string;           // id
  distanceDelta: number;
  durationDelta: number;
  paceDelta: number;
  elevationDelta: number;
  calorieDelta: number;
}

/** Route segment for multi-segment activities (e.g., interval runs). */
export interface RouteSegment {
  type: 'active' | 'rest' | 'warmup' | 'cooldown';
  startIndex: number;          // index into route array
  endIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecsPerKm: number;
}

/** Workout exercise types for the structured logging (Module 2). */
export interface ExerciseDefinition {
  id: string;
  name: string;
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  category: ExerciseCategory;
  equipment: EquipmentType;
  instructions?: string;
}

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'full_body'
  | 'cardio';

export type ExerciseCategory =
  | 'compound'
  | 'isolation'
  | 'olympic'
  | 'bodyweight'
  | 'machine'
  | 'cable'
  | 'cardio'
  | 'plyometric'
  | 'stretch';

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'bands'
  | 'medicine_ball'
  | 'other'
  | 'none';

/** A single set within a workout exercise. */
export interface WorkoutSet {
  setNumber: number;
  weight: number;              // in user's preferred unit (lb or kg)
  reps: number;
  rpe?: number;                // 1-10 rate of perceived exertion
  isWarmup?: boolean;
  isDropSet?: boolean;
  restSeconds?: number;        // rest taken after this set
  completed: boolean;
}

/** An exercise logged during a workout session. */
export interface LoggedExercise {
  exerciseId: string;
  exerciseName: string;
  muscleGroup: MuscleGroup;
  sets: WorkoutSet[];
  notes?: string;
  supersetWith?: string;       // exerciseId if superset
}

/** A complete structured workout log. */
export interface StructuredWorkoutLog {
  id: string;
  memberId: string;
  date: string;                // ISO
  name: string;                // "Push Day", "Full Body", etc.
  exercises: LoggedExercise[];
  durationMinutes: number;
  totalVolume: number;         // weight × reps × sets summed
  notes?: string;
  templateId?: string;         // if started from a template
  createdAt: string;           // ISO
}

/** Workout template — saved exercise structure for quick repeat. */
export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: {
    exerciseId: string;
    exerciseName: string;
    muscleGroup: MuscleGroup;
    targetSets: number;
    targetReps: number;
    targetWeight?: number;
  }[];
  lastUsedAt?: string;         // ISO
  createdAt: string;           // ISO
}

/** Personal record for an exercise. */
export interface ExercisePR {
  exerciseId: string;
  exerciseName: string;
  type: 'weight' | '1rm' | 'reps' | 'volume';
  value: number;
  unit: string;
  date: string;                // ISO
  workoutLogId: string;
}

/** Estimated 1RM using Epley formula: weight × (1 + reps/30). */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

/** Volume for a set of exercises. */
export function totalVolume(exercises: LoggedExercise[]): number {
  let vol = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed && !set.isWarmup) {
        vol += set.weight * set.reps;
      }
    }
  }
  return vol;
}

/** Volume per muscle group from logged exercises. */
export function volumeByMuscleGroup(exercises: LoggedExercise[]): Record<MuscleGroup, number> {
  const vol: Record<string, number> = {};
  for (const ex of exercises) {
    const group = ex.muscleGroup;
    if (!vol[group]) vol[group] = 0;
    for (const set of ex.sets) {
      if (set.completed && !set.isWarmup) {
        vol[group] += set.weight * set.reps;
      }
    }
  }
  return vol as Record<MuscleGroup, number>;
}

/** Meal type for food logging (Module 3). */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export const MEAL_TYPE_ICONS: Record<MealType, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snacks: '🍎',
};

/** Body measurement entry (Module 4). */
export interface BodyMeasurement {
  id: string;
  memberId: string;
  date: string;                // ISO
  chest?: number;              // inches or cm based on unit pref
  waist?: number;
  hips?: number;
  bicepLeft?: number;
  bicepRight?: number;
  thighLeft?: number;
  thighRight?: number;
  neck?: number;
  unit: 'in' | 'cm';
}

/** Weight goal for Module 4. */
export interface WeightGoal {
  targetWeight: number;        // in user's preferred unit
  targetDate: string;          // ISO
  startWeight: number;
  startDate: string;           // ISO
  unit: 'lb' | 'kg';
}

/** Timer preset for Module 7. */
export interface TimerPreset {
  id: string;
  name: string;
  type: 'tabata' | 'emom' | 'amrap' | 'custom' | 'interval' | 'countdown';
  rounds: number;
  workSeconds: number;
  restSeconds: number;
  totalDurationSeconds?: number; // for AMRAP/countdown
  createdAt: string;           // ISO
}

/** Timer session log for Module 7. */
export interface TimerSessionLog {
  id: string;
  memberId: string;
  presetId?: string;
  presetName?: string;
  type: string;
  totalDurationSeconds: number;
  roundsCompleted: number;
  roundsTarget: number;
  splitTimes?: number[];       // per-round times in seconds
  date: string;                // ISO
}

/** Promo code for Store Module 12. */
export interface PromoCode {
  code: string;
  discountPercent: number;     // 0-100
  discountFlat?: number;       // flat dollar amount (takes precedence if set)
  minPurchase?: number;
  maxUses?: number;
  usedCount: number;
  expiresAt?: string;          // ISO
  active: boolean;
}

/** Wishlist item for Store Module 12. */
export interface WishlistItem {
  productId: string;
  addedAt: string;             // ISO
}

/** Saved meal / recipe for Module 3. */
export interface SavedMeal {
  id: string;
  name: string;
  items: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    servingSize?: string;
  }[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  createdAt: string;           // ISO
}

/** Notification preference toggles for Settings Module 10. */
export interface NotificationPreferences {
  classReminders: boolean;
  streakAlerts: boolean;
  communityMentions: boolean;
  achievementUnlocks: boolean;
  quietHoursStart?: string;    // "22:00"
  quietHoursEnd?: string;      // "07:00"
}

/** User preferences for Settings Module 10. */
export interface UserPreferences {
  units: 'imperial' | 'metric';
  theme: 'light' | 'dark' | 'system';
  soundEnabled: boolean;
  soundVolume: number;         // 0-1
  soundTheme: 'default' | 'retro' | 'zen' | 'pipboy';
  notifications: NotificationPreferences;
}
