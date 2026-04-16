import { Achievement } from '../types/gamification';

type AchDef = Omit<Achievement, 'unlocked' | 'unlockedAt'>;

export const ACHIEVEMENT_DEFINITIONS: AchDef[] = [
  // ─── Session milestones ───
  { id: 'first_blood',     title: 'First Blood',    description: 'Complete your first session',  icon: 'flash-outline',    xpReward: 50,   flameReward: 1,  difficulty: 'easy',  requirement: { type: 'sessions_total', value: 1 } },
  { id: 'getting_started', title: 'Getting Started',description: 'Complete 10 sessions',         icon: 'fitness-outline',  xpReward: 100,  flameReward: 2,  difficulty: 'easy',  requirement: { type: 'sessions_total', value: 10 } },
  { id: 'in_the_groove',   title: 'In the Groove',  description: 'Complete 25 sessions',         icon: 'pulse-outline',    xpReward: 150,  flameReward: 3,  difficulty: 'medium',requirement: { type: 'sessions_total', value: 25 } },
  { id: 'dedicated',       title: 'Dedicated',      description: 'Complete 50 sessions',         icon: 'barbell-outline',  xpReward: 250,  flameReward: 5,  difficulty: 'medium',requirement: { type: 'sessions_total', value: 50 } },
  { id: 'devoted',         title: 'Devoted',        description: 'Complete 75 sessions',         icon: 'medal-outline',    xpReward: 350,  flameReward: 7,  difficulty: 'medium',requirement: { type: 'sessions_total', value: 75 } },
  { id: 'centurion',       title: 'Centurion',      description: 'Complete 100 sessions',        icon: 'shield-outline',   xpReward: 500,  flameReward: 10, difficulty: 'hard',  requirement: { type: 'sessions_total', value: 100 } },
  { id: 'two_fifty',       title: 'Quarter Grand',  description: 'Complete 250 sessions',        icon: 'trophy-outline',   xpReward: 750,  flameReward: 15, difficulty: 'hard',  requirement: { type: 'sessions_total', value: 250 } },
  { id: 'legend',          title: 'Living Legend',  description: 'Complete 500 sessions',        icon: 'trophy',           xpReward: 1000, flameReward: 25, difficulty: 'elite', requirement: { type: 'sessions_total', value: 500 } },
  { id: 'mythic',          title: 'Mythic',         description: 'Complete 1,000 sessions',      icon: 'planet-outline',   xpReward: 2000, flameReward: 50, difficulty: 'mythic',requirement: { type: 'sessions_total', value: 1000 } },

  // ─── Streak milestones ───
  { id: 'streak_3',   title: 'On Fire',           description: '3-day streak',                  icon: 'flame-outline',    xpReward: 30,   flameReward: 1,  difficulty: 'easy',  requirement: { type: 'streak_days', value: 3 } },
  { id: 'streak_5',   title: 'Heating Up',        description: '5-day streak',                  icon: 'flame-outline',    xpReward: 50,   flameReward: 2,  difficulty: 'easy',  requirement: { type: 'streak_days', value: 5 } },
  { id: 'streak_7',   title: 'Week Warrior',      description: '7-day streak',                  icon: 'flame',            xpReward: 75,   flameReward: 3,  difficulty: 'medium',requirement: { type: 'streak_days', value: 7 } },
  { id: 'streak_14',  title: 'Unstoppable',       description: '14-day streak',                 icon: 'rocket-outline',   xpReward: 150,  flameReward: 5,  difficulty: 'medium',requirement: { type: 'streak_days', value: 14 } },
  { id: 'streak_21',  title: 'Habit Forged',      description: '21-day streak',                 icon: 'sparkles-outline', xpReward: 200,  flameReward: 7,  difficulty: 'medium',requirement: { type: 'streak_days', value: 21 } },
  { id: 'streak_30',  title: 'Iron Will',         description: '30-day streak',                 icon: 'diamond-outline',  xpReward: 300,  flameReward: 10, difficulty: 'hard',  requirement: { type: 'streak_days', value: 30 } },
  { id: 'streak_60',  title: 'Mountain Mover',    description: '60-day streak',                 icon: 'mountain',         xpReward: 500,  flameReward: 15, difficulty: 'hard',  requirement: { type: 'streak_days', value: 60 } },
  { id: 'streak_100', title: 'Zenki Master',      description: '100-day streak',                icon: 'star',             xpReward: 1000, flameReward: 30, difficulty: 'elite', requirement: { type: 'streak_days', value: 100 } },
  { id: 'streak_365', title: 'Year of Discipline',description: '365-day streak',                icon: 'planet',           xpReward: 5000, flameReward: 100,difficulty: 'mythic',requirement: { type: 'streak_days', value: 365 } },

  // ─── Classes booked ───
  { id: 'first_booking', title: 'First Class', description: 'Book your first class',             icon: 'calendar-outline', xpReward: 25,  flameReward: 1,  difficulty: 'easy',  requirement: { type: 'classes_booked', value: 1 } },
  { id: 'regular',       title: 'Regular',     description: 'Book 10 classes',                   icon: 'calendar',         xpReward: 100, flameReward: 2,  difficulty: 'easy',  requirement: { type: 'classes_booked', value: 10 } },
  { id: 'planner',       title: 'The Planner', description: 'Book 50 classes',                   icon: 'calendar-clear',   xpReward: 250, flameReward: 5,  difficulty: 'medium',requirement: { type: 'classes_booked', value: 50 } },

  // ─── Private sessions ───
  { id: 'private_first', title: 'One-on-One',      description: 'Book your first private session', icon: 'person-outline', xpReward: 75,  flameReward: 2,  difficulty: 'easy',   requirement: { type: 'private_sessions', value: 1 } },
  { id: 'private_10',    title: 'Private Student', description: '10 private sessions',             icon: 'person',         xpReward: 250, flameReward: 7,  difficulty: 'medium', requirement: { type: 'private_sessions', value: 10 } },
  { id: 'private_25',    title: 'Devoted Student', description: '25 private sessions',             icon: 'school-outline', xpReward: 500, flameReward: 15, difficulty: 'hard',   requirement: { type: 'private_sessions', value: 25 } },

  // ─── Belt promotions ───
  { id: 'white_belt',  title: 'White Belt',  description: 'Earned your white belt',  icon: 'ribbon-outline', xpReward: 100,  flameReward: 3,  difficulty: 'easy',   requirement: { type: 'belt_promotion', value: 1 } },
  { id: 'blue_belt',   title: 'Blue Belt',   description: 'Earned your blue belt',   icon: 'ribbon-outline', xpReward: 500,  flameReward: 20, difficulty: 'hard',   requirement: { type: 'belt_promotion', value: 2 } },
  { id: 'purple_belt', title: 'Purple Belt', description: 'Earned your purple belt', icon: 'ribbon',         xpReward: 750,  flameReward: 35, difficulty: 'elite',  requirement: { type: 'belt_promotion', value: 3 } },
  { id: 'brown_belt',  title: 'Brown Belt',  description: 'Earned your brown belt',  icon: 'ribbon',         xpReward: 1000, flameReward: 50, difficulty: 'elite',  requirement: { type: 'belt_promotion', value: 4 } },
  { id: 'black_belt',  title: 'Black Belt',  description: 'Earned your black belt',  icon: 'medal',          xpReward: 2500, flameReward: 150,difficulty: 'mythic', requirement: { type: 'belt_promotion', value: 5 } },

  // ─── Stripes ───
  { id: 'first_stripe',  title: 'First Stripe', description: 'Earned your first stripe',  icon: 'remove-outline',       xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'stripes_earned', value: 1 } },
  { id: 'four_stripes',  title: 'Four Stripes', description: 'All 4 stripes on a belt',   icon: 'reorder-four-outline', xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'stripes_earned', value: 4 } },

  // ─── Time of day ───
  { id: 'early_bird',        title: 'Early Bird',      description: 'Train before 7 AM',           icon: 'sunny-outline',           xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'early_bird', value: 1 } },
  { id: 'early_bird_10',     title: 'Sunrise Samurai', description: 'Train before 7 AM ten times', icon: 'sunny',                   xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'early_bird', value: 10 } },
  { id: 'night_owl',         title: 'Night Owl',       description: 'Train after 8 PM',            icon: 'moon-outline',            xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'night_owl', value: 1 } },
  { id: 'night_owl_10',      title: 'Midnight Warrior',description: 'Train after 8 PM ten times',  icon: 'moon',                    xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'night_owl', value: 10 } },
  { id: 'weekend_warrior',   title: 'Weekend Warrior', description: 'Train on a weekend',          icon: 'calendar-number-outline', xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'weekend_warrior', value: 1 } },
  { id: 'weekend_warrior_10',title: 'Weekend Regular', description: 'Train 10 weekend sessions',   icon: 'calendar-number',         xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'weekend_warrior', value: 10 } },

  // ─── Weekly volume ───
  { id: 'big_week',  title: 'Big Week',  description: '5+ sessions in a single week', icon: 'trending-up-outline', xpReward: 150, flameReward: 4, difficulty: 'medium', requirement: { type: 'week_warrior', value: 5 } },
  { id: 'huge_week', title: 'Huge Week', description: '7+ sessions in a single week', icon: 'trending-up',         xpReward: 250, flameReward: 7, difficulty: 'hard',   requirement: { type: 'week_warrior', value: 7 } },

  // ─── Monthly volume ───
  { id: 'big_month',  title: 'Big Month', description: '20+ sessions in a single month',icon: 'bar-chart-outline',xpReward: 300, flameReward: 8,  difficulty: 'hard',  requirement: { type: 'month_warrior', value: 20 } },
  { id: 'huge_month', title: 'Huge Month',description: '30+ sessions in a single month',icon: 'bar-chart',         xpReward: 500, flameReward: 15, difficulty: 'elite', requirement: { type: 'month_warrior', value: 30 } },

  // ─── Anniversaries ───
  { id: 'one_month_member', title: 'One Month In',      description: '30 days as a member', icon: 'calendar-outline', xpReward: 100,  flameReward: 3,  difficulty: 'easy',   requirement: { type: 'dojo_anniversary', value: 30 } },
  { id: 'six_month_member', title: 'Half Year',         description: '6 months as a member',icon: 'calendar',         xpReward: 300,  flameReward: 10, difficulty: 'hard',   requirement: { type: 'dojo_anniversary', value: 180 } },
  { id: 'one_year_member',  title: 'Anniversary',       description: '1 year as a member',  icon: 'gift-outline',     xpReward: 1000, flameReward: 40, difficulty: 'elite',  requirement: { type: 'dojo_anniversary', value: 365 } },
  { id: 'five_year_member', title: 'Five Year Veteran', description: '5 years as a member', icon: 'gift',             xpReward: 5000, flameReward: 200,difficulty: 'mythic', requirement: { type: 'dojo_anniversary', value: 1825 } },

  // ─── Community feed ───
  { id: 'first_post',      title: 'Hello, Dojo',      description: 'Share your first community post', icon: 'create-outline',     xpReward: 50,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'posts_created', value: 1 } },
  { id: 'ten_posts',       title: 'Storyteller',      description: 'Post 10 times to community',      icon: 'create',             xpReward: 150, flameReward: 4,  difficulty: 'medium', requirement: { type: 'posts_created', value: 10 } },
  { id: 'fifty_posts',     title: 'Voice of the Dojo',description: 'Post 50 times',                   icon: 'megaphone-outline',  xpReward: 500, flameReward: 12, difficulty: 'hard',   requirement: { type: 'posts_created', value: 50 } },
  { id: 'first_follower',  title: 'Recognized',       description: 'Get your first follower',         icon: 'person-add-outline', xpReward: 50,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'followers', value: 1 } },
  { id: 'ten_followers',   title: 'Mini-Influencer',  description: 'Reach 10 followers',              icon: 'people-outline',     xpReward: 150, flameReward: 4,  difficulty: 'medium', requirement: { type: 'followers', value: 10 } },
  { id: 'fifty_followers', title: 'Community Star',   description: 'Reach 50 followers',              icon: 'people',             xpReward: 500, flameReward: 12, difficulty: 'hard',   requirement: { type: 'followers', value: 50 } },
  { id: 'first_like',      title: 'Crowd Pleaser',    description: 'Get your first like',             icon: 'heart-outline',      xpReward: 25,  flameReward: 1,  difficulty: 'easy',   requirement: { type: 'likes_received', value: 1 } },
  { id: 'fifty_likes',     title: 'Liked',            description: 'Receive 50 total likes',          icon: 'heart',              xpReward: 200, flameReward: 5,  difficulty: 'medium', requirement: { type: 'likes_received', value: 50 } },
  { id: 'community_member',title: 'Joined the Dojo',  description: 'Welcome to the Zenki community',  icon: 'people-circle-outline',xpReward: 25,flameReward: 1,  difficulty: 'easy',   requirement: { type: 'community_member', value: 1 } },

  // ─── Drinks logged (vending tab) ───
  { id: 'first_drink',  title: 'Hydrated',         description: 'Log your first drink', icon: 'water-outline', xpReward: 25,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'drinks_logged', value: 1 } },
  { id: 'fifty_drinks', title: 'Regular Customer', description: 'Log 50 drinks',        icon: 'water',         xpReward: 150, flameReward: 4, difficulty: 'medium', requirement: { type: 'drinks_logged', value: 50 } },

  // ─── Store / gear ───
  { id: 'first_purchase', title: 'Repping the Brand', description: 'Buy your first item',     icon: 'bag-outline',        xpReward: 100, flameReward: 2, difficulty: 'easy',   requirement: { type: 'gear_purchase', value: 1 } },
  { id: 'gear_collector', title: 'Gear Collector',    description: 'Buy 5 items from the store',icon: 'bag-handle-outline', xpReward: 300, flameReward: 8, difficulty: 'medium', requirement: { type: 'gear_purchase', value: 5 } },

  // ─── Login streak ───
  { id: 'login_streak_7',  title: 'Daily Visitor',    description: 'Open the app 7 days in a row', icon: 'phone-portrait-outline', xpReward: 75,  flameReward: 2, difficulty: 'easy',   requirement: { type: 'login_streak', value: 7 } },
  { id: 'login_streak_30', title: 'Faithful Visitor', description: '30-day login streak',          icon: 'phone-portrait',         xpReward: 300, flameReward: 8, difficulty: 'hard',   requirement: { type: 'login_streak', value: 30 } },

  // ─── Quote reader ───
  { id: 'wisdom_seeker_7',  title: 'Wisdom Seeker', description: 'Read the daily quote 7 days',  icon: 'book-outline', xpReward: 50,  flameReward: 1, difficulty: 'easy',   requirement: { type: 'quote_reader', value: 7 } },
  { id: 'wisdom_seeker_30', title: 'Sage',          description: 'Read the daily quote 30 days', icon: 'book',         xpReward: 200, flameReward: 5, difficulty: 'medium', requirement: { type: 'quote_reader', value: 30 } },

  // ─── Referrals ───
  { id: 'referrer',        title: 'Recruiter',       description: 'Refer a friend who joins',     icon: 'gift-outline', xpReward: 250,  flameReward: 8,  difficulty: 'medium', requirement: { type: 'referral', value: 1 } },
  { id: 'super_recruiter', title: 'Super Recruiter', description: 'Refer 5 friends who join',     icon: 'gift',         xpReward: 1000, flameReward: 40, difficulty: 'elite',  requirement: { type: 'referral', value: 5 } },

  // ─── Meta ───
  { id: 'completionist', title: 'Completionist', description: 'Unlock 50 achievements', icon: 'ribbon', xpReward: 2500, flameReward: 100, difficulty: 'mythic', requirement: { type: 'completionist', value: 50 } },
];

export function createInitialAchievements(): Achievement[] {
  return ACHIEVEMENT_DEFINITIONS.map((def) => ({
    ...def,
    unlocked: false,
  }));
}
