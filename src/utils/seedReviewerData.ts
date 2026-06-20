/**
 * Bootstraps the App Review demo account with realistic sample data on its
 * first sign-in. This exists so Apple reviewers land on a lived-in app, not
 * a series of empty states (App Review Guideline 2.1(a) — "provide a demo
 * account with pre-populated uploads and content").
 *
 * Only runs when:
 *   - The signed-in member's id is '5' (the reviewer, see data/members.ts)
 *   - The AsyncStorage marker @zenki_reviewer_seeded_v1 is not set
 *
 * Safe to call on every sign-in — short-circuits after the first success.
 *
 * Data seeded (all dated relative to today so trend charts always have recent
 * shape). Every section below populates a different user-facing screen so the
 * reviewer never hits an empty state:
 *   - 12 weight entries spanning 90 days (mild cut — 168 → 161.5)
 *   - 10 workout logs (mix of formats, strength + benchmarks, one scaled)
 *   - 8 personal records across squats / deadlift / bench / oly / benchmarks
 *   - 3 DEXA scans (90 / 45 / today) showing body-comp progression
 *   - 3 bloodwork panels over 90 days (Vitamin D trending back into range)
 *   - ~5 days of macro entries (today + 4 recent days), macro goals, profile
 *   - Recent foods + a weight goal
 *   - 2 medications/peptides + recent adherence logs
 *   - 4 GPS activities (runs / walk / hike) with routes + splits
 *   - 4 heart-rate workout sessions with zone breakdowns
 *   - Gamification: level/XP/streak/points + a believable set of unlocked
 *     achievements (written to the per-user namespaced key)
 *   - ~3 weeks of drink-tab history
 *   - 2 past gear orders
 *   - 6 dojo check-ins (attendance)
 *
 * Posts are NOT seeded here — those live in Firestore and are seeded from
 * the admin's uid so they appear as posts from another member. See
 * APP_REVIEWER.md for how that happens. Cycle tracker is skipped (female-only;
 * the reviewer profile is male).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member } from '../data/members';
import { WorkoutLog, PersonalRecord } from '../types/workout';
import { WeightEntry, MacroEntry, MacroGoals, NutritionProfile } from '../types/nutrition';
import { DexaScan } from '../types/dexa';
import { BloodworkReport } from '../types/bloodwork';
import { MedicationEntry, MedicationLog } from '../types/medication';
import { GpsActivity, GpsPoint, SplitData } from '../types/activity';
import { HRSession } from '../types/heartRate';
import { GamificationState, Achievement } from '../types/gamification';
import { createInitialAchievements } from '../data/achievements';
import { DrinkEntry, DrinkType } from '../types/drinks';
import { Order } from '../types/orders';
import { AttendanceVisit } from '../types/attendance';
import { FoodSearchResult } from '../types/food';
import { WeightGoal } from '../types/activity';

// Bump this version whenever the seed payload grows/changes. Installs that were
// already seeded by an OLDER version carry the previous marker, so a stale marker
// would make the expanded seed short-circuit (line ~145) and the new sections
// (meds, GPS, HR, orders, attendance, drinks, workouts, PRs) would never get
// written — exactly the "every section isn't populated" symptom. Bumping the
// marker forces a one-time re-seed over any prior install, including an Apple
// reviewer who UPDATES the app instead of fresh-installing (app data, and thus
// the old marker, survive an update). v1 → v2: seed expanded to 18 sections.
const SEEDED_MARKER = '@zenki_reviewer_seeded_v2';
const REVIEWER_MEMBER_ID = '5';
const REVIEWER_EMAIL = 'reviewer@zenkidojo.com';
const REVIEWER_USERNAME = 'reviewer';

/**
 * Detect the App Review demo account robustly. The reviewer's Firebase account
 * isn't reliably stamped back to Member id '5' at runtime (sign-in can resolve
 * the member by email/uid instead), so gating ONLY on id === '5' made the seed
 * silently skip — Body Lab + Home landed EMPTY for the reviewer (App Review
 * 2.1(a) "provide a demo account with pre-populated uploads"). Match on email
 * and username too. The seed writes under member.id (whatever it resolves to),
 * which is exactly the id the screens read via user.id, so the data lines up.
 */
function isReviewerAccount(member: Member): boolean {
  return (
    member.id === REVIEWER_MEMBER_ID ||
    (member.email ?? '').toLowerCase() === REVIEWER_EMAIL ||
    (member.username ?? '').toLowerCase() === REVIEWER_USERNAME
  );
}

// Storage keys — copied verbatim from each context so we don't have to
// export them just for this one-shot seed. Confirmed against each owning
// context's load/save code (so the shape — array vs Record vs object — and the
// key match exactly; a mismatch would mean the seed writes to a key the screen
// never reads).
const K = {
  weights:        '@zenki_weight_entries',       // array
  macros:         '@zenki_macro_entries',        // array
  goals:          '@zenki_macro_goals',          // Record<memberId, MacroGoals>
  profile:        '@zenki_nutrition_profiles',   // Record<memberId, NutritionProfile>
  dexa:           '@zenki_dexa_scans',           // array
  bloodwork:      '@zenki_bloodwork_reports',    // array
  workoutLogs:    '@zenki_workout_logs',         // array
  personalRecords: '@zenki_personal_records',    // array
  recentFoods:    '@zenki_recent_foods',         // Record<memberId, FoodSearchResult[]>
  weightGoal:     '@zenki_weight_goal',          // single WeightGoal object
  medications:    '@zenki_medications',          // array
  medicationLogs: '@zenki_medication_logs',      // array
  gpsActivities:  '@zenki_gps_activities',       // array
  hrSessions:     '@zenki_hr_sessions',          // array
  drinkTracker:   '@zenki_drink_tracker',        // { entries: [], pending: [] }
  orders:         '@zenki_orders',               // array
  attendance:     '@zenki_attendance',           // { visits: [] }
} as const;

/** Gamification persists under a PER-USER namespaced key (see
 *  GamificationContext.storageKeyFor). The reviewer's screens read via
 *  user.id === member.id, so seed under that same namespace. */
function gamificationKeyFor(uid: string): string {
  return `@zenki_gamification_${uid}`;
}

/** YYYY-MM-DD for today - N days. */
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/** Current instant in ISO, N days ago at noon. */
function daysAgoInstant(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/** ISO instant N days ago at an explicit hour/minute (local). */
function daysAgoAt(n: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Epoch ms N days ago at an explicit hour/minute (local) — for GPS/HR samples. */
function daysAgoMs(n: number, hour: number, minute = 0): number {
  return new Date(daysAgoAt(n, hour, minute)).getTime();
}

function genId(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

export async function seedReviewerDataIfNeeded(member: Member): Promise<void> {
  if (!isReviewerAccount(member)) return;

  try {
    const marker = await AsyncStorage.getItem(SEEDED_MARKER);
    if (marker === 'true') return;
  } catch {
    // Read error — safer to skip than double-seed
    return;
  }

  const uid = member.id;

  // ─── Weight entries — 12 over 90 days, showing a steady mild cut ───
  const weights: WeightEntry[] = [
    { id: genId('w', 'rv01'), memberId: uid, date: daysAgoISO(90), weight: 168.0, unit: 'lb', createdAt: daysAgoInstant(90) },
    { id: genId('w', 'rv02'), memberId: uid, date: daysAgoISO(82), weight: 167.1, unit: 'lb', createdAt: daysAgoInstant(82) },
    { id: genId('w', 'rv03'), memberId: uid, date: daysAgoISO(74), weight: 166.4, unit: 'lb', createdAt: daysAgoInstant(74) },
    { id: genId('w', 'rv04'), memberId: uid, date: daysAgoISO(66), weight: 165.7, unit: 'lb', createdAt: daysAgoInstant(66) },
    { id: genId('w', 'rv05'), memberId: uid, date: daysAgoISO(58), weight: 165.0, unit: 'lb', createdAt: daysAgoInstant(58) },
    { id: genId('w', 'rv06'), memberId: uid, date: daysAgoISO(48), weight: 164.3, unit: 'lb', note: 'Diet break week — held steady.', createdAt: daysAgoInstant(48) },
    { id: genId('w', 'rv07'), memberId: uid, date: daysAgoISO(38), weight: 163.8, unit: 'lb', createdAt: daysAgoInstant(38) },
    { id: genId('w', 'rv08'), memberId: uid, date: daysAgoISO(30), weight: 163.4, unit: 'lb', createdAt: daysAgoInstant(30) },
    { id: genId('w', 'rv09'), memberId: uid, date: daysAgoISO(21), weight: 162.9, unit: 'lb', createdAt: daysAgoInstant(21) },
    { id: genId('w', 'rv10'), memberId: uid, date: daysAgoISO(14), weight: 162.5, unit: 'lb', createdAt: daysAgoInstant(14) },
    { id: genId('w', 'rv11'), memberId: uid, date: daysAgoISO(5),  weight: 162.0, unit: 'lb', createdAt: daysAgoInstant(5) },
    { id: genId('w', 'rv12'), memberId: uid, date: daysAgoISO(1),  weight: 161.5, unit: 'lb', note: 'Feeling lean and strong.', createdAt: daysAgoInstant(1) },
  ];

  // ─── Workout logs — 10 sessions spread over 6 weeks, varied formats ───
  const workouts: WorkoutLog[] = [
    {
      id: genId('wo', 'rv01'), memberId: uid, date: daysAgoISO(42),
      title: 'Deadlift 5/3/1', format: 'STRENGTH', result: '315 / 335 / 355 x3', rxOrScaled: 'Rx',
      notes: 'Top set felt fast. Belt only on last.', durationMinutes: 30, createdAt: daysAgoInstant(42),
    },
    {
      id: genId('wo', 'rv02'), memberId: uid, date: daysAgoISO(36),
      title: 'Grace', format: 'FOR_TIME', result: '3:58', rxOrScaled: 'Rx',
      notes: '30 clean & jerks @ 135. Touch-and-go in fives.', durationMinutes: 4, createdAt: daysAgoInstant(36),
    },
    {
      id: genId('wo', 'rv03'), memberId: uid, date: daysAgoISO(30),
      title: 'EMOM 16', format: 'EMOM', result: 'Held all rounds', rxOrScaled: 'Rx',
      notes: 'Odd: 12 cal row / Even: 10 burpees. Engine work.', durationMinutes: 16, createdAt: daysAgoInstant(30),
    },
    {
      id: genId('wo', 'rv04'), memberId: uid, date: daysAgoISO(24),
      title: 'Front Squat 4x6', format: 'STRENGTH', result: '185 / 195 / 205 / 205', rxOrScaled: 'Rx',
      notes: 'Tempo 3s down. Quads cooked.', durationMinutes: 28, createdAt: daysAgoInstant(24),
    },
    {
      id: genId('wo', 'rv05'), memberId: uid, date: daysAgoISO(18),
      title: 'Tabata Mash', format: 'TABATA', result: 'Lowest round 8 reps', rxOrScaled: 'Rx',
      notes: 'Air squats / push-ups / sit-ups / cals. Smoker.', durationMinutes: 16, createdAt: daysAgoInstant(18),
    },
    {
      id: genId('wo', 'rv06'), memberId: uid, date: daysAgoISO(13),
      title: 'Fran', format: 'FOR_TIME', result: '4:32', rxOrScaled: 'Rx',
      notes: 'Felt strong. Unbroken thrusters.', durationMinutes: 5, createdAt: daysAgoInstant(13),
    },
    {
      id: genId('wo', 'rv07'), memberId: uid, date: daysAgoISO(9),
      title: 'Back Squat 5x5', format: 'STRENGTH', result: '185 / 205 / 215 / 215 / 225', rxOrScaled: 'Rx',
      notes: 'Last set was a grinder.', durationMinutes: 25, createdAt: daysAgoInstant(9),
    },
    {
      id: genId('wo', 'rv08'), memberId: uid, date: daysAgoISO(5),
      title: 'Cindy (20-min AMRAP)', format: 'AMRAP', result: '8 rounds + 12 reps', rxOrScaled: 'Rx',
      notes: '5 pull-ups / 10 push-ups / 15 air squats.',
      durationMinutes: 20, createdAt: daysAgoInstant(5),
    },
    {
      id: genId('wo', 'rv09'), memberId: uid, date: daysAgoISO(3),
      title: 'The Chief', format: 'CHIPPER', result: '5 cycles', rxOrScaled: 'Rx',
      notes: '5x 3-min AMRAP: 3 cleans / 6 push-ups / 9 squats.', durationMinutes: 25, createdAt: daysAgoInstant(3),
    },
    {
      id: genId('wo', 'rv10'), memberId: uid, date: daysAgoISO(2),
      title: 'Helen', format: 'FOR_TIME', result: '10:14', rxOrScaled: 'Scaled',
      notes: 'Scaled pull-ups to jumping. Pushed on the run.',
      durationMinutes: 11, createdAt: daysAgoInstant(2),
    },
  ];

  // ─── Personal records — 8 entries across many lifts/benchmarks ───
  // value is weight (lbs), reps (count), or time (seconds) per the exercise's
  // unit in data/exercises.ts. exerciseKey values verified against that catalog.
  const prs: PersonalRecord[] = [
    {
      id: genId('pr', 'rv1'), memberId: uid, exerciseKey: 'back_squat',
      value: 315, reps: 1, date: daysAgoISO(58),
      notes: 'Bodyweight x2 club. Belt + sleeves.', createdAt: daysAgoInstant(58),
    },
    {
      id: genId('pr', 'rv2'), memberId: uid, exerciseKey: 'deadlift',
      value: 405, reps: 1, date: daysAgoISO(42),
      notes: 'Four plates! Hook grip held.', createdAt: daysAgoInstant(42),
    },
    {
      id: genId('pr', 'rv3'), memberId: uid, exerciseKey: 'front_squat',
      value: 245, reps: 1, date: daysAgoISO(24),
      notes: 'Clean catch, stood it up easy.', createdAt: daysAgoInstant(24),
    },
    {
      id: genId('pr', 'rv4'), memberId: uid, exerciseKey: 'bench_press',
      value: 245, reps: 1, date: daysAgoISO(30),
      notes: 'Paused, no spot needed.', createdAt: daysAgoInstant(30),
    },
    {
      id: genId('pr', 'rv5'), memberId: uid, exerciseKey: 'clean',
      value: 205, reps: 1, date: daysAgoISO(20),
      notes: 'Fast under the bar.', createdAt: daysAgoInstant(20),
    },
    {
      id: genId('pr', 'rv6'), memberId: uid, exerciseKey: 'snatch',
      value: 155, reps: 1, date: daysAgoISO(15),
      notes: 'Caught it in the bottom — finally.', createdAt: daysAgoInstant(15),
    },
    {
      id: genId('pr', 'rv7'), memberId: uid, exerciseKey: 'fran',
      value: 272, // seconds = 4:32
      date: daysAgoISO(13), notes: 'First sub-5 Fran.', createdAt: daysAgoInstant(13),
    },
    {
      id: genId('pr', 'rv8'), memberId: uid, exerciseKey: 'row_500m',
      value: 88, // seconds = 1:28
      date: daysAgoISO(11), notes: 'Sprint piece after class.', createdAt: daysAgoInstant(11),
    },
  ];

  // ─── DEXA scans — 3 reports (90 / 45 / today) showing the cut working:
  // body fat dropping while lean mass is largely preserved. ───
  const dexa: DexaScan[] = [
    {
      id: genId('dexa', 'rv1'), memberId: uid, scanDate: daysAgoISO(90),
      addedAt: daysAgoInstant(90), source: 'manual',
      totalBodyFatPct: 20.6, fatMassKg: 15.7, leanMassKg: 58.0, bmc: 2.6,
      vatCm2: 86, fmi: 5.0, ffmi: 19.3, androidGynoidRatio: 0.88,
      arms:  { leanKg: 7.1, fatKg: 1.6 },
      legs:  { leanKg: 20.3, fatKg: 4.8 },
      trunk: { leanKg: 27.2, fatKg: 8.3 },
      notes: 'Baseline scan — start of the cut.',
    },
    {
      id: genId('dexa', 'rv2'), memberId: uid, scanDate: daysAgoISO(45),
      addedAt: daysAgoInstant(45), source: 'manual',
      totalBodyFatPct: 18.4, fatMassKg: 13.8, leanMassKg: 58.2, bmc: 2.6,
      vatCm2: 74, fmi: 4.6, ffmi: 19.4, androidGynoidRatio: 0.82,
      arms:  { leanKg: 7.2, fatKg: 1.4 },
      legs:  { leanKg: 20.5, fatKg: 4.2 },
      trunk: { leanKg: 27.3, fatKg: 7.1 },
      notes: 'Mid-cut — lean mass holding, VAT down.',
    },
    {
      id: genId('dexa', 'rv3'), memberId: uid, scanDate: daysAgoISO(0),
      addedAt: daysAgoInstant(0), source: 'ai',
      totalBodyFatPct: 16.1, fatMassKg: 11.9, leanMassKg: 58.5, bmc: 2.7,
      vatCm2: 61, fmi: 4.0, ffmi: 19.6, androidGynoidRatio: 0.78,
      arms:  { leanKg: 7.3, fatKg: 1.2 },
      legs:  { leanKg: 20.7, fatKg: 3.6 },
      trunk: { leanKg: 27.4, fatKg: 6.0 },
      notes: 'Leanest yet — abs visible. Lean mass up slightly.',
    },
  ];

  // ─── Bloodwork — 3 panels over 90 days. Vitamin D starts low and climbs back
  // into range across the panels (so the biomarker time-series chart has a real
  // trend the reviewer can scrub). ───
  const bloodwork: BloodworkReport[] = [
    {
      id: genId('bw', 'rv1'), memberId: uid, testDate: daysAgoISO(88),
      addedAt: daysAgoInstant(88), source: 'manual', labName: 'Quest Diagnostics',
      biomarkers: [
        { name: 'HDL', displayName: 'HDL-C', value: 54, unit: 'mg/dL', referenceLow: 40, status: 'sufficient', category: 'Lipid' },
        { name: 'LDL', displayName: 'LDL-C', value: 128, unit: 'mg/dL', referenceHigh: 130, status: 'sufficient', category: 'Lipid' },
        { name: 'Triglycerides', value: 118, unit: 'mg/dL', referenceHigh: 150, status: 'sufficient', category: 'Lipid' },
        { name: 'Total Cholesterol', value: 206, unit: 'mg/dL', referenceHigh: 200, status: 'out_of_range', category: 'Lipid' },
        { name: 'Glucose', displayName: 'Fasting glucose', value: 94, unit: 'mg/dL', referenceLow: 70, referenceHigh: 99, status: 'optimal', category: 'Metabolic' },
        { name: 'HbA1c', value: 5.4, unit: '%', referenceHigh: 5.6, status: 'sufficient', category: 'Metabolic' },
        { name: 'Testosterone', displayName: 'Total testosterone', value: 540, unit: 'ng/dL', referenceLow: 300, referenceHigh: 1000, status: 'optimal', category: 'Hormone' },
        { name: 'TSH', value: 2.4, unit: 'µIU/mL', referenceLow: 0.4, referenceHigh: 4.0, status: 'optimal', category: 'Thyroid' },
        { name: 'Vitamin D (25-OH)', value: 22, unit: 'ng/mL', referenceLow: 30, referenceHigh: 100, status: 'out_of_range', category: 'Vitamin' },
        { name: 'Ferritin', value: 76, unit: 'ng/mL', referenceLow: 30, referenceHigh: 400, status: 'optimal', category: 'Vitamin' },
      ],
      notes: 'Baseline panel. Started D3 + K2 after these results.',
    },
    {
      id: genId('bw', 'rv2'), memberId: uid, testDate: daysAgoISO(45),
      addedAt: daysAgoInstant(45), source: 'manual', labName: 'Labcorp',
      biomarkers: [
        { name: 'HDL', displayName: 'HDL-C', value: 62, unit: 'mg/dL', referenceLow: 40, status: 'optimal', category: 'Lipid' },
        { name: 'LDL', displayName: 'LDL-C', value: 118, unit: 'mg/dL', referenceHigh: 130, status: 'sufficient', category: 'Lipid' },
        { name: 'Triglycerides', value: 92, unit: 'mg/dL', referenceHigh: 150, status: 'optimal', category: 'Lipid' },
        { name: 'Total Cholesterol', value: 198, unit: 'mg/dL', referenceHigh: 200, status: 'sufficient', category: 'Lipid' },
        { name: 'Glucose', displayName: 'Fasting glucose', value: 88, unit: 'mg/dL', referenceLow: 70, referenceHigh: 99, status: 'optimal', category: 'Metabolic' },
        { name: 'HbA1c', value: 5.2, unit: '%', referenceHigh: 5.6, status: 'optimal', category: 'Metabolic' },
        { name: 'Testosterone', displayName: 'Total testosterone', value: 612, unit: 'ng/dL', referenceLow: 300, referenceHigh: 1000, status: 'optimal', category: 'Hormone' },
        { name: 'TSH', value: 2.1, unit: 'µIU/mL', referenceLow: 0.4, referenceHigh: 4.0, status: 'optimal', category: 'Thyroid' },
        { name: 'Vitamin D (25-OH)', value: 31, unit: 'ng/mL', referenceLow: 30, referenceHigh: 100, status: 'sufficient', category: 'Vitamin' },
        { name: 'Ferritin', value: 88, unit: 'ng/mL', referenceLow: 30, referenceHigh: 400, status: 'optimal', category: 'Vitamin' },
      ],
      notes: 'Mid-cut panel. Lipids improving, D back in range.',
    },
    {
      id: genId('bw', 'rv3'), memberId: uid, testDate: daysAgoISO(7),
      addedAt: daysAgoInstant(7), source: 'ai', labName: 'Labcorp',
      biomarkers: [
        { name: 'HDL', displayName: 'HDL-C', value: 66, unit: 'mg/dL', referenceLow: 40, status: 'optimal', category: 'Lipid' },
        { name: 'LDL', displayName: 'LDL-C', value: 104, unit: 'mg/dL', referenceHigh: 130, status: 'optimal', category: 'Lipid' },
        { name: 'Triglycerides', value: 78, unit: 'mg/dL', referenceHigh: 150, status: 'optimal', category: 'Lipid' },
        { name: 'Total Cholesterol', value: 186, unit: 'mg/dL', referenceHigh: 200, status: 'optimal', category: 'Lipid' },
        { name: 'Glucose', displayName: 'Fasting glucose', value: 85, unit: 'mg/dL', referenceLow: 70, referenceHigh: 99, status: 'optimal', category: 'Metabolic' },
        { name: 'HbA1c', value: 5.1, unit: '%', referenceHigh: 5.6, status: 'optimal', category: 'Metabolic' },
        { name: 'Testosterone', displayName: 'Total testosterone', value: 648, unit: 'ng/dL', referenceLow: 300, referenceHigh: 1000, status: 'optimal', category: 'Hormone' },
        { name: 'TSH', value: 1.9, unit: 'µIU/mL', referenceLow: 0.4, referenceHigh: 4.0, status: 'optimal', category: 'Thyroid' },
        { name: 'Vitamin D (25-OH)', value: 44, unit: 'ng/mL', referenceLow: 30, referenceHigh: 100, status: 'optimal', category: 'Vitamin' },
        { name: 'Ferritin', value: 95, unit: 'ng/mL', referenceLow: 30, referenceHigh: 400, status: 'optimal', category: 'Vitamin' },
      ],
      notes: 'Best panel yet — everything optimal.',
    },
  ];

  // ─── Macro entries — today + 4 recent days, full meals each day so the
  // daily ring and history both look lived-in. ───
  const today = daysAgoISO(0);
  const macros: MacroEntry[] = [
    // Today (in-progress — breakfast + lunch + snack logged so far)
    { id: genId('m', 'rv01'), memberId: uid, date: today, name: 'Oatmeal + banana + whey',
      calories: 420, protein: 34, carbs: 68, fat: 6, mealType: 'breakfast', createdAt: daysAgoAt(0, 8, 30) },
    { id: genId('m', 'rv02'), memberId: uid, date: today, name: 'Grilled chicken + rice + greens',
      calories: 620, protein: 48, carbs: 72, fat: 14, mealType: 'lunch', createdAt: daysAgoAt(0, 12, 45) },
    { id: genId('m', 'rv03'), memberId: uid, date: today, name: 'Greek yogurt + berries',
      calories: 180, protein: 22, carbs: 18, fat: 3, mealType: 'snacks', createdAt: daysAgoAt(0, 15, 30) },

    // Yesterday (complete day)
    { id: genId('m', 'rv04'), memberId: uid, date: daysAgoISO(1), name: 'Egg whites + oats',
      calories: 380, protein: 32, carbs: 52, fat: 5, mealType: 'breakfast', createdAt: daysAgoAt(1, 7, 45) },
    { id: genId('m', 'rv05'), memberId: uid, date: daysAgoISO(1), name: 'Turkey + sweet potato bowl',
      calories: 560, protein: 44, carbs: 64, fat: 12, mealType: 'lunch', createdAt: daysAgoAt(1, 13, 0) },
    { id: genId('m', 'rv06'), memberId: uid, date: daysAgoISO(1), name: 'Salmon + asparagus + quinoa',
      calories: 640, protein: 46, carbs: 48, fat: 22, mealType: 'dinner', createdAt: daysAgoAt(1, 19, 30) },
    { id: genId('m', 'rv07'), memberId: uid, date: daysAgoISO(1), name: 'Casein shake',
      calories: 160, protein: 30, carbs: 5, fat: 2, mealType: 'snacks', createdAt: daysAgoAt(1, 21, 30) },

    // 2 days ago
    { id: genId('m', 'rv08'), memberId: uid, date: daysAgoISO(2), name: 'Protein pancakes',
      calories: 440, protein: 36, carbs: 58, fat: 9, mealType: 'breakfast', createdAt: daysAgoAt(2, 8, 0) },
    { id: genId('m', 'rv09'), memberId: uid, date: daysAgoISO(2), name: 'Chipotle chicken bowl (no rice)',
      calories: 590, protein: 52, carbs: 40, fat: 20, mealType: 'lunch', createdAt: daysAgoAt(2, 12, 30) },
    { id: genId('m', 'rv10'), memberId: uid, date: daysAgoISO(2), name: 'Lean beef + jasmine rice + broccoli',
      calories: 660, protein: 50, carbs: 66, fat: 16, mealType: 'dinner', createdAt: daysAgoAt(2, 19, 0) },

    // 3 days ago
    { id: genId('m', 'rv11'), memberId: uid, date: daysAgoISO(3), name: 'Cottage cheese + pineapple',
      calories: 300, protein: 30, carbs: 28, fat: 5, mealType: 'breakfast', createdAt: daysAgoAt(3, 8, 15) },
    { id: genId('m', 'rv12'), memberId: uid, date: daysAgoISO(3), name: 'Tuna wrap + side salad',
      calories: 520, protein: 42, carbs: 48, fat: 16, mealType: 'lunch', createdAt: daysAgoAt(3, 13, 15) },
    { id: genId('m', 'rv13'), memberId: uid, date: daysAgoISO(3), name: 'Shrimp stir-fry',
      calories: 580, protein: 44, carbs: 58, fat: 14, mealType: 'dinner', createdAt: daysAgoAt(3, 19, 15) },

    // 4 days ago
    { id: genId('m', 'rv14'), memberId: uid, date: daysAgoISO(4), name: 'Bagel + smoked salmon',
      calories: 460, protein: 28, carbs: 56, fat: 14, mealType: 'breakfast', createdAt: daysAgoAt(4, 8, 30) },
    { id: genId('m', 'rv15'), memberId: uid, date: daysAgoISO(4), name: 'Chicken Caesar (light dressing)',
      calories: 540, protein: 46, carbs: 24, fat: 28, mealType: 'lunch', createdAt: daysAgoAt(4, 12, 45) },
    { id: genId('m', 'rv16'), memberId: uid, date: daysAgoISO(4), name: 'Ground turkey pasta',
      calories: 620, protein: 48, carbs: 70, fat: 14, mealType: 'dinner', createdAt: daysAgoAt(4, 19, 30) },
  ];

  // ─── Macro goals — standard cut for ~160lb lifter ───
  const goals: Record<string, MacroGoals> = {
    [uid]: {
      memberId: uid, calories: 2100, protein: 165, carbs: 210, fat: 65,
      updatedAt: daysAgoInstant(30),
    },
  };

  // ─── Nutrition profile — Mifflin-St Jeor baseline ───
  const profiles: Record<string, NutritionProfile> = {
    [uid]: {
      memberId: uid, sex: 'male', ageYears: 32, heightCm: 178,
      activity: 'active', goal: 'cut',
      completedAt: daysAgoInstant(90), updatedAt: daysAgoInstant(1),
      adaptedTdee: 2625, lastAdaptedAt: daysAgoInstant(1),
      dietType: 'high_protein',
    },
  };

  // ─── Recent foods — Record<memberId, FoodSearchResult[]> (so food search
  // surfaces the reviewer's go-to items). ───
  const recentFoods: Record<string, FoodSearchResult[]> = {
    [uid]: [
      {
        id: 'usda_171287', name: 'Chicken breast, grilled', source: 'usda',
        serving: { label: '100 g', grams: 100 },
        macros: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
        macrosPer100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
      },
      {
        id: 'usda_169704', name: 'White rice, cooked', source: 'usda',
        serving: { label: '100 g', grams: 100 },
        macros: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
        macrosPer100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
      },
      {
        id: 'off_0631312709420', name: 'Whey Protein Isolate, Vanilla', brand: 'Optimum Nutrition',
        source: 'off', serving: { label: '1 scoop (31 g)', grams: 31 },
        macros: { calories: 120, protein: 24, carbs: 3, fat: 1 },
        macrosPer100g: { calories: 387, protein: 77, carbs: 10, fat: 3.2 },
      },
      {
        id: 'usda_173424', name: 'Rolled oats, dry', source: 'usda',
        serving: { label: '40 g', grams: 40 },
        macros: { calories: 152, protein: 5.3, carbs: 27, fat: 2.6 },
        macrosPer100g: { calories: 379, protein: 13.2, carbs: 67.7, fat: 6.5 },
      },
      {
        id: 'usda_175167', name: 'Atlantic salmon, cooked', source: 'usda',
        serving: { label: '100 g', grams: 100 },
        macros: { calories: 206, protein: 22, carbs: 0, fat: 12 },
        macrosPer100g: { calories: 206, protein: 22, carbs: 0, fat: 12 },
      },
    ],
  };

  // ─── Weight goal — single WeightGoal object at @zenki_weight_goal ───
  const weightGoal: WeightGoal = {
    startWeight: 168.0,
    startDate: daysAgoISO(90),
    targetWeight: 158.0,
    targetDate: daysAgoISO(-30), // ~30 days out from today
    unit: 'lb',
  };

  // ─── Medications / peptides — 2 entries + recent adherence logs ───
  const dailyVitamin: MedicationEntry = {
    id: genId('med', 'rv_vitd'), memberId: uid,
    name: 'Vitamin D3 + K2', brandName: 'Thorne', category: 'vitamin',
    dose: '5000', doseUnit: 'IU', route: 'oral', frequency: 'daily',
    timesOfDay: ['08:00'], startDate: daysAgoISO(80),
    notes: 'Started after low Vitamin D panel.',
    notificationsEnabled: true, scheduledNotificationIds: [],
    createdAt: daysAgoInstant(80), updatedAt: daysAgoInstant(80),
  };
  const bpc157: MedicationEntry = {
    id: genId('med', 'rv_bpc'), memberId: uid,
    name: 'BPC-157', category: 'peptide',
    dose: '250', doseUnit: 'mcg', route: 'subcutaneous', frequency: 'daily',
    timesOfDay: ['07:30'], startDate: daysAgoISO(21), endDate: daysAgoISO(-9),
    injectionSites: ['Left Abdomen', 'Right Abdomen'], lastInjectionSite: 'Right Abdomen',
    notes: 'Recovery protocol for a tweaked shoulder. 30-day cycle.',
    notificationsEnabled: true, scheduledNotificationIds: [],
    createdAt: daysAgoInstant(21), updatedAt: daysAgoInstant(1),
  };
  const medications: MedicationEntry[] = [bpc157, dailyVitamin];

  // Adherence logs — last 7 days of both meds (vitamin every day; peptide
  // alternating injection sites). takenAt/scheduledFor are real ISO timestamps.
  const medicationLogs: MedicationLog[] = [];
  for (let d = 1; d <= 7; d++) {
    medicationLogs.push({
      id: genId('mlog', `vitd_${d}`), medicationId: dailyVitamin.id, memberId: uid,
      takenAt: daysAgoAt(d, 8, 5), scheduledFor: daysAgoAt(d, 8, 0),
      dose: '5000', skipped: false,
    });
    medicationLogs.push({
      id: genId('mlog', `bpc_${d}`), medicationId: bpc157.id, memberId: uid,
      takenAt: daysAgoAt(d, 7, 35), scheduledFor: daysAgoAt(d, 7, 30),
      dose: '250', injectionSite: d % 2 === 0 ? 'Left Abdomen' : 'Right Abdomen',
      skipped: false,
    });
  }

  // ─── GPS activities — 4 runs/walk/hike with downsampled routes + splits ───
  // Tiny but valid routes (a few points each) around the LA dojo so maps render.
  const baseLat = 34.1006;
  const baseLon = -118.2916;
  const makeRoute = (n: number, dayAgo: number, startHour: number, stepM: number): GpsPoint[] => {
    const pts: GpsPoint[] = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        latitude: baseLat + i * 0.0009,
        longitude: baseLon + i * 0.0006,
        altitude: 110 + i * 1.5,
        speed: stepM > 0 ? 1000 / stepM : 2.5,
        timestamp: daysAgoMs(dayAgo, startHour) + i * 60_000,
      });
    }
    return pts;
  };
  const makeSplits = (km: number, paceSecPerKm: number, elevPerKm: number): SplitData[] => {
    const out: SplitData[] = [];
    for (let i = 1; i <= km; i++) {
      out.push({
        splitNumber: i, distanceMeters: 1000,
        durationSeconds: paceSecPerKm, paceSecsPerKm: paceSecPerKm,
        elevationDelta: elevPerKm,
      });
    }
    return out;
  };
  const gpsActivities: GpsActivity[] = [
    {
      id: genId('gps', 'rv1'), memberId: uid, type: 'run',
      startedAt: daysAgoAt(12, 6, 30), endedAt: daysAgoAt(12, 7, 4),
      durationSeconds: 2040, distanceMeters: 6200, elevationGainMeters: 42,
      avgPaceSecsPerKm: 329, maxSpeedMps: 3.9, route: makeRoute(6, 12, 6, 329),
      splits: makeSplits(6, 329, 7), calories: 540,
    },
    {
      id: genId('gps', 'rv2'), memberId: uid, type: 'run',
      startedAt: daysAgoAt(7, 6, 45), endedAt: daysAgoAt(7, 7, 12),
      durationSeconds: 1620, distanceMeters: 5050, elevationGainMeters: 30,
      avgPaceSecsPerKm: 321, maxSpeedMps: 4.1, route: makeRoute(5, 7, 6, 321),
      splits: makeSplits(5, 321, 6), calories: 430,
    },
    {
      id: genId('gps', 'rv3'), memberId: uid, type: 'walk',
      startedAt: daysAgoAt(4, 19, 0), endedAt: daysAgoAt(4, 19, 38),
      durationSeconds: 2280, distanceMeters: 3100, elevationGainMeters: 18,
      avgPaceSecsPerKm: 735, maxSpeedMps: 1.8, route: makeRoute(4, 4, 19, 735),
      splits: makeSplits(3, 735, 6), calories: 190,
    },
    {
      id: genId('gps', 'rv4'), memberId: uid, type: 'hike',
      startedAt: daysAgoAt(2, 8, 0), endedAt: daysAgoAt(2, 9, 35),
      durationSeconds: 5700, distanceMeters: 7400, elevationGainMeters: 320,
      avgPaceSecsPerKm: 770, maxSpeedMps: 2.2, route: makeRoute(8, 2, 8, 770),
      splits: makeSplits(7, 770, 45), calories: 720,
    },
  ];

  // ─── Heart-rate sessions — 4 workouts with zone breakdowns + a few samples. ───
  const makeHrSamples = (dayAgo: number, startHour: number, count: number, avg: number): { bpm: number; timestamp: number }[] => {
    const s: { bpm: number; timestamp: number }[] = [];
    for (let i = 0; i < count; i++) {
      const wobble = Math.round(Math.sin(i / 2) * 12);
      s.push({ bpm: avg + wobble, timestamp: daysAgoMs(dayAgo, startHour) + i * 30_000 });
    }
    return s;
  };
  const hrSessions: HRSession[] = [
    {
      id: genId('hrsess', 'rv1'), memberId: uid,
      startedAt: daysAgoAt(13, 18, 0), endedAt: daysAgoAt(13, 18, 47),
      durationMinutes: 47, avgBpm: 148, maxBpm: 178, minBpm: 92,
      samples: makeHrSamples(13, 18, 12, 148),
      zones: { zone1: 4, zone2: 10, zone3: 18, zone4: 12, zone5: 3 },
      strain: 14.2, calories: 612, activityType: 'martial_arts', deviceName: 'Polar H10',
    },
    {
      id: genId('hrsess', 'rv2'), memberId: uid,
      startedAt: daysAgoAt(9, 17, 30), endedAt: daysAgoAt(9, 18, 5),
      durationMinutes: 35, avgBpm: 132, maxBpm: 165, minBpm: 88,
      samples: makeHrSamples(9, 17, 10, 132),
      zones: { zone1: 6, zone2: 12, zone3: 11, zone4: 5, zone5: 1 },
      strain: 10.8, calories: 388, activityType: 'strength', deviceName: 'Polar H10',
    },
    {
      id: genId('hrsess', 'rv3'), memberId: uid,
      startedAt: daysAgoAt(5, 12, 0), endedAt: daysAgoAt(5, 12, 22),
      durationMinutes: 22, avgBpm: 159, maxBpm: 186, minBpm: 104,
      samples: makeHrSamples(5, 12, 9, 159),
      zones: { zone1: 1, zone2: 3, zone3: 6, zone4: 9, zone5: 3 },
      strain: 15.6, calories: 305, activityType: 'hiit', deviceName: 'Polar H10',
    },
    {
      id: genId('hrsess', 'rv4'), memberId: uid,
      startedAt: daysAgoAt(2, 19, 0), endedAt: daysAgoAt(2, 19, 41),
      durationMinutes: 41, avgBpm: 141, maxBpm: 172, minBpm: 90,
      samples: makeHrSamples(2, 19, 11, 141),
      zones: { zone1: 5, zone2: 11, zone3: 15, zone4: 8, zone5: 2 },
      strain: 12.9, calories: 498, activityType: 'cardio', deviceName: 'Polar H10',
    },
  ];

  // ─── Gamification — a believable level/XP/streak/points blob with a curated
  // set of unlocked achievements. The hydrate path (GamificationContext) merges
  // by achievement id, carrying over ONLY unlocked + unlockedAt, so we start
  // from the real catalog and flip a coherent subset on. ───
  const unlockedIds = new Set<string>([
    // Training
    'first_blood', 'getting_started', 'in_the_groove', 'dedicated',
    'streak_3', 'streak_7', 'first_booking', 'regular', 'white_belt', 'blue_belt',
    // Workouts (HR)
    'first_hr', 'hr_10',
    // Nutrition
    'first_meal', 'meals_10', 'meals_50', 'first_weigh', 'weigh_30',
    // Body Lab
    'first_dexa', 'dexa_3', 'first_blood_report', 'blood_3',
    // Community / store / hydration / engagement / time-based
    'first_post', 'first_follower', 'community_member',
    'first_purchase', 'first_drink', 'fifty_drinks',
    'login_streak_7', 'first_spin', 'early_bird', 'night_owl', 'weekend_warrior',
  ]);
  const seededAchievements: Achievement[] = createInitialAchievements().map((a) =>
    unlockedIds.has(a.id)
      ? { ...a, unlocked: true, unlockedAt: daysAgoInstant(Math.floor(Math.random() * 60) + 5) }
      : a,
  );
  const gamification: GamificationState = {
    xp: 4820, level: 10, streak: 8, longestStreak: 19, lastActiveDate: daysAgoISO(0),
    weekStreak: 6, longestWeekStreak: 9, lastActiveWeek: '',
    totalSessions: 64, dojoPoints: 540, pointsLifetime: 1280,
    flames: 96, flamesLifetime: 96,
    totalBookings: 18, totalPrivateSessions: 4, totalDrinks: 63,
    totalGearPurchases: 2, totalPosts: 3, followersCount: 7, likesReceived: 41,
    earlyBirdCount: 6, nightOwlCount: 9, weekendSessionsCount: 11,
    loginStreak: 12, lastLoginDate: daysAgoISO(0),
    quoteReadStreak: 12, lastQuoteReadDate: daysAgoISO(0),
    referralCount: 1, beltLevel: 2, stripesEarned: 2,
    memberSinceDate: daysAgoInstant(210),
    sessionsThisWeek: 3, sessionsThisMonth: 12, lastSessionMonth: today.slice(0, 7),
    hrSessionsCount: 4, mealsLoggedCount: 58, weightLoggedCount: 12,
    dexaScansCount: 3, bloodworkReportsCount: 3, spinWinsCount: 4,
    achievements: seededAchievements, pendingCelebration: null,
  };

  // ─── Drink tracker — ~3 weeks of tab history. Shape is the DrinkTrackerState
  // object { entries, pending }. DrinkEntry has NO memberId (scoped per device/
  // member implicitly). Mix of paid (older) and unpaid (recent) charges. ───
  const drinkMenu: { type: DrinkType; price: number }[] = [
    { type: 'protein', price: 5.0 }, { type: 'electrolytes', price: 3.0 },
    { type: 'coffee', price: 3.0 }, { type: 'kombucha', price: 4.5 },
    { type: 'bcaa', price: 4.0 }, { type: 'water', price: 2.0 },
    { type: 'tea', price: 3.5 },
  ];
  const drinkEntries: DrinkEntry[] = [];
  // Roughly one drink most days for 21 days; the last ~5 days are unpaid.
  const drinkDays = [21, 20, 18, 17, 15, 14, 12, 11, 9, 8, 6, 5, 4, 3, 2, 1, 0];
  drinkDays.forEach((dayAgo, i) => {
    const pick = drinkMenu[i % drinkMenu.length];
    const paid = dayAgo > 5;
    drinkEntries.push({
      id: genId('drink', `rv${i}`),
      type: pick.type, price: pick.price,
      timestamp: daysAgoAt(dayAgo, 17, 30), date: daysAgoISO(dayAgo),
      paid, paidAt: paid ? daysAgoAt(dayAgo, 18, 0) : undefined,
    });
  });
  const drinkTracker = { entries: drinkEntries, pending: [] as { type: DrinkType; count: number }[] };

  // ─── Orders — 2 past gear orders at @zenki_orders (array). ───
  const memberName = `${member.firstName ?? 'App'} ${member.lastName ?? 'Reviewer'}`.trim();
  const orders: Order[] = [
    {
      id: genId('order', 'rv1'), kind: 'gear', memberId: uid, memberName,
      items: [
        { productId: 'rashguard_black', productName: 'Zenki Rashguard (Black)', quantity: 1, selectedSize: 'L', unitPrice: 54.0 },
        { productId: 'shaker_bottle', productName: 'Zenki Shaker Bottle', quantity: 1, unitPrice: 14.0 },
      ],
      subtotal: 68.0, pointsUsed: 0, pointsValueUsd: 0, promoDiscountUsd: 0,
      balanceDueUsd: 0, status: 'paid', paymentMethod: 'apple_pay',
      paymentIntentId: 'pi_demo_reviewer_001', createdAt: daysAgoInstant(34),
    },
    {
      id: genId('order', 'rv2'), kind: 'gear', memberId: uid, memberName,
      items: [
        { productId: 'gi_white', productName: 'Zenki Competition Gi (White)', quantity: 1, selectedSize: 'A2', unitPrice: 129.0 },
      ],
      subtotal: 129.0, pointsUsed: 200, pointsValueUsd: 10.0,
      promoLabel: 'MEMBER10', promoDiscountUsd: 12.9,
      balanceDueUsd: 106.1, status: 'reserved', paymentMethod: 'pay_at_dojo',
      createdAt: daysAgoInstant(11),
    },
  ];

  // ─── Attendance — 6 dojo check-ins at @zenki_attendance ({ visits: [] }). ───
  const attendanceDays = [13, 11, 9, 5, 3, 2];
  const attendanceVisits: AttendanceVisit[] = attendanceDays.map((dayAgo, i) => ({
    id: genId('visit', `rv${i}`), memberId: uid, memberName,
    date: daysAgoISO(dayAgo), checkInTime: daysAgoAt(dayAgo, 18, 0),
  }));
  const attendance = { visits: attendanceVisits };

  // Persist in parallel
  await Promise.all([
    AsyncStorage.setItem(K.weights, JSON.stringify(weights)),
    AsyncStorage.setItem(K.workoutLogs, JSON.stringify(workouts)),
    AsyncStorage.setItem(K.personalRecords, JSON.stringify(prs)),
    AsyncStorage.setItem(K.dexa, JSON.stringify(dexa)),
    AsyncStorage.setItem(K.bloodwork, JSON.stringify(bloodwork)),
    AsyncStorage.setItem(K.macros, JSON.stringify(macros)),
    AsyncStorage.setItem(K.goals, JSON.stringify(goals)),
    AsyncStorage.setItem(K.profile, JSON.stringify(profiles)),
    AsyncStorage.setItem(K.recentFoods, JSON.stringify(recentFoods)),
    AsyncStorage.setItem(K.weightGoal, JSON.stringify(weightGoal)),
    AsyncStorage.setItem(K.medications, JSON.stringify(medications)),
    AsyncStorage.setItem(K.medicationLogs, JSON.stringify(medicationLogs)),
    AsyncStorage.setItem(K.gpsActivities, JSON.stringify(gpsActivities)),
    AsyncStorage.setItem(K.hrSessions, JSON.stringify(hrSessions)),
    AsyncStorage.setItem(gamificationKeyFor(uid), JSON.stringify(gamification)),
    AsyncStorage.setItem(K.drinkTracker, JSON.stringify(drinkTracker)),
    AsyncStorage.setItem(K.orders, JSON.stringify(orders)),
    AsyncStorage.setItem(K.attendance, JSON.stringify(attendance)),
  ]);

  await AsyncStorage.setItem(SEEDED_MARKER, 'true');
}
