/**
 * Types for the Weight Tracker + Macro Tracker features.
 *
 * Weight tracker — one entry per weigh-in (user can log multiple but usually once daily).
 * Macro tracker — per-day totals for protein / carbs / fat / calories, with configurable goals.
 */

import type { Sex, ActivityLevel, Goal } from '../utils/nutrition';

export type WeightUnit = 'lb' | 'kg';

/**
 * Macro setup profile — captured via the assisted wizard.
 * Used to compute BMR/TDEE/macro targets.
 */
export interface NutritionProfile {
  memberId: string;
  sex: Sex;
  ageYears: number;
  heightCm: number;       // stored canonical in cm
  activity: ActivityLevel;
  goal: Goal;
  /** Optional calorie-adjustment override (% as decimal). If unset, uses the goal's default. */
  calorieAdjustment?: number;
  completedAt: string;    // ISO — first time setup was finished
  updatedAt: string;      // ISO

  /**
   * Current effective TDEE in kcal/day. Initialized from the Mifflin-St Jeor
   * estimate at setup, then updated weekly by the adaptive expenditure algorithm
   * based on observed weight trend vs. logged intake. If absent, fall back to
   * the Mifflin-St Jeor computation from the other profile fields.
   */
  adaptedTdee?: number;
  /** ISO timestamp of the most recent successful adaptive update. */
  lastAdaptedAt?: string;
}

export interface WeightEntry {
  id: string;
  memberId: string;
  date: string;         // YYYY-MM-DD
  weight: number;       // stored in the unit the user picked at log time
  unit: WeightUnit;
  note?: string;
  createdAt: string;    // ISO
}

/** Meal type for grouping logged food items. */
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

/**
 * One logged food item. Totals for the day are derived by summing entries
 * whose date matches today.
 */
export interface MacroEntry {
  id: string;
  memberId: string;
  date: string;         // YYYY-MM-DD
  name: string;         // "Chicken bowl", "Protein shake", etc.
  calories: number;     // kcal
  protein: number;      // grams
  carbs: number;        // grams
  fat: number;          // grams
  mealType?: MealType;  // breakfast, lunch, dinner, snacks (optional for backward compat)
  createdAt: string;    // ISO
}

/**
 * Per-member daily macro goals. One goal set per member; updated in place.
 */
export interface MacroGoals {
  memberId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  updatedAt: string;    // ISO
}

export const DEFAULT_MACRO_GOALS: Omit<MacroGoals, 'memberId' | 'updatedAt'> = {
  calories: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
};

export interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}
