import React, { createContext, useContext, useState, useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

interface MotionContextValue {
  /** True when the user has enabled "Reduce Motion" in iOS settings */
  reduceMotion: boolean;
}

const MotionContext = createContext<MotionContextValue>({ reduceMotion: false });

/**
 * Provides system reduce-motion preference to the entire app.
 * Components can check `reduceMotion` to skip or simplify animations.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    // Check initial value
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

    // Subscribe to changes
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => subscription.remove();
  }, []);

  return (
    <MotionContext.Provider value={{ reduceMotion }}>
      {children}
    </MotionContext.Provider>
  );
}

export function useMotion() {
  return useContext(MotionContext);
}
