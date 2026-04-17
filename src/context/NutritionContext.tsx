import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WeightEntry,
  MacroEntry,
  MacroGoals,
  MacroTotals,
  NutritionProfile,
  DEFAULT_MACRO_GOALS,
  MealType,
} from '../types/nutrition';
import {
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  reconcileExpenditure,
  ExpenditureUpdate,
} from '../utils/nutrition';
import { FoodSearchResult } from '../types/food';
import { DexaScan } from '../types/dexa';
import { BloodworkReport } from '../types/bloodwork';

const WEIGHT_KEY = '@zenki_weight_entries';
const MACRO_KEY = '@zenki_macro_entries';
const GOALS_KEY = '@zenki_macro_goals';
const PROFILE_KEY = '@zenki_nutrition_profiles';
const RECENT_FOODS_KEY = '@zenki_recent_foods';
const DEXA_KEY = '@zenki_dexa_scans';
const BLOODWORK_KEY = '@zenki_bloodwork_reports';

const RECENT_FOODS_LIMIT = 20;

interface NutritionContextValue {
  weights: WeightEntry[];
  macros: MacroEntry[];
  goalsByMember: Record<string, MacroGoals>;
  profilesByMember: Record<string, NutritionProfile>;

  // Weight
  myWeights: (memberId: string) => WeightEntry[];
  latestWeight: (memberId: string) => WeightEntry | null;
  addWeight: (entry: Omit<WeightEntry, 'id' | 'createdAt'>) => WeightEntry;
  removeWeight: (id: string) => void;

  // Macros
  myMacros: (memberId: string) => MacroEntry[];
  macrosForDate: (memberId: string, dateISO: string) => MacroEntry[];
  totalsForDate: (memberId: string, dateISO: string) => MacroTotals;
  addMacroEntry: (entry: Omit<MacroEntry, 'id' | 'createdAt'>) => MacroEntry;
  removeMacroEntry: (id: string) => void;

  // Macros — meal type grouping
  macrosForDateByMeal: (memberId: string, dateISO: string) => Record<MealType, MacroEntry[]>;
  totalsForDateByMeal: (memberId: string, dateISO: string) => Record<MealType, MacroTotals>;

  // Goals
  goalsFor: (memberId: string) => MacroGoals;
  updateGoals: (memberId: string, goals: Partial<Omit<MacroGoals, 'memberId' | 'updatedAt'>>) => void;

  // Profile (BMR/TDEE setup)
  profileFor: (memberId: string) => NutritionProfile | null;
  saveProfile: (profile: Omit<NutritionProfile, 'updatedAt' | 'completedAt'>, weightKg: number) => void;
  hasCompletedSetup: (memberId: string) => boolean;

  // Recent foods (for surfacing in search)
  recentFoodsFor: (memberId: string) => FoodSearchResult[];
  rememberFood: (memberId: string, food: FoodSearchResult) => void;

  // Adaptive expenditure
  /**
   * Runs the reconciliation and, if there's a real update, mutates the profile +
   * recomputes macro goals. Returns the ExpenditureUpdate regardless so the UI
   * can show "why no update yet". Safe to call on every mount — it short-circuits
   * if <7 days since last run.
   */
  runAdaptiveUpdate: (memberId: string) => ExpenditureUpdate | null;
  /** Current effective TDEE — adapted if available, else Mifflin estimate. */
  effectiveTdee: (memberId: string) => number;

  // DEXA
  myDexaScans: (memberId: string) => DexaScan[];
  addDexaScan: (scan: Omit<DexaScan, 'id' | 'addedAt'>) => DexaScan;
  updateDexaScan: (id: string, patch: Partial<Omit<DexaScan, 'id' | 'memberId'>>) => void;
  removeDexaScan: (id: string) => void;
  getDexaScan: (id: string) => DexaScan | null;

  // Bloodwork
  myBloodworkReports: (memberId: string) => BloodworkReport[];
  addBloodworkReport: (report: Omit<BloodworkReport, 'id' | 'addedAt'>) => BloodworkReport;
  removeBloodworkReport: (id: string) => void;
  getBloodworkReport: (id: string) => BloodworkReport | null;
  /** Time series for one biomarker across all reports, oldest → newest. */
  biomarkerSeries: (memberId: string, biomarkerName: string) => { date: string; value: number }[];
}

const NutritionContext = createContext<NutritionContextValue>({
  weights: [],
  macros: [],
  goalsByMember: {},
  profilesByMember: {},
  myWeights: () => [],
  latestWeight: () => null,
  addWeight: () => ({} as WeightEntry),
  removeWeight: () => {},
  myMacros: () => [],
  macrosForDate: () => [],
  totalsForDate: () => ({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
  addMacroEntry: () => ({} as MacroEntry),
  removeMacroEntry: () => {},
  macrosForDateByMeal: () => ({ breakfast: [], lunch: [], dinner: [], snacks: [] }),
  totalsForDateByMeal: () => ({
    breakfast: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    lunch: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    dinner: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    snacks: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  }),
  goalsFor: () => ({ memberId: '', ...DEFAULT_MACRO_GOALS, updatedAt: new Date().toISOString() }),
  updateGoals: () => {},
  profileFor: () => null,
  saveProfile: () => {},
  hasCompletedSetup: () => false,
  recentFoodsFor: () => [],
  rememberFood: () => {},
  runAdaptiveUpdate: () => null,
  effectiveTdee: () => 0,
  myDexaScans: () => [],
  addDexaScan: () => ({} as DexaScan),
  updateDexaScan: () => {},
  removeDexaScan: () => {},
  getDexaScan: () => null,
  myBloodworkReports: () => [],
  addBloodworkReport: () => ({} as BloodworkReport),
  removeBloodworkReport: () => {},
  getBloodworkReport: () => null,
  biomarkerSeries: () => [],
});

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function NutritionProvider({ children }: { children: React.ReactNode }) {
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [macros, setMacros] = useState<MacroEntry[]>([]);
  const [goalsByMember, setGoalsByMember] = useState<Record<string, MacroGoals>>({});
  const [profilesByMember, setProfilesByMember] = useState<Record<string, NutritionProfile>>({});
  const [recentFoodsByMember, setRecentFoodsByMember] = useState<Record<string, FoodSearchResult[]>>({});
  const [dexaScans, setDexaScans] = useState<DexaScan[]>([]);
  const [bloodwork, setBloodwork] = useState<BloodworkReport[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Load all seven slices
  useEffect(() => {
    (async () => {
      try {
        const [wRaw, mRaw, gRaw, pRaw, rRaw, dRaw, bRaw] = await Promise.all([
          AsyncStorage.getItem(WEIGHT_KEY),
          AsyncStorage.getItem(MACRO_KEY),
          AsyncStorage.getItem(GOALS_KEY),
          AsyncStorage.getItem(PROFILE_KEY),
          AsyncStorage.getItem(RECENT_FOODS_KEY),
          AsyncStorage.getItem(DEXA_KEY),
          AsyncStorage.getItem(BLOODWORK_KEY),
        ]);
        if (wRaw) setWeights(JSON.parse(wRaw));
        if (mRaw) setMacros(JSON.parse(mRaw));
        if (gRaw) setGoalsByMember(JSON.parse(gRaw));
        if (pRaw) setProfilesByMember(JSON.parse(pRaw));
        if (rRaw) setRecentFoodsByMember(JSON.parse(rRaw));
        if (dRaw) setDexaScans(JSON.parse(dRaw));
        if (bRaw) setBloodwork(JSON.parse(bRaw));
      } catch (e) {
        // non-fatal — start empty
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Persist on change
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(WEIGHT_KEY, JSON.stringify(weights)).catch(() => {});
  }, [weights, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(MACRO_KEY, JSON.stringify(macros)).catch(() => {});
  }, [macros, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goalsByMember)).catch(() => {});
  }, [goalsByMember, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profilesByMember)).catch(() => {});
  }, [profilesByMember, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(RECENT_FOODS_KEY, JSON.stringify(recentFoodsByMember)).catch(() => {});
  }, [recentFoodsByMember, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(DEXA_KEY, JSON.stringify(dexaScans)).catch(() => {});
  }, [dexaScans, loaded]);
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(BLOODWORK_KEY, JSON.stringify(bloodwork)).catch(() => {});
  }, [bloodwork, loaded]);

  // ── Weight ──
  const myWeights = useCallback(
    (memberId: string) =>
      weights
        .filter((w) => w.memberId === memberId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [weights],
  );

  const latestWeight = useCallback(
    (memberId: string): WeightEntry | null => {
      const mine = myWeights(memberId);
      return mine.length ? mine[0] : null;
    },
    [myWeights],
  );

  const addWeight = useCallback((entry: Omit<WeightEntry, 'id' | 'createdAt'>): WeightEntry => {
    const full: WeightEntry = {
      ...entry,
      id: genId('w'),
      createdAt: new Date().toISOString(),
    };
    setWeights((prev) => [...prev, full]);
    return full;
  }, []);

  const removeWeight = useCallback((id: string) => {
    setWeights((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // ── Macros ──
  const myMacros = useCallback(
    (memberId: string) =>
      macros
        .filter((m) => m.memberId === memberId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [macros],
  );

  const macrosForDate = useCallback(
    (memberId: string, dateISO: string) =>
      macros
        .filter((m) => m.memberId === memberId && m.date === dateISO)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [macros],
  );

  const totalsForDate = useCallback(
    (memberId: string, dateISO: string): MacroTotals => {
      return macros
        .filter((m) => m.memberId === memberId && m.date === dateISO)
        .reduce(
          (acc, m) => ({
            calories: acc.calories + (Number(m.calories) || 0),
            protein: acc.protein + (Number(m.protein) || 0),
            carbs: acc.carbs + (Number(m.carbs) || 0),
            fat: acc.fat + (Number(m.fat) || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
    },
    [macros],
  );

  const addMacroEntry = useCallback((entry: Omit<MacroEntry, 'id' | 'createdAt'>): MacroEntry => {
    const full: MacroEntry = {
      ...entry,
      id: genId('m'),
      createdAt: new Date().toISOString(),
    };
    setMacros((prev) => [...prev, full]);
    return full;
  }, []);

  const removeMacroEntry = useCallback((id: string) => {
    setMacros((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const macrosForDateByMeal = useCallback(
    (memberId: string, dateISO: string): Record<MealType, MacroEntry[]> => {
      const dayEntries = macros.filter((m) => m.memberId === memberId && m.date === dateISO);
      const grouped: Record<MealType, MacroEntry[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snacks: [],
      };
      for (const entry of dayEntries) {
        const mt = entry.mealType || 'snacks';
        grouped[mt].push(entry);
      }
      return grouped;
    },
    [macros],
  );

  const totalsForDateByMeal = useCallback(
    (memberId: string, dateISO: string): Record<MealType, MacroTotals> => {
      const grouped = macrosForDateByMeal(memberId, dateISO);
      const sumEntries = (entries: MacroEntry[]): MacroTotals =>
        entries.reduce(
          (acc, m) => ({
            calories: acc.calories + (Number(m.calories) || 0),
            protein: acc.protein + (Number(m.protein) || 0),
            carbs: acc.carbs + (Number(m.carbs) || 0),
            fat: acc.fat + (Number(m.fat) || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fat: 0 },
        );
      return {
        breakfast: sumEntries(grouped.breakfast),
        lunch: sumEntries(grouped.lunch),
        dinner: sumEntries(grouped.dinner),
        snacks: sumEntries(grouped.snacks),
      };
    },
    [macrosForDateByMeal],
  );

  // ── Goals ──
  const goalsFor = useCallback(
    (memberId: string): MacroGoals =>
      goalsByMember[memberId] ?? {
        memberId,
        ...DEFAULT_MACRO_GOALS,
        updatedAt: new Date().toISOString(),
      },
    [goalsByMember],
  );

  const updateGoals = useCallback(
    (memberId: string, partial: Partial<Omit<MacroGoals, 'memberId' | 'updatedAt'>>) => {
      setGoalsByMember((prev) => {
        const existing = prev[memberId] ?? {
          memberId,
          ...DEFAULT_MACRO_GOALS,
          updatedAt: new Date().toISOString(),
        };
        return {
          ...prev,
          [memberId]: {
            ...existing,
            ...partial,
            memberId,
            updatedAt: new Date().toISOString(),
          },
        };
      });
    },
    [],
  );

  // ── Profile ──
  const profileFor = useCallback(
    (memberId: string): NutritionProfile | null => profilesByMember[memberId] ?? null,
    [profilesByMember],
  );

  const hasCompletedSetup = useCallback(
    (memberId: string) => !!profilesByMember[memberId],
    [profilesByMember],
  );

  /**
   * Save a profile and derive macro goals from it.
   * `weightKg` is passed in so we can compute TDEE/macros here without forcing
   * the caller to know whether to pull from the weight tracker or ask the user.
   */
  const saveProfile = useCallback(
    (profile: Omit<NutritionProfile, 'updatedAt' | 'completedAt'>, weightKg: number) => {
      const now = new Date().toISOString();
      setProfilesByMember((prev) => {
        const existing = prev[profile.memberId];
        return {
          ...prev,
          [profile.memberId]: {
            ...profile,
            completedAt: existing?.completedAt ?? now,
            updatedAt: now,
          },
        };
      });

      // Compute and store derived macro goals
      const bmr = calculateBMR({
        sex: profile.sex,
        weightKg,
        heightCm: profile.heightCm,
        ageYears: profile.ageYears,
      });
      const tdee = calculateTDEE(bmr, profile.activity);
      const macros = calculateMacros({
        tdee,
        goal: profile.goal,
        weightKg,
        adjustmentOverride: profile.calorieAdjustment,
      });

      setGoalsByMember((prev) => ({
        ...prev,
        [profile.memberId]: {
          memberId: profile.memberId,
          calories: macros.calories,
          protein: macros.protein,
          carbs: macros.carbs,
          fat: macros.fat,
          updatedAt: now,
        },
      }));
    },
    [],
  );

  // ── Recent foods ──
  const recentFoodsFor = useCallback(
    (memberId: string) => recentFoodsByMember[memberId] ?? [],
    [recentFoodsByMember],
  );

  const rememberFood = useCallback((memberId: string, food: FoodSearchResult) => {
    setRecentFoodsByMember((prev) => {
      const existing = prev[memberId] ?? [];
      const withoutDupe = existing.filter((f) => f.id !== food.id);
      const next = [food, ...withoutDupe].slice(0, RECENT_FOODS_LIMIT);
      return { ...prev, [memberId]: next };
    });
  }, []);

  // ── Adaptive expenditure ──
  const effectiveTdee = useCallback(
    (memberId: string): number => {
      const profile = profilesByMember[memberId];
      if (!profile) return 0;
      if (profile.adaptedTdee && profile.adaptedTdee > 0) return profile.adaptedTdee;

      // Fall back to Mifflin — use latest weigh-in for current kg
      const latest = weights
        .filter((w) => w.memberId === memberId)
        .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      if (!latest) return 0;
      const weightKg = latest.unit === 'kg' ? latest.weight : latest.weight / 2.20462;
      const bmr = calculateBMR({
        sex: profile.sex,
        weightKg,
        heightCm: profile.heightCm,
        ageYears: profile.ageYears,
      });
      return Math.round(calculateTDEE(bmr, profile.activity));
    },
    [profilesByMember, weights],
  );

  const runAdaptiveUpdate = useCallback(
    (memberId: string): ExpenditureUpdate | null => {
      const profile = profilesByMember[memberId];
      if (!profile) return null;

      // Rate-limit: skip if last run was <7 days ago
      if (profile.lastAdaptedAt) {
        const daysSince =
          (Date.now() - new Date(profile.lastAdaptedAt).getTime()) / 86400000;
        if (daysSince < 7) return null;
      }

      // Build intake + weight maps
      const intakeByDate: Record<string, number> = {};
      for (const m of macros) {
        if (m.memberId !== memberId) continue;
        intakeByDate[m.date] = (intakeByDate[m.date] ?? 0) + (m.calories || 0);
      }

      const weightByDateKg: Record<string, number> = {};
      for (const w of weights) {
        if (w.memberId !== memberId) continue;
        const kg = w.unit === 'kg' ? w.weight : w.weight / 2.20462;
        // If multiple on the same day, keep the latest
        weightByDateKg[w.date] = kg;
      }

      const priorTdee = effectiveTdee(memberId);
      if (priorTdee <= 0) return null;

      const update = reconcileExpenditure({
        priorTdee,
        intakeByDate,
        weightByDateKg,
      });

      // Only commit an update if we actually adapted (delta != 0 or we produced a high-confidence "no change")
      if (update.confidence !== 'none') {
        const now = new Date().toISOString();
        setProfilesByMember((prev) => {
          const existing = prev[memberId];
          if (!existing) return prev;
          return {
            ...prev,
            [memberId]: {
              ...existing,
              adaptedTdee: update.newTdee,
              lastAdaptedAt: now,
              updatedAt: now,
            },
          };
        });

        // Also recompute macro goals against the new TDEE
        const latest = weights
          .filter((w) => w.memberId === memberId)
          .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
        if (latest) {
          const weightKg = latest.unit === 'kg' ? latest.weight : latest.weight / 2.20462;
          const macros = calculateMacros({
            tdee: update.newTdee,
            goal: profile.goal,
            weightKg,
            adjustmentOverride: profile.calorieAdjustment,
          });
          setGoalsByMember((prev) => ({
            ...prev,
            [memberId]: {
              memberId,
              calories: macros.calories,
              protein: macros.protein,
              carbs: macros.carbs,
              fat: macros.fat,
              updatedAt: now,
            },
          }));
        }
      }

      return update;
    },
    [profilesByMember, macros, weights, effectiveTdee],
  );

  // ── DEXA ──
  const myDexaScans = useCallback(
    (memberId: string) =>
      dexaScans
        .filter((s) => s.memberId === memberId)
        .sort((a, b) => (a.scanDate < b.scanDate ? 1 : -1)),
    [dexaScans],
  );

  const addDexaScan = useCallback(
    (scan: Omit<DexaScan, 'id' | 'addedAt'>): DexaScan => {
      const full: DexaScan = {
        ...scan,
        id: genId('dexa'),
        addedAt: new Date().toISOString(),
      };
      setDexaScans((prev) => [...prev, full]);
      return full;
    },
    [],
  );

  const updateDexaScan = useCallback(
    (id: string, patch: Partial<Omit<DexaScan, 'id' | 'memberId'>>) => {
      setDexaScans((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    },
    [],
  );

  const removeDexaScan = useCallback((id: string) => {
    setDexaScans((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const getDexaScan = useCallback(
    (id: string): DexaScan | null => dexaScans.find((s) => s.id === id) ?? null,
    [dexaScans],
  );

  // ── Bloodwork ──
  const myBloodworkReports = useCallback(
    (memberId: string) =>
      bloodwork
        .filter((r) => r.memberId === memberId)
        .sort((a, b) => (a.testDate < b.testDate ? 1 : -1)),
    [bloodwork],
  );

  const addBloodworkReport = useCallback(
    (report: Omit<BloodworkReport, 'id' | 'addedAt'>): BloodworkReport => {
      const full: BloodworkReport = {
        ...report,
        id: genId('bw'),
        addedAt: new Date().toISOString(),
      };
      setBloodwork((prev) => [...prev, full]);
      return full;
    },
    [],
  );

  const removeBloodworkReport = useCallback((id: string) => {
    setBloodwork((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const getBloodworkReport = useCallback(
    (id: string): BloodworkReport | null => bloodwork.find((r) => r.id === id) ?? null,
    [bloodwork],
  );

  const biomarkerSeries = useCallback(
    (memberId: string, biomarkerName: string): { date: string; value: number }[] => {
      const reports = bloodwork
        .filter((r) => r.memberId === memberId)
        .sort((a, b) => (a.testDate < b.testDate ? -1 : 1));
      const out: { date: string; value: number }[] = [];
      for (const r of reports) {
        const hit = r.biomarkers.find((b) => b.name === biomarkerName);
        if (hit && typeof hit.value === 'number') {
          out.push({ date: r.testDate, value: hit.value });
        }
      }
      return out;
    },
    [bloodwork],
  );

  const value = useMemo<NutritionContextValue>(
    () => ({
      weights,
      macros,
      goalsByMember,
      profilesByMember,
      myWeights,
      latestWeight,
      addWeight,
      removeWeight,
      myMacros,
      macrosForDate,
      totalsForDate,
      addMacroEntry,
      removeMacroEntry,
      macrosForDateByMeal,
      totalsForDateByMeal,
      goalsFor,
      updateGoals,
      profileFor,
      saveProfile,
      hasCompletedSetup,
      recentFoodsFor,
      rememberFood,
      runAdaptiveUpdate,
      effectiveTdee,
      myDexaScans,
      addDexaScan,
      updateDexaScan,
      removeDexaScan,
      getDexaScan,
      myBloodworkReports,
      addBloodworkReport,
      removeBloodworkReport,
      getBloodworkReport,
      biomarkerSeries,
    }),
    [
      weights,
      macros,
      goalsByMember,
      profilesByMember,
      dexaScans,
      bloodwork,
      myWeights,
      latestWeight,
      addWeight,
      removeWeight,
      myMacros,
      macrosForDate,
      totalsForDate,
      addMacroEntry,
      removeMacroEntry,
      macrosForDateByMeal,
      totalsForDateByMeal,
      goalsFor,
      updateGoals,
      profileFor,
      saveProfile,
      hasCompletedSetup,
      recentFoodsFor,
      rememberFood,
      runAdaptiveUpdate,
      effectiveTdee,
      myDexaScans,
      addDexaScan,
      updateDexaScan,
      removeDexaScan,
      getDexaScan,
      myBloodworkReports,
      addBloodworkReport,
      removeBloodworkReport,
      getBloodworkReport,
      biomarkerSeries,
    ],
  );

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}

export function useNutrition() {
  return useContext(NutritionContext);
}
