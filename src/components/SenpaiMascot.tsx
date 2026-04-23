import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity,
  Dimensions, Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSenpai, MascotMood } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { useTheme } from '../context/ThemeContext';

const { width: SW, height: SH } = Dimensions.get('window');
const POS_KEY = '@zenki_senpai_pos';
const MASCOT_SIZE = 140;

/* ─── Animation asset map ────────────────────────────────────────────────── */

const ANIM_ASSETS: Record<string, any> = {
  idle: require('../assets/senpai/senpai_idle.webp'),
  cheering: require('../assets/senpai/senpai_cheering.webp'),
  impressed: require('../assets/senpai/senpai_impressed.webp'),
  encouraging: require('../assets/senpai/senpai_encouraging.webp'),
  celebrating: require('../assets/senpai/senpai_celebrating.webp'),
  sleeping: require('../assets/senpai/senpai_sleep.webp'),
  disappointed: require('../assets/senpai/senpai_cry.webp'),
  // Extra animations available:
  // dance: require('../assets/senpai/senpai_dance.webp'),
  // die: require('../assets/senpai/senpai_die.webp'),
  // think: require('../assets/senpai/senpai_think.webp'),
  // wave: require('../assets/senpai/senpai_wave.webp'),
};

/**
 * Senpai Mode mascot — animated chibi character using Ziggle WebP animations.
 * Floats on screen, reacts to user actions, shows speech bubbles.
 * Draggable, with idle/sleep timers.
 */
export function SenpaiMascot() {
  const { state, triggerReaction } = useSenpai();
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(false);
  const [showClose, setShowClose] = useState(false);

  // Position state
  const [basePos, setBasePos] = useState({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      if (raw) {
        try {
          const { x, y } = JSON.parse(raw);
          setBasePos({ x, y });
        } catch {}
      }
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      // Capture variant lets the parent View steal the touch from the inner
      // Pressable once movement crosses the threshold — so taps still work,
      // but a drag gesture actually gets the responder.
      onMoveShouldSetPanResponderCapture: (_, gs) => Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const x = (pan.x as any)._value;
        const y = (pan.y as any)._value;
        setBasePos({ x, y });
        pan.setValue({ x: 0, y: 0 });
        AsyncStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
      },
    }),
  ).current;

  // Idle timer
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.enabled) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);

    if (state.mascotMood !== 'idle' && state.mascotMood !== 'sleeping') {
      idleTimerRef.current = setTimeout(() => {
        triggerReaction('idle', randomDialogue('idle'), 5000);
        sleepTimerRef.current = setTimeout(() => {
          triggerReaction('sleeping', 'zzz...', 99999);
        }, 60000);
      }, 45000);
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [state.mascotMood, state.enabled]);

  // Subtle bounce for the whole mascot (supplements the built-in animation)
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.enabled) return;
    const mood = state.mascotMood;
    const bounceDist = mood === 'sleeping' ? 1.5 : mood === 'cheering' || mood === 'celebrating' ? 3 : 2;
    const bounceDur = mood === 'sleeping' ? 4000 : mood === 'cheering' ? 600 : 2500;

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -bounceDist, duration: bounceDur / 2, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: bounceDur / 2, useNativeDriver: true }),
      ]),
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, [state.mascotMood, state.enabled]);

  const handleTap = () => {
    triggerReaction('cheering', randomDialogue('mascotTap'), 2500);
  };

  const handleLongPress = () => {
    setShowClose(true);
    setTimeout(() => setShowClose(false), 4000);
  };

  if (!state.enabled || hidden) return null;

  const mood = state.mascotMood;
  const opacity = mood === 'sleeping' ? 0.85 : 1;
  const animSource = ANIM_ASSETS[mood] ?? ANIM_ASSETS.idle;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: 110 - basePos.y,
          right: 16 - basePos.x,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { translateY: bounce },
          ],
          opacity,
        },
      ]}
      {...panResponder.panHandlers}
    >
      {/* Speech bubble */}
      {state.lastReaction && (
        <SpeechBubble text={state.lastReaction} colors={colors} />
      )}

      {/* Animated mascot */}
      <Pressable onPress={handleTap} onLongPress={handleLongPress}>
        <Image
          source={animSource}
          style={styles.mascotImage}
          contentFit="contain"
          autoplay
          cachePolicy="memory-disk"
        />
      </Pressable>

      {/* Close button (on long press) */}
      {showClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={() => setHidden(true)}>
          <Text style={styles.closeBtnText}>x</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/* ─── Speech Bubble ──────────────────────────────────────────────────────── */

function SpeechBubble({ text, colors }: { text: string; colors: any }) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [text]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: fade,
          transform: [{ scale }],
        },
      ]}
    >
      <Text style={[styles.bubbleText, { color: colors.textPrimary }]} numberOfLines={3}>
        {text}
      </Text>
      <View style={[styles.bubbleArrow, { borderTopColor: colors.surface }]} />
    </Animated.View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99990,
    width: MASCOT_SIZE,
    alignItems: 'center',
  },

  mascotImage: {
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
  },

  // Speech bubble
  bubble: {
    position: 'absolute',
    bottom: MASCOT_SIZE + 8,
    right: -10,
    maxWidth: 180,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 10,
  },
  bubbleText: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  bubbleArrow: {
    position: 'absolute',
    bottom: -6,
    right: 20,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // Close button
  closeBtn: {
    position: 'absolute', top: -8, right: -8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  closeBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
