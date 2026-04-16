import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGamification } from './GamificationContext';

const STORAGE_KEY = '@zenki_spin_wheel';

/** Prize shapes returned by spinning the wheel. */
export type SpinPrize =
  | { type: 'flames'; amount: number; label: string }
  | { type: 'points'; amount: number; label: string }
  | { type: 'item';   itemKey: string; label: string };

/** The 8 wheel slices — ordered clockwise from the top. */
export const WHEEL_SLICES: SpinPrize[] = [
  { type: 'points',  amount: 25,  label: '25 pts'    },
  { type: 'flames',  amount: 2,   label: '2 🔥'       },
  { type: 'points',  amount: 100, label: '100 pts'   },
  { type: 'item',    itemKey: 'free_drink', label: 'Free Drink' },
  { type: 'points',  amount: 50,  label: '50 pts'    },
  { type: 'flames',  amount: 5,   label: '5 🔥'       },
  { type: 'points',  amount: 500, label: '500 pts'   },
  { type: 'flames',  amount: 10,  label: '10 🔥'      },
];

interface SpinWheelState {
  lastSpinDate: string;                  // YYYY-MM-DD
  freeDrinkCredits: number;
  history: { date: string; prize: SpinPrize }[];
}

interface SpinWheelContextValue extends SpinWheelState {
  hasSpunToday: boolean;
  spin: () => { sliceIndex: number; prize: SpinPrize };   // returns the landing slice + prize
  consumeFreeDrink: () => boolean;                         // deducts 1 if any — returns true if spent
}

const defaultState: SpinWheelState = {
  lastSpinDate: '',
  freeDrinkCredits: 0,
  history: [],
};

const SpinWheelContext = createContext<SpinWheelContextValue>({
  ...defaultState,
  hasSpunToday: false,
  spin: () => ({ sliceIndex: 0, prize: WHEEL_SLICES[0] }),
  consumeFreeDrink: () => false,
});

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
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
    // Weighted random — common prizes land more often, jackpots rarely.
    // weights aligned with WHEEL_SLICES order
    const weights = [18, 18, 15, 6, 18, 12, 3, 10]; // 500 pts and free drink are rare
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) { idx = i; break; }
    }
    const prize = WHEEL_SLICES[idx];

    // Award immediately to the user
    if (prize.type === 'points') {
      awardPoints(prize.amount);
    } else if (prize.type === 'flames') {
      awardFlames(prize.amount);
    }
    // Free drink credits are tracked locally below

    setState((prev) => ({
      lastSpinDate: todayISO(),
      freeDrinkCredits: prev.freeDrinkCredits + (prize.type === 'item' && prize.itemKey === 'free_drink' ? 1 : 0),
      history: [{ date: todayISO(), prize }, ...prev.history].slice(0, 60),
    }));

    return { sliceIndex: idx, prize };
  }, [awardPoints, awardFlames]);

  const consumeFreeDrink = useCallback((): boolean => {
    if (state.freeDrinkCredits <= 0) return false;
    setState((prev) => ({ ...prev, freeDrinkCredits: Math.max(0, prev.freeDrinkCredits - 1) }));
    return true;
  }, [state.freeDrinkCredits]);

  return (
    <SpinWheelContext.Provider value={{ ...state, hasSpunToday, spin, consumeFreeDrink }}>
      {children}
    </SpinWheelContext.Provider>
  );
}

export function useSpinWheel() {
  return useContext(SpinWheelContext);
}

