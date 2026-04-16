import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { duration, easing } from '../theme';
import { useMotion } from '../context/MotionContext';

interface AnimatedTabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  focused: boolean;
}

/**
 * Tab bar icon with a quick spring-scale bounce when selected.
 * Respects Reduce Motion — renders static icon if enabled.
 */
export function AnimatedTabIcon({ name, size, color, focused }: AnimatedTabIconProps) {
  const { reduceMotion } = useMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduceMotion) return;

    if (focused) {
      scaleAnim.setValue(0.85);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: duration.fast,
        easing: easing.decelerate,
        useNativeDriver: true,
      }).start();
    }
  }, [focused, reduceMotion]);

  if (reduceMotion) {
    return <Ionicons name={name} size={size} color={color} />;
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}
