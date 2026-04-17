// ──────────────────────────────────────────────────────────────────
// TRAINING TOOLS
//
// Members log two kinds of things:
//  - WorkoutLog: free-form workout session (any workout they did)
//  - PersonalRecord: a tracked PR against a specific exercise from
//    the catalog in data/exercises.ts
// ──────────────────────────────────────────────────────────────────

export type WorkoutFormat =
  | 'AMRAP'
  | 'EMOM'
  | 'FOR_TIME'
  | 'TABATA'
  | 'CHIPPER'
  | 'STRENGTH'
  | 'OTHER';

export const WORKOUT_FORMAT_LABEL: Record<WorkoutFormat, string> = {
  AMRAP:    'AMRAP',
  EMOM:     'EMOM',
  FOR_TIME: 'For Time',
  TABATA:   'Tabata',
  CHIPPER:  'Chipper',
  STRENGTH: 'Strength',
  OTHER:    'Workout',
};

export type WodResult = 'Rx' | 'Scaled';

export interface WorkoutLog {
  id: string;
  memberId: string;
  date: string;             // YYYY-MM-DD
  title: string;
  format: WorkoutFormat;
  result: string;           // "4:32" or "5 rounds + 12 reps"
  rxOrScaled: WodResult;
  notes: string;
  durationMinutes?: number;
  createdAt: string;
}

export interface PersonalRecord {
  id: string;
  memberId: string;
  exerciseKey: string;      // from EXERCISES in data/exercises.ts
  value: number;            // weight (lbs), time (sec), or reps
  reps?: number;            // when value is weight, reps lets us compute 1RM
  date: string;             // YYYY-MM-DD
  notes?: string;
  createdAt: string;
}
