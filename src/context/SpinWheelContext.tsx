import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGamification } from './GamificationContext';

const STORAGE_KEY = '@zenki_spin_wheel';

/** Prize shapes returned by spinning the wheel. */
export type SpinPrize =
  | { type: 'flames'; amount: number; label: string; icon: string; confetti?: boolean; rare?: boolean }
  | { type: 'points'; amount: number; label: string; icon: string; confetti?: boolean; rare?: boolean }
  | { type: 'item';   itemKey: 'free_drink' | 'free_shirt'; label: string; icon: string; confetti?: boolean; rare?: boolean };

/**
 * The 8 wheel slices — ordered clockwise from the top.
 *  `icon`      — rendered ON the wheel (simple, recognizable)
 *  `label`     — only revealed in the result display after winning
 *  `confetti`  — triggers the confetti cannon when won
 *  `rare`      — flagged as jackpot-tier, subject to monthly cap
 *
 * Positions match the weight table in SLICE_WEIGHTS below (same index).
 */
export const WHEEL_SLICES: SpinPrize[] = [
  { type: 'points',  amount: 25,  label: '25 pts',              icon: '💎' },                         // 0
  { type: 'flames',  amount: 2,   label: '2 Flames',            icon: '🔥' },                         // 1
  { type: 'points',  amount: 100, label: '100 pts',             icon: '💎' },                         // 2
  { type: 'item',    itemKey: 'free_drink', label: 'FREE DRINK', icon: '🥤', confetti: true, rare: true }, // 3
  { type: 'points',  amount: 50,  label: '50 pts',              icon: '💎' },                         // 4
  { type: 'flames',  amount: 5,   label: '5 Flames',            icon: '🔥' },                         // 5
  { type: 'points',  amount: 500, label: 'JACKPOT — 500 pts',   icon: '👑', confetti: true, rare: true }, // 6
  { type: 'item',    itemKey: 'free_shirt', label: 'FREE SHIRT', icon: '👕', confetti: true, rare: true }, // 7
];

/**
 * Weighted probabilities per slice — sum must equal WEIGHT_TOTAL.
 * Tuned so the economy is sustainable: ~2% rare prizes combined.
 *  - 25 pts ...... 35%  (common filler — feels-good)
 *  - 2 flames .... 28%  (common)
 *  - 100 pts ..... 10%  (medium)
 *  - Free Drink ... 2%  (rare)
 *  - 50 pts ...... 18%  (medium)
 *  - 5 flames ..... 6%  (medium)
 *  - 500 pts ...... 0.9% (very rare jackpot)
 *  - Free Shirt ... 0.1% (mythic — maybe once a year per member)
 */
const SLICE_WEIGHTS = [350, 280, 100, 20, 180, 60, 9, 1];
const WEIGHT_TOTAL = SLICE_WEIGHTS.reduce((a, b) => a + b, 0); // 1000

/** Pity floor: guarantee at least one flame win within every PITY_WINDOW spins. */
const PITY_WINDOW = 5;

/**
 * Per-prize caps. Once a member hits a cap within the time window, that
 * specific slice is removed from the pool (weight zeroed) and its weight
 * is re-distributed to common prizes for that spin.
 */
interface PrizeCap {
  /** Maximum wins allowed in the time window. */
  max: number;
  /** Time window: 'week' | 'month' | 'year'. */
  window: 'week' | 'month' | 'year';
}

/** Maps slice index → cap rule. Uncapped slices are omitted. */
const SLICE_CAPS: Record<number, PrizeCap> = {
  3: { max: 1, window: 'week' },   // Free Drink — 1/week per member
  6: { max: 1, window: 'month' },  // 500 pts jackpot — 1/month
  7: { max: 1, window: 'year' },   // Free Shirt — 1/year (mythic)
};

interface SpinHistoryEntry {
  date: string;
  prize: SpinPrize;
}

interface SpinWheelState {
  lastSpinDate: string;
  freeDrinkCredits: number;
  freeShirtCredits: number;
  history: SpinHistoryEntry[];
}

interface SpinWheelContextValue extends SpinWheelState {
  hasSpunToday: boolean;
  /** Spin and return the prize and visual slice index landed on. */
  spin: () => { sliceIndex: number; prize: SpinPrize };
  consumeFreeDrink: () => boolean;
  consumeFreeShirt: () => boolean;
  /** For UI transparency — returns probability % for each slice. */
  getSliceOdds: () => number[];
}

const defaultState: SpinWheelState = {
  lastSpinDate: '',
  freeDrinkCredits: 0,
  freeShirtCredits: 0,
  history: [],
};

const SpinWheelContext = createContext<SpinWheelContextValue>({
  ...defaultState,
  hasSpunToday: false,
  spin: () => ({ sliceIndex: 0, prize: WHEEL_SLICES[0] }),
  consumeFreeDrink: () => false,
  consumeFreeShirt: () => false,
  getSliceOdds: () => SLICE_WEIGHTS.map((w) => (w / WEIGHT_TOTAL) * 100),
});

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/** Returns true if the given ISO date falls within the current window. */
function inWindow(dateISO: string, window: 'week' | 'month' | 'year'): boolean {
  const d = new Date(dateISO);
  const now = new Date();
  if (window === 'year')  return d.getFullYear() === now.getFullYear();
  if (window === 'month') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  // week: last 7 days rolling
  const diff = now.getTime() - d.getTime();
  return diff >= 0 && diff < 7 * 86400000;
}

/** Pick a slice index using the weighted distribution. */
function weightedPick(weights: number[], total: number): number {
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function SpinWheelProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SpinWheelState>(defaultState);
  const [loaded, setLoaded] = useState(false);
  const { awardPoints, awardFlames } = useGamification();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setState({ ...defaultState, ...JSON.parse(raw) }); } catch { /* ignore */ }
      }
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, loaded]);

  const hasSpunToday = state.lastSpinDate === todayISO();

  const spin = useCallback((): { sliceIndex: number; prize: SpinPrize } => {
    // 1. Pity system — guarantee a flame win if none in last PITY_WINDOW spins
    const recent = state.history.slice(0, PITY_WINDOW);
    const hasRecentFlame = recent.some((h) => h.prize.type === 'flames');
    const needPity = recent.length >= PITY_WINDOW && !hasRecentFlame;

    // 2. Per-slice caps — zero out any slice that has hit its cap within its window.
    //    e.g. Free Drink capped at 1/week, Free Shirt at 1/year.
    let effectiveWeights = [...SLICE_WEIGHTS];
    let effectiveTotal = WEIGHT_TOTAL;

    Object.entries(SLICE_CAPS).forEach(([idxStr, cap]) => {
      const idx = parseInt(idxStr, 10);
      const slice = WHEEL_SLICES[idx];
      const matchingWins = state.history.filter((h) => {
        if (!inWindow(h.date, cap.window)) return false;
        // Match by same prize identity
        if (slice.type === 'item' && h.prize.type === 'item') {
          return h.prize.itemKey === slice.itemKey;
        }
        if (slice.type === 'points' && h.prize.type === 'points') {
          return h.prize.amount === slice.amount;
        }
        if (slice.type === 'flames' && h.prize.type === 'flames') {
          return h.prize.amount === slice.amount;
        }
        return false;
      }).length;
      if (matchingWins >= cap.max) {
        effectiveTotal -= effectiveWeights[idx];
        effectiveWeights[idx] = 0;
      }
    });

    let idx: number;
    if (needPity) {
      // Force a flame slice. Pick the first flame slice by weight.
      const flameIndices = WHEEL_SLICES
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.type === 'flames')
        .map(({ i }) => i);
      // Weighted pick among flame slices only
      const flameWeights = flameIndices.map((i) => SLICE_WEIGHTS[i]);
      const flameTotal = flameWeights.reduce((a, b) => a + b, 0);
      let r = Math.random() * flameTotal;
      idx = flameIndices[0];
      for (let k = 0; k < flameIndices.length; k++) {
        r -= flameWeights[k];
        if (r <= 0) { idx = flameIndices[k]; break; }
      }
    } else {
      idx = weightedPick(effectiveWeights, effectiveTotal);
    }

    const prize = WHEEL_SLICES[idx];

    // Grant immediately
    if (prize.type === 'points') awardPoints(prize.amount);
    else if (prize.type === 'flames') awardFlames(prize.amount);
    // free_drink / free_shirt stored as credits in this context

    setState((prev) => ({
      lastSpinDate: todayISO(),
      freeDrinkCredits: prev.freeDrinkCredits + (prize.type === 'item' && prize.itemKey === 'free_drink' ? 1 : 0),
      freeShirtCredits: prev.freeShirtCredits + (prize.type === 'item' && prize.itemKey === 'free_shirt' ? 1 : 0),
      history: [{ date: todayISO(), prize }, ...prev.history].slice(0, 60),
    }));

    return { sliceIndex: idx, prize };
  }, [awardPoints, awardFlames, state.history]);

  const consumeFreeDrink = useCallback((): boolean => {
    if (state.freeDrinkCredits <= 0) return false;
    setState((prev) => ({ ...prev, freeDrinkCredits: Math.max(0, prev.freeDrinkCredits - 1) }));
    return true;
  }, [state.freeDrinkCredits]);

  const consumeFreeShirt = useCallback((): boolean => {
    if (state.freeShirtCredits <= 0) return false;
    setState((prev) => ({ ...prev, freeShirtCredits: Math.max(0, prev.freeShirtCredits - 1) }));
    return true;
  }, [state.freeShirtCredits]);

  const getSliceOdds = useCallback(
    () => SLICE_WEIGHTS.map((w) => (w / WEIGHT_TOTAL) * 100),
    [],
  );

  return (
    <SpinWheelContext.Provider
      value={{
        ...state,
        hasSpunToday,
        spin,
        consumeFreeDrink,
        consumeFreeShirt,
        getSliceOdds,
      }}
    >
      {children}
    </SpinWheelContext.Provider>
  );
}

export function useSpinWheel() {
  return useContext(SpinWheelContext);
}
