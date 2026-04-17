/**
 * Nutrition math — BMR, TDEE, macro targets.
 * Uses the Mifflin-St Jeor equation (most accurate for modern populations, ±5%).
 *
 * Reference: https://reference.medscape.com/calculator/846/mifflin-st-jeor-equation
 */

export type Sex = 'male' | 'female';

export type ActivityLevel =
  | 'sedentary'         // desk job, no training
  | 'light'             // 1–3 training days / wk
  | 'moderate'          // 3–5 training days / wk
  | 'active'            // 6–7 training days / wk
  | 'very_active';      // physical job + daily training

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  active: 'Very active',
  very_active: 'Extremely active',
};

export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, string> = {
  sedentary: 'Desk job, no training',
  light: '1–3 training days/week',
  moderate: '3–5 training days/week',
  active: '6–7 training days/week',
  very_active: 'Physical job + daily training',
};

export type Goal = 'cut' | 'maintain' | 'bulk';

export const GOAL_LABELS: Record<Goal, string> = {
  cut: 'Lose fat',
  maintain: 'Maintain',
  bulk: 'Gain muscle',
};

/**
 * Default calorie adjustment as % of TDEE per goal.
 * - Cut: -20% (aggressive but sustainable — ~1lb/week at 2500 TDEE)
 * - Maintain: 0%
 * - Bulk: +10% (lean gains, minimize fat gain)
 */
export const GOAL_ADJUSTMENT: Record<Goal, number> = {
  cut: -0.2,
  maintain: 0,
  bulk: 0.1,
};

// ─────────────────────────────────────────────
// Unit conversion
// ─────────────────────────────────────────────

export function lbsToKg(lbs: number): number {
  return lbs / 2.20462;
}

export function kgToLbs(kg: number): number {
  return kg * 2.20462;
}

export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * 12 + inches);
}

// ─────────────────────────────────────────────
// BMR / TDEE
// ─────────────────────────────────────────────

interface BMRInput {
  sex: Sex;
  weightKg: number;
  heightCm: number;
  ageYears: number;
}

/**
 * Mifflin-St Jeor BMR (kcal/day).
 * Male:   10*kg + 6.25*cm - 5*age + 5
 * Female: 10*kg + 6.25*cm - 5*age - 161
 */
export function calculateBMR({ sex, weightKg, heightCm, ageYears }: BMRInput): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return sex === 'male' ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activity: ActivityLevel): number {
  return bmr * ACTIVITY_MULTIPLIERS[activity];
}

// ─────────────────────────────────────────────
// Macro split
// ─────────────────────────────────────────────

export interface MacroTargets {
  calories: number;
  protein: number;  // grams
  carbs: number;    // grams
  fat: number;      // grams
}

interface MacroSplitInput {
  tdee: number;
  goal: Goal;
  weightKg: number;
  /** Optional override of calorie adjustment (default: GOAL_ADJUSTMENT[goal]) */
  adjustmentOverride?: number;
}

/**
 * Split calories into macros:
 *  - Protein: 1g per lb body weight (2.2g/kg) — high enough for aesthetic + performance goals
 *  - Fat: 25% of calories (minimum for hormone health)
 *  - Carbs: remainder
 *
 * Calories / gram: protein 4, carbs 4, fat 9.
 */
export function calculateMacros({ tdee, goal, weightKg, adjustmentOverride }: MacroSplitInput): MacroTargets {
  const adj = adjustmentOverride ?? GOAL_ADJUSTMENT[goal];
  const calories = Math.round(tdee * (1 + adj));

  const proteinG = Math.round(weightKg * 2.2);
  const proteinCal = proteinG * 4;

  const fatCal = Math.round(calories * 0.25);
  const fatG = Math.round(fatCal / 9);

  const remainingCal = Math.max(0, calories - proteinCal - fatCal);
  const carbsG = Math.round(remainingCal / 4);

  return {
    calories,
    protein: proteinG,
    carbs: carbsG,
    fat: fatG,
  };
}

// ─────────────────────────────────────────────
// Adaptive expenditure
// ─────────────────────────────────────────────

/**
 * Energy density of body mass change — widely used in energy-balance models.
 *   1 lb of fat ≈ 3500 kcal  →  1 kg ≈ 7700 kcal
 * Real body mass changes mix fat + water + glycogen, so this is an approximation,
 * but it's the standard coefficient for reconciling intake ↔ weight.
 */
const KCAL_PER_KG_MASS_CHANGE = 7700;

/**
 * Maximum per-update change to TDEE. Damps the algorithm so short-term
 * water-weight swings don't create whiplash in macro targets.
 * MacroFactor uses roughly ±50 kcal/week.
 */
const MAX_TDEE_DELTA_KCAL = 50;

/**
 * Minimum number of days of both intake + weight data required before
 * we attempt a reconciliation update. Under this, we just return the
 * prior TDEE unchanged with confidence 'none'.
 */
const MIN_WINDOW_DAYS = 10;

export type ExpenditureConfidence = 'none' | 'low' | 'medium' | 'high';

export interface ExpenditureUpdate {
  /** New TDEE after reconciliation. Clamped to ±MAX_TDEE_DELTA_KCAL of prior. */
  newTdee: number;
  /** Delta from the prior TDEE. Always within [-MAX_TDEE_DELTA_KCAL, +MAX_TDEE_DELTA_KCAL]. */
  delta: number;
  /** Raw observed TDEE before clamping/damping. Useful for transparency. */
  rawObservedTdee: number;
  /** Number of days the update was computed over. */
  windowDays: number;
  confidence: ExpenditureConfidence;
  /** Human-readable reason if no update was made (e.g. "Not enough data"). */
  reason?: string;
}

interface ReconcileInput {
  priorTdee: number;
  /** intakeByDate[YYYY-MM-DD] = total kcal consumed that day. */
  intakeByDate: Record<string, number>;
  /** weightByDateKg[YYYY-MM-DD] = weight in kg (canonical). */
  weightByDateKg: Record<string, number>;
  /** Optional override of the max window days we'll look back. Default 28. */
  maxWindowDays?: number;
}

/**
 * Pure function. Reconciles observed weight change against observed intake to
 * back out a real expenditure estimate, then damps it against the prior TDEE.
 *
 * Algorithm (simplified MacroFactor):
 *   1. Take the earliest weigh-in in the window and the latest.
 *   2. Sum all intake between them.
 *   3. Expected weight change = (sumIntake - priorTdee * days) / 7700
 *      Actual weight change = latest - earliest (kg)
 *      observedTdee = (sumIntake - actualChange_kg * 7700) / days
 *   4. Clamp delta to ±MAX_TDEE_DELTA_KCAL.
 */
export function reconcileExpenditure({
  priorTdee,
  intakeByDate,
  weightByDateKg,
  maxWindowDays = 28,
}: ReconcileInput): ExpenditureUpdate {
  const weightDates = Object.keys(weightByDateKg).sort();
  if (weightDates.length < 2) {
    return {
      newTdee: priorTdee,
      delta: 0,
      rawObservedTdee: priorTdee,
      windowDays: 0,
      confidence: 'none',
      reason: 'Need at least 2 weigh-ins',
    };
  }

  // Window: latest weigh-in back up to maxWindowDays.
  const latestDate = weightDates[weightDates.length - 1];
  const latestWeightKg = weightByDateKg[latestDate];

  const earliestDate = weightDates.find((d) => daysBetween(d, latestDate) <= maxWindowDays) ?? weightDates[0];
  const earliestWeightKg = weightByDateKg[earliestDate];

  const windowDays = daysBetween(earliestDate, latestDate);
  if (windowDays < MIN_WINDOW_DAYS) {
    return {
      newTdee: priorTdee,
      delta: 0,
      rawObservedTdee: priorTdee,
      windowDays,
      confidence: 'none',
      reason: `Need ${MIN_WINDOW_DAYS}+ days of data (have ${windowDays})`,
    };
  }

  // Sum intake for every day in [earliest, latest]. Days with no log count as 0 —
  // we surface this in `confidence` rather than trying to interpolate intake.
  let daysWithIntake = 0;
  let sumIntake = 0;
  let cursor = new Date(earliestDate + 'T12:00:00');
  const end = new Date(latestDate + 'T12:00:00');
  while (cursor <= end) {
    const iso = cursor.toISOString().split('T')[0];
    const kcal = intakeByDate[iso];
    if (typeof kcal === 'number' && kcal > 0) {
      sumIntake += kcal;
      daysWithIntake++;
    }
    cursor = new Date(cursor.getTime() + 86400000);
  }

  // If we didn't log intake on enough days, we can't reliably reconcile.
  const coverage = daysWithIntake / windowDays;
  if (coverage < 0.5 || daysWithIntake < 5) {
    return {
      newTdee: priorTdee,
      delta: 0,
      rawObservedTdee: priorTdee,
      windowDays,
      confidence: 'none',
      reason: 'Log intake on more days for adaptive updates',
    };
  }

  const weightChangeKg = latestWeightKg - earliestWeightKg;
  // observedTdee = (sumIntake - weightChangeKg * 7700) / daysWithIntake
  // Rationale: sumIntake - weightChangeKg * 7700 = total expenditure over those days.
  const totalExpenditure = sumIntake - weightChangeKg * KCAL_PER_KG_MASS_CHANGE;
  const rawObservedTdee = totalExpenditure / Math.max(1, daysWithIntake);

  // Damp delta to ±MAX_TDEE_DELTA_KCAL
  const rawDelta = rawObservedTdee - priorTdee;
  const delta = Math.max(-MAX_TDEE_DELTA_KCAL, Math.min(MAX_TDEE_DELTA_KCAL, rawDelta));
  const newTdee = Math.round(priorTdee + delta);

  // Confidence scales with window + coverage + magnitude of raw signal
  let confidence: ExpenditureConfidence;
  if (coverage >= 0.85 && windowDays >= 21) confidence = 'high';
  else if (coverage >= 0.7 && windowDays >= 14) confidence = 'medium';
  else confidence = 'low';

  return {
    newTdee,
    delta: Math.round(delta),
    rawObservedTdee: Math.round(rawObservedTdee),
    windowDays,
    confidence,
  };
}

function daysBetween(earlierISO: string, laterISO: string): number {
  const a = new Date(earlierISO + 'T12:00:00').getTime();
  const b = new Date(laterISO + 'T12:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

// ─────────────────────────────────────────────
// Trend weight (MacroFactor-style)
// ─────────────────────────────────────────────

/**
 * EWMA smoothing factor. α=0.1 gives roughly a 14-day effective window
 * (the "half-life" is ~ln(2)/α ≈ 6.9 days; 95% of weight is from the last ~30 days).
 * Matches what MacroFactor's help docs describe for their trend weight.
 */
const TREND_ALPHA = 0.1;

export interface TrendPoint {
  date: string;       // YYYY-MM-DD
  rawKg: number | null; // null if this day was interpolated
  trendKg: number;
}

interface RawPoint {
  date: string;
  weightKg: number;
}

/**
 * Compute a trend weight series from a sparse list of weigh-ins.
 *
 *  1. Sort weigh-ins ascending by date.
 *  2. Fill day-by-day from the first weigh-in to the last, linearly interpolating
 *     missing days between surrounding entries.
 *  3. Apply EWMA forward: trend[0] = raw[0], trend[i] = α*raw[i] + (1-α)*trend[i-1].
 *
 * Returns one TrendPoint per day (inclusive), oldest first.
 */
export function computeTrendWeight(rawPoints: RawPoint[], alpha = TREND_ALPHA): TrendPoint[] {
  if (rawPoints.length === 0) return [];

  const sorted = [...rawPoints].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (sorted.length === 1) {
    return [{ date: sorted[0].date, rawKg: sorted[0].weightKg, trendKg: sorted[0].weightKg }];
  }

  // Step 1: build a day-by-day raw series with linear interpolation.
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const totalDays = daysBetween(first.date, last.date);

  const rawByDate: Record<string, number> = {};
  // Exact entries first — if multiple on same day, keep the latest provided (caller's order)
  for (const p of sorted) rawByDate[p.date] = p.weightKg;

  const series: { date: string; rawKg: number | null; interpKg: number }[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = new Date(first.date + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().split('T')[0];

    if (iso in rawByDate) {
      series.push({ date: iso, rawKg: rawByDate[iso], interpKg: rawByDate[iso] });
    } else {
      // Interpolate between surrounding anchors
      const prev = sorted.filter((p) => p.date < iso).pop();
      const next = sorted.find((p) => p.date > iso);
      if (prev && next) {
        const total = daysBetween(prev.date, next.date);
        const offset = daysBetween(prev.date, iso);
        const t = offset / total;
        const interp = prev.weightKg + t * (next.weightKg - prev.weightKg);
        series.push({ date: iso, rawKg: null, interpKg: interp });
      } else if (prev) {
        series.push({ date: iso, rawKg: null, interpKg: prev.weightKg });
      } else if (next) {
        series.push({ date: iso, rawKg: null, interpKg: next.weightKg });
      }
    }
  }

  // Step 2: apply EWMA
  const out: TrendPoint[] = [];
  let trend = series[0].interpKg;
  for (let i = 0; i < series.length; i++) {
    const s = series[i];
    trend = i === 0 ? s.interpKg : alpha * s.interpKg + (1 - alpha) * trend;
    out.push({ date: s.date, rawKg: s.rawKg, trendKg: trend });
  }

  return out;
}

/**
 * Delta between the most-recent trend value and the trend value from `daysAgo` days ago.
 * Returns null if there's insufficient history.
 */
export function trendChange(trend: TrendPoint[], daysAgo: number): number | null {
  if (trend.length === 0) return null;
  const latest = trend[trend.length - 1];
  const latestDate = new Date(latest.date + 'T12:00:00');
  const target = new Date(latestDate.getTime() - daysAgo * 86400000)
    .toISOString()
    .split('T')[0];
  // Find the closest trend point to the target date
  const earlier = [...trend].reverse().find((p) => p.date <= target);
  if (!earlier) return null;
  return latest.trendKg - earlier.trendKg;
}
