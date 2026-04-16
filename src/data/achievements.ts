import { Achievement } from '../types/gamification';

export const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  // Session milestones
  { id: 'first_blood', title: 'First Blood', description: 'Complete your first session', icon: 'flash-outline', xpReward: 50, requirement: { type: 'sessions_total', value: 1 } },
  { id: 'getting_started', title: 'Getting Started', description: 'Complete 10 sessions', icon: 'fitness-outline', xpReward: 100, requirement: { type: 'sessions_total', value: 10 } },
  { id: 'dedicated', title: 'Dedicated', description: 'Complete 50 sessions', icon: 'barbell-outline', xpReward: 250, requirement: { type: 'sessions_total', value: 50 } },
  { id: 'centurion', title: 'Centurion', description: 'Complete 100 sessions', icon: 'shield-outline', xpReward: 500, requirement: { type: 'sessions_total', value: 100 } },
  { id: 'legend', title: 'Living Legend', description: 'Complete 500 sessions', icon: 'trophy-outline', xpReward: 1000, requirement: { type: 'sessions_total', value: 500 } },

  // Streak milestones
  { id: 'streak_3', title: 'On Fire', description: '3-day streak', icon: 'flame-outline', xpReward: 30, requirement: { type: 'streak_days', value: 3 } },
  { id: 'streak_7', title: 'Week Warrior', description: '7-day streak', icon: 'flame', xpReward: 75, requirement: { type: 'streak_days', value: 7 } },
  { id: 'streak_14', title: 'Unstoppable', description: '14-day streak', icon: 'rocket-outline', xpReward: 150, requirement: { type: 'streak_days', value: 14 } },
  { id: 'streak_30', title: 'Iron Will', description: '30-day streak', icon: 'diamond-outline', xpReward: 300, requirement: { type: 'streak_days', value: 30 } },
  { id: 'streak_100', title: 'Zenki Master', description: '100-day streak', icon: 'star', xpReward: 1000, requirement: { type: 'streak_days', value: 100 } },

  // Belt promotions
  { id: 'blue_belt', title: 'Blue Belt', description: 'Earn your blue belt', icon: 'ribbon-outline', xpReward: 500, requirement: { type: 'belt_promotion', value: 2 } },
  { id: 'purple_belt', title: 'Purple Belt', description: 'Earn your purple belt', icon: 'ribbon', xpReward: 750, requirement: { type: 'belt_promotion', value: 3 } },

  // Fun ones
  { id: 'early_bird', title: 'Early Bird', description: 'Train before 7 AM', icon: 'sunny-outline', xpReward: 50, requirement: { type: 'early_bird', value: 1 } },
  { id: 'night_owl', title: 'Night Owl', description: 'Train after 8 PM', icon: 'moon-outline', xpReward: 50, requirement: { type: 'night_owl', value: 1 } },
];

export function createInitialAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: false,
  }));
}
