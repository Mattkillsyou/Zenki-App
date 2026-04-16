import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GamificationState, Celebration, getLevelFromXP } from '../types/gamification';
import { createInitialAchievements } from '../data/achievements';

const STORAGE_KEY = '@zenki_gamification';

const XP_PER_SESSION = 25;
const XP_PER_BOOKING = 10;
const STREAK_BONUS_XP = 5; // extra per streak day

interface GamificationContextValue {
  state: GamificationState;
  levelInfo: { level: number; currentXP: number; nextLevelXP: number; progress: number };
  addXP: (amount: number, reason?: string) => void;
  recordSession: () => void;
  recordBooking: () => void;
  dismissCelebration: () => void;
}

const defaultState: GamificationState = {
  xp: 0,
  level: 1,
  streak: 0,
  longestStreak: 0,
  lastActiveDate: '',
  totalSessions: 0,
  achievements: createInitialAchievements(),
  pendingCelebration: null,
};

const GamificationContext = createContext<GamificationContextValue>({
  state: defaultState,
  levelInfo: { level: 1, currentXP: 0, nextLevelXP: 100, progress: 0 },
  addXP: () => {},
  recordSession: () => {},
  recordBooking: () => {},
  dismissCelebration: () => {},
});

export function GamificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GamificationState>(defaultState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw);
          // Merge with any new achievements added since last save
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
    const today = new Date().toISOString().split('T')[0];
    if (prev.lastActiveDate === today) return prev; // already active today

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const newStreak = prev.lastActiveDate === yesterday ? prev.streak + 1 : 1;
    const longestStreak = Math.max(prev.longestStreak, newStreak);

    return {
      ...prev,
      streak: newStreak,
      longestStreak,
      lastActiveDate: today,
    };
  }, []);

  const checkAchievements = useCallback((prev: GamificationState): GamificationState => {
    let newCelebration: Celebration | null = null;
    let bonusXP = 0;
    const achievements = prev.achievements.map((a) => {
      if (a.unlocked) return a;

      let earned = false;
      switch (a.requirement.type) {
        case 'sessions_total':
          earned = prev.totalSessions >= a.requirement.value;
          break;
        case 'streak_days':
          earned = prev.streak >= a.requirement.value;
          break;
      }

      if (earned) {
        bonusXP += a.xpReward;
        newCelebration = {
          type: 'achievement',
          title: a.title,
          subtitle: a.description,
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
      pendingCelebration: newCelebration || prev.pendingCelebration,
    };
  }, []);

  const addXP = useCallback((amount: number, _reason?: string) => {
    setState((prev) => {
      const oldLevel = getLevelFromXP(prev.xp).level;
      const newXP = prev.xp + amount;
      const newLevel = getLevelFromXP(newXP).level;

      let celebration: Celebration | null = null;
      if (newLevel > oldLevel) {
        celebration = {
          type: 'level_up',
          title: `Level ${newLevel}!`,
          subtitle: 'You leveled up!',
          xpGained: amount,
        };
      }

      return {
        ...prev,
        xp: newXP,
        level: newLevel,
        pendingCelebration: celebration || prev.pendingCelebration,
      };
    });
  }, []);

  const recordSession = useCallback(() => {
    setState((prev) => {
      let updated = { ...prev, totalSessions: prev.totalSessions + 1 };
      updated = updateStreak(updated);
      const streakBonus = updated.streak * STREAK_BONUS_XP;
      updated.xp += XP_PER_SESSION + streakBonus;

      const oldLevel = getLevelFromXP(prev.xp).level;
      const newLevel = getLevelFromXP(updated.xp).level;
      if (newLevel > oldLevel) {
        updated.pendingCelebration = {
          type: 'level_up',
          title: `Level ${newLevel}!`,
          subtitle: 'Keep training!',
          xpGained: XP_PER_SESSION + streakBonus,
        };
      }

      // Check streak milestones
      if (updated.streak === 7 || updated.streak === 14 || updated.streak === 30 || updated.streak === 100) {
        updated.pendingCelebration = {
          type: 'streak_milestone',
          title: `${updated.streak}-Day Streak!`,
          subtitle: 'You\'re on fire!',
          icon: 'flame',
        };
      }

      updated = checkAchievements(updated);
      return updated;
    });
  }, [updateStreak, checkAchievements]);

  const recordBooking = useCallback(() => {
    addXP(XP_PER_BOOKING, 'booking');
  }, [addXP]);

  const dismissCelebration = useCallback(() => {
    setState((prev) => ({ ...prev, pendingCelebration: null }));
  }, []);

  const levelInfo = getLevelFromXP(state.xp);

  return (
    <GamificationContext.Provider
      value={{ state, levelInfo, addXP, recordSession, recordBooking, dismissCelebration }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  return useContext(GamificationContext);
}
