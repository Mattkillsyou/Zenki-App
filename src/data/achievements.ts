import { Achievement } from '../types/gamification';

type AchDef = Omit<Achievement, 'unlocked' | 'unlockedAt'>;

/**
 * Achievement definitions — organized by MODULE.
 * Each module (workout, HR, GPS, nutrition, community, store, etc.) has its own
 * progression ladder. Every achievement is earnable through real app usage.
 */
export const ACHIEVEMENT_DEFINITIONS: AchDef[] = [
  // ═══════════════════════════════════════════════════
  // MODULE: TRAINING (check-ins, sessions, streaks)
  // ═══════════════════════════════════════════════════
  { id: 'first_blood',     title: 'First Blood',       description: 'Complete your first training session', icon: 'flash-outline',   xpReward: 50,   flameReward: 1,  difficulty: 'easy',   requirement: { type: 'sessions_total', value: 1 } },
  { id: 'getting_started', title: 'Getting Started',    description: 'Complete 10 sessions',                icon: 'fitness-outline', xpReward: 100,  flameReward: 2,  difficulty: 'easy',   requirement: { type: 'sessions_total', value: 10 } },
  { id: 'in_the_groove',   title: 'In the Groove',      description: 'Complete 25 sessions',                icon: 'pulse-outline',  xpReward: 150,  flameReward: 3,  difficulty: 'medium', requirement: { type: 'sessions_total', value: 25 } },
  { id: 'dedicated',       title: 'Dedicated',          description: 'Complete 50 sessions',                icon: 'barbell-outline',xpReward: 250,  flameReward: 5,  difficulty: 'medium', requirement: { type: 'sessions_total', value: 50 } },
  { id: 'centurion',       title: 'Centurion',          description: 'Complete 100 sessions',               icon: 'shield-outline', xpReward: 500,  flameReward: 10, difficulty: 'hard',   requirement: { type: 'sessions_total', value: 100 } },
  { id: 'legend',          title: 'Living Legend',      description: 'Complete 500 sessions',               icon: 'trophy',         xpReward: 1000, flameReward: 25, difficulty: 'elite',  requirement: { type: 'sessions_total', value: 500 } },

  // Streaks
  { id: 'streak_3',   title: 'On Fire',           description: '3-day training streak',  icon: 'flame-outline',    xpReward: 30,   flameReward: 1,  difficulty: 'easy',   requirement: { type: 'streak_days', value: 3 } },
  { id: 'streak_7',   title: 'Week Warrior',      description: '7-day training streak',  icon: 'flame',            xpReward: 75,   flameReward: 3,  difficulty: 'medium', requirement: { type: 'streak_days', value: 7 } },
  { id: 'streak_14',  title: 'Unstoppable',       description: '14-day training streak', icon: 'rocket-outline',   xpReward: 150,  flameReward: 5,  difficulty: 'medium', requirement: { type: 'streak_days', value: 14 } },
  { id: 'streak_30',  title: 'Iron Will',         description: '30-day training streak', icon: 'diamond-outline',  xpReward: 300,  flameReward: 10, difficulty: 'hard',   requirement: { type: 'streak_days', value: 30 } },
  { id: 'streak_100', title: 'Zenki Master',      description: '100-day training streak',icon: 'star',             xpReward: 1000, flameReward: 30, difficulty: 'elite',  requirement: { type: 'streak_days', value: 100 } },

  // Bookings
  { id: 'first_booking', title: 'First Class',     description: 'Book your first class',  icon: 'calendar-outline', xpReward: 25,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'classes_booked', value: 1 } },
  { id: 'regular',       title: 'Regular',         description: 'Book 10 classes',         icon: 'calendar',        xpReward: 100, flameReward: 2, difficulty: 'easy',   requirement: { type: 'classes_booked', value: 10 } },

  // Belt
  { id: 'white_belt', title: 'White Belt', description: 'Earn your white belt', icon: 'ribbon-outline', xpReward: 100,  flameReward: 3,  difficulty: 'easy',   requirement: { type: 'belt_promotion', value: 1 } },
  { id: 'blue_belt',  title: 'Blue Belt',  description: 'Earn your blue belt',  icon: 'ribbon-outline', xpReward: 500,  flameReward: 20, difficulty: 'hard',   requirement: { type: 'belt_promotion', value: 2 } },
  { id: 'black_belt', title: 'Black Belt', description: 'Earn your black belt', icon: 'medal',          xpReward: 2500, flameReward: 150,difficulty: 'mythic', requirement: { type: 'belt_promotion', value: 5 } },

  // ═══════════════════════════════════════════════════
  // MODULE: HR SESSIONS (heart rate, strain, calories)
  // ═══════════════════════════════════════════════════
  { id: 'first_hr',     title: 'Heart Monitor',     description: 'Complete your first HR session',    icon: 'heart-outline',  xpReward: 50,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'hr_sessions', value: 1 } },
  { id: 'hr_10',        title: 'Cardio Warrior',    description: 'Complete 10 HR sessions',           icon: 'heart',          xpReward: 200, flameReward: 5,  difficulty: 'medium', requirement: { type: 'hr_sessions', value: 10 } },
  { id: 'hr_50',        title: 'Heart of Gold',     description: 'Complete 50 HR sessions',           icon: 'heart-circle',   xpReward: 500, flameReward: 12, difficulty: 'hard',   requirement: { type: 'hr_sessions', value: 50 } },
  { id: 'hr_100',       title: 'Cardiac Engine',    description: 'Complete 100 HR sessions',          icon: 'pulse',          xpReward: 1000,flameReward: 30, difficulty: 'elite',  requirement: { type: 'hr_sessions', value: 100 } },

  // ═══════════════════════════════════════════════════
  // MODULE: GPS TRACKING (runs, walks, bikes, hikes)
  // ═══════════════════════════════════════════════════
  // GPS activities are tracked via sessions_total (they call recordSession)
  // Add specific ones if we add a gps_activities counter later

  // ═══════════════════════════════════════════════════
  // MODULE: NUTRITION (food logging, macros, weight)
  // ═══════════════════════════════════════════════════
  { id: 'first_meal',   title: 'First Bite',         description: 'Log your first meal',      icon: 'restaurant-outline', xpReward: 25,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'meals_logged', value: 1 } },
  { id: 'meals_10',     title: 'Tracking Pro',       description: 'Log 10 meals',             icon: 'restaurant',         xpReward: 100, flameReward: 2,  difficulty: 'easy',   requirement: { type: 'meals_logged', value: 10 } },
  { id: 'meals_50',     title: 'Macro Master',       description: 'Log 50 meals',             icon: 'nutrition-outline',  xpReward: 200, flameReward: 5,  difficulty: 'medium', requirement: { type: 'meals_logged', value: 50 } },
  { id: 'meals_100',    title: 'Nutrition Nerd',     description: 'Log 100 meals',            icon: 'nutrition-outline',  xpReward: 300, flameReward: 8,  difficulty: 'medium', requirement: { type: 'meals_logged', value: 100 } },
  { id: 'meals_365',    title: 'Year of Fuel',       description: 'Log 365 meals',            icon: 'nutrition',          xpReward: 1000,flameReward: 30, difficulty: 'elite',  requirement: { type: 'meals_logged', value: 365 } },

  // Weight tracking
  { id: 'first_weigh',  title: 'On the Scale',       description: 'Log your first weigh-in',  icon: 'scale-outline', xpReward: 25,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'weight_logged', value: 1 } },
  { id: 'weigh_30',     title: 'Consistent Scale',   description: '30 weigh-ins recorded',    icon: 'scale',         xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'weight_logged', value: 30 } },
  { id: 'weigh_100',    title: 'Data Driven',        description: '100 weigh-ins recorded',   icon: 'analytics',     xpReward: 500, flameReward: 15,difficulty: 'hard',   requirement: { type: 'weight_logged', value: 100 } },

  // ═══════════════════════════════════════════════════
  // MODULE: BODY LAB (DEXA + Bloodwork)
  // ═══════════════════════════════════════════════════
  { id: 'first_dexa',         title: 'Body Mapped',        description: 'Upload your first DEXA scan',  icon: 'body-outline',  xpReward: 100, flameReward: 3,  difficulty: 'easy',   requirement: { type: 'dexa_scans', value: 1 } },
  { id: 'dexa_3',             title: 'Composition Tracker', description: 'Upload 3 DEXA scans',         icon: 'body',          xpReward: 300, flameReward: 10, difficulty: 'medium', requirement: { type: 'dexa_scans', value: 3 } },
  { id: 'first_blood_report', title: 'Blood Work',         description: 'Upload your first blood panel',icon: 'flask-outline', xpReward: 100, flameReward: 3,  difficulty: 'easy',   requirement: { type: 'bloodwork_reports', value: 1 } },
  { id: 'blood_3',            title: 'Lab Regular',        description: 'Upload 3 blood panels',        icon: 'flask',         xpReward: 300, flameReward: 10, difficulty: 'medium', requirement: { type: 'bloodwork_reports', value: 3 } },

  // ═══════════════════════════════════════════════════
  // MODULE: COMMUNITY (posts, followers, engagement)
  // ═══════════════════════════════════════════════════
  { id: 'first_post',    title: 'Hello, Dojo',       description: 'Share your first post',   icon: 'create-outline',     xpReward: 50,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'posts_created', value: 1 } },
  { id: 'ten_posts',     title: 'Storyteller',       description: 'Post 10 times',           icon: 'create',             xpReward: 150, flameReward: 4,  difficulty: 'medium', requirement: { type: 'posts_created', value: 10 } },
  { id: 'first_follower',title: 'Recognized',        description: 'Get your first follower', icon: 'person-add-outline', xpReward: 50,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'followers', value: 1 } },
  { id: 'community_member', title: 'Joined the Dojo',description: 'Welcome to the community',icon: 'people-circle-outline', xpReward: 25, flameReward: 1, difficulty: 'easy',  requirement: { type: 'community_member', value: 1 } },

  // ═══════════════════════════════════════════════════
  // MODULE: STORE (purchases, gear)
  // ═══════════════════════════════════════════════════
  { id: 'first_purchase', title: 'Repping the Brand', description: 'Buy your first item',    icon: 'bag-outline',        xpReward: 100, flameReward: 2, difficulty: 'easy',   requirement: { type: 'gear_purchase', value: 1 } },
  { id: 'gear_collector', title: 'Gear Collector',    description: 'Buy 5 items',             icon: 'bag-handle-outline', xpReward: 300, flameReward: 8, difficulty: 'medium', requirement: { type: 'gear_purchase', value: 5 } },

  // ═══════════════════════════════════════════════════
  // MODULE: HYDRATION (drink tracking)
  // ═══════════════════════════════════════════════════
  { id: 'first_drink',   title: 'Hydrated',           description: 'Log your first drink',    icon: 'water-outline', xpReward: 25,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'drinks_logged', value: 1 } },
  { id: 'fifty_drinks',  title: 'Regular Customer',   description: 'Log 50 drinks',           icon: 'water',         xpReward: 150, flameReward: 4, difficulty: 'medium', requirement: { type: 'drinks_logged', value: 50 } },

  // ═══════════════════════════════════════════════════
  // MODULE: DAILY ENGAGEMENT (app opens, quotes, spin)
  // ═══════════════════════════════════════════════════
  { id: 'login_streak_7',  title: 'Daily Visitor',    description: 'Open the app 7 days in a row', icon: 'phone-portrait-outline', xpReward: 75,  flameReward: 2, difficulty: 'easy',   requirement: { type: 'login_streak', value: 7 } },
  { id: 'login_streak_30', title: 'Faithful Visitor', description: '30-day login streak',          icon: 'phone-portrait',         xpReward: 300, flameReward: 8, difficulty: 'hard',   requirement: { type: 'login_streak', value: 30 } },
  { id: 'first_spin',      title: 'Lucky Spin',       description: 'Win your first daily spin',    icon: 'disc-outline',           xpReward: 25,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'spin_wins', value: 1 } },
  { id: 'spin_30',         title: 'Wheel Warrior',    description: 'Win 30 daily spins',           icon: 'disc',                   xpReward: 150, flameReward: 4, difficulty: 'medium', requirement: { type: 'spin_wins', value: 30 } },
  { id: 'spin_100',        title: 'Fortune Favored',  description: 'Win 100 daily spins',          icon: 'star',                   xpReward: 500, flameReward: 15,difficulty: 'hard',   requirement: { type: 'spin_wins', value: 100 } },

  // ═══════════════════════════════════════════════════
  // MODULE: TIME-BASED (early bird, night owl, weekend)
  // ═══════════════════════════════════════════════════
  { id: 'early_bird',    title: 'Early Bird',         description: 'Train before 7 AM',       icon: 'sunny-outline',           xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'early_bird', value: 1 } },
  { id: 'night_owl',     title: 'Night Owl',          description: 'Train after 8 PM',        icon: 'moon-outline',            xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'night_owl', value: 1 } },
  { id: 'weekend_warrior', title: 'Weekend Warrior',  description: 'Train on a weekend',      icon: 'calendar-number-outline', xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'weekend_warrior', value: 1 } },

  // ═══════════════════════════════════════════════════
  // META
  // ═══════════════════════════════════════════════════
  { id: 'completionist', title: 'Completionist', description: 'Unlock 40 achievements', icon: 'ribbon', xpReward: 2500, flameReward: 100, difficulty: 'mythic', requirement: { type: 'completionist', value: 40 } },
];

export function createInitialAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: false,
  }));
}
