import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';

/**
 * Pink flash that replays every time `navKey` changes.
 * Driven from App.tsx via NavigationContainer.onStateChange so we don't rely
 * on useNavigationState inside an unstable position in the tree.
 *
 * No-op when Senpai disabled.
 */
export function SenpaiScreenFlash({ navKey }: { navKey: number }) {
  const { state } = useSenpai();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.enabled) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 0.06, duration: 75, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 75, useNativeDriver: true }),
    ]).start();
  }, [navKey, state.enabled]);

  if (!state.enabled) return null;
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: '#FF2E51', opacity, zIndex: 99980 }]}
      pointerEvents="none"
    />
  );
}
