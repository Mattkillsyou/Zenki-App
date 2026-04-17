// ──────────────────────────────────────────────────────────────────
// CROSSFIT WORKOUT TOOLS
//
// Admins publish a "Workout of the Day" (WOD). Members view it and
// log their results against it, or log their own workout.
// ──────────────────────────────────────────────────────────────────

export type WODFormat =
  | 'AMRAP'      // As Many Reps/Rounds As Possible
  | 'EMOM'       // Every Minute On the Minute
  | 'FOR_TIME'   // Finish as fast as possible
  | 'TABATA'     // 20s work / 10s rest x 8
  | 'CHIPPER'    // One big list of reps, knock them out
  | 'STRENGTH'   // e.g. 5x5 Back Squat
  | 'OTHER';

export const WOD_FORMAT_LABEL: Record<WODFormat, string> = {
  AMRAP:    'AMRAP',
  EMOM:     'EMOM',
  FOR_TIME: 'For Time',
  TABATA:   'Tabata',
  CHIPPER:  'Chipper',
  STRENGTH: 'Strength',
  OTHER:    'Workout',
};

export type WodResult = 'Rx' | 'Scaled';

export interface WOD {
  id: string;
  date: string;             // YYYY-MM-DD
  title: string;
  format: WODFormat;
  description: string;
  timeCapMinutes?: number;
  coachingNotes?: string;
  createdAt: string;        // ISO
}

export interface WorkoutLog {
  id: string;
  memberId: string;
  wodId?: string;           // set if following a published WOD
  date: string;             // YYYY-MM-DD
  title: string;
  format: WODFormat;
  result: string;           // "4:32" or "5 rounds + 12 reps"
  rxOrScaled: WodResult;
  notes: string;
  durationMinutes?: number;
  createdAt: string;        // ISO
}
