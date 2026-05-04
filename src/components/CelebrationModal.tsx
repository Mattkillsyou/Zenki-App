import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Pressable } from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Celebration } from '../types/gamification';
import { typography, spacing, borderRadius } from '../theme';

interface CelebrationModalProps {
  celebration: Celebration | null;
  onDismiss: () => void;
}

// Simple confetti dots
function ConfettiDots() {
  const dots = useRef(
    Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 500,
      color: ['#D4A017', '#C41E2A', '#E8B828', '#FF6B35', '#4CAF50', '#2196F3'][Math.floor(Math.random() * 6)],
      anim: new Animated.Value(0),
    })),
  ).current;

  useEffect(() => {
    // Capture the loop handles so we can stop them on unmount — without
    // cleanup these run forever on the native driver, accumulating across
    // every celebration shown and eventually stalling touch responsiveness
    // (suspected cause of post-spin home-screen freezes).
    const loops = dots.map((dot) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(dot.delay),
          Animated.timing(dot.anim, { toValue: 1, duration: 1500, useNativeDriver: true }),
          Animated.timing(dot.anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return loop;
    });
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [dots]);

  return (
    <>
      {dots.map((dot) => (
        <Animated.View
          key={dot.id}
          style={[
            styles.confettiDot,
            {
              left: `${dot.x}%`,
              backgroundColor: dot.color,
              opacity: dot.anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                {
                  translateY: dot.anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 400] }),
                },
                {
                  rotate: dot.anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${Math.random() * 720}deg`] }),
                },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

export function CelebrationModal({ celebration, onDismiss }: CelebrationModalProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (celebration) {
      // Reset to entry values, then animate. Without resetting, a second
      // celebration after the first dismisses would re-use the final
      // (1.0, 1.0) state and the spring would be a visual no-op.
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
      // Failsafe: if the animation gets dropped (e.g. when stacked behind
      // another Modal that's mid-dismiss), force the card visible after a
      // short window so the user is never staring at an invisible card with
      // an unresponsive backdrop.
      const failsafe = setTimeout(() => {
        scaleAnim.setValue(1);
        opacityAnim.setValue(1);
      }, 500);
      return () => clearTimeout(failsafe);
    } else {
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
    }
  }, [celebration, scaleAnim, opacityAnim]);

  if (!celebration) return null;

  const icon = celebration.type === 'level_up' ? 'arrow-up-circle' :
               celebration.type === 'streak_milestone' ? 'flame' :
               celebration.icon || 'trophy';

  const iconColor = celebration.type === 'streak_milestone' ? '#FF6B35' : colors.gold;

  return (
    // onRequestClose wires the Android back button + iOS gesture to dismiss.
    // Critical when this modal stacks on top of another (e.g. SpinWheelModal):
    // without a tappable backdrop the user could end up locked out if the
    // spring animation didn't finish rendering the AWESOME button.
    <Modal visible transparent animationType="none" onRequestClose={onDismiss}>
      <Pressable
        style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.85)' }]}
        onPress={onDismiss}
      >
        <ConfettiDots />
        {/* stopPropagation so tapping the card doesn't bubble to the backdrop */}
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View style={[styles.card, { backgroundColor: colors.surface, transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
            <Ionicons name={icon as any} size={64} color={iconColor} />
            <Text style={[styles.title, { color: colors.textPrimary }]}>{celebration.title}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{celebration.subtitle}</Text>
            {celebration.xpGained && (
              <View style={[styles.xpBadge, { backgroundColor: colors.goldMuted }]}>
                <Text style={[styles.xpText, { color: colors.gold }]}>+{celebration.xpGained} XP</Text>
              </View>
            )}
            <SoundPressable style={[styles.button, { backgroundColor: colors.gold }]} onPress={onDismiss}>
              <Text style={styles.buttonText}>AWESOME!</Text>
            </SoundPressable>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    width: '80%',
    maxWidth: 320,
    gap: spacing.sm,
    zIndex: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  xpBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  xpText: {
    fontSize: 18,
    fontWeight: '800',
  },
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  buttonText: {
    ...typography.button,
    color: '#000',
    fontWeight: '900',
  },
  confettiDot: {
    position: 'absolute',
    top: -10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
