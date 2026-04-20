/**
 * Bootstraps the App Review demo account with realistic sample data on its
 * first sign-in. This exists so Apple reviewers land on a lived-in app, not
 * a series of empty states.
 *
 * Only runs when:
 *   - The signed-in member's id is '5' (the reviewer, see data/members.ts)
 *   - The AsyncStorage marker @zenki_reviewer_seeded_v1 is not set
 *
 * Safe to call on every sign-in — short-circuits after the first success.
 *
 * Data seeded (all dated relative to today so the trend chart always has
 * recent shape):
 *   - 6 weight entries spanning 30 days (mild cut — 165 → 161.5)
 *   - 4 workout logs (mix of formats + one scaled)
 *   - 2 personal records (back squat + 5K row)
 *   - 1 DEXA scan from 30 days ago
 *   - 1 bloodwork report from 21 days ago (one out-of-range biomarker)
 *   - Today's macro entries (breakfast + lunch + snack)
 *   - Nutrition profile + macro goals for today
 *
 * Posts are NOT seeded here — those live in Firestore and are seeded from
 * the admin's uid so they appear as posts from another member. See
 * APP_REVIEWER.md for how that happens.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Member } from '../data/members';
import { WorkoutLog, PersonalRecord } from '../types/workout';
import { WeightEntry, MacroEntry, MacroGoals, NutritionProfile } from '../types/nutrition';
import { DexaScan } from '../types/dexa';
import { BloodworkReport } from '../types/bloodwork';

const SEEDED_MARKER = '@zenki_reviewer_seeded_v1';
const REVIEWER_MEMBER_ID = '5';

// Storage keys — copied verbatim from each context so we don't have to
// export them just for this one-shot seed.
const K = {
  weights:        '@zenki_weight_entries',
  macros:         '@zenki_macro_entries',
  goals:          '@zenki_macro_goals',
  profile:        '@zenki_nutrition_profiles',
  dexa:           '@zenki_dexa_scans',
  bloodwork:      '@zenki_bloodwork_reports',
  workoutLogs:    '@zenki_workout_logs',
  personalRecords: '@zenki_personal_records',
} as const;

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

function genId(prefix: string, suffix: string): string {
  return `${prefix}_${suffix}`;
}

export async function seedReviewerDataIfNeeded(member: Member): Promise<void> {
  if (member.id !== REVIEWER_MEMBER_ID) return;

  try {
    const marker = await AsyncStorage.getItem(SEEDED_MARKER);
    if (marker === 'true') return;
  } catch {
    // Read error — safer to skip than double-seed
    return;
  }

  const uid = member.id;

  // ─── Weight entries — 6 over 30 days, showing mild cut ───
  const weights: WeightEntry[] = [
    { id: genId('w', 'rv1'), memberId: uid, date: daysAgoISO(30), weight: 165.0, unit: 'lb', createdAt: daysAgoInstant(30) },
    { id: genId('w', 'rv2'), memberId: uid, date: daysAgoISO(24), weight: 164.2, unit: 'lb', createdAt: daysAgoInstant(24) },
    { id: genId('w', 'rv3'), memberId: uid, date: daysAgoISO(17), weight: 163.6, unit: 'lb', createdAt: daysAgoInstant(17) },
    { id: genId('w', 'rv4'), memberId: uid, date: daysAgoISO(10), weight: 162.8, unit: 'lb', createdAt: daysAgoInstant(10) },
    { id: genId('w', 'rv5'), memberId: uid, date: daysAgoISO(5),  weight: 162.1, unit: 'lb', createdAt: daysAgoInstant(5) },
    { id: genId('w', 'rv6'), memberId: uid, date: daysAgoISO(1),  weight: 161.5, unit: 'lb', createdAt: daysAgoInstant(1) },
  ];

  // ─── Workout logs — 4 sessions spread over 2 weeks ───
  const workouts: WorkoutLog[] = [
    {
      id: genId('wo', 'rv1'), memberId: uid, date: daysAgoISO(13),
      title: 'Fran', format: 'FOR_TIME', result: '4:32', rxOrScaled: 'Rx',
      notes: 'Felt strong. Unbroken thrusters.', durationMinutes: 5, createdAt: daysAgoInstant(13),
    },
    {
      id: genId('wo', 'rv2'), memberId: uid, date: daysAgoISO(9),
      title: 'Back Squat 5x5', format: 'STRENGTH', result: '185 / 205 / 215 / 215 / 225', rxOrScaled: 'Rx',
      notes: 'Last set was a grinder.', durationMinutes: 25, createdAt: daysAgoInstant(9),
    },
    {
      id: genId('wo', 'rv3'), memberId: uid, date: daysAgoISO(5),
      title: '20-min AMRAP', format: 'AMRAP', result: '8 rounds + 12 reps', rxOrScaled: 'Rx',
      notes: '5 pullups / 10 pushups / 15 air squats. Cindy.',
      durationMinutes: 20, createdAt: daysAgoInstant(5),
    },
    {
      id: genId('wo', 'rv4'), memberId: uid, date: daysAgoISO(2),
      title: 'Helen', format: 'FOR_TIME', result: '10:14', rxOrScaled: 'Scaled',
      notes: 'Scaled pullups to jumping. Pushed on run.',
      durationMinutes: 11, createdAt: daysAgoInstant(2),
    },
  ];

  // ─── Personal records — 2 entries ───
  const prs: PersonalRecord[] = [
    {
      id: genId('pr', 'rv1'), memberId: uid, exerciseKey: 'back_squat',
      value: 245, reps: 1, date: daysAgoISO(9),
      notes: 'New PR off 5x5 top set.', createdAt: daysAgoInstant(9),
    },
    {
      id: genId('pr', 'rv2'), memberId: uid, exerciseKey: 'fran',
      value: 272, // seconds = 4:32
      date: daysAgoISO(13), notes: 'First sub-5 Fran.', createdAt: daysAgoInstant(13),
    },
  ];

  // ─── DEXA scan — 1 report, 30 days old ───
  const dexa: DexaScan[] = [
    {
      id: genId('dexa', 'rv1'), memberId: uid, scanDate: daysAgoISO(30),
      addedAt: daysAgoInstant(30), source: 'manual',
      totalBodyFatPct: 18.4, fatMassKg: 13.8, leanMassKg: 58.2, bmc: 2.6,
      vatCm2: 74, fmi: 4.6, ffmi: 19.4, androidGynoidRatio: 0.82,
      arms:  { leanKg: 7.2, fatKg: 1.4 },
      legs:  { leanKg: 20.5, fatKg: 4.2 },
      trunk: { leanKg: 27.3, fatKg: 7.1 },
      notes: 'Baseline DEXA scan for cut cycle.',
    },
  ];

  // ─── Bloodwork — 1 report with mixed statuses ───
  const bloodwork: BloodworkReport[] = [
    {
      id: genId('bw', 'rv1'), memberId: uid, testDate: daysAgoISO(21),
      addedAt: daysAgoInstant(21), source: 'manual', labName: 'Labcorp',
      biomarkers: [
        { name: 'HDL', displayName: 'HDL-C', value: 62, unit: 'mg/dL', referenceLow: 40, status: 'optimal', category: 'Lipid' },
        { name: 'LDL', displayName: 'LDL-C', value: 118, unit: 'mg/dL', referenceHigh: 130, status: 'sufficient', category: 'Lipid' },
        { name: 'Triglycerides', value: 92, unit: 'mg/dL', referenceHigh: 150, status: 'optimal', category: 'Lipid' },
        { name: 'Total Cholesterol', value: 198, unit: 'mg/dL', referenceHigh: 200, status: 'sufficient', category: 'Lipid' },
        { name: 'Glucose', displayName: 'Fasting glucose', value: 88, unit: 'mg/dL', referenceLow: 70, referenceHigh: 99, status: 'optimal', category: 'Metabolic' },
        { name: 'HbA1c', value: 5.2, unit: '%', referenceHigh: 5.6, status: 'optimal', category: 'Metabolic' },
        { name: 'Testosterone', displayName: 'Total testosterone', value: 612, unit: 'ng/dL', referenceLow: 300, referenceHigh: 1000, status: 'optimal', category: 'Hormone' },
        { name: 'TSH', value: 2.1, unit: 'µIU/mL', referenceLow: 0.4, referenceHigh: 4.0, status: 'optimal', category: 'Thyroid' },
        { name: 'Vitamin D (25-OH)', value: 26, unit: 'ng/mL', referenceLow: 30, referenceHigh: 100, status: 'out_of_range', category: 'Vitamin' },
        { name: 'Ferritin', value: 88, unit: 'ng/mL', referenceLow: 30, referenceHigh: 400, status: 'optimal', category: 'Vitamin' },
      ],
    },
  ];

  // ─── Macro entries for today — breakfast + lunch + snack ───
  const today = daysAgoISO(0);
  const todayInstant = new Date();
  todayInstant.setHours(8, 30, 0, 0);
  const macros: MacroEntry[] = [
    { id: genId('m', 'rv1'), memberId: uid, date: today, name: 'Oatmeal + banana',
      calories: 350, protein: 10, carbs: 68, fat: 6, mealType: 'breakfast',
      createdAt: todayInstant.toISOString() },
    { id: genId('m', 'rv2'), memberId: uid, date: today, name: 'Grilled chicken + rice + greens',
      calories: 620, protein: 48, carbs: 72, fat: 14, mealType: 'lunch',
      createdAt: new Date(todayInstant.getTime() + 4 * 3600_000).toISOString() },
    { id: genId('m', 'rv3'), memberId: uid, date: today, name: 'Protein shake',
      calories: 180, protein: 30, carbs: 8, fat: 3, mealType: 'snacks',
      createdAt: new Date(todayInstant.getTime() + 6 * 3600_000).toISOString() },
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
      completedAt: daysAgoInstant(30), updatedAt: daysAgoInstant(1),
      adaptedTdee: 2625, lastAdaptedAt: daysAgoInstant(1),
    },
  };

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
  ]);

  await AsyncStorage.setItem(SEEDED_MARKER, 'true');
}
