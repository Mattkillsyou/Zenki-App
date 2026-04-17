import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity,
  Dimensions, Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSenpai, MascotMood } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { useTheme } from '../context/ThemeContext';

const { width: SW, height: SH } = Dimensions.get('window');
const POS_KEY = '@zenki_senpai_pos';

/**
 * Senpai Mode mascot — a View-based chibi anime character.
 * Floats on screen, reacts to user actions, shows speech bubbles.
 * Draggable, with idle/sleep timers.
 */
export function SenpaiMascot() {
  const { state, triggerReaction } = useSenpai();
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(false);
  const [showClose, setShowClose] = useState(false);

  // Position state — use bottom/right as base, translate for drag offset
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
      onStartShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 2 || Math.abs(gs.dy) > 2,
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
    // Reset idle timer on every reaction
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

  // Bounce animation
  const bounce = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!state.enabled) return;
    const mood = state.mascotMood;
    const bounceDist = mood === 'cheering' ? 12 : mood === 'celebrating' ? 30 : mood === 'sleeping' ? 2 : 4;
    const bounceDur = mood === 'cheering' ? 400 : mood === 'sleeping' ? 4000 : 2000;

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -bounceDist, duration: bounceDur / 2, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: bounceDur / 2, useNativeDriver: true }),
      ]),
    );
    bounceLoop.start();

    const scaleTarget = mood === 'impressed' ? 1.05 : mood === 'disappointed' ? 0.9 : 1.02;
    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: scaleTarget, duration: 1500, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ]),
    );
    breatheLoop.start();

    return () => { bounceLoop.stop(); breatheLoop.stop(); };
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
  const opacity = mood === 'sleeping' ? 0.7 : 1;

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
            { scale: breathe },
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

      {/* The chibi character */}
      <Pressable onPress={handleTap} onLongPress={handleLongPress}>
        <ChibiCharacter mood={mood} beltColor={colors.gold} />
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
    <Animated.View style={[styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border, opacity: fade, transform: [{ scale }] }]}>
      <Text style={[styles.bubbleText, { color: colors.textPrimary }]} numberOfLines={3}>
        {text}
      </Text>
      <View style={[styles.bubbleArrow, { borderTopColor: colors.surface }]} />
    </Animated.View>
  );
}

/* ─── Chibi Character (View-based) ────────────────────────────────────────── */

function ChibiCharacter({ mood, beltColor }: { mood: MascotMood; beltColor: string }) {
  const armsRaised = mood === 'cheering' || mood === 'celebrating';
  const eyeStyle = mood === 'sleeping' ? 'closed' : mood === 'impressed' ? 'stars' : 'normal';
  const mouthStyle = mood === 'cheering' || mood === 'celebrating' ? 'open'
    : mood === 'impressed' ? 'o'
    : mood === 'disappointed' ? 'sad'
    : mood === 'sleeping' ? 'sleep'
    : 'smile';

  return (
    <View style={styles.chibi}>
      {/* Arms (behind body when down, above when raised) */}
      {!armsRaised && (
        <>
          <View style={[styles.arm, styles.armLeft]} />
          <View style={[styles.arm, styles.armRight]} />
        </>
      )}

      {/* Hair back */}
      <View style={styles.hairBack} />

      {/* Head */}
      <View style={styles.head}>
        {/* Hair bangs */}
        <View style={styles.hairBangs}>
          <View style={styles.bang1} />
          <View style={styles.bang2} />
          <View style={styles.bang3} />
        </View>

        {/* Side hair */}
        <View style={[styles.sideHair, styles.sideHairLeft]} />
        <View style={[styles.sideHair, styles.sideHairRight]} />

        {/* Eyes */}
        <View style={styles.eyeRow}>
          <Eye style={eyeStyle} />
          <Eye style={eyeStyle} />
        </View>

        {/* Blush */}
        <View style={[styles.blush, styles.blushLeft]} />
        <View style={[styles.blush, styles.blushRight]} />

        {/* Mouth */}
        <Mouth style={mouthStyle} />
      </View>

      {/* Body — gi */}
      <View style={styles.body}>
        {/* V-neck notch */}
        <View style={styles.vneck} />
        {/* Belt */}
        <View style={[styles.belt, { backgroundColor: beltColor }]} />
      </View>

      {/* Arms raised */}
      {armsRaised && (
        <>
          <View style={[styles.arm, styles.armRaisedLeft]} />
          <View style={[styles.arm, styles.armRaisedRight]} />
        </>
      )}

      {/* Sleeping Zs */}
      {mood === 'sleeping' && <SleepingZs />}
    </View>
  );
}

function Eye({ style }: { style: 'normal' | 'closed' | 'stars' }) {
  if (style === 'closed') {
    return <View style={styles.eyeClosed} />;
  }
  if (style === 'stars') {
    return (
      <View style={styles.eyeStar}>
        <View style={styles.starCore} />
        <View style={[styles.starCore, { transform: [{ rotate: '45deg' }] }]} />
      </View>
    );
  }
  return (
    <View style={styles.eye}>
      <View style={styles.eyeShine} />
    </View>
  );
}

function Mouth({ style }: { style: 'smile' | 'open' | 'o' | 'sad' | 'sleep' }) {
  if (style === 'open') {
    return <View style={styles.mouthOpen} />;
  }
  if (style === 'o') {
    return <View style={styles.mouthO} />;
  }
  if (style === 'sad') {
    return <View style={styles.mouthSad} />;
  }
  if (style === 'sleep') {
    return <View style={styles.mouthSleep} />;
  }
  // smile
  return <View style={styles.mouthSmile} />;
}

function SleepingZs() {
  const z1 = useRef(new Animated.Value(0)).current;
  const z2 = useRef(new Animated.Value(0)).current;
  const z3 = useRef(new Animated.Value(0)).current;
  const f1 = useRef(new Animated.Value(1)).current;
  const f2 = useRef(new Animated.Value(1)).current;
  const f3 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = (val: Animated.Value, fade: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(val, { toValue: -30, duration: 2000, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(val, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
      ]));
    anim(z1, f1, 0).start();
    anim(z2, f2, 700).start();
    anim(z3, f3, 1400).start();
  }, []);

  return (
    <View style={styles.zzContainer}>
      <Animated.Text style={[styles.zzText, { transform: [{ translateY: z1 }], opacity: f1 }]}>Z</Animated.Text>
      <Animated.Text style={[styles.zzText, styles.zzMed, { transform: [{ translateY: z2 }], opacity: f2 }]}>Z</Animated.Text>
      <Animated.Text style={[styles.zzText, styles.zzSmall, { transform: [{ translateY: z3 }], opacity: f3 }]}>z</Animated.Text>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const SKIN = '#FFE0D0';
const HAIR = '#FF69B4';
const EYE_COLOR = '#2D1B69';
const GI_WHITE = '#F5F0EB';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99990,
    width: 80,
    alignItems: 'center',
  },

  // ── Speech bubble ──
  bubble: {
    position: 'absolute',
    bottom: 125,
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

  // ── Close button ──
  closeBtn: {
    position: 'absolute', top: -8, right: -8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  closeBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  // ── Chibi container ──
  chibi: { width: 80, height: 115, alignItems: 'center', position: 'relative' },

  // ── Hair ──
  hairBack: {
    position: 'absolute', top: 2, width: 58, height: 34,
    backgroundColor: HAIR, borderTopLeftRadius: 29, borderTopRightRadius: 29,
  },
  hairBangs: {
    position: 'absolute', top: -4, left: 4, right: 4, height: 18,
    flexDirection: 'row', justifyContent: 'center', zIndex: 5,
  },
  bang1: { width: 16, height: 18, backgroundColor: HAIR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginHorizontal: -1 },
  bang2: { width: 18, height: 20, backgroundColor: HAIR, borderBottomLeftRadius: 9, borderBottomRightRadius: 9, marginHorizontal: -1, marginTop: -2 },
  bang3: { width: 16, height: 18, backgroundColor: HAIR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8, marginHorizontal: -1 },
  sideHair: {
    position: 'absolute', top: 20, width: 10, height: 40,
    backgroundColor: HAIR, borderBottomLeftRadius: 5, borderBottomRightRadius: 5, zIndex: 1,
  },
  sideHairLeft: { left: 1 },
  sideHairRight: { right: 1 },

  // ── Head ──
  head: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: SKIN,
    marginTop: 4, zIndex: 3,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Eyes ──
  eyeRow: {
    flexDirection: 'row', gap: 10,
    marginTop: 6,
  },
  eye: {
    width: 11, height: 11, borderRadius: 5.5,
    backgroundColor: EYE_COLOR,
    position: 'relative',
  },
  eyeShine: {
    position: 'absolute', top: 2, right: 2,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#FFF',
  },
  eyeClosed: {
    width: 11, height: 2, borderRadius: 1,
    backgroundColor: EYE_COLOR,
    marginTop: 4,
  },
  eyeStar: {
    width: 12, height: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  starCore: {
    position: 'absolute',
    width: 10, height: 10, borderRadius: 1,
    backgroundColor: '#FFD700',
  },

  // ── Blush ──
  blush: {
    position: 'absolute', top: 32, width: 10, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,105,180,0.35)',
  },
  blushLeft: { left: 6 },
  blushRight: { right: 6 },

  // ── Mouth ──
  mouthSmile: {
    width: 8, height: 4, borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
    borderWidth: 1.5, borderTopWidth: 0, borderColor: '#C4846B',
    marginTop: 4,
  },
  mouthOpen: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#C4846B',
    marginTop: 3,
  },
  mouthO: {
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1.5, borderColor: '#C4846B',
    marginTop: 4,
  },
  mouthSad: {
    width: 8, height: 4, borderTopLeftRadius: 4, borderTopRightRadius: 4,
    borderWidth: 1.5, borderBottomWidth: 0, borderColor: '#C4846B',
    marginTop: 4,
  },
  mouthSleep: {
    width: 6, height: 2, borderRadius: 1,
    backgroundColor: '#C4846B',
    marginTop: 5,
  },

  // ── Body (gi) ──
  body: {
    width: 40, height: 36,
    backgroundColor: GI_WHITE,
    borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    marginTop: -2, zIndex: 2,
    alignItems: 'center',
    overflow: 'hidden',
  },
  vneck: {
    width: 12, height: 8,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
    backgroundColor: SKIN,
    marginTop: -1,
  },
  belt: {
    width: 40, height: 5,
    marginTop: 6,
  },

  // ── Arms ──
  arm: {
    position: 'absolute',
    width: 8, height: 24,
    backgroundColor: GI_WHITE,
    borderRadius: 4, zIndex: 1,
  },
  armLeft: { top: 62, left: 8 },
  armRight: { top: 62, right: 8 },
  armRaisedLeft: { top: 30, left: 4, transform: [{ rotate: '-30deg' }] },
  armRaisedRight: { top: 30, right: 4, transform: [{ rotate: '30deg' }] },

  // ── Sleeping Zs ──
  zzContainer: {
    position: 'absolute', top: -10, right: -5,
    flexDirection: 'row', gap: 3,
  },
  zzText: { fontSize: 14, fontWeight: '900', color: '#FF69B4' },
  zzMed: { fontSize: 11, marginTop: -4 },
  zzSmall: { fontSize: 9, marginTop: -2 },
});
