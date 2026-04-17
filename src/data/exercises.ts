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

/* ═══════════════════════════════════════════════════════════════════════════
 * STRUCTURED EXERCISE CATALOG (Module 2)
 * 100+ exercises with muscle group classification for structured workout logging.
 * ═══════════════════════════════════════════════════════════════════════════ */

import {
  ExerciseDefinition,
  MuscleGroup,
  ExerciseCategory as StructuredCategory,
  EquipmentType,
} from '../types/activity';

function defEx(
  id: string,
  name: string,
  muscleGroup: MuscleGroup,
  secondaryMuscles: MuscleGroup[],
  category: StructuredCategory,
  equipment: EquipmentType,
): ExerciseDefinition {
  return { id, name, muscleGroup, secondaryMuscles, category, equipment };
}

export const STRUCTURED_EXERCISES: ExerciseDefinition[] = [
  // ── CHEST ──
  defEx('bench-press', 'Bench Press', 'chest', ['triceps', 'shoulders'], 'compound', 'barbell'),
  defEx('incline-bench', 'Incline Bench Press', 'chest', ['triceps', 'shoulders'], 'compound', 'barbell'),
  defEx('decline-bench', 'Decline Bench Press', 'chest', ['triceps'], 'compound', 'barbell'),
  defEx('db-bench', 'Dumbbell Bench Press', 'chest', ['triceps', 'shoulders'], 'compound', 'dumbbell'),
  defEx('db-incline-bench', 'Incline Dumbbell Press', 'chest', ['triceps', 'shoulders'], 'compound', 'dumbbell'),
  defEx('db-fly', 'Dumbbell Fly', 'chest', ['shoulders'], 'isolation', 'dumbbell'),
  defEx('cable-fly', 'Cable Fly', 'chest', ['shoulders'], 'isolation', 'cable'),
  defEx('cable-crossover', 'Cable Crossover', 'chest', ['shoulders'], 'isolation', 'cable'),
  defEx('pec-deck', 'Pec Deck', 'chest', [], 'isolation', 'machine'),
  defEx('push-up', 'Push-Up', 'chest', ['triceps', 'shoulders', 'core'], 'bodyweight', 'bodyweight'),
  defEx('dip-chest', 'Chest Dip', 'chest', ['triceps', 'shoulders'], 'bodyweight', 'bodyweight'),
  defEx('machine-chest-press', 'Machine Chest Press', 'chest', ['triceps'], 'compound', 'machine'),

  // ── BACK ──
  defEx('deadlift-struct', 'Deadlift', 'back', ['hamstrings', 'glutes', 'core'], 'compound', 'barbell'),
  defEx('barbell-row', 'Barbell Row', 'back', ['biceps', 'core'], 'compound', 'barbell'),
  defEx('pendlay-row', 'Pendlay Row', 'back', ['biceps', 'core'], 'compound', 'barbell'),
  defEx('db-row', 'Dumbbell Row', 'back', ['biceps'], 'compound', 'dumbbell'),
  defEx('pull-up', 'Pull-Up', 'back', ['biceps', 'forearms'], 'bodyweight', 'bodyweight'),
  defEx('chin-up', 'Chin-Up', 'back', ['biceps'], 'bodyweight', 'bodyweight'),
  defEx('lat-pulldown', 'Lat Pulldown', 'back', ['biceps'], 'compound', 'cable'),
  defEx('cable-row', 'Seated Cable Row', 'back', ['biceps'], 'compound', 'cable'),
  defEx('t-bar-row', 'T-Bar Row', 'back', ['biceps', 'core'], 'compound', 'barbell'),
  defEx('face-pull', 'Face Pull', 'back', ['shoulders'], 'isolation', 'cable'),
  defEx('rack-pull', 'Rack Pull', 'back', ['hamstrings', 'glutes'], 'compound', 'barbell'),
  defEx('machine-row', 'Machine Row', 'back', ['biceps'], 'compound', 'machine'),
  defEx('hyperextension', 'Hyperextension', 'back', ['glutes', 'hamstrings'], 'isolation', 'bodyweight'),
  defEx('straight-arm-pulldown', 'Straight Arm Pulldown', 'back', [], 'isolation', 'cable'),

  // ── SHOULDERS ──
  defEx('ohp', 'Overhead Press', 'shoulders', ['triceps', 'core'], 'compound', 'barbell'),
  defEx('db-shoulder-press', 'Dumbbell Shoulder Press', 'shoulders', ['triceps'], 'compound', 'dumbbell'),
  defEx('arnold-press', 'Arnold Press', 'shoulders', ['triceps'], 'compound', 'dumbbell'),
  defEx('lateral-raise', 'Lateral Raise', 'shoulders', [], 'isolation', 'dumbbell'),
  defEx('front-raise', 'Front Raise', 'shoulders', [], 'isolation', 'dumbbell'),
  defEx('rear-delt-fly', 'Rear Delt Fly', 'shoulders', ['back'], 'isolation', 'dumbbell'),
  defEx('cable-lateral-raise', 'Cable Lateral Raise', 'shoulders', [], 'isolation', 'cable'),
  defEx('machine-shoulder-press', 'Machine Shoulder Press', 'shoulders', ['triceps'], 'compound', 'machine'),
  defEx('upright-row', 'Upright Row', 'shoulders', ['biceps'], 'compound', 'barbell'),
  defEx('shrug', 'Barbell Shrug', 'shoulders', ['forearms'], 'isolation', 'barbell'),
  defEx('db-shrug', 'Dumbbell Shrug', 'shoulders', ['forearms'], 'isolation', 'dumbbell'),

  // ── BICEPS ──
  defEx('barbell-curl', 'Barbell Curl', 'biceps', ['forearms'], 'isolation', 'barbell'),
  defEx('db-curl', 'Dumbbell Curl', 'biceps', ['forearms'], 'isolation', 'dumbbell'),
  defEx('hammer-curl', 'Hammer Curl', 'biceps', ['forearms'], 'isolation', 'dumbbell'),
  defEx('preacher-curl', 'Preacher Curl', 'biceps', [], 'isolation', 'barbell'),
  defEx('incline-curl', 'Incline Dumbbell Curl', 'biceps', [], 'isolation', 'dumbbell'),
  defEx('concentration-curl', 'Concentration Curl', 'biceps', [], 'isolation', 'dumbbell'),
  defEx('cable-curl', 'Cable Curl', 'biceps', ['forearms'], 'isolation', 'cable'),
  defEx('ez-bar-curl', 'EZ Bar Curl', 'biceps', ['forearms'], 'isolation', 'barbell'),

  // ── TRICEPS ──
  defEx('close-grip-bench', 'Close Grip Bench Press', 'triceps', ['chest'], 'compound', 'barbell'),
  defEx('tricep-pushdown', 'Tricep Pushdown', 'triceps', [], 'isolation', 'cable'),
  defEx('overhead-extension', 'Overhead Tricep Extension', 'triceps', [], 'isolation', 'dumbbell'),
  defEx('skull-crusher', 'Skull Crusher', 'triceps', [], 'isolation', 'barbell'),
  defEx('dip-tricep', 'Tricep Dip', 'triceps', ['chest', 'shoulders'], 'bodyweight', 'bodyweight'),
  defEx('kickback', 'Tricep Kickback', 'triceps', [], 'isolation', 'dumbbell'),
  defEx('rope-pushdown', 'Rope Pushdown', 'triceps', [], 'isolation', 'cable'),

  // ── FOREARMS ──
  defEx('wrist-curl', 'Wrist Curl', 'forearms', [], 'isolation', 'barbell'),
  defEx('reverse-wrist-curl', 'Reverse Wrist Curl', 'forearms', [], 'isolation', 'barbell'),
  defEx('farmer-walk', 'Farmer Walk', 'forearms', ['core', 'shoulders'], 'compound', 'dumbbell'),

  // ── QUADS ──
  defEx('back-squat', 'Back Squat', 'quads', ['glutes', 'hamstrings', 'core'], 'compound', 'barbell'),
  defEx('front-squat-struct', 'Front Squat', 'quads', ['glutes', 'core'], 'compound', 'barbell'),
  defEx('leg-press', 'Leg Press', 'quads', ['glutes'], 'compound', 'machine'),
  defEx('leg-extension', 'Leg Extension', 'quads', [], 'isolation', 'machine'),
  defEx('goblet-squat', 'Goblet Squat', 'quads', ['glutes', 'core'], 'compound', 'dumbbell'),
  defEx('hack-squat', 'Hack Squat', 'quads', ['glutes'], 'compound', 'machine'),
  defEx('bulgarian-split-squat', 'Bulgarian Split Squat', 'quads', ['glutes'], 'compound', 'dumbbell'),
  defEx('walking-lunge', 'Walking Lunge', 'quads', ['glutes', 'hamstrings'], 'compound', 'dumbbell'),
  defEx('step-up', 'Step Up', 'quads', ['glutes'], 'compound', 'dumbbell'),

  // ── HAMSTRINGS ──
  defEx('romanian-deadlift', 'Romanian Deadlift', 'hamstrings', ['glutes', 'back'], 'compound', 'barbell'),
  defEx('leg-curl', 'Leg Curl', 'hamstrings', [], 'isolation', 'machine'),
  defEx('stiff-leg-deadlift', 'Stiff Leg Deadlift', 'hamstrings', ['glutes', 'back'], 'compound', 'barbell'),
  defEx('db-rdl', 'Dumbbell Romanian Deadlift', 'hamstrings', ['glutes'], 'compound', 'dumbbell'),
  defEx('nordic-curl', 'Nordic Curl', 'hamstrings', [], 'bodyweight', 'bodyweight'),
  defEx('good-morning', 'Good Morning', 'hamstrings', ['back', 'glutes'], 'compound', 'barbell'),

  // ── GLUTES ──
  defEx('hip-thrust', 'Hip Thrust', 'glutes', ['hamstrings'], 'compound', 'barbell'),
  defEx('glute-bridge', 'Glute Bridge', 'glutes', ['hamstrings'], 'isolation', 'bodyweight'),
  defEx('cable-pull-through', 'Cable Pull Through', 'glutes', ['hamstrings'], 'compound', 'cable'),
  defEx('sumo-deadlift', 'Sumo Deadlift', 'glutes', ['quads', 'back'], 'compound', 'barbell'),
  defEx('hip-abduction', 'Hip Abduction Machine', 'glutes', [], 'isolation', 'machine'),

  // ── CALVES ──
  defEx('calf-raise', 'Standing Calf Raise', 'calves', [], 'isolation', 'machine'),
  defEx('seated-calf-raise', 'Seated Calf Raise', 'calves', [], 'isolation', 'machine'),

  // ── CORE ──
  defEx('plank', 'Plank', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('side-plank', 'Side Plank', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('crunch', 'Crunch', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('hanging-leg-raise', 'Hanging Leg Raise', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('cable-woodchop', 'Cable Woodchop', 'core', ['shoulders'], 'compound', 'cable'),
  defEx('russian-twist', 'Russian Twist', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('ab-wheel', 'Ab Wheel Rollout', 'core', ['shoulders'], 'bodyweight', 'other'),
  defEx('mountain-climber', 'Mountain Climber', 'core', ['shoulders', 'quads'], 'bodyweight', 'bodyweight'),
  defEx('dead-bug', 'Dead Bug', 'core', [], 'bodyweight', 'bodyweight'),
  defEx('pallof-press', 'Pallof Press', 'core', [], 'isolation', 'cable'),

  // ── FULL BODY / OLYMPIC ──
  defEx('clean-struct', 'Clean', 'full_body', ['back', 'shoulders', 'quads'], 'olympic', 'barbell'),
  defEx('clean-jerk-struct', 'Clean & Jerk', 'full_body', ['back', 'shoulders', 'quads'], 'olympic', 'barbell'),
  defEx('snatch-struct', 'Snatch', 'full_body', ['back', 'shoulders', 'quads'], 'olympic', 'barbell'),
  defEx('power-clean', 'Power Clean', 'full_body', ['back', 'quads'], 'olympic', 'barbell'),
  defEx('thruster-struct', 'Thruster', 'full_body', ['quads', 'shoulders'], 'compound', 'barbell'),
  defEx('turkish-getup', 'Turkish Get-Up', 'full_body', ['core', 'shoulders'], 'compound', 'kettlebell'),
  defEx('burpee', 'Burpee', 'full_body', ['chest', 'quads', 'core'], 'plyometric', 'bodyweight'),
  defEx('kettlebell-swing', 'Kettlebell Swing', 'full_body', ['glutes', 'hamstrings', 'core'], 'compound', 'kettlebell'),
  defEx('man-maker', 'Man Maker', 'full_body', ['chest', 'shoulders', 'back'], 'compound', 'dumbbell'),

  // ── CARDIO ──
  defEx('rowing-machine', 'Rowing Machine', 'cardio', ['back', 'quads'], 'cardio', 'machine'),
  defEx('assault-bike', 'Assault Bike', 'cardio', ['quads', 'core'], 'cardio', 'machine'),
  defEx('jump-rope', 'Jump Rope', 'cardio', ['calves'], 'cardio', 'other'),
  defEx('box-jump', 'Box Jump', 'cardio', ['quads', 'glutes'], 'plyometric', 'bodyweight'),
  defEx('battle-ropes', 'Battle Ropes', 'cardio', ['shoulders', 'core'], 'cardio', 'other'),
  defEx('treadmill', 'Treadmill Run', 'cardio', [], 'cardio', 'machine'),

  // ── MARTIAL ARTS / DOJO-SPECIFIC ──
  defEx('heavy-bag', 'Heavy Bag Work', 'cardio', ['shoulders', 'core'], 'cardio', 'other'),
  defEx('pad-work', 'Pad Work / Mitts', 'cardio', ['shoulders', 'core'], 'cardio', 'other'),
  defEx('bjj-drilling', 'BJJ Drilling', 'full_body', ['core', 'back'], 'cardio', 'bodyweight'),
  defEx('bjj-rolling', 'BJJ Rolling', 'full_body', ['core', 'back', 'shoulders'], 'cardio', 'bodyweight'),
  defEx('muay-thai-sparring', 'Muay Thai Sparring', 'full_body', ['core', 'shoulders'], 'cardio', 'bodyweight'),
  defEx('shadow-boxing', 'Shadow Boxing', 'cardio', ['shoulders', 'core'], 'cardio', 'bodyweight'),
];

/** All unique muscle groups that have exercises. */
export const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'core', 'quads', 'hamstrings', 'glutes', 'calves', 'full_body', 'cardio',
];

/** User-friendly muscle group labels. */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  core: 'Core',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  full_body: 'Full Body',
  cardio: 'Cardio',
};

/** Emoji icons for muscle groups. */
export const MUSCLE_GROUP_ICONS: Record<MuscleGroup, string> = {
  chest: '🫁',
  back: '🔙',
  shoulders: '💪',
  biceps: '💪',
  triceps: '💪',
  forearms: '🤛',
  core: '🔥',
  quads: '🦵',
  hamstrings: '🦵',
  glutes: '🍑',
  calves: '🦶',
  full_body: '🏋️',
  cardio: '❤️',
};

/** Search structured exercises by name (case-insensitive). */
export function searchStructuredExercises(query: string): ExerciseDefinition[] {
  if (!query.trim()) return STRUCTURED_EXERCISES;
  const lower = query.toLowerCase();
  return STRUCTURED_EXERCISES.filter((e) =>
    e.name.toLowerCase().includes(lower) ||
    e.muscleGroup.includes(lower) ||
    e.category.includes(lower),
  );
}

/** Get structured exercises by muscle group. */
export function exercisesByMuscleGroup(group: MuscleGroup): ExerciseDefinition[] {
  return STRUCTURED_EXERCISES.filter(
    (e) => e.muscleGroup === group || e.secondaryMuscles.includes(group),
  );
}

/** Get structured exercise by ID. */
export function getStructuredExercise(id: string): ExerciseDefinition | undefined {
  return STRUCTURED_EXERCISES.find((e) => e.id === id);
}
