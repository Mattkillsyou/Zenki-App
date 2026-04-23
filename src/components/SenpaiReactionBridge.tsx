import { useEffect, useRef } from 'react';
import { useSenpai } from '../context/SenpaiContext';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { randomDialogue } from '../data/senpaiDialogue';

/**
 * SenpaiReactionBridge — invisible component that watches gamification &
 * workout state and fires Senpai reactions at the right moments.
 *
 * Lives inside NavigationContainer alongside SenpaiMascot/SenpaiOverlay,
 * where both providers (Gamification, Workout, Senpai) are in scope.
 *
 * Early-returns on every effect when Senpai is disabled, so zero work
 * happens for non-Senpai users.
 */
export function SenpaiReactionBridge() {
  const { state: senpaiState, triggerReaction, shouldReact } = useSenpai();
  const { state: gamState } = useGamification();
  const { prs } = useWorkouts();

  // Refs track previous values so we only fire on transitions, not initial load.
  const prevSessionsRef = useRef<number | null>(null);
  const prevMealsRef = useRef<number | null>(null);
  const prevPRCountRef = useRef<number | null>(null);
  const prevStreakRef = useRef<number | null>(null);
  const prevCelebrationIdRef = useRef<string | null>(null);

  // Workout complete — totalSessions increments
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const curr = gamState.totalSessions;
    if (prevSessionsRef.current === null) {
      prevSessionsRef.current = curr;
      return;
    }
    if (curr > prevSessionsRef.current) {
      prevSessionsRef.current = curr;
      if (shouldReact()) {
        try {
          triggerReaction('cheering', randomDialogue('workoutComplete'), 3000);
        } catch { /* fail silent */ }
      }
    } else {
      prevSessionsRef.current = curr;
    }
  }, [gamState.totalSessions, senpaiState.enabled]);

  // Nutrition meal logged — mealsLoggedCount increments
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const curr = gamState.mealsLoggedCount || 0;
    if (prevMealsRef.current === null) {
      prevMealsRef.current = curr;
      return;
    }
    if (curr > prevMealsRef.current) {
      prevMealsRef.current = curr;
      if (shouldReact()) {
        try {
          triggerReaction('encouraging', randomDialogue('nutritionLog'), 2500);
        } catch { /* fail silent */ }
      }
    } else {
      prevMealsRef.current = curr;
    }
  }, [gamState.mealsLoggedCount, senpaiState.enabled]);

  // New PR — prs array grows
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const curr = prs.length;
    if (prevPRCountRef.current === null) {
      prevPRCountRef.current = curr;
      return;
    }
    if (curr > prevPRCountRef.current) {
      prevPRCountRef.current = curr;
      if (shouldReact()) {
        try {
          triggerReaction('impressed', randomDialogue('newPR'), 4000);
        } catch { /* fail silent */ }
      }
    } else {
      prevPRCountRef.current = curr;
    }
  }, [prs.length, senpaiState.enabled]);

  // Streak broken — streak drops back to 1 after being higher
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const curr = gamState.streak;
    const prev = prevStreakRef.current;
    prevStreakRef.current = curr;
    if (prev === null) return;
    if (prev > 1 && curr === 1) {
      if (shouldReact()) {
        try {
          triggerReaction('disappointed', randomDialogue('streakBroken'), 4000);
        } catch { /* fail silent */ }
      }
    }
  }, [gamState.streak, senpaiState.enabled]);

  // Celebrations — level_up, streak_milestone, achievement
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const c = gamState.pendingCelebration;
    if (!c) {
      prevCelebrationIdRef.current = null;
      return;
    }
    const id = `${c.type}:${c.title}`;
    if (prevCelebrationIdRef.current === id) return;
    prevCelebrationIdRef.current = id;
    if (!shouldReact()) return;

    try {
      if (c.type === 'level_up') {
        triggerReaction('celebrating', randomDialogue('levelUp'), 5000);
      } else if (c.type === 'achievement') {
        triggerReaction('celebrating', randomDialogue('achievement'), 4000);
      } else if (c.type === 'streak_milestone') {
        triggerReaction('cheering', randomDialogue('streakMilestone'), 3500);
      }
    } catch { /* fail silent */ }
  }, [gamState.pendingCelebration, senpaiState.enabled]);

  return null;
}
