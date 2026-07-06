import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeStorageSet } from '../utils/safeStorage';
import { useSenpai } from '../context/SenpaiContext';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useAuth } from '../context/AuthContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { daysSinceMet, deriveBondTier, nextAnniversaryCrossed } from '../services/senpaiBond';

// Per-user marker for the last streak-break Senpai already acknowledged,
// keyed by the break's `lastActiveDate` so each break is comforted exactly
// once no matter how many app opens happen before the user trains again.
const STREAK_BREAK_ACK_PREFIX = '@senpai_streak_break_ack_';

// H2: per-account marker for the highest bond anniversary threshold already
// celebrated (stores the day count, e.g. "30") — each threshold fires once
// ever, mirroring the streak-break ack pattern above.
const ANNIVERSARY_ACK_PREFIX = '@senpai_anniversary_ack:';

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
  const { state: senpaiState, triggerReaction, recordBondEvent } = useSenpai();
  const { state: gamState, loaded: gamLoaded } = useGamification();
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
  // H2 bond bookkeeping. streakSeedDoneRef: whether this account's bond has
  // been seeded with gamState.longestStreak (retried until the bond exists,
  // since a pre-hydration recordBondEvent is a no-op). prevStreakRef: streak
  // transition baseline. annivAckRef: in-memory mirror of the persisted
  // anniversary ack (null = not read yet). annivFiredRef / tierFiredRef:
  // one-shot guards for the delayed celebration timers.
  const streakSeedDoneRef = useRef(false);
  const prevStreakRef = useRef<number | null>(null);
  const annivAckRef = useRef<number | null>(null);
  const annivFiredRef = useRef<number | null>(null);
  const tierFiredRef = useRef<number | null>(null);

  // When the active account changes, drop all transition baselines so we don't
  // fire a "NEW PR!" / celebration for another user's pre-existing totals.
  useEffect(() => {
    prevSessionsRef.current = null;
    prevMealsRef.current = null;
    prevPRCountRef.current = null;
    prevCelebrationIdRef.current = null;
    celebrationInitRef.current = false;
    breakAckFiredRef.current = null;
    streakSeedDoneRef.current = false;
    prevStreakRef.current = null;
    annivAckRef.current = null;
    annivFiredRef.current = null;
    tierFiredRef.current = null;
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
        // H2: a workout witnessed together (first one mints a milestone).
        recordBondEvent({ type: 'workout' });
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
        // H2: PR witnessed (first one mints the 'first_pr' milestone).
        recordBondEvent({ type: 'pr' });
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
            // H2: coming back after a break is a bond moment — rides the
            // existing one-shot ack, so it can't double-mint.
            recordBondEvent({ type: 'comeback' });
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
        // H2: landmark levels (5, 10, 15…) go into the bond trophy list.
        // gamState.level updates in the same commit as pendingCelebration.
        if (gamState.level >= 5 && gamState.level % 5 === 0) {
          recordBondEvent({ type: 'level', level: gamState.level });
        }
      } else if (c.type === 'achievement') {
        triggerReaction('celebrating', randomDialogue('achievement'), 4000, 'milestone');
      } else if (c.type === 'streak_milestone') {
        triggerReaction('cheering', randomDialogue('streakMilestone'), 3500, 'milestone');
      }
    } catch { /* fail silent */ }
  }, [gamState.pendingCelebration, senpaiState.enabled]);

  // H2: best-streak witness. First run for an account SEEDS bestStreakSeen
  // from gamState.longestStreak (silently — no milestone) so a long-time
  // member's very first bond line can already cite their real best streak;
  // the audit noted longestStreakDays was shipped to the backend and unused —
  // this finally uses it on the scripted side too. Later runs report streak
  // growth; the reducer only mints a 'best_streak' milestone when a WITNESSED
  // streak beats the old best and is ≥ 5. The seed retries until the bond
  // exists: a pre-hydration recordBondEvent is a no-op, so we only mark the
  // seed done once senpaiState.bond is non-null (bond in deps re-runs us both
  // when hydration lands and when the seed's own init commits).
  useEffect(() => {
    if (!senpaiState.enabled) return;
    // Hydration gate: gamState starts as zeroed defaults while AsyncStorage
    // loads (and, mid account-switch, still holds the PREVIOUS user's
    // numbers). Seeding or baselining prevStreakRef off that snapshot either
    // fabricates a "witnessed" best-streak milestone when hydration jumps
    // 0→N in one commit, or imports another account's longestStreak into
    // this bond (bestStreakSeen never decreases). Wait until the active
    // user's storage read has actually completed.
    if (!gamLoaded) return;
    if (!streakSeedDoneRef.current) {
      recordBondEvent({ type: 'streakSeen', days: gamState.longestStreak, seed: true });
      if (senpaiState.bond) streakSeedDoneRef.current = true;
      prevStreakRef.current = gamState.streak;
      return;
    }
    const curr = gamState.streak;
    if (prevStreakRef.current !== null && curr > prevStreakRef.current) {
      recordBondEvent({ type: 'streakSeen', days: curr });
    }
    prevStreakRef.current = curr;
  }, [gamState.streak, gamState.longestStreak, gamLoaded, senpaiState.enabled, senpaiState.bond]);

  // H2: bond anniversary — one-shot per threshold (7/30/100/365/… days
  // together), cloned from the streak-break pattern above: persisted ack key
  // + in-memory ref + 3.5s delay so the Home greeting at 1.5s doesn't get
  // stomped and doesn't stomp it. 'milestone' source deliberately — these are
  // the rare earned beats the D2 tiering exists for.
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const bond = senpaiState.bond;
    if (!bond) return;
    const elapsed = daysSinceMet(bond);
    // Fast path: ack already known in-memory and nothing new was crossed —
    // skip the storage read (this effect re-runs on every bond bump).
    if (annivAckRef.current !== null && nextAnniversaryCrossed(elapsed, annivAckRef.current) === null) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ackKey = `${ANNIVERSARY_ACK_PREFIX}${user?.id ?? 'guest'}`;
    AsyncStorage.getItem(ackKey)
      .then((raw) => {
        if (cancelled) return;
        const stored = raw != null && /^\d+$/.test(raw) ? parseInt(raw, 10) : 0;
        const acked = Math.max(annivAckRef.current ?? 0, stored);
        annivAckRef.current = acked;
        const threshold = nextAnniversaryCrossed(elapsed, acked);
        if (threshold === null || annivFiredRef.current === threshold) return;
        timer = setTimeout(() => {
          if (annivFiredRef.current === threshold) return;
          annivFiredRef.current = threshold;
          annivAckRef.current = threshold;
          safeStorageSet(ackKey, String(threshold), '[SenpaiReactionBridge]');
          try {
            triggerReaction('celebrating', randomDialogue('anniversary'), 6000, 'milestone');
            recordBondEvent({ type: 'anniversary', days: threshold });
          } catch { /* fail silent */ }
        }, 3500);
      })
      .catch(() => { /* fail silent — worst case she celebrates next open */ });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [senpaiState.bond, senpaiState.enabled, user?.id]);

  // H2/H3: bond tier-up — fires once when the derived tier climbs past
  // lastTierSeen, then self-quiesces (the tierSeen write makes the condition
  // false). Can't fire on a fresh init: a new bond is tier 1 = lastTierSeen.
  // Same 3.5s delay as the other app-open one-shots.
  useEffect(() => {
    if (!senpaiState.enabled) return;
    const bond = senpaiState.bond;
    if (!bond) return;
    const tier = deriveBondTier(bond).tier;
    if (tier <= bond.lastTierSeen || tierFiredRef.current === tier) return;
    const timer = setTimeout(() => {
      if (tierFiredRef.current === tier) return;
      tierFiredRef.current = tier;
      try {
        triggerReaction('celebrating', randomDialogue('bondLevel'), 6000, 'milestone');
        recordBondEvent({ type: 'tierSeen', tier });
      } catch { /* fail silent */ }
    }, 3500);
    return () => clearTimeout(timer);
  }, [senpaiState.bond, senpaiState.enabled]);

  return null;
}
