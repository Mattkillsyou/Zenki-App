import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ImpactType } from '../components/SenpaiImpactEffect';
import { useAuth } from './AuthContext';
import { safeParseJSON, safeStorageSet } from '../utils/safeStorage';
import {
  applyBondEvent,
  addFactToBond,
  bondHasFact,
  bondKeyFor,
  buildBondSlots,
  FACT_MAX_LEN,
  hydrateBondFromRaw,
  initBond,
  removeFactFromBond,
  todayISO,
  type BondEvent,
  type SenpaiBond,
} from '../services/senpaiBond';
import { setDialogueBondSlots } from '../data/senpaiDialogue';

const STORAGE_KEY = '@zenki_senpai_mode';
const VOLUME_KEY = '@zenki_senpai_volume';
const SPARKLE_KEY = '@zenki_senpai_sparkle';
// Legacy device-global memory key (pre per-account). The diary is now stored
// per account under `memoryKeyFor(...)`; the bare key is migrated once below.
const MEMORY_KEY = '@zenki_senpai_memory';
const AMBIENT_KEY = '@zenki_senpai_ambient';

// The diary contains verbatim reaction/chat lines, so it must not leak across
// members sharing a device. Signed-in members get their own bucket; guests and
// signed-out share 'guest'. Preferences (enabled/volume/sparkle/ambient) stay
// device-global on purpose.
const memoryKeyFor = (accountId: string) => `${MEMORY_KEY}:${accountId}`;

const MEMORY_CAP = 100;

export type MascotMood =
  | 'idle'
  | 'cheering'
  | 'impressed'
  | 'encouraging'
  | 'celebrating'
  | 'sleeping'
  | 'disappointed';

export type SenpaiVolume = 'low' | 'med' | 'high';
export type SparkleIntensity = 'normal' | 'maximum';

// Who fired a reaction. Only 'milestone' (workout done, PR, level-up…) may
// detonate the full-screen impact + sparkle layers; chat mirrors and ambient
// chatter get pose + bubble only, so a real PR still looks special.
export type ReactionSource = 'milestone' | 'chat' | 'ambient';

export interface MemoryEntry {
  mood: MascotMood;
  dialogue: string;
  timestamp: number;
}

// Reaction precedence: when several reactions fire within COALESCE_MS of each
// other (e.g. a single GPS save increments totalSessions AND unlocks an
// achievement AND a screen fires its own line), the highest-priority one wins
// instead of the last writer stomping the others. Also makes "streak broken"
// (disappointed) lose to the "you trained!" (cheering) it always coincides with.
const MOOD_PRIORITY: Record<MascotMood, number> = {
  celebrating: 5,
  impressed: 4,
  cheering: 3,
  encouraging: 2,
  disappointed: 1,
  idle: 0,
  sleeping: 0,
};
const COALESCE_MS = 250;

interface SenpaiState {
  enabled: boolean;
  mascotMood: MascotMood;
  lastReaction: string | null;
  reactionExpiry: number;
  sparkleActive: boolean;
  volume: SenpaiVolume;
  sparkleIntensity: SparkleIntensity;
  memoryLog: MemoryEntry[];
  transformationPlayed: boolean;
  ambientEffects: boolean;
  activeImpact: ImpactType | null;
  // H2: the durable relationship bond file — null until hydrated / initialized
  // (per-account, owned here, mutated only via recordBondEvent & the fact API).
  bond: SenpaiBond | null;
}

interface SenpaiContextValue {
  state: SenpaiState;
  setEnabled: (on: boolean) => void;
  triggerReaction: (mood: MascotMood, dialogue: string, durationMs?: number, source?: ReactionSource) => void;
  setVolume: (vol: SenpaiVolume) => void;
  setSparkleIntensity: (intensity: SparkleIntensity) => void;
  clearMemoryLog: () => void;
  shouldReact: () => boolean;
  markTransformationPlayed: () => void;
  setAmbientEffects: (on: boolean) => void;
  clearImpact: () => void;
  // H2 bond mutators — all writes funnel through the pure applyBondEvent
  // reducer via functional setState, so concurrent writers can't race.
  recordBondEvent: (e: BondEvent) => void;
  addBondFact: (text: string) => 'added' | 'duplicate';
  removeBondFact: (id: string) => void;
  resetBond: () => void;
}

const defaultState: SenpaiState = {
  enabled: false,
  mascotMood: 'idle',
  lastReaction: null,
  reactionExpiry: 0,
  sparkleActive: false,
  volume: 'high',
  sparkleIntensity: 'normal',
  memoryLog: [],
  transformationPlayed: false,
  ambientEffects: true,
  activeImpact: null,
  bond: null,
};

const SenpaiContext = createContext<SenpaiContextValue>({
  state: defaultState,
  setEnabled: () => {},
  triggerReaction: () => {},
  setVolume: () => {},
  setSparkleIntensity: () => {},
  clearMemoryLog: () => {},
  shouldReact: () => false,
  markTransformationPlayed: () => {},
  setAmbientEffects: () => {},
  clearImpact: () => {},
  recordBondEvent: () => {},
  addBondFact: () => 'duplicate',
  removeBondFact: () => {},
  resetBond: () => {},
});

function isMemoryEntry(e: unknown): e is MemoryEntry {
  return (
    !!e &&
    typeof e === 'object' &&
    typeof (e as MemoryEntry).dialogue === 'string' &&
    typeof (e as MemoryEntry).timestamp === 'number' &&
    typeof (e as MemoryEntry).mood === 'string'
  );
}

export function SenpaiProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SenpaiState>(defaultState);
  const { user } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRef = useRef<SenpaiVolume>(defaultState.volume);
  // Coalescing bookkeeping (see MOOD_PRIORITY).
  const lastTriggerAtRef = useRef(0);
  const lastPriorityRef = useRef(-1);

  // Storage key for the active account's diary (guest bucket when signed out).
  const accountId = user?.id ?? null;
  const memoryKey = memoryKeyFor(accountId ?? 'guest');
  // H2: the bond file is per-account too (same F4 reasoning as the diary).
  const bondKey = bondKeyFor(accountId ?? 'guest');
  // The key the in-memory memoryLog was hydrated FROM — null while a hydrate
  // is in flight. The persist effect below only writes when this matches the
  // current key, so (a) the pre-hydration [] can never overwrite the stored
  // log on launch, and (b) an account switch can never write one member's
  // diary into another's bucket.
  const memoryHydratedKeyRef = useRef<string | null>(null);
  // H2 bond bookkeeping — same hydration-key guard as the diary (mandatory:
  // without it the pre-hydration null / a fresh re-init could clobber a
  // stored bond on launch), plus a 400ms trailing debounce so the reaction
  // counter's write volume doesn't hammer AsyncStorage.
  const bondHydratedKeyRef = useRef<string | null>(null);
  const bondKeyRef = useRef(bondKey);
  bondKeyRef.current = bondKey;
  const bondTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bondPendingRef = useRef<{ key: string; value: SenpaiBond } | null>(null);
  // High-value mutations (confirmed facts, milestone-bearing events) set this
  // so the persist effect writes immediately instead of debouncing — force-
  // quit can lose at most 400ms of COUNTER bumps, never a confirmed fact.
  const bondFlushRequestedRef = useRef(false);
  // Render-mirror so addBondFact can answer 'duplicate' synchronously
  // (messagesRef pattern from useSenpaiChat).
  const bondRef = useRef<SenpaiBond | null>(state.bond);
  bondRef.current = state.bond;

  // Load device-global preferences on mount (memory log is per-account and
  // hydrated by its own effect below).
  useEffect(() => {
    (async () => {
      try {
        const [enabledRaw, volumeRaw, sparkleRaw, ambientRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(VOLUME_KEY),
          AsyncStorage.getItem(SPARKLE_KEY),
          AsyncStorage.getItem(AMBIENT_KEY),
        ]);
        const volume: SenpaiVolume =
          volumeRaw === 'low' || volumeRaw === 'med' || volumeRaw === 'high' ? volumeRaw : 'high';
        const sparkleIntensity: SparkleIntensity =
          sparkleRaw === 'maximum' ? 'maximum' : 'normal';
        const ambientEffects = ambientRaw === null ? true : ambientRaw === 'true';
        volumeRef.current = volume;
        setState((s) => ({
          ...s,
          enabled: enabledRaw === 'true',
          volume,
          sparkleIntensity,
          ambientEffects,
        }));
      } catch { /* ignore storage errors */ }
    })();
  }, []);

  // Persist the memory log from committed state (G1). Computing the capped
  // log inside the setState updater and persisting it after dispatch relied
  // on React invoking the updater eagerly — the SECOND dispatch in one batch
  // defers its updater, so the stale [] got persisted and wiped the diary.
  // The hydration guard is essential: without it this same effect would
  // re-open the wipe window by writing the pre-hydration [] on launch.
  useEffect(() => {
    if (memoryHydratedKeyRef.current !== memoryKey) return;
    safeStorageSet(memoryKey, state.memoryLog, '[Senpai]');
  }, [state.memoryLog, memoryKey]);

  // Hydrate the per-account memory log on mount and on account switch,
  // clearing the previous account's entries from memory (F4).
  useEffect(() => {
    let cancelled = false;
    memoryHydratedKeyRef.current = null;
    (async () => {
      try {
        let memoryRaw = await AsyncStorage.getItem(memoryKey);
        // One-time migration: pre per-account builds stored the diary under
        // the bare legacy key. The first SIGNED-IN account to hydrate adopts
        // it; the legacy key is then removed so later accounts start fresh.
        // Never migrate into the guest bucket — on cold launch this effect
        // runs as 'guest' before AuthContext finishes restoring the session,
        // and consuming the legacy key there would strand the returning
        // member's diary.
        if (memoryRaw === null && accountId !== null) {
          const legacyRaw = await AsyncStorage.getItem(MEMORY_KEY);
          if (legacyRaw !== null) {
            memoryRaw = legacyRaw;
            await AsyncStorage.setItem(memoryKey, legacyRaw);
            await AsyncStorage.removeItem(MEMORY_KEY);
          }
        }
        const parsedMemory = safeParseJSON<MemoryEntry[]>(memoryRaw, [], Array.isArray);
        // Validate element shape, not just Array.isArray — a corrupt blob must
        // not produce undefined-mood / Invalid-Date rows in the Memory screen.
        const memoryLog: MemoryEntry[] = parsedMemory.filter(isMemoryEntry).slice(-MEMORY_CAP);
        if (cancelled) return;
        setState((s) => ({ ...s, memoryLog }));
        memoryHydratedKeyRef.current = memoryKey;
      } catch {
        // Leave this key un-hydrated: better to skip persisting for the
        // session than to overwrite a stored diary we failed to read.
        if (!cancelled) setState((s) => ({ ...s, memoryLog: [] }));
      }
    })();
    return () => { cancelled = true; };
  }, [memoryKey, accountId]);

  // ── H2: bond hydrate / persist / flush ──────────────────────────────────

  // Persist the bond from committed state (G1 pattern + 400ms trailing
  // debounce — triggerReaction bumps reactionsWitnessed on every reaction, so
  // the writer absorbs the volume). Single writer: no dispatch path persists.
  // The cleanup clears the TIMER only; the pending write stays in
  // bondPendingRef so the flush effect below can rescue it.
  useEffect(() => {
    if (bondHydratedKeyRef.current !== bondKey || state.bond === null) return;
    const bond = state.bond;
    bondPendingRef.current = { key: bondKey, value: bond };
    if (bondTimerRef.current) clearTimeout(bondTimerRef.current);
    if (bondFlushRequestedRef.current) {
      // High-value mutation (confirmed fact / milestone) — write NOW.
      bondFlushRequestedRef.current = false;
      bondPendingRef.current = null;
      bondTimerRef.current = null;
      safeStorageSet(bondKey, bond, '[Senpai]');
      return;
    }
    bondTimerRef.current = setTimeout(() => {
      bondPendingRef.current = null;
      bondTimerRef.current = null;
      safeStorageSet(bondKey, bond, '[Senpai]');
    }, 400);
    return () => { if (bondTimerRef.current) clearTimeout(bondTimerRef.current); };
  }, [state.bond, bondKey]);

  // Flush effect: keyed [bondKey] ONLY — its cleanup synchronously writes the
  // pending bond (if any) before the next account's hydrate flips the guard,
  // so an account switch (or provider teardown) can't drop the last ≤400ms
  // of writes. pending.key is embedded, so it can never write cross-bucket.
  useEffect(() => {
    return () => {
      if (bondTimerRef.current) {
        clearTimeout(bondTimerRef.current);
        bondTimerRef.current = null;
      }
      const pending = bondPendingRef.current;
      if (pending) {
        bondPendingRef.current = null;
        safeStorageSet(pending.key, pending.value, '[Senpai]');
      }
    };
  }, [bondKey]);

  // Hydrate the per-account bond on mount and on account switch, clearing the
  // previous account's bond from memory first (F4 — no cross-account leak).
  // No legacy-key migration: the bond is a new feature, no legacy key exists.
  useEffect(() => {
    let cancelled = false;
    bondHydratedKeyRef.current = null;
    setState((s) => (s.bond === null ? s : { ...s, bond: null }));
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(bondKey);
        const loaded = hydrateBondFromRaw(raw); // corrupt → null → clean re-init
        if (cancelled) return;
        const today = todayISO();
        setState((s) => {
          // Senpai off: keep whatever was stored; init waits for setEnabled.
          if (!s.enabled) return { ...s, bond: loaded };
          // Enabled: an app open with zero events still counts as a day
          // together — touch the day counter as hydration completes. No
          // stored bond (new feature / corrupt blob) → today is the day we
          // met, exactly as if the first recordBondEvent had initialized it.
          return {
            ...s,
            bond: loaded ? applyBondEvent(loaded, { type: 'day' }, today) : initBond(today),
          };
        });
        bondHydratedKeyRef.current = bondKey;
      } catch {
        // Leave this key un-hydrated: never persist over a blob we failed
        // to read (same rule as the diary hydrate catch).
        if (!cancelled) setState((s) => (s.bond === null ? s : { ...s, bond: null }));
      }
    })();
    return () => { cancelled = true; };
  }, [bondKey, accountId]);

  // Push fresh template slots into the dialogue registry whenever the bond
  // changes, so scripted lines ("day {days} of you and me") stay current
  // without any call-site signature changes.
  useEffect(() => {
    setDialogueBondSlots(state.bond ? buildBondSlots(state.bond) : null);
  }, [state.bond]);

  // The single bond write path. Updaters are pure & idempotent (day-count
  // dedupes via lastDayCounted, milestones dedupe via natural-key id), so
  // the bridge, the chat hook, and triggerReaction can never race — React
  // functional updates serialize them. Persistence is exclusively the
  // debounced effect above, never a dispatch path (G1).
  const recordBondEvent = useCallback((e: BondEvent) => {
    // Drop events until this account's bond hydrated — writing before the
    // stored blob is loaded could fork/clobber it.
    if (bondHydratedKeyRef.current !== bondKeyRef.current) return;
    // Milestone-bearing events skip the debounce (see bondFlushRequestedRef).
    if (e.type !== 'day' && e.type !== 'chat') bondFlushRequestedRef.current = true;
    const today = todayISO();
    setState((s) => {
      if (!s.enabled) return s;
      // First event with no stored bond initializes it — today is the day
      // we met (seeding for existing users; there is no legacy key).
      const base = s.bond ?? initBond(today);
      const next = applyBondEvent(base, e, today);
      return next === s.bond ? s : { ...s, bond: next };
    });
  }, []);

  const addBondFact = useCallback((text: string): 'added' | 'duplicate' => {
    const trimmed = text.trim().slice(0, FACT_MAX_LEN);
    if (!trimmed) return 'duplicate';
    if (bondHydratedKeyRef.current !== bondKeyRef.current) return 'duplicate';
    const current = bondRef.current;
    if (current && bondHasFact(current, trimmed)) return 'duplicate';
    const today = todayISO();
    bondFlushRequestedRef.current = true; // a confirmed fact must never be lost
    setState((s) => {
      if (!s.enabled) return s;
      const base = s.bond ?? initBond(today);
      return { ...s, bond: addFactToBond(base, trimmed, today) };
    });
    return 'added';
  }, []);

  const removeBondFact = useCallback((id: string) => {
    bondFlushRequestedRef.current = true;
    setState((s) => {
      if (!s.bond) return s;
      const next = removeFactFromBond(s.bond, id);
      return next === s.bond ? s : { ...s, bond: next };
    });
  }, []);

  // Re-init to a fresh day-1 bond (MemoryScreen "Reset our story").
  const resetBond = useCallback(() => {
    if (bondHydratedKeyRef.current !== bondKeyRef.current) return;
    const today = todayISO();
    bondFlushRequestedRef.current = true;
    setState((s) => ({ ...s, bond: initBond(today) }));
  }, []);

  const setEnabled = useCallback((on: boolean) => {
    // Disabling must fully quiesce the mascot: cancel the pending auto-clear
    // timer and reset transient reaction state so nothing fires after the user
    // turns Senpai off (and a long-lived `sleeping` doesn't linger into re-enable).
    if (!on && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // H2: the first enable is "the day we met" — init the bond (only once
    // this account's bond has hydrated, so a pre-hydration enable can't
    // fork a stored bond; the first recordBondEvent inits it instead).
    // Disabling deliberately KEEPS the bond — turning her off doesn't erase
    // the relationship.
    const bondHydrated = bondHydratedKeyRef.current === bondKeyRef.current;
    const today = todayISO();
    if (on && bondHydrated && bondRef.current === null) bondFlushRequestedRef.current = true;
    setState((s) => ({
      ...s,
      enabled: on,
      transformationPlayed: on ? s.transformationPlayed : false,
      ...(on && bondHydrated && s.bond === null ? { bond: initBond(today) } : {}),
      ...(on
        ? {}
        : {
            mascotMood: 'idle' as MascotMood,
            lastReaction: null,
            reactionExpiry: 0,
            sparkleActive: false,
            activeImpact: null,
          }),
    }));
    safeStorageSet(STORAGE_KEY, String(on), '[Senpai]');
  }, []);

  const setVolume = useCallback((vol: SenpaiVolume) => {
    volumeRef.current = vol;
    setState((s) => ({ ...s, volume: vol }));
    safeStorageSet(VOLUME_KEY, vol, '[Senpai]');
  }, []);

  const setSparkleIntensity = useCallback((intensity: SparkleIntensity) => {
    setState((s) => ({ ...s, sparkleIntensity: intensity }));
    safeStorageSet(SPARKLE_KEY, intensity, '[Senpai]');
  }, []);

  const clearMemoryLog = useCallback(() => {
    // Persisted by the memory-log effect above (single writer).
    setState((s) => ({ ...s, memoryLog: [] }));
  }, []);

  const markTransformationPlayed = useCallback(() => {
    setState((s) => (s.transformationPlayed ? s : { ...s, transformationPlayed: true }));
  }, []);

  const setAmbientEffects = useCallback((on: boolean) => {
    setState((s) => ({ ...s, ambientEffects: on }));
    safeStorageSet(AMBIENT_KEY, String(on), '[Senpai]');
  }, []);

  const shouldReact = useCallback(() => {
    const v = volumeRef.current;
    if (v === 'high') return true;
    if (v === 'med') return Math.random() < 0.7;
    return Math.random() < 0.3;
  }, []);

  const triggerReaction = useCallback((mood: MascotMood, dialogue: string, durationMs: number = 3000, source: ReactionSource = 'ambient') => {
    const now = Date.now();
    const priority = MOOD_PRIORITY[mood] ?? 0;
    // A non-finite/0 duration means "terminal" — no auto-clear. Used by the
    // idle→sleep ('zzz…') so she stays asleep until the next interaction,
    // instead of flipping back to idle ~100s later and re-arming the cycle.
    const terminal = !Number.isFinite(durationMs) || durationMs <= 0;
    // Coalesce same-moment bursts: if a strictly higher-priority reaction just
    // fired, keep it instead of letting this lower one stomp it.
    if (now - lastTriggerAtRef.current < COALESCE_MS && priority < lastPriorityRef.current) {
      return;
    }
    lastTriggerAtRef.current = now;
    lastPriorityRef.current = priority;

    if (timerRef.current) clearTimeout(timerRef.current);
    // Earned celebrations (D2): only milestones may set sparkle/impact. Chat
    // and ambient reactions still swap pose + bubble but leave the full-screen
    // layers alone (preserved, not nulled — a chat reply arriving mid-PR must
    // not cancel an in-flight milestone effect).
    const isMilestone = source === 'milestone';
    const sparkle = isMilestone && (mood === 'cheering' || mood === 'impressed' || mood === 'celebrating');
    // Mood-driven impact effect — every ImpactType is reachable from a mood.
    const impactMap: Partial<Record<MascotMood, ImpactType>> = {
      impressed: 'explosion',
      celebrating: 'spiral',
      cheering: 'hearts',
      encouraging: 'flash',
    };
    const impact = isMilestone ? impactMap[mood] ?? null : null;
    const entry: MemoryEntry = { mood, dialogue, timestamp: now };
    const today = todayISO();
    // Updater stays pure (React may run it more than once); the memory log is
    // persisted by the effect on state.memoryLog, NOT here — persisting a
    // value computed inside the updater raced with batched dispatches (G1).
    setState((s) => {
      const nextLog = [...s.memoryLog, entry];
      const cappedLog = nextLog.length > MEMORY_CAP ? nextLog.slice(nextLog.length - MEMORY_CAP) : nextLog;
      // H2: every reaction while enabled is a moment witnessed — bump the
      // bond inside this same dispatch (no extra render; the debounced
      // writer absorbs the write volume). applyBondEvent also touches the
      // day counter, so any reaction on a new calendar day counts the day.
      const bond =
        s.enabled && s.bond
          ? applyBondEvent(
              { ...s.bond, reactionsWitnessed: s.bond.reactionsWitnessed + 1 },
              { type: 'day' },
              today,
            )
          : s.bond;
      return {
        ...s,
        mascotMood: mood,
        lastReaction: dialogue,
        reactionExpiry: terminal ? Number.MAX_SAFE_INTEGER : now + durationMs,
        sparkleActive: isMilestone ? sparkle : s.sparkleActive,
        memoryLog: cappedLog,
        activeImpact: isMilestone ? impact : s.activeImpact,
        bond,
      };
    });
    if (!terminal) {
      timerRef.current = setTimeout(() => {
        setState((s) => ({ ...s, mascotMood: 'idle', lastReaction: null, sparkleActive: false }));
      }, durationMs);
    }
  }, []);

  const clearImpact = useCallback(() => {
    setState((s) => (s.activeImpact === null ? s : { ...s, activeImpact: null }));
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const value = useMemo<SenpaiContextValue>(() => ({
    state,
    setEnabled,
    triggerReaction,
    setVolume,
    setSparkleIntensity,
    clearMemoryLog,
    shouldReact,
    markTransformationPlayed,
    setAmbientEffects,
    clearImpact,
    recordBondEvent,
    addBondFact,
    removeBondFact,
    resetBond,
  }), [state, setEnabled, triggerReaction, setVolume, setSparkleIntensity, clearMemoryLog, shouldReact, markTransformationPlayed, setAmbientEffects, clearImpact, recordBondEvent, addBondFact, removeBondFact, resetBond]);

  return <SenpaiContext.Provider value={value}>{children}</SenpaiContext.Provider>;
}

export function useSenpai() {
  return useContext(SenpaiContext);
}
