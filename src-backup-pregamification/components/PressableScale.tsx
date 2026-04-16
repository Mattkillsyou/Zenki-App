import React, { useRef, useCallback } from 'react';
import { Animated, Pressable, ViewStyle } from 'react-native';
import { duration, easing, scale as scaleTokens } from '../theme';
import { useMotion } from '../context/MotionContext';

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  /** Scale factor when pressed. Default: 0.96 */
  scaleTo?: number;
  disabled?: boolean;
}

/**
 * A Pressable wrapper that scales down subtly on press.
 * Respects Reduce Motion — skips scale animation if enabled.
 */
export function PressableScale({
  children,
  onPress,
  style,
  scaleTo = scaleTokens.pressed,
  disabled = false,
}: PressableScaleProps) {
  const { reduceMotion } = useMotion();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    if (reduceMotion) return;
    Animated.timing(scaleAnim, {
      toValue: scaleTo,
      duration: duration.instant,
      easing: easing.decelerate,
      useNativeDriver: true,
    }).start();
  }, [scaleTo, reduceMotion]);

  const handlePressOut = useCallback(() => {
    if (reduceMotion) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 200,
      useNativeDriver: true,
    }).start();
  }, [reduceMotion]);

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
