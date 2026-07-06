import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import { todayDateString as todayISO } from '../utils/dates';
import {
  Achievement,
  GamificationState,
  Celebration,
  getLevelFromXP,
  getCurrentValue,
} from '../types/gamification';
import { createInitialAchievements } from '../data/achievements';
import { useAuth } from './AuthContext';

// Legacy single-user global key. Kept for one-time migration into the
// per-user key so the original member's progress isn't lost.
const LEGACY_STORAGE_KEY = '@zenki_gamification';

// Gamification state is a single flat blob (not a memberId-filterable list),
// so — unlike NutritionContext/WorkoutContext which key on memberId inside the
// data — we scope persistence by namespacing the storage key on the user id.
// This keeps each member's xp/streak/points/achievements separate on a shared
// device. Signed-out fallback keeps the legacy key so pre-auth progress, if any,
// survives until the user signs in (then it migrates into their per-user key).
function storageKeyFor(userId?: string): string {
  return userId ? `@zenki_gamification_${userId}` : LEGACY_STORAGE_KEY;
}

const XP_PER_SESSION = 25;
const XP_PER_BOOKING = 10;
const STREAK_BONUS_XP = 5; // extra per streak day

// Dojo Points — earnable currency redeemable in store
const POINTS_PER_SESSION = 10;
const POINTS_STREAK_BONUS = 2; // extra per streak day, capped at 30

// Flames — $1 credit per flame
export const FLAME_VALUE_USD = 1;

interface GamificationContextValue {
  state: GamificationState;
  levelInfo: { level: number; currentXP: number; nextLevelXP: number; progress: number };
  addXP: (amount: number, reason?: string) => void;
  recordSession: () => void;
  recordBooking: () => void;
  recordPrivateSession: () => void;
  recordDrinkLogged: () => void;
  recordGearPurchase: () => void;
  recordPostCreated: () => void;
  recordFollowerGained: () => void;
  recordLikeReceived: () => void;
  recordReferral: () => void;
  recordAppOpen: () => void;     // for login streak + quote reader
  promoteBelt: (newBeltLevel: number) => void;
  awardStripe: () => void;
  redeemPoints: (amount: number, reason?: string) => boolean;
  awardPoints: (amount: number, reason?: string) => void;
  // Return points from an aborted redemption (e.g. a checkout refund). Unlike
  // awardPoints this leaves pointsLifetime alone — the points were never
  // re-earned, just un-spent.
  restorePoints: (amount: number, reason?: string) => void;
  // Reverse a prior award (e.g. deleting a PR that granted points). Clamps both
  // the spendable balance and the lifetime tally at 0 so it can't go negative.
  deductPoints: (amount: number, reason?: string) => void;
  awardFlames: (amount: number, reason?: string) => void;
  redeemFlames: (amount: number, reason?: string) => boolean;
  recordHRSession: () => void;
  recordMealLogged: () => void;
  recordWeightLogged: () => void;
  recordDexaScan: () => void;
  recordBloodwork: () => void;
  recordSpinWin: () => void;
  dismissCelebration: () => void;
}

const defaultState: GamificationState = {
  xp: 0,
  level: 1,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  weekStreak: 0,
  longestWeekStreak: 0,
  lastActiveWeek: '',
  totalSessions: 0,
  dojoPoints: 0,
  pointsLifetime: 0,
  flames: 0,
  flamesLifetime: 0,
  totalBookings: 0,
  totalPrivateSessions: 0,
  totalDrinks: 0,
  totalGearPurchases: 0,
  totalPosts: 0,
  followersCount: 0,
  likesReceived: 0,
  earlyBirdCount: 0,
  nightOwlCount: 0,
  weekendSessionsCount: 0,
  loginStreak: 0,
  lastLoginDate: '',
  quoteReadStreak: 0,
  lastQuoteReadDate: '',
  referralCount: 0,
  beltLevel: 0,
  stripesEarned: 0,
  memberSinceDate: '',
  sessionsThisWeek: 0,
  sessionsThisMonth: 0,
  lastSessionMonth: '',
  hrSessionsCount: 0,
  mealsLoggedCount: 0,
  weightLoggedCount: 0,
  dexaScansCount: 0,
  bloodworkReportsCount: 0,
  spinWinsCount: 0,
  achievements: createInitialAchievements(),
  pendingCelebration: null,
};

const GamificationContext = createContext<GamificationContextValue>({
  state: defaultState,
  levelInfo: { level: 1, currentXP: 0, nextLevelXP: 100, progress: 0 },
  addXP: () => {},
  recordSession: () => {},
  recordBooking: () => {},
  recordPrivateSession: () => {},
  recordDrinkLogged: () => {},
  recordGearPurchase: () => {},
  recordPostCreated: () => {},
  recordFollowerGained: () => {},
  recordLikeReceived: () => {},
  recordReferral: () => {},
  recordAppOpen: () => {},
  promoteBelt: () => {},
  awardStripe: () => {},
  redeemPoints: () => false,
  awardPoints: () => {},
  restorePoints: () => {},
  deductPoints: () => {},
  awardFlames: () => {},
  redeemFlames: () => false,
  recordHRSession: () => {},
  recordMealLogged: () => {},
  recordWeightLogged: () => {},
  recordDexaScan: () => {},
  recordBloodwork: () => {},
  recordSpinWin: () => {},
  dismissCelebration: () => {},
});

function yesterdayISO(): string {
  return new Date(Date.now() - 86400000).toISOString().split('T')[0];
}
function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/** Returns ISO week identifier like '2026-W15'. Week starts on Monday. */
function isoWeek(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the ISO year
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** The ISO week identifier of 7 days before the given date. */
function previousWeekISO(fromISOWeek: string): string {
  const match = fromISOWeek.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return '';
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // Reconstruct a date at the start of that week, subtract 7 days. Build and
  // advance the date with LOCAL accessors so the value round-trips through
  // isoWeek (which reads getFullYear/getMonth/getDate) in the same zone;
  // using UTC here would shift back an extra week in UTC-behind timezones.
  const jan4 = new Date(year, 0, 4);
  const jan4Dow = jan4.getDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - (jan4Dow - 1) + (week - 1) * 7 - 7);
  return isoWeek(weekStart);
}

/** Hydrate a saved (possibly partial) blob into a full GamificationState,
 *  reconciling persisted achievement unlock flags against the current catalog. */
function hydrateState(saved: Partial<GamificationState>): GamificationState {
  const initial = createInitialAchievements();
  const merged = initial.map((a) => {
    const existing = saved.achievements?.find((e: any) => e.id === a.id);
    if (!existing) return a;
    return {
      ...a,
      unlocked: !!existing.unlocked,
      unlockedAt: existing.unlockedAt,
    };
  });
  return { ...defaultState, ...saved, achievements: merged };
}

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GamificationState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuth();
  // The storage key the current `state` was hydrated from. Persist only fires
  // when this matches the active user's key, so a stale write from the previous
  // member can't clobber the new member's key while a switch is in flight.
  const loadedKeyRef = useRef<string | null>(null);
  // Live mirror of `state` for synchronous redeem decisions (same pattern as
  // SpinWheelContext). React skips the eager-updater pass whenever this fiber
  // already has a pending update, so a flag set inside a setState updater is
  // NOT reliably readable on the next line — redeem could report failure yet
  // still deduct when the queued updater runs. Redeems decide from this ref,
  // decrement it synchronously, and dispatch a clamped updater.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  // Re-read (or initialize) per-user gamification whenever the signed-in user
  // changes, so on a shared device member B never sees/overwrites member A's
  // progress. On first load for a user whose per-user key is empty, migrate the
  // legacy global blob once; a brand-new member with no data starts fresh.
  useEffect(() => {
    let cancelled = false;
    const key = storageKeyFor(user?.id);
    setLoaded(false);
    (async () => {
      try {
        let raw = await AsyncStorage.getItem(key);
        // One-time migration: if this user has no per-user data yet, fall back
        // to the legacy global key (and copy it into the per-user key) so the
        // pre-existing single user's progress carries over instead of resetting.
        if (raw == null && key !== LEGACY_STORAGE_KEY) {
          const legacyRaw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyRaw != null) {
            raw = legacyRaw;
            await AsyncStorage.setItem(key, legacyRaw);
          }
        }
        if (cancelled) return;
        const saved = safeParseJSON<Partial<GamificationState> | null>(raw, null, (v) =>
          typeof v === 'object' && v !== null && !Array.isArray(v),
        );
        // Reset to a fresh initial state when a member with no data signs in.
        setState(saved ? hydrateState(saved) : { ...defaultState, achievements: createInitialAchievements() });
      } catch {
        if (!cancelled) setState({ ...defaultState, achievements: createInitialAchievements() });
      } finally {
        if (!cancelled) {
          loadedKeyRef.current = key;
          setLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    const key = storageKeyFor(user?.id);
    // Guard against persisting the previous user's state to the new user's key:
    // only write once the active user's hydrate has completed for this key.
    if (loaded && loadedKeyRef.current === key) {
      AsyncStorage.setItem(key, JSON.stringify(state));
    }
  }, [state, loaded, user?.id]);

  const updateStreak = useCallback((prev: GamificationState): GamificationState => {
    const today = todayISO();
    const thisWeek = isoWeek();

    // Daily streak
    let next = prev;
    if (prev.lastActiveDate !== today) {
      const newStreak = prev.lastActiveDate === yesterdayISO() ? prev.streak + 1 : 1;
      const longestStreak = Math.max(prev.longestStreak, newStreak);
      next = { ...next, streak: newStreak, longestStreak, lastActiveDate: today };
    }

    // Weekly streak — independent of daily streak. A week counts once the member
    // trains any day in it; consecutive calendar weeks extend the streak.
    // Rolling into a new week also zeroes sessionsThisWeek so the week_warrior
    // achievement ("5+ sessions in a week") measures THIS week, not lifetime.
    if (prev.lastActiveWeek !== thisWeek) {
      const prevWeek = prev.lastActiveWeek ? previousWeekISO(thisWeek) : '';
      const newWeekStreak = prev.lastActiveWeek === prevWeek ? prev.weekStreak + 1 : 1;
      const longestWeekStreak = Math.max(prev.longestWeekStreak, newWeekStreak);
      next = {
        ...next,
        weekStreak: newWeekStreak,
        longestWeekStreak,
        lastActiveWeek: thisWeek,
        sessionsThisWeek: 0,
      };
    }

    return next;
  }, []);

  // Higher number wins. Level-ups are rarest/most notable, then achievements,
  // then streak milestones. A single celebration slot can only be overwritten
  // by an equal-or-higher priority celebration within the same update.
  const celebrationPriority = (c: Celebration | null): number => {
    switch (c?.type) {
      case 'level_up':         return 3;
      case 'achievement':      return 2;
      case 'streak_milestone': return 1;
      default:                 return 0;
    }
  };

  const checkAchievements = useCallback((prev: GamificationState): GamificationState => {
    let newCelebration: Celebration | null = prev.pendingCelebration;
    let bonusXP = 0;
    let flamesEarned = 0;

    // One unlock pass over `list`, evaluating each still-locked achievement
    // against `evalState`. Mutates the closed-over reward/celebration tallies
    // and returns the updated achievement array. Already-unlocked entries are
    // skipped, so re-running this is safe (no double rewards).
    const runPass = (list: Achievement[], evalState: GamificationState): Achievement[] =>
      list.map((a) => {
        if (a.unlocked) return a;
        const current = getCurrentValue(a.requirement.type, evalState);
        if (current >= a.requirement.value) {
          const flame = a.flameReward ?? 1;
          bonusXP += a.xpReward;
          flamesEarned += flame;
          // Don't clobber a higher-priority celebration already pending (e.g. a level_up).
          if (celebrationPriority({ type: 'achievement' } as Celebration) >= celebrationPriority(newCelebration)) {
            newCelebration = {
              type: 'achievement',
              title: a.title,
              subtitle: `${a.description} · +${flame} 🔥`,
              xpGained: a.xpReward,
              icon: a.icon,
            };
          }
          return { ...a, unlocked: true, unlockedAt: new Date().toISOString() };
        }
        return a;
      });

    // First pass evaluates against `prev`. A second pass evaluates against the
    // already-updated list so count-of-unlocked achievements (completionist)
    // sees this pass's unlocks and can fire in the same action instead of
    // lagging a cycle. One extra pass suffices: completionist is the only
    // achievement whose value derives from other achievements' unlock state.
    let achievements = runPass(prev.achievements, prev);
    achievements = runPass(achievements, { ...prev, achievements });

    return {
      ...prev,
      achievements,
      xp: prev.xp + bonusXP,
      flames: prev.flames + flamesEarned,
      flamesLifetime: prev.flamesLifetime + flamesEarned,
      pendingCelebration: newCelebration,
    };
  }, []);

  const ensureMemberSince = useCallback((prev: GamificationState): GamificationState => {
    if (prev.memberSinceDate) return prev;
    return { ...prev, memberSinceDate: new Date().toISOString() };
  }, []);

  const addXP = useCallback((amount: number, _reason?: string) => {
    setState((prev) => {
      const oldLevel = getLevelFromXP(prev.xp).level;
      const newXP = prev.xp + amount;
      const newLevel = getLevelFromXP(newXP).level;
      let celebration: Celebration | null = prev.pendingCelebration;
      if (newLevel > oldLevel) {
        celebration = {
          type: 'level_up',
          title: `Level ${newLevel}!`,
          subtitle: 'You leveled up!',
          xpGained: amount,
        };
      }
      return { ...prev, xp: newXP, level: newLevel, pendingCelebration: celebration };
    });
  }, []);

  const recordSession = useCallback(() => {
    setState((prev) => {
      const now = new Date();
      const hour = now.getHours();
      const thisMonth = todayISO().slice(0, 7); // 'YYYY-MM'
      let updated: GamificationState = { ...prev, totalSessions: prev.totalSessions + 1 };
      updated = ensureMemberSince(updated);
      // updateStreak zeroes sessionsThisWeek when the ISO week rolls over.
      updated = updateStreak(updated);

      if (hour < 7)  updated.earlyBirdCount  = (updated.earlyBirdCount  || 0) + 1;
      if (hour >= 20) updated.nightOwlCount  = (updated.nightOwlCount   || 0) + 1;
      if (isWeekend(now)) updated.weekendSessionsCount = (updated.weekendSessionsCount || 0) + 1;
      // Reset the monthly counter when the calendar month rolls over so
      // month_warrior ("20+ sessions in a month") measures THIS month, not lifetime.
      if (updated.lastSessionMonth !== thisMonth) {
        updated.sessionsThisMonth = 0;
        updated.lastSessionMonth = thisMonth;
      }
      updated.sessionsThisWeek  = (updated.sessionsThisWeek  || 0) + 1;
      updated.sessionsThisMonth = (updated.sessionsThisMonth || 0) + 1;

      const streakBonus = updated.streak * STREAK_BONUS_XP;
      updated.xp += XP_PER_SESSION + streakBonus;

      const pointsBonus  = Math.min(updated.streak, 30) * POINTS_STREAK_BONUS;
      const pointsEarned = POINTS_PER_SESSION + pointsBonus;
      updated.dojoPoints     = (updated.dojoPoints     || 0) + pointsEarned;
      updated.pointsLifetime = (updated.pointsLifetime || 0) + pointsEarned;

      const oldLevel = getLevelFromXP(prev.xp).level;
      const newLevel = getLevelFromXP(updated.xp).level;
      if (newLevel > oldLevel) {
        updated.pendingCelebration = {
          type: 'level_up',
          title: `Level ${newLevel}!`,
          subtitle: `+${pointsEarned} Diamonds earned`,
          xpGained: XP_PER_SESSION + streakBonus,
        };
      }
      // Streak milestone is the lowest priority — only show it if a higher-priority
      // celebration (e.g. the level_up above) wasn't already set this session.
      if (
        updated.streak !== prev.streak &&
        [7, 14, 30, 100].includes(updated.streak) &&
        celebrationPriority({ type: 'streak_milestone' } as Celebration) >= celebrationPriority(updated.pendingCelebration)
      ) {
        updated.pendingCelebration = {
          type: 'streak_milestone',
          title: `${updated.streak}-Day Streak!`,
          subtitle: `You're on fire! +${pointsEarned} Diamonds`,
          icon: 'flame',
        };
      }

      return checkAchievements(updated);
    });
  }, [updateStreak, checkAchievements, ensureMemberSince]);

  const recordBooking = useCallback(() => {
    setState((prev) => {
      const updated = {
        ...prev,
        totalBookings: prev.totalBookings + 1,
        xp: prev.xp + XP_PER_BOOKING,
      };
      return checkAchievements(ensureMemberSince(updated));
    });
  }, [checkAchievements, ensureMemberSince]);

  const recordPrivateSession = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, totalPrivateSessions: prev.totalPrivateSessions + 1 }));
  }, [checkAchievements]);

  const recordDrinkLogged = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, totalDrinks: prev.totalDrinks + 1 }));
  }, [checkAchievements]);

  const recordGearPurchase = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, totalGearPurchases: prev.totalGearPurchases + 1 }));
  }, [checkAchievements]);

  const recordPostCreated = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, totalPosts: prev.totalPosts + 1 }));
  }, [checkAchievements]);

  const recordFollowerGained = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, followersCount: prev.followersCount + 1 }));
  }, [checkAchievements]);

  const recordLikeReceived = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, likesReceived: prev.likesReceived + 1 }));
  }, [checkAchievements]);

  const recordReferral = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, referralCount: prev.referralCount + 1 }));
  }, [checkAchievements]);

  const recordAppOpen = useCallback(() => {
    setState((prev) => {
      const today = todayISO();
      const yest  = yesterdayISO();
      let updated: GamificationState = ensureMemberSince(prev);

      if (updated.lastLoginDate !== today) {
        updated.loginStreak   = updated.lastLoginDate === yest ? updated.loginStreak + 1 : 1;
        updated.lastLoginDate = today;
      }
      if (updated.lastQuoteReadDate !== today) {
        updated.quoteReadStreak   = updated.lastQuoteReadDate === yest ? updated.quoteReadStreak + 1 : 1;
        updated.lastQuoteReadDate = today;
      }
      return checkAchievements(updated);
    });
  }, [checkAchievements, ensureMemberSince]);

  const promoteBelt = useCallback((newBeltLevel: number) => {
    setState((prev) => checkAchievements({
      ...prev,
      beltLevel: Math.max(prev.beltLevel, newBeltLevel),
      stripesEarned: 0, // reset stripes on belt promotion
    }));
  }, [checkAchievements]);

  const awardStripe = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, stripesEarned: Math.min(prev.stripesEarned + 1, 4) }));
  }, [checkAchievements]);

  const awardPoints = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      dojoPoints: (prev.dojoPoints || 0) + amount,
      pointsLifetime: (prev.pointsLifetime || 0) + amount,
    }));
  }, []);

  const restorePoints = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      dojoPoints: (prev.dojoPoints || 0) + amount,
    }));
  }, []);

  const deductPoints = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      dojoPoints: Math.max(0, (prev.dojoPoints || 0) - amount),
      pointsLifetime: Math.max(0, (prev.pointsLifetime || 0) - amount),
    }));
  }, []);

  const awardFlames = useCallback((amount: number) => {
    setState((prev) => ({
      ...prev,
      flames: (prev.flames || 0) + amount,
      flamesLifetime: (prev.flamesLifetime || 0) + amount,
    }));
  }, []);

  // New module recording methods
  const recordHRSession = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, hrSessionsCount: (prev.hrSessionsCount || 0) + 1 }));
  }, [checkAchievements]);

  const recordMealLogged = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, mealsLoggedCount: (prev.mealsLoggedCount || 0) + 1 }));
  }, [checkAchievements]);

  const recordWeightLogged = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, weightLoggedCount: (prev.weightLoggedCount || 0) + 1 }));
  }, [checkAchievements]);

  const recordDexaScan = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, dexaScansCount: (prev.dexaScansCount || 0) + 1 }));
  }, [checkAchievements]);

  const recordBloodwork = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, bloodworkReportsCount: (prev.bloodworkReportsCount || 0) + 1 }));
  }, [checkAchievements]);

  const recordSpinWin = useCallback(() => {
    setState((prev) => checkAchievements({ ...prev, spinWinsCount: (prev.spinWinsCount || 0) + 1 }));
  }, [checkAchievements]);

  const redeemPoints = useCallback((amount: number): boolean => {
    const balance = stateRef.current.dojoPoints || 0;
    if (balance < amount) return false;
    // Decrement the mirror synchronously so back-to-back redeems in the same
    // tick see the reduced balance; the clamp keeps the committed state from
    // going negative if the mirror was momentarily ahead of a pending update.
    stateRef.current = { ...stateRef.current, dojoPoints: balance - amount };
    setState((prev) => ({ ...prev, dojoPoints: Math.max(0, (prev.dojoPoints || 0) - amount) }));
    return true;
  }, []);

  const redeemFlames = useCallback((amount: number): boolean => {
    const balance = stateRef.current.flames || 0;
    if (balance < amount) return false;
    stateRef.current = { ...stateRef.current, flames: balance - amount };
    setState((prev) => ({ ...prev, flames: Math.max(0, (prev.flames || 0) - amount) }));
    return true;
  }, []);

  const dismissCelebration = useCallback(() => {
    setState((prev) => ({ ...prev, pendingCelebration: null }));
  }, []);

  const levelInfo = getLevelFromXP(state.xp);

  return (
    <GamificationContext.Provider
      value={{
        state,
        levelInfo,
        addXP,
        recordSession,
        recordBooking,
        recordPrivateSession,
        recordDrinkLogged,
        recordGearPurchase,
        recordPostCreated,
        recordFollowerGained,
        recordLikeReceived,
        recordReferral,
        recordAppOpen,
        promoteBelt,
        awardStripe,
        redeemPoints,
        awardPoints,
        restorePoints,
        deductPoints,
        awardFlames,
        redeemFlames,
        recordHRSession,
        recordMealLogged,
        recordWeightLogged,
        recordDexaScan,
        recordBloodwork,
        recordSpinWin,
        dismissCelebration,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  return useContext(GamificationContext);
}
