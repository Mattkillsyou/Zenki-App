import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, PanResponder, TouchableOpacity,
  Dimensions, Pressable,
} from 'react-native';
import Svg, {
  Path, G, Defs, LinearGradient, Stop, Ellipse, Rect, Polygon, Line, Circle,
} from 'react-native-svg';
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

/* ─── Chibi Character (SVG-based anime style) ───────────────────────────── */

const HAIR_HI = '#DDF6F3';
const HAIR_LO = '#9FE0DA';
const HAIR_SHADE = '#7FCFC7';
const SKIN_TONE = '#FFE5D4';
const SKIN_SHADOW = '#F2C9B0';
const IRIS_HI = '#E9CAE8';
const IRIS_LO = '#9D7DC2';
const LASH = '#2A2240';
const LIP = '#D68799';
const GI = '#F8F4ED';
const GI_SHADOW = '#D9CFBE';

function ChibiCharacter({ mood, beltColor }: { mood: MascotMood; beltColor: string }) {
  const armsRaised = mood === 'cheering' || mood === 'celebrating';

  return (
    <View style={styles.chibi}>
      <Svg width={110} height={165} viewBox="0 0 110 165">
        <Defs>
          <LinearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={HAIR_HI} />
            <Stop offset="1" stopColor={HAIR_LO} />
          </LinearGradient>
          <LinearGradient id="iris" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={IRIS_HI} />
            <Stop offset="1" stopColor={IRIS_LO} />
          </LinearGradient>
          <LinearGradient id="giGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="1" stopColor={GI} />
          </LinearGradient>
        </Defs>

        {/* ── Back hair (short bob, flips slightly at the bottom) ── */}
        <Path d="M 18 44
                 Q 12 22 30 10
                 Q 55 2 80 10
                 Q 98 22 92 44
                 L 94 74
                 Q 92 82 84 82
                 Q 80 78 78 62
                 L 32 62
                 Q 30 78 26 82
                 Q 18 82 16 74 Z"
              fill="url(#hair)" />

        {/* ── Ahoge (little antenna strand) ── */}
        <Path d="M 52 10 Q 48 -2 54 -1 Q 55 4 54 10 Z" fill="url(#hair)" />
        <Path d="M 58 10 Q 62 1 56 2 Q 55 5 56 10 Z" fill={HAIR_SHADE} opacity="0.6" />

        {/* ── Face ── */}
        <Path d="M 31 44
                 Q 31 66 38 74
                 Q 46 82 55 82
                 Q 64 82 72 74
                 Q 79 66 79 44
                 Q 79 30 55 30
                 Q 31 30 31 44 Z"
              fill={SKIN_TONE} />

        {/* Soft jaw shadow */}
        <Path d="M 39 70 Q 55 82 71 70 Q 71 76 55 80 Q 39 76 39 70 Z" fill={SKIN_SHADOW} opacity="0.2" />

        {/* ── Bangs (wavy soft sweep across forehead) ── */}
        <Path d="M 18 46
                 Q 22 28 32 34
                 Q 42 22 50 32
                 Q 55 26 60 32
                 Q 68 22 78 34
                 Q 88 28 92 46
                 Q 82 14 55 12
                 Q 28 14 18 46 Z"
              fill="url(#hair)" />

        {/* Bang shading for depth */}
        <Path d="M 30 38 Q 42 28 48 32 Q 44 38 36 42 Z" fill={HAIR_SHADE} opacity="0.5" />
        <Path d="M 80 38 Q 68 28 62 32 Q 66 38 74 42 Z" fill={HAIR_SHADE} opacity="0.5" />

        {/* Hair highlight */}
        <Path d="M 35 22 Q 45 18 55 18 Q 50 26 42 28 Z" fill="white" opacity="0.5" />

        {/* ── Eyebrows ── */}
        {mood !== 'sleeping' && (
          <G>
            <Path d={eyebrowPath(mood, 'left')} stroke="#7F6FB8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <Path d={eyebrowPath(mood, 'right')} stroke="#7F6FB8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </G>
        )}

        {/* ── Eyes ── */}
        {renderEyes(mood)}

        {/* ── Blush ── */}
        <Ellipse cx="36" cy="63" rx="6" ry="3.2" fill="#FFA5C2" opacity="0.6" />
        <Ellipse cx="74" cy="63" rx="6" ry="3.2" fill="#FFA5C2" opacity="0.6" />

        {/* ── Nose hint ── */}
        <Path d="M 54 60 Q 55 64 56 60" stroke={SKIN_SHADOW} strokeWidth="0.8" fill="none" strokeLinecap="round" />

        {/* ── Mouth ── */}
        {renderMouth(mood)}

        {/* ── Neck ── */}
        <Rect x="48" y="80" width="14" height="8" fill={SKIN_TONE} />
        <Path d="M 48 84 Q 55 86 62 84" stroke={SKIN_SHADOW} strokeWidth="0.6" fill="none" opacity="0.5" />

        {/* ── Gi pants (back layer so belt covers the top) ── */}
        <Path d="M 24 120
                 L 28 154
                 Q 32 157 38 156
                 L 42 156
                 Q 48 155 50 150
                 L 52 122
                 L 58 122
                 L 60 150
                 Q 62 155 68 156
                 L 72 156
                 Q 78 157 82 154
                 L 86 120 Z"
              fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.6" />
        {/* Pant fold lines */}
        <Path d="M 40 124 L 36 154" stroke={GI_SHADOW} strokeWidth="0.5" fill="none" opacity="0.4" />
        <Path d="M 70 124 L 74 154" stroke={GI_SHADOW} strokeWidth="0.5" fill="none" opacity="0.4" />

        {/* ── Bare feet (traditional karate is barefoot) ── */}
        <Ellipse cx="38" cy="158" rx="8" ry="3.5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.4" />
        <Ellipse cx="72" cy="158" rx="8" ry="3.5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.4" />

        {/* ── Gi jacket (wrap-front, larger & fuller than before) ── */}
        <Path d="M 22 92
                 Q 18 108 22 122
                 L 88 122
                 Q 92 108 88 92
                 Q 70 98 55 98
                 Q 40 98 22 92 Z"
              fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.7" />

        {/* Gi inner lapel shading (crossed front) */}
        <Path d="M 34 92 L 55 114 L 76 92 L 70 92 L 55 108 L 40 92 Z" fill={GI_SHADOW} opacity="0.35" />
        {/* Lapel edge lines */}
        <Path d="M 34 92 L 55 114" stroke={GI_SHADOW} strokeWidth="0.8" fill="none" />
        <Path d="M 76 92 L 55 114" stroke={GI_SHADOW} strokeWidth="0.8" fill="none" />

        {/* V-neck showing skin */}
        <Path d="M 44 92 Q 55 102 66 92 L 55 96 Z" fill={SKIN_TONE} />

        {/* Shoulder folds */}
        <Path d="M 22 92 Q 26 98 30 102 L 32 94 Z" fill={GI_SHADOW} opacity="0.3" />
        <Path d="M 88 92 Q 84 98 80 102 L 78 94 Z" fill={GI_SHADOW} opacity="0.3" />

        {/* ── Sleeves (gi sleeves — loose, past elbow) ── */}
        {!armsRaised && (
          <G>
            {/* Left sleeve */}
            <Path d="M 22 94
                     Q 14 104 12 120
                     Q 12 126 18 126
                     Q 22 124 26 118
                     L 30 96 Z"
                  fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.6" />
            <Path d="M 12 120 L 26 120" stroke={GI_SHADOW} strokeWidth="0.6" opacity="0.5" />
            {/* Right sleeve */}
            <Path d="M 88 94
                     Q 96 104 98 120
                     Q 98 126 92 126
                     Q 88 124 84 118
                     L 80 96 Z"
                  fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.6" />
            <Path d="M 84 120 L 98 120" stroke={GI_SHADOW} strokeWidth="0.6" opacity="0.5" />
            {/* Hands */}
            <Circle cx="17" cy="128" r="4.5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.4" />
            <Circle cx="93" cy="128" r="4.5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.4" />
          </G>
        )}

        {/* ── Raised arms (cheer pose) ── */}
        {armsRaised && (
          <G>
            <Path d="M 24 96 Q 14 78 10 54 Q 9 48 14 46 Q 20 48 24 60 Q 28 78 32 98 Z" fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.6" />
            <Path d="M 86 96 Q 96 78 100 54 Q 101 48 96 46 Q 90 48 86 60 Q 82 78 78 98 Z" fill="url(#giGrad)" stroke={GI_SHADOW} strokeWidth="0.6" />
            {/* Sleeve cuffs */}
            <Path d="M 10 54 L 24 60" stroke={GI_SHADOW} strokeWidth="0.8" opacity="0.5" />
            <Path d="M 100 54 L 86 60" stroke={GI_SHADOW} strokeWidth="0.8" opacity="0.5" />
            {/* Raised fists */}
            <Circle cx="12" cy="44" r="5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.5" />
            <Circle cx="98" cy="44" r="5" fill={SKIN_TONE} stroke={SKIN_SHADOW} strokeWidth="0.5" />
          </G>
        )}

        {/* ── Belt (over the gi) ── */}
        <Rect x="20" y="117" width="70" height="6" fill={beltColor} rx="1" />
        <Rect x="20" y="117" width="70" height="1" fill="#000" opacity="0.18" />
        {/* Belt knot */}
        <Rect x="46" y="114" width="18" height="13" fill={beltColor} rx="2" />
        <Path d="M 46 114 L 64 114" stroke="#000" strokeWidth="0.5" opacity="0.25" />
        {/* Belt ends hanging down */}
        <Path d="M 48 127 L 46 140 L 52 140 L 52 127 Z" fill={beltColor} />
        <Path d="M 58 127 L 58 140 L 64 140 L 62 127 Z" fill={beltColor} />
      </Svg>

      {mood === 'sleeping' && <SleepingZs />}
    </View>
  );
}

/* ── Eye renderers ───────────────────────────────────────────────────────── */

function renderEyes(mood: MascotMood) {
  if (mood === 'sleeping') {
    return (
      <G>
        <Path d="M 30 52 Q 38 47 46 52" stroke={LASH} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d="M 64 52 Q 72 47 80 52" stroke={LASH} strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d="M 32 54 Q 38 56 44 54" stroke={LASH} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
        <Path d="M 66 54 Q 72 56 78 54" stroke={LASH} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      </G>
    );
  }
  if (mood === 'impressed') {
    return (
      <G>
        {starPoints(38, 52, 8)}
        {starPoints(72, 52, 8)}
      </G>
    );
  }
  if (mood === 'cheering' || mood === 'celebrating') {
    // Closed happy "^ ^" eyes
    return (
      <G>
        <Path d="M 32 54 Q 38 46 44 54" stroke={LASH} strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <Path d="M 66 54 Q 72 46 78 54" stroke={LASH} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </G>
    );
  }
  // Default + disappointed (disappointed drops pupils)
  const pupilY = mood === 'disappointed' ? 55 : 52;
  return (
    <G>
      {animeEye(38, pupilY)}
      {animeEye(72, pupilY)}
    </G>
  );
}

function animeEye(cx: number, cy: number) {
  return (
    <G>
      {/* Upper lash thick */}
      <Path d={`M ${cx - 8} ${cy - 5} Q ${cx} ${cy - 10} ${cx + 8} ${cy - 5}`} stroke={LASH} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* Sclera */}
      <Ellipse cx={cx} cy={cy} rx="6.5" ry="7.5" fill="white" />
      {/* Iris */}
      <Ellipse cx={cx} cy={cy + 1} rx="5.2" ry="6.5" fill="url(#iris)" />
      {/* Iris ring */}
      <Ellipse cx={cx} cy={cy + 1} rx="5.2" ry="6.5" fill="none" stroke={IRIS_LO} strokeWidth="0.5" />
      {/* Pupil */}
      <Ellipse cx={cx} cy={cy + 2} rx="1.8" ry="3" fill="#120930" />
      {/* Large highlight */}
      <Ellipse cx={cx - 2} cy={cy - 3} rx="2.2" ry="2.8" fill="white" />
      {/* Secondary highlight */}
      <Ellipse cx={cx + 2} cy={cy + 3} rx="0.9" ry="1.2" fill="white" opacity="0.85" />
      {/* Tiny shine */}
      <Circle cx={cx - 3} cy={cy - 1} r="0.5" fill="white" opacity="0.7" />
      {/* Lower lash hint */}
      <Path d={`M ${cx - 5} ${cy + 6} Q ${cx} ${cy + 8} ${cx + 5} ${cy + 6}`} stroke={LASH} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.6" />
    </G>
  );
}

function starPoints(cx: number, cy: number, size: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? size : size * 0.42;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return (
    <G>
      <Polygon points={pts.join(' ')} fill="#FFD94A" stroke="#E8A800" strokeWidth="0.8" />
      <Circle cx={cx - 1.5} cy={cy - 2} r="1.2" fill="white" opacity="0.9" />
    </G>
  );
}

/* ── Mouth renderers ─────────────────────────────────────────────────────── */

function renderMouth(mood: MascotMood) {
  if (mood === 'sleeping') {
    return <Line x1="52" y1="72" x2="58" y2="72" stroke={LIP} strokeWidth="1.2" strokeLinecap="round" />;
  }
  if (mood === 'cheering' || mood === 'celebrating') {
    return (
      <G>
        {/* Open happy mouth */}
        <Path d="M 48 69 Q 55 79 62 69 Q 58 76 55 76.5 Q 52 76 48 69 Z" fill="#8B3A4A" />
        <Path d="M 48 69 Q 55 74 62 69" stroke={LIP} strokeWidth="1" fill="none" strokeLinecap="round" />
        {/* Tongue dot */}
        <Ellipse cx="55" cy="74" rx="2" ry="1.2" fill="#FF8AA0" opacity="0.8" />
      </G>
    );
  }
  if (mood === 'disappointed') {
    return <Path d="M 49 72 Q 55 68 61 72" stroke={LIP} strokeWidth="1.5" fill="none" strokeLinecap="round" />;
  }
  if (mood === 'impressed') {
    return (
      <G>
        <Ellipse cx="55" cy="72" rx="2.5" ry="3" fill="#8B3A4A" />
        <Ellipse cx="55" cy="72" rx="2.5" ry="3" fill="none" stroke={LIP} strokeWidth="0.8" />
      </G>
    );
  }
  // default smile
  return (
    <G>
      <Path d="M 50 70 Q 55 74 60 70" stroke={LIP} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Path d="M 51 70.5 Q 55 73 59 70.5" stroke="#F89BAF" strokeWidth="0.8" fill="none" strokeLinecap="round" />
    </G>
  );
}

function eyebrowPath(mood: MascotMood, side: 'left' | 'right') {
  const cx = side === 'left' ? 38 : 72;
  if (mood === 'impressed' || mood === 'cheering' || mood === 'celebrating') {
    // Raised
    return `M ${cx - 7} 41 Q ${cx} 37 ${cx + 7} 41`;
  }
  if (mood === 'disappointed') {
    // Furrowed — inner tips up
    if (side === 'left') return `M ${cx - 7} 42 Q ${cx} 40 ${cx + 7} 44`;
    return `M ${cx - 7} 44 Q ${cx} 40 ${cx + 7} 42`;
  }
  // Default — gentle arch
  return `M ${cx - 7} 42 Q ${cx} 39 ${cx + 7} 42`;
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
    width: 110,
    alignItems: 'center',
  },

  // ── Speech bubble ──
  bubble: {
    position: 'absolute',
    bottom: 172,
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
  chibi: { width: 110, height: 165, alignItems: 'center', position: 'relative' },

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
