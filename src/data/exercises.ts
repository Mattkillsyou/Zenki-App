// ──────────────────────────────────────────────────────────────────
// EXERCISE CATALOG
//
// Pre-defined exercises members can log PRs against. Members pick
// from this list so PRs are comparable across the dojo (e.g. two
// members both logged "Back Squat" means the same thing).
//
// Categories:
//  - strength: classic barbell lifts (1RM PRs, unit = lbs)
//  - olympic:  olympic lifts (unit = lbs)
//  - gymnastic: bodyweight maxes (reps)
//  - benchmark: CrossFit time-based benchmarks (unit = seconds)
//  - engine:   endurance pieces (unit = seconds)
// ──────────────────────────────────────────────────────────────────

export type ExerciseCategory = 'strength' | 'olympic' | 'gymnastic' | 'benchmark' | 'engine';
export type ExerciseUnit = 'lbs' | 'time' | 'reps';

export interface Exercise {
  key: string;
  name: string;
  category: ExerciseCategory;
  unit: ExerciseUnit;
  /** For time-based exercises: 'lower is better'. Default 'higher is better'. */
  lowerIsBetter?: boolean;
}

export const EXERCISES: Exercise[] = [
  // Strength lifts — weight 1RM
  { key: 'back_squat',    name: 'Back Squat',    category: 'strength', unit: 'lbs' },
  { key: 'front_squat',   name: 'Front Squat',   category: 'strength', unit: 'lbs' },
  { key: 'deadlift',      name: 'Deadlift',      category: 'strength', unit: 'lbs' },
  { key: 'bench_press',   name: 'Bench Press',   category: 'strength', unit: 'lbs' },
  { key: 'strict_press',  name: 'Strict Press',  category: 'strength', unit: 'lbs' },
  { key: 'push_press',    name: 'Push Press',    category: 'strength', unit: 'lbs' },

  // Olympic lifts — weight 1RM
  { key: 'clean',         name: 'Clean',         category: 'olympic',  unit: 'lbs' },
  { key: 'clean_jerk',    name: 'Clean & Jerk',  category: 'olympic',  unit: 'lbs' },
  { key: 'snatch',        name: 'Snatch',        category: 'olympic',  unit: 'lbs' },
  { key: 'thruster',      name: 'Thruster',      category: 'olympic',  unit: 'lbs' },

  // Gymnastic — rep maxes
  { key: 'pullups_max',   name: 'Max Pull-ups',        category: 'gymnastic', unit: 'reps' },
  { key: 'pushups_max',   name: 'Max Push-ups',        category: 'gymnastic', unit: 'reps' },
  { key: 'toes2bar_max',  name: 'Max Toes-to-Bar',     category: 'gymnastic', unit: 'reps' },
  { key: 'muscleups_max', name: 'Max Muscle-ups',      category: 'gymnastic', unit: 'reps' },
  { key: 'hs_pushup_max', name: 'Max HS Push-ups',     category: 'gymnastic', unit: 'reps' },

  // Benchmark CrossFit WODs — time (lower is better)
  { key: 'fran',          name: 'Fran',          category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'helen',         name: 'Helen',         category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'cindy',         name: 'Cindy (20min AMRAP)', category: 'benchmark', unit: 'reps' },
  { key: 'murph',         name: 'Murph',         category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'grace',         name: 'Grace',         category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'diane',         name: 'Diane',         category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'isabel',        name: 'Isabel',        category: 'benchmark', unit: 'time', lowerIsBetter: true },
  { key: 'annie',         name: 'Annie',         category: 'benchmark', unit: 'time', lowerIsBetter: true },

  // Engine — endurance (lower is better)
  { key: 'run_1mi',       name: '1-Mile Run',        category: 'engine', unit: 'time', lowerIsBetter: true },
  { key: 'run_5k',        name: '5K Run',            category: 'engine', unit: 'time', lowerIsBetter: true },
  { key: 'row_500m',      name: '500m Row',          category: 'engine', unit: 'time', lowerIsBetter: true },
  { key: 'row_2k',        name: '2K Row',            category: 'engine', unit: 'time', lowerIsBetter: true },
  { key: 'bike_cal',      name: 'Assault Bike Cal/min', category: 'engine', unit: 'reps' },
];

export const EXERCISES_BY_KEY: Record<string, Exercise> = EXERCISES.reduce((acc, ex) => {
  acc[ex.key] = ex;
  return acc;
}, {} as Record<string, Exercise>);

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength:  'Strength',
  olympic:   'Olympic',
  gymnastic: 'Gymnastic',
  benchmark: 'Benchmark',
  engine:    'Engine',
};

export const CATEGORY_ORDER: ExerciseCategory[] = ['strength', 'olympic', 'gymnastic', 'benchmark', 'engine'];

/** Format a PR value into something displayable given the unit. */
export function formatPRValue(value: number, unit: ExerciseUnit): string {
  if (unit === 'lbs')  return `${value} lb`;
  if (unit === 'reps') return `${value}`;
  // time in seconds — show mm:ss or hh:mm:ss
  const total = Math.floor(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Parse a user-entered value for an exercise back into a number. */
export function parsePRValue(input: string, unit: ExerciseUnit): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (unit === 'time') {
    // Accept "mm:ss" or "h:mm:ss"
    const parts = trimmed.split(':').map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }
  const n = parseFloat(trimmed);
  return Number.isNaN(n) ? null : n;
}

/** Estimate 1RM via Epley: weight × (1 + reps/30). */
export function estimate1RM(weight: number, reps: number): number {
  if (reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}
