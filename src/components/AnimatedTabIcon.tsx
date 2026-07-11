import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spring } from '../theme';
import { useMotion } from '../context/MotionContext';

// The icon size prop is pinned (no 24→28 layout pop) — focus is now read as a
// scale-up instead. 1.15 ≈ the old 28/24 active-vs-inactive ratio.
const FOCUSED_SCALE = 1.15;

interface AnimatedTabIconProps {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  focused: boolean;
  senpaiActive?: boolean;
}

/**
 * Tab bar icon with a quick spring-scale bounce when selected.
 * When senpaiActive is true and the icon is focused, adds a continuous
 * gentle bounce and shows a pulsing yellow ✦ sparkle above the icon.
 */
export function AnimatedTabIcon({ name, size, color, focused, senpaiActive }: AnimatedTabIconProps) {
  const { reduceMotion } = useMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0.3)).current;

  // Focus spring: grow to FOCUSED_SCALE when selected, settle back to 1
  // otherwise. spring.press gives the tight, slightly-overshooting pop that
  // used to come from the (now-removed) size jump.
  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(scaleAnim, {
      toValue: focused ? FOCUSED_SCALE : 1,
      friction: spring.press.friction,
      tension: spring.press.tension,
      useNativeDriver: true,
    }).start();
  }, [focused, reduceMotion]);

  // Senpai-mode continuous bounce on the active tab
  useEffect(() => {
    if (reduceMotion || !senpaiActive || !focused) {
      bounceAnim.stopAnimation();
      bounceAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -1.5, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [senpaiActive, focused, reduceMotion]);

  // Senpai-mode sparkle pulse above the active tab
  useEffect(() => {
    if (reduceMotion || !senpaiActive || !focused) {
      sparkleOpacity.stopAnimation();
      sparkleOpacity.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkleOpacity, { toValue: 0.8, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sparkleOpacity, { toValue: 0.3, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [senpaiActive, focused, reduceMotion]);

  const showSparkle = senpaiActive && focused && !reduceMotion;

  if (reduceMotion) {
    return <Ionicons name={name} size={size} color={color} />;
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }, { translateY: bounceAnim }] }}>
      {showSparkle && (
        <Animated.Text
          style={{
            position: 'absolute',
            top: -10,
            left: size / 2 - 3,
            fontSize: 6,
            color: '#FFF666',
            opacity: sparkleOpacity,
            zIndex: 2,
          }}
        >
          {'\u2726'}
        </Animated.Text>
      )}
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}
