import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeStorageSet } from '../utils/safeStorage';
import { useSenpai } from '../context/SenpaiContext';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';
import { randomDialogue } from '../data/senpaiDialogue';

// Per-user marker for the last streak-break Senpai already acknowledged,
// keyed by the break's `lastActiveDate` so each break is comforted exactly
// once no matter how many app opens happen before the user trains again.
const STREAK_BREAK_ACK_PREFIX = '@senpai_streak_break_ack_';

/**
 * SenpaiReactionBridge — invisible component that watches gamification &
 * workout state and fires Senpai reactions at the right moments.
 *
 * Lives inside NavigationContainer alongside SenpaiMascot/SenpaiOverlay,
 * where both providers (Gamification, Workout, Senpai) are in scope.
 *
 * Early-returns on every effect when Senpai is disabled, so zero work
 * happens for non-Senpai users.
 *
 * These are discrete, meaningful milestones (workout done, new PR, level up,
 * streak broken…), so they are NOT volume-gated — `shouldReact()` only throttles
 * ambient/idle chatter (in SenpaiMascot). Gating a one-shot milestone would
 * silently drop it forever, since the transition ref advances past it.
 */
export function SenpaiReactionBridge() {
  const { state: senpaiState, triggerReaction } = useSenpai();
  const { state: gamState } = useGamification();
  const { prs } = useWorkouts();
  const { user } = useAuth();

  // Refs track previous values so we only fire on transitions, not initial load.
  const prevSessionsRef = useRef<number | null>(null);
  const prevMealsRef = useRef<number | null>(null);
  const prevPRCountRef = useRef<number | null>(null);
  const prevCelebrationIdRef = useRef<string | null>(null);
  const celebrationInitRef = useRef(false);
  // In-memory guard so a double-scheduled comeback (two effect runs racing the
  // async marker read) can't fire twice before the persisted marker lands.
  const breakAckFiredRef = useRef<string | null>(null);

  // When the active account changes, drop all transition baselines so we don't
  // fire a "NEW PR!" / celebration for another user's pre-existing totals.
  useEffect(() => {
    prevSessionsRef.current = null;
    prevMealsRef.current = null;
    prevPRCountRef.current = null;
    prevCelebrationIdRef.current = null;
    celebrationInitRef.current = false;
    breakAckFiredRef.current = null;
  }, [user?.id]);

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
      try {
        // 'milestone' — a finished workout is the app's core earned moment
        // (ReactionSource tiering lists it by name); it keeps the sparkle +
        // hearts impact, same as PRs and level-ups.
        triggerReaction('cheering', randomDialogue('workoutComplete'), 3000, 'milestone');
      } catch { /* fail silent */ }
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
      try {
        triggerReaction('encouraging', randomDialogue('nutritionLog'), 2500);
      } catch { /* fail silent */ }
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
      try {
        // 'milestone' — a real PR keeps the full-screen impact + sparkles;
        // ordinary chatter (chat replies, ambient lines) stays impact-free.
        triggerReaction('impressed', randomDialogue('newPR'), 4000, 'milestone');
      } catch { /* fail silent */ }
    } else {
      prevPRCountRef.current = curr;
    }
  }, [prs.length, senpaiState.enabled]);

  // Streak broken — acknowledged at APP-OPEN, not at record-time. The old
  // record-time effect here was provably dead: `streak` only resets inside
  // recordSession, so the >1→1 transition always shared a commit with
  // totalSessions++ and its `disappointed` lost the 250ms coalesce to the
  // higher-priority workout-complete cheer — every time. Instead, on hydrate
  // (and any later state change): if the user last trained BEFORE yesterday
  // with a streak worth mourning (≥3) and this break hasn't been
  // acknowledged yet (persisted per-break marker), fire ONE gentle comeback
  // line. Comfort on return — not disappointment stapled to a workout.
  // Delayed past the Home greeting (1.5s) so the comeback wins the bubble
  // instead of being stomped by "welcome back!!".
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const lastActive = gamState.lastActiveDate;
    const priorStreak = gamState.streak; // still the pre-break value — no idle decay
    if (!lastActive || priorStreak < 3) return;
    // Same UTC day-string convention as GamificationContext's streak math.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (lastActive >= yesterday) return; // trained today/yesterday — streak alive
    if (breakAckFiredRef.current === lastActive) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ackKey = `${STREAK_BREAK_ACK_PREFIX}${user?.id ?? 'device'}`;
    AsyncStorage.getItem(ackKey)
      .then((acked) => {
        if (cancelled || acked === lastActive) return;
        timer = setTimeout(() => {
          if (breakAckFiredRef.current === lastActive) return;
          breakAckFiredRef.current = lastActive;
          safeStorageSet(ackKey, lastActive, '[SenpaiReactionBridge]');
          try {
            triggerReaction('encouraging', randomDialogue('streakBroken'), 6000);
          } catch { /* fail silent */ }
        }, 3500);
      })
      .catch(() => { /* fail silent — worst case she comforts next open */ });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [gamState.lastActiveDate, gamState.streak, senpaiState.enabled, user?.id]);

  // Celebrations — level_up, streak_milestone, achievement
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const c = gamState.pendingCelebration;
    // First run after mount / cold relaunch / user switch: adopt whatever is
    // already pending WITHOUT firing, so a persisted celebration doesn't
    // re-trigger its reaction every launch.
    if (!celebrationInitRef.current) {
      celebrationInitRef.current = true;
      prevCelebrationIdRef.current = c ? `${c.type}:${c.title}` : null;
      return;
    }
    if (!c) {
      prevCelebrationIdRef.current = null;
      return;
    }
    const id = `${c.type}:${c.title}`;
    if (prevCelebrationIdRef.current === id) return;
    prevCelebrationIdRef.current = id;

    try {
      // 'milestone' — level-ups / achievements / streak milestones are the
      // rare, earned beats that keep full-screen impacts + sparkles.
      if (c.type === 'level_up') {
        triggerReaction('celebrating', randomDialogue('levelUp'), 5000, 'milestone');
      } else if (c.type === 'achievement') {
        triggerReaction('celebrating', randomDialogue('achievement'), 4000, 'milestone');
      } else if (c.type === 'streak_milestone') {
        triggerReaction('cheering', randomDialogue('streakMilestone'), 3500, 'milestone');
      }
    } catch { /* fail silent */ }
  }, [gamState.pendingCelebration, senpaiState.enabled]);

  return null;
}
