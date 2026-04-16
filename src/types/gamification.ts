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
  | 'private_sessions'
  | 'belt_promotion'
  | 'stripes_earned'
  | 'login_streak'
  | 'posts_created'
  | 'followers'
  | 'likes_received'
  | 'drinks_logged'
  | 'store_purchase'
  | 'gear_purchase'
  | 'early_bird'       // trained before 7am
  | 'night_owl'        // trained after 8pm
  | 'weekend_warrior'  // trained on a weekend
  | 'week_warrior'     // 5+ sessions in a week
  | 'month_warrior'    // 20+ sessions in a month
  | 'dojo_anniversary' // membership milestones (1mo, 6mo, 1yr, etc)
  | 'community_member' // joined community feed
  | 'quote_reader'     // opened home screen N days in a row
  | 'referral'         // invited another member
  | 'completionist';   // collected 50 achievements

export interface GamificationState {
  xp: number;
  level: number;
  streak: number;          // consecutive days with activity
  longestStreak: number;
  lastActiveDate: string;  // YYYY-MM-DD
  totalSessions: number;
  dojoPoints: number;       // earned from check-ins, redeemable in store
  pointsLifetime: number;   // total ever earned (for stats)
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
