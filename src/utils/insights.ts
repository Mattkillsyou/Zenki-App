/**
 * Cross-module insights engine.
 * Analyzes trends across ALL modules and generates motivational nudges.
 * Each insight has a type (positive/warning/neutral) and a plain-English message.
 *
 * Designed to catch users who are slipping and encourage them back,
 * while celebrating wins when they're on track.
 */

export type InsightType = 'positive' | 'warning' | 'neutral' | 'milestone';

export interface Insight {
  id: string;
  module: 'training' | 'hr' | 'gps' | 'nutrition' | 'weight' | 'bodylab' | 'engagement' | 'overall';
  type: InsightType;
  icon: string;        // Ionicons name
  title: string;
  message: string;
  priority: number;    // 1=highest, 5=lowest — used for sorting
}

interface InsightInput {
  // Training
  sessionsThisWeek: number;
  sessionsLastWeek: number;
  currentStreak: number;
  longestStreak: number;

  // Workouts
  hrSessionsThisWeek: number;
  hrSessionsLastWeek: number;
  avgStrainThisWeek: number;
  avgStrainLastWeek: number;
  totalCaloriesHrThisWeek: number;

  // GPS
  gpsDistanceThisWeek: number;     // meters
  gpsDistanceLastWeek: number;
  gpsActivitiesThisWeek: number;
  gpsActivitiesLastWeek: number;

  // Nutrition
  mealsLoggedThisWeek: number;
  mealsLoggedLastWeek: number;
  avgCaloriesThisWeek: number;
  avgCaloriesLastWeek: number;
  avgProteinThisWeek: number;
  calorieGoal: number;
  proteinGoal: number;

  // Weight
  weighInsThisWeek: number;
  weighInsLastWeek: number;
  latestWeightKg: number | null;
  weightTrendDirection: 'up' | 'down' | 'stable' | 'unknown';

  // Engagement
  loginStreakDays: number;
  daysActiveThisWeek: number;
  spinWinsThisWeek: number;

  // Body Lab
  totalDexaScans: number;
  totalBloodworkReports: number;
  daysSinceLastDexa: number | null;
  daysSinceLastBloodwork: number | null;
}

export function generateInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  let id = 0;
  const add = (i: Omit<Insight, 'id'>) => insights.push({ ...i, id: `insight_${id++}` });

  // ─── TRAINING ───
  if (input.sessionsThisWeek > input.sessionsLastWeek && input.sessionsLastWeek > 0) {
    const pct = Math.round(((input.sessionsThisWeek - input.sessionsLastWeek) / input.sessionsLastWeek) * 100);
    add({ module: 'training', type: 'positive', icon: 'trending-up', title: 'Training Up', message: `You trained ${pct}% more this week. ${input.sessionsThisWeek} sessions vs ${input.sessionsLastWeek} last week. Keep it up!`, priority: 2 });
  } else if (input.sessionsThisWeek < input.sessionsLastWeek && input.sessionsLastWeek > 0) {
    const diff = input.sessionsLastWeek - input.sessionsThisWeek;
    add({ module: 'training', type: 'warning', icon: 'trending-down', title: 'Training Dip', message: `You've trained ${diff} fewer time${diff > 1 ? 's' : ''} this week than last. Get back on the mat!`, priority: 1 });
  }
  if (input.currentStreak >= 7) {
    add({ module: 'training', type: 'milestone', icon: 'flame', title: `${input.currentStreak}-Day Streak!`, message: `You're on fire. Don't break the chain. Longest ever: ${input.longestStreak} days.`, priority: 2 });
  } else if (input.currentStreak === 0 && input.sessionsLastWeek > 0) {
    add({ module: 'training', type: 'warning', icon: 'flame-outline', title: 'Streak Lost', message: 'Your training streak reset. One session today restarts it. Show up!', priority: 1 });
  }

  // ─── WORKOUTS ───
  if (input.hrSessionsThisWeek > 0 && input.avgStrainThisWeek > input.avgStrainLastWeek && input.avgStrainLastWeek > 0) {
    add({ module: 'hr', type: 'positive', icon: 'heart', title: 'Pushing Harder', message: `Average strain up to ${input.avgStrainThisWeek.toFixed(1)} from ${input.avgStrainLastWeek.toFixed(1)} last week.`, priority: 3 });
  }
  if (input.hrSessionsThisWeek === 0 && input.hrSessionsLastWeek > 0) {
    add({ module: 'hr', type: 'warning', icon: 'heart-outline', title: 'No Workouts', message: `You tracked ${input.hrSessionsLastWeek} workout${input.hrSessionsLastWeek > 1 ? 's' : ''} last week but none this week. Strap up!`, priority: 2 });
  }

  // ─── GPS ───
  if (input.gpsDistanceThisWeek > input.gpsDistanceLastWeek && input.gpsDistanceLastWeek > 0) {
    const miThis = (input.gpsDistanceThisWeek / 1609.34).toFixed(1);
    const miLast = (input.gpsDistanceLastWeek / 1609.34).toFixed(1);
    add({ module: 'gps', type: 'positive', icon: 'navigate', title: 'More Miles', message: `${miThis} mi this week vs ${miLast} mi last week. You're covering more ground!`, priority: 3 });
  } else if (input.gpsDistanceThisWeek < input.gpsDistanceLastWeek * 0.7 && input.gpsDistanceLastWeek > 0) {
    add({ module: 'gps', type: 'warning', icon: 'navigate-outline', title: 'Less Distance', message: `You ran/walked 30%+ less this week. Try to get outside for even a short walk.`, priority: 2 });
  }

  // ─── NUTRITION ───
  if (input.mealsLoggedThisWeek === 0 && input.mealsLoggedLastWeek > 0) {
    add({ module: 'nutrition', type: 'warning', icon: 'restaurant-outline', title: 'No Food Logged', message: 'You logged meals last week but not this week. Track even one meal today to stay accountable.', priority: 1 });
  } else if (input.mealsLoggedThisWeek > 0 && input.avgCaloriesThisWeek > 0) {
    if (input.calorieGoal > 0 && input.avgCaloriesThisWeek > input.calorieGoal * 1.15) {
      add({ module: 'nutrition', type: 'warning', icon: 'alert-circle-outline', title: 'Over Calorie Goal', message: `Averaging ${Math.round(input.avgCaloriesThisWeek)} kcal/day, ${Math.round(input.avgCaloriesThisWeek - input.calorieGoal)} over your ${input.calorieGoal} target.`, priority: 2 });
    } else if (input.calorieGoal > 0 && input.avgCaloriesThisWeek < input.calorieGoal * 0.8) {
      add({ module: 'nutrition', type: 'warning', icon: 'alert-circle-outline', title: 'Under-Eating', message: `Averaging only ${Math.round(input.avgCaloriesThisWeek)} kcal/day, well below your ${input.calorieGoal} goal. Fuel your training!`, priority: 2 });
    }
    if (input.proteinGoal > 0 && input.avgProteinThisWeek < input.proteinGoal * 0.8) {
      add({ module: 'nutrition', type: 'warning', icon: 'fish-outline', title: 'Low Protein', message: `Averaging ${Math.round(input.avgProteinThisWeek)}g protein/day. Aim for ${input.proteinGoal}g to support recovery.`, priority: 2 });
    }
  }
  if (input.mealsLoggedThisWeek > input.mealsLoggedLastWeek && input.mealsLoggedLastWeek > 0) {
    add({ module: 'nutrition', type: 'positive', icon: 'restaurant', title: 'Tracking Strong', message: `${input.mealsLoggedThisWeek} meals logged this week, up from ${input.mealsLoggedLastWeek}. Consistency is key!`, priority: 3 });
  }

  // ─── WEIGHT ───
  if (input.weighInsThisWeek === 0 && input.weighInsLastWeek > 0) {
    add({ module: 'weight', type: 'warning', icon: 'scale-outline', title: 'No Weigh-Ins', message: 'You weighed in last week but not yet this week. Step on the scale to keep your trend accurate.', priority: 3 });
  }
  if (input.weightTrendDirection === 'down') {
    add({ module: 'weight', type: 'positive', icon: 'trending-down', title: 'Weight Trending Down', message: 'Your trend weight is decreasing. Stay consistent with training and nutrition.', priority: 4 });
  } else if (input.weightTrendDirection === 'up') {
    add({ module: 'weight', type: 'neutral', icon: 'trending-up', title: 'Weight Trending Up', message: 'Your trend weight is increasing. Check if this aligns with your goal (bulk vs cut).', priority: 4 });
  }

  // ─── BODY LAB ───
  if (input.daysSinceLastDexa !== null && input.daysSinceLastDexa > 180) {
    add({ module: 'bodylab', type: 'neutral', icon: 'body-outline', title: 'DEXA Overdue', message: `It's been ${Math.round(input.daysSinceLastDexa / 30)} months since your last DEXA scan. Consider scheduling one to track body composition changes.`, priority: 4 });
  }
  if (input.daysSinceLastBloodwork !== null && input.daysSinceLastBloodwork > 180) {
    add({ module: 'bodylab', type: 'neutral', icon: 'flask-outline', title: 'Bloodwork Due', message: `Your last blood panel was ${Math.round(input.daysSinceLastBloodwork / 30)} months ago. Regular labs help catch issues early.`, priority: 4 });
  }
  if (input.totalDexaScans === 0 && input.totalBloodworkReports === 0) {
    add({ module: 'bodylab', type: 'neutral', icon: 'medkit-outline', title: 'No Lab Data Yet', message: 'Upload a DEXA scan or blood panel to track your health markers over time.', priority: 5 });
  }

  // ─── ENGAGEMENT ───
  if (input.loginStreakDays >= 14) {
    add({ module: 'engagement', type: 'milestone', icon: 'phone-portrait', title: `${input.loginStreakDays}-Day App Streak`, message: 'You\'re checking in every day. That discipline shows on the mat.', priority: 4 });
  }
  if (input.daysActiveThisWeek >= 5) {
    add({ module: 'overall', type: 'positive', icon: 'checkmark-circle', title: 'Crushing It', message: `${input.daysActiveThisWeek} active days this week. You're in the top tier of Zenki members.`, priority: 1 });
  } else if (input.daysActiveThisWeek <= 1) {
    add({ module: 'overall', type: 'warning', icon: 'alert-circle', title: 'Time to Move', message: 'Only 1 active day so far this week. Your body and mind need training. Even 20 minutes counts.', priority: 1 });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}
