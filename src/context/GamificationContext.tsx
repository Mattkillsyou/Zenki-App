import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GamificationState,
  Celebration,
  getLevelFromXP,
  getCurrentValue,
} from '../types/gamification';
import { createInitialAchievements } from '../data/achievements';

const STORAGE_KEY = '@zenki_gamification';

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

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
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
  // Reconstruct a date at the start of that week, subtract 7 days
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1) + (week - 1) * 7 - 7);
  return isoWeek(weekStart);
}

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GamificationState>(defaultState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          const initial = createInitialAchievements();
          const merged = initial.map((a) => {
            const existing = saved.achievements?.find((e: any) => e.id === a.id);
            return existing || a;
          });
          setState({ ...defaultState, ...saved, achievements: merged });
        } catch {
          setState(defaultState);
        }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, loaded]);

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
    if (prev.lastActiveWeek !== thisWeek) {
      const prevWeek = prev.lastActiveWeek ? previousWeekISO(thisWeek) : '';
      const newWeekStreak = prev.lastActiveWeek === prevWeek ? prev.weekStreak + 1 : 1;
      const longestWeekStreak = Math.max(prev.longestWeekStreak, newWeekStreak);
      next = { ...next, weekStreak: newWeekStreak, longestWeekStreak, lastActiveWeek: thisWeek };
    }

    return next;
  }, []);

  const checkAchievements = useCallback((prev: GamificationState): GamificationState => {
    let newCelebration: Celebration | null = prev.pendingCelebration;
    let bonusXP = 0;
    let flamesEarned = 0;

    const achievements = prev.achievements.map((a) => {
      if (a.unlocked) return a;
      const current = getCurrentValue(a.requirement.type, prev);
      if (current >= a.requirement.value) {
        const flame = a.flameReward ?? 1;
        bonusXP += a.xpReward;
        flamesEarned += flame;
        newCelebration = {
          type: 'achievement',
          title: a.title,
          subtitle: `${a.description} · +${flame} 🔥`,
          xpGained: a.xpReward,
          icon: a.icon,
        };
        return { ...a, unlocked: true, unlockedAt: new Date().toISOString() };
      }
      return a;
    });

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
      let updated: GamificationState = { ...prev, totalSessions: prev.totalSessions + 1 };
      updated = ensureMemberSince(updated);
      updated = updateStreak(updated);

      if (hour < 7)  updated.earlyBirdCount  = (updated.earlyBirdCount  || 0) + 1;
      if (hour >= 20) updated.nightOwlCount  = (updated.nightOwlCount   || 0) + 1;
      if (isWeekend(now)) updated.weekendSessionsCount = (updated.weekendSessionsCount || 0) + 1;
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
      if ([7, 14, 30, 100].includes(updated.streak)) {
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
    let success = false;
    setState((prev) => {
      if ((prev.dojoPoints || 0) < amount) return prev;
      success = true;
      return { ...prev, dojoPoints: (prev.dojoPoints || 0) - amount };
    });
    return success;
  }, []);

  const redeemFlames = useCallback((amount: number): boolean => {
    let success = false;
    setState((prev) => {
      if ((prev.flames || 0) < amount) return prev;
      success = true;
      return { ...prev, flames: (prev.flames || 0) - amount };
    });
    return success;
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
