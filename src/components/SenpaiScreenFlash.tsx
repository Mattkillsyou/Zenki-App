import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';

/**
 * Pink flash that replays every time `navKey` changes.
 * Driven from App.tsx via NavigationContainer.onStateChange so we don't rely
 * on useNavigationState inside an unstable position in the tree.
 *
 * No-op when Senpai disabled, ambient effects off, or system Reduce Motion is
 * on (D5 — a full-screen flash is exactly what that setting asks us to skip).
 */
export function SenpaiScreenFlash({ navKey }: { navKey: number }) {
  const { state } = useSenpai();
  const { reduceMotion } = useMotion();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.enabled || !state.ambientEffects || reduceMotion) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.06, duration: 75, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 75, useNativeDriver: true }),
    ]).start();
  }, [navKey, state.enabled, state.ambientEffects, reduceMotion]);

  if (!state.enabled || !state.ambientEffects || reduceMotion) return null;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#FF2E51', opacity, zIndex: 99980 }]}
      pointerEvents="none"
    />
  );
}
