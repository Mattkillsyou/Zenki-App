/**
 * Menstrual cycle tracking types.
 * This data is sensitive — never exposed in social/shared features.
 */

export type FlowIntensity = 'light' | 'medium' | 'heavy';

export type CycleSymptom =
  | 'cramps'
  | 'headache'
  | 'bloating'
  | 'fatigue'
  | 'mood_changes'
  | 'breast_tenderness'
  | 'acne'
  | 'backache'
  | 'nausea'
  | 'insomnia';

export const SYMPTOM_LABELS: Record<CycleSymptom, string> = {
  cramps: 'Cramps',
  headache: 'Headache',
  bloating: 'Bloating',
  fatigue: 'Fatigue',
  mood_changes: 'Mood Changes',
  breast_tenderness: 'Breast Tenderness',
  acne: 'Acne',
  backache: 'Backache',
  nausea: 'Nausea',
  insomnia: 'Insomnia',
};

export const SYMPTOM_ICONS: Record<CycleSymptom, string> = {
  cramps: '😣',
  headache: '🤕',
  bloating: '🫧',
  fatigue: '😴',
  mood_changes: '🎭',
  breast_tenderness: '💗',
  acne: '✨',
  backache: '🔙',
  nausea: '🤢',
  insomnia: '🌙',
};

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'Menstrual',
  follicular: 'Follicular',
  ovulation: 'Ovulation',
  luteal: 'Luteal',
};

export const PHASE_COLORS: Record<CyclePhase, string> = {
  menstrual: '#E63946',
  follicular: '#2EC4B6',
  ovulation: '#FFB800',
  luteal: '#9B59B6',
};

export const PHASE_ICONS: Record<CyclePhase, string> = {
  menstrual: '🩸',
  follicular: '🌱',
  ovulation: '🌸',
  luteal: '🌙',
};

/** Nutritional recommendations per cycle phase. */
export const PHASE_RECOMMENDATIONS: Record<CyclePhase, {
  energy: string;
  nutrition: string;
  training: string;
  calorieAdjustment: number; // additional kcal above baseline
}> = {
  menstrual: {
    energy: 'Energy may be lower — listen to your body',
    nutrition: 'Increase iron-rich foods (spinach, red meat, lentils). Magnesium helps with cramps.',
    training: 'Gentle movement, yoga, light cardio. Reduce intensity if needed.',
    calorieAdjustment: 0,
  },
  follicular: {
    energy: 'Energy rising — great time for new challenges',
    nutrition: 'Balanced macros, focus on lean protein for muscle building.',
    training: 'High-intensity training, PRs, heavy lifts. Your body recovers well.',
    calorieAdjustment: 0,
  },
  ovulation: {
    energy: 'Peak energy and strength',
    nutrition: 'Anti-inflammatory foods (berries, fatty fish). Stay hydrated.',
    training: 'Push hard — this is your strongest phase. Go for PRs.',
    calorieAdjustment: 50,
  },
  luteal: {
    energy: 'Energy gradually decreasing, cravings are normal',
    nutrition: 'Metabolism increases ~100-300 cal. Complex carbs help mood. Extra magnesium and B6.',
    training: 'Moderate intensity. Switch to strength/endurance. Avoid overtraining.',
    calorieAdjustment: 200,
  },
};

/** A logged period entry. */
export interface PeriodEntry {
  id: string;
  memberId: string;
  startDate: string;      // YYYY-MM-DD
  endDate?: string;        // YYYY-MM-DD — null if still ongoing
  flowIntensity: FlowIntensity;
  symptoms: CycleSymptom[];
  notes?: string;
  createdAt: string;       // ISO
}

/** Computed cycle data. */
export interface CycleInfo {
  /** Average cycle length in days (default 28 if not enough data). */
  avgCycleLength: number;
  /** Current phase based on last period. */
  currentPhase: CyclePhase;
  /** Day within the current cycle (1-indexed). */
  cycleDay: number;
  /** Predicted next period start date. */
  predictedNextPeriod: string; // YYYY-MM-DD
  /** Days until predicted next period (0 when due or overdue — see isOverdue). */
  daysUntilNextPeriod: number;
  /** Whether currently menstruating. */
  isOnPeriod: boolean;
  /** True when the predicted next period has passed without a new log. */
  isOverdue: boolean;
  /** Days past the predicted start (0 when not overdue). */
  daysOverdue: number;
}

/**
 * Parse a YYYY-MM-DD string as LOCAL midnight. Returns null for anything
 * unparseable. computeCycleInfo runs inside an app-root provider render, so
 * one bad date must degrade gracefully — never throw.
 */
function parseLocalDate(dateStr: unknown): Date | null {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
}

/** Whether a string is a real, parseable YYYY-MM-DD date. */
export function isValidCycleDate(dateStr: string): boolean {
  return parseLocalDate(dateStr) !== null;
}

/**
 * Calculate current cycle phase from cycle day and average length.
 *
 * Typical 28-day cycle:
 * - Days 1-5: Menstrual
 * - Days 6-13: Follicular
 * - Days 14-16: Ovulation
 * - Days 17-28: Luteal
 *
 * Scales proportionally for different cycle lengths.
 */
export function computePhase(cycleDay: number, cycleLength: number): CyclePhase {
  const ratio = cycleDay / cycleLength;
  if (ratio <= 0.18) return 'menstrual';      // ~days 1-5 of 28
  if (ratio <= 0.46) return 'follicular';      // ~days 6-13 of 28
  if (ratio <= 0.57) return 'ovulation';       // ~days 14-16 of 28
  return 'luteal';                              // ~days 17-28 of 28
}

/**
 * Calculate cycle info from period entries.
 */
export function computeCycleInfo(entries: PeriodEntry[]): CycleInfo | null {
  // Drop entries whose startDate can't parse — an unparseable date must never
  // reach the math below (a thrown RangeError here lands on the ROOT error
  // boundary because the provider computes this during render).
  const usable = entries.filter((e) => parseLocalDate(e.startDate) !== null);
  if (usable.length === 0) return null;

  // Sort entries newest first
  const sorted = [...usable].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const latest = sorted[0];

  // Calculate average cycle length from consecutive periods
  let totalCycleDays = 0;
  let cycleCount = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = parseLocalDate(sorted[i].startDate)!;
    const previous = parseLocalDate(sorted[i + 1].startDate)!;
    const diff = Math.round((current.getTime() - previous.getTime()) / 86400000);
    if (diff >= 21 && diff <= 40) { // valid cycle range
      totalCycleDays += diff;
      cycleCount++;
    }
  }
  const avgCycleLength = cycleCount > 0 ? Math.round(totalCycleDays / cycleCount) : 28;

  // Calculate current cycle day. No modulo wrap — wrapping past avgCycleLength
  // asserted "Menstrual · Day 1" for a period that was never logged; an overdue
  // period is surfaced via isOverdue/daysOverdue instead.
  const lastPeriodStart = parseLocalDate(latest.startDate)!;
  const now = new Date();
  const daysSinceLastPeriod = Math.floor((now.getTime() - lastPeriodStart.getTime()) / 86400000);
  const cycleDay = Math.max(1, daysSinceLastPeriod + 1);

  // Is currently on period?
  const isOnPeriod = latest.endDate
    ? now <= new Date(latest.endDate + 'T23:59:59')
    : daysSinceLastPeriod <= 7; // assume max 7 days if no end date

  // Predicted next period — one avgCycleLength after the last logged start.
  // Deliberately NOT rolled forward once it passes: lateness is reported,
  // not masked as a fresh prediction.
  const nextPeriodDate = new Date(lastPeriodStart);
  nextPeriodDate.setDate(nextPeriodDate.getDate() + avgCycleLength);
  const rawDaysUntil = Math.ceil((nextPeriodDate.getTime() - now.getTime()) / 86400000);
  const isOverdue = !isOnPeriod && rawDaysUntil < 0;
  const daysOverdue = isOverdue ? -rawDaysUntil : 0;
  const daysUntilNextPeriod = Math.max(0, rawDaysUntil);
  // Format from local date fields (toISOString would shift the day for
  // non-UTC timezones now that the base date is local midnight).
  const pad = (n: number) => String(n).padStart(2, '0');
  const predictedNextPeriod = `${nextPeriodDate.getFullYear()}-${pad(nextPeriodDate.getMonth() + 1)}-${pad(nextPeriodDate.getDate())}`;

  // Past avgCycleLength the ratio exceeds 1 → stays 'luteal' (never re-enters
  // early phases while a period is overdue).
  const currentPhase = isOnPeriod ? 'menstrual' : computePhase(cycleDay, avgCycleLength);

  return {
    avgCycleLength,
    currentPhase,
    cycleDay,
    predictedNextPeriod,
    daysUntilNextPeriod,
    isOnPeriod,
    isOverdue,
    daysOverdue,
  };
}
