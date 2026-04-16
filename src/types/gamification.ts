export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // Ionicons name
  xpReward: number;
  unlocked: boolean;
  unlockedAt?: string; // ISO date
  requirement: { type: AchievementType; value: number };
}

export type AchievementType =
  | 'sessions_total'
  | 'streak_days'
  | 'classes_booked'
  | 'belt_promotion'
  | 'login_streak'
  | 'early_bird'     // clocked in before 7am
  | 'night_owl'      // trained after 8pm
  | 'week_warrior';  // 5+ sessions in a week

export interface GamificationState {
  xp: number;
  level: number;
  streak: number;          // consecutive days with activity
  longestStreak: number;
  lastActiveDate: string;  // YYYY-MM-DD
  totalSessions: number;
  achievements: Achievement[];
  pendingCelebration: Celebration | null;
}

export interface Celebration {
  type: 'level_up' | 'achievement' | 'streak_milestone';
  title: string;
  subtitle: string;
  xpGained?: number;
  icon?: string;
}

// XP per level: level N requires N * 100 XP
export function xpForLevel(level: number): number {
  return level * 100;
}

export function getLevelFromXP(totalXP: number): { level: number; currentXP: number; nextLevelXP: number; progress: number } {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  const nextLevelXP = xpForLevel(level);
  return {
    level,
    currentXP: remaining,
    nextLevelXP,
    progress: remaining / nextLevelXP,
  };
}
