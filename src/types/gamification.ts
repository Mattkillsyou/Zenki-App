export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string; // Ionicons name
  xpReward: number;
  flameReward: number;           // flames earned on unlock — scaled by difficulty
  difficulty: 'easy' | 'medium' | 'hard' | 'elite' | 'mythic';
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
  | 'completionist'    // collected 50 achievements
  // ─── New module types ───
  | 'hr_sessions'      // completed HR-tracked workout sessions
  | 'meals_logged'     // food entries logged in macro tracker
  | 'weight_logged'    // weigh-ins recorded
  | 'dexa_scans'       // DEXA body comp scans uploaded
  | 'bloodwork_reports' // bloodwork reports uploaded
  | 'spin_wins';       // daily spin wheel prizes won

export interface GamificationState {
  xp: number;
  level: number;
  streak: number;          // consecutive days with activity
  longestStreak: number;
  lastActiveDate: string;  // YYYY-MM-DD
  weekStreak: number;          // consecutive weeks with at least one training day
  longestWeekStreak: number;
  lastActiveWeek: string;      // ISO week identifier like '2026-W15'
  totalSessions: number;
  dojoPoints: number;       // earned from check-ins, redeemable in store
  pointsLifetime: number;   // total ever earned (for stats)
  // Flames — new currency: 1 flame earned per achievement unlocked, redeemable as credit
  flames: number;
  flamesLifetime: number;
  // Counters for achievement tracking
  totalBookings: number;
  totalPrivateSessions: number;
  totalDrinks: number;
  totalGearPurchases: number;
  totalPosts: number;
  followersCount: number;
  likesReceived: number;
  earlyBirdCount: number;   // sessions before 7am
  nightOwlCount: number;    // sessions after 8pm
  weekendSessionsCount: number;
  loginStreak: number;
  lastLoginDate: string;
  quoteReadStreak: number;
  lastQuoteReadDate: string;
  referralCount: number;
  beltLevel: number;        // 1 white, 2 blue, 3 purple, 4 brown, 5 black
  stripesEarned: number;
  // New module counters
  hrSessionsCount: number;
  mealsLoggedCount: number;
  weightLoggedCount: number;
  dexaScansCount: number;
  bloodworkReportsCount: number;
  spinWinsCount: number;
  memberSinceDate: string;  // ISO
  sessionsThisWeek: number;
  sessionsThisMonth: number;
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

/** Return the current counter value for an achievement requirement, given state. */
export function getCurrentValue(type: AchievementType, state: GamificationState): number {
  switch (type) {
    case 'sessions_total':    return state.totalSessions;
    case 'streak_days':       return state.streak;
    case 'classes_booked':    return state.totalBookings;
    case 'private_sessions':  return state.totalPrivateSessions;
    case 'belt_promotion':    return state.beltLevel;
    case 'stripes_earned':    return state.stripesEarned;
    case 'login_streak':      return state.loginStreak;
    case 'posts_created':     return state.totalPosts;
    case 'followers':         return state.followersCount;
    case 'likes_received':    return state.likesReceived;
    case 'drinks_logged':     return state.totalDrinks;
    case 'store_purchase':    return state.totalGearPurchases;
    case 'gear_purchase':     return state.totalGearPurchases;
    case 'early_bird':        return state.earlyBirdCount;
    case 'night_owl':         return state.nightOwlCount;
    case 'weekend_warrior':   return state.weekendSessionsCount;
    case 'week_warrior':      return state.sessionsThisWeek;
    case 'month_warrior':     return state.sessionsThisMonth;
    case 'dojo_anniversary': {
      if (!state.memberSinceDate) return 0;
      const start = new Date(state.memberSinceDate).getTime();
      const days = Math.floor((Date.now() - start) / 86400000);
      return Math.max(0, days);
    }
    case 'community_member':  return state.totalPosts > 0 || state.followersCount > 0 ? 1 : 0;
    case 'quote_reader':      return state.quoteReadStreak;
    case 'referral':          return state.referralCount;
    case 'completionist':     return state.achievements.filter((a) => a.unlocked).length;
    case 'hr_sessions':       return state.hrSessionsCount || 0;
    case 'meals_logged':      return state.mealsLoggedCount || 0;
    case 'weight_logged':     return state.weightLoggedCount || 0;
    case 'dexa_scans':        return state.dexaScansCount || 0;
    case 'bloodwork_reports': return state.bloodworkReportsCount || 0;
    case 'spin_wins':         return state.spinWinsCount || 0;
    default:                  return 0;
  }
}

/** Progress in [0..1] for an achievement. */
export function getAchievementProgress(ach: Achievement, state: GamificationState): number {
  if (ach.unlocked) return 1;
  const current = getCurrentValue(ach.requirement.type, state);
  return Math.max(0, Math.min(1, current / ach.requirement.value));
}

/** Fallback flame reward if an achievement definition doesn't specify one. */
export function defaultFlameReward(xpReward: number): number {
  if (xpReward >= 2000) return 50;
  if (xpReward >= 1000) return 25;
  if (xpReward >= 500)  return 12;
  if (xpReward >= 250)  return 6;
  if (xpReward >= 100)  return 3;
  return 1;
}

/** Display color for an achievement difficulty tier. */
export function difficultyColor(diff: Achievement['difficulty'] | undefined): string {
  switch (diff) {
    case 'mythic':  return '#FF2D55';   // red
    case 'elite':   return '#AF52DE';   // purple
    case 'hard':    return '#FF9F0A';   // orange
    case 'medium':  return '#FFD60A';   // yellow
    case 'easy':
    default:        return '#32D74B';   // green
  }
}
