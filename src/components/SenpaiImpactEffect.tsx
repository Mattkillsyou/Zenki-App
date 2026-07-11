import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { getSenpaiCornerInfo, effectScaleFor } from './senpaiCornerStore';

export type ImpactType = 'explosion' | 'hearts' | 'flash' | 'spiral';

interface Props {
  type: ImpactType;
  onComplete?: () => void;
}

/* ═══ SVG GLOW PARTICLES ═══
   Same rationale as SenpaiOverlay.tsx: the old Animated.Text glyphs couldn't
   glow on native (textShadow silently drops), so particles are tiny Svg
   shapes filled with a RadialGradient (bright core → transparent edge). The
   Svg mounts once and never re-renders per frame — all motion lives on the
   wrapping Animated.View (transform/opacity, native driver). Duplicated
   rather than shared: the two effect layers stay self-contained on purpose. */

type GlowShapeKind = 'star' | 'heart' | 'dot';

// Concave 4-point sparkle star (24×24 box).
const STAR4_D = 'M12 0C13.2 7.4 16.6 10.8 24 12C16.6 13.2 13.2 16.6 12 24C10.8 16.6 7.4 13.2 0 12C7.4 10.8 10.8 7.4 12 0Z';
// Filled heart (24×24 box).
const HEART_D = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function GlowShape({ kind, size, color, id }: { kind: GlowShapeKind; size: number; color: string; id: string }) {
  // ids are unique per instance: react-native-svg scopes <Defs> per <Svg> on
  // native, but unique ids keep us safe on any renderer that hoists defs.
  const fill = `url(#${id})`;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <Stop offset="45%" stopColor={color} stopOpacity="0.95" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      {kind === 'dot'
        ? <Circle cx="12" cy="12" r="12" fill={fill} />
        : <Path d={kind === 'star' ? STAR4_D : HEART_D} fill={fill} />}
    </Svg>
  );
}

// Pre-sampled sine for the hearts' x-sway — the wave shape lives in the
// interpolate node while the driving timing stays linear (SenpaiFlipbook.tsx
// header has the 120Hz note on why stepping/shaping belongs in interpolate).
const SWAY_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const swayOutput = (amp: number, phase: number) =>
  SWAY_STOPS.map((t) => Math.sin((t + phase) * Math.PI * 2) * amp);

/**
 * One-shot dramatic overlay for major events.
 * - explosion: 12 stars burst outward + central flash (700ms). PR/achievement/level up.
 * - hearts: 25 hearts fall from top with drift + rotation (2500ms). Workout complete.
 * - flash: white → pink → transparent (400ms). Quick accent.
 * - spiral: 16 sparkles converge to center + final flash (1500ms). Streak milestone.
 *
 * Geometry (D3/H5): positions use REAL window dims via useWindowDimensions
 * (the old module-level `Math.min(height, 932)` clamp landed everything in the
 * top ~70% of an iPad); burst radii scale through effectScaleFor (clamped
 * ×1–1.35 for 1024-1366pt widths). The explosion and spiral erupt from the
 * mascot's ACTUAL dock corner (senpaiCornerStore) instead of screen center —
 * the celebration is HERS. Reduce Motion is handled upstream: SenpaiImpactBridge
 * never mounts this component when it's on (D5).
 */
export function SenpaiImpactEffect({ type, onComplete }: Props) {
  switch (type) {
    case 'explosion': return <ExplosionEffect onComplete={onComplete} />;
    case 'hearts':    return <HeartsEffect onComplete={onComplete} />;
    case 'flash':     return <FlashEffect onComplete={onComplete} />;
    case 'spiral':    return <SpiralEffect onComplete={onComplete} />;
    default:          return null;
  }
}

/* ─── Explosion — 12 stars burst + center flash, from her corner ─── */
function ExplosionEffect({ onComplete }: { onComplete?: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const scale = effectScaleFor(sw, sh);
  // Read once at mount — the bridge remounts this per impact, so it always
  // bursts from the corner she's docked in when the milestone fires.
  const center = useMemo(() => getSenpaiCornerInfo().center, []);
  const COLORS = ['#FF2E51', '#FFF666', '#5158FF', '#FFB3DF'];
  const particles = useMemo(() =>
    Array.from({ length: 12 }).map((_, i) => {
      const baseAngle = (i / 12) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * (Math.PI / 18);
      const distance = (120 + Math.random() * 80) * scale;
      return {
        key: i,
        dx: Math.cos(baseAngle + jitter) * distance,
        dy: Math.sin(baseAngle + jitter) * distance,
        // ~×1.3 vs the old glyph sizes — the gradient edge is transparent, so
        // the perceived footprint shrinks; this keeps the old visual weight.
        size: 18 + Math.random() * 10,
        color: COLORS[i % COLORS.length],
        // per-star duration/delay scatter — 12 identical 500ms flings read as
        // one mechanical unit. Stays inside the 700ms onComplete window.
        dur: 440 + Math.random() * 160,
        delay: Math.random() * 90,
      };
    }),
  [scale]);

  const flashScale = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(flashScale, { toValue: 2, duration: 200, useNativeDriver: true }),
        Animated.timing(flashOpacity, { toValue: 0.7, duration: 150, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(flashScale, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(flashOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
    const t = setTimeout(() => { try { onComplete?.(); } catch {} }, 700);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={{
          position: 'absolute',
          left: center.x - 22,
          top: center.y - 22,
          opacity: flashOpacity,
          transform: [{ scale: flashScale }],
        }}
      >
        {/* radial-gradient bloom — the flat #FFF circle had no falloff */}
        <GlowShape kind="dot" size={44} color="#FFFFFF" id="expl-flash" />
      </Animated.View>
      {particles.map((p) => (
        <ExplosionStar key={p.key} config={p} center={center} />
      ))}
    </View>
  );
}

function ExplosionStar({ config, center }: { config: any; center: { x: number; y: number } }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(config.delay),
      Animated.parallel([
        Animated.timing(translateX, { toValue: config.dx, duration: config.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: config.dy, duration: config.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          // hold bright through the throw, fade on the tail
          Animated.delay(config.dur * 0.35),
          Animated.timing(opacity, { toValue: 0, duration: config.dur * 0.65, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: center.x - config.size / 2,
        top: center.y - config.size / 2,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <GlowShape kind="star" size={config.size} color={config.color} id={`ex-${config.key}`} />
    </Animated.View>
  );
}

/* ─── Hearts — 25 hearts fall from top with rotation, full window ─── */
function HeartsEffect({ onComplete }: { onComplete?: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const COLORS = ['#FF2E51', '#FFB3DF', '#D260FF'];
  const hearts = useMemo(() =>
    Array.from({ length: 25 }).map((_, i) => ({
      key: i,
      sh,
      x: Math.random() * sw,
      color: COLORS[i % COLORS.length],
      // ~×1.3 vs the old glyph sizes (transparent gradient edge)
      size: 16 + Math.random() * 10,
      speed: 1500 + Math.random() * 1000,
      delay: Math.random() * 500,
      // sinusoidal x-sway (replaces the old one-way linear drift): amplitude
      // + phase baked into the interpolate output, no per-frame JS work.
      swayOut: swayOutput(10 + Math.random() * 12, i / 25),
      spinDir: Math.random() < 0.5 ? 1 : -1,
    })),
  [sw, sh]);

  useEffect(() => {
    const t = setTimeout(() => { try { onComplete?.(); } catch {} }, 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {hearts.map((h) => (
        <HeartFaller key={h.key} config={h} />
      ))}
    </View>
  );
}

function HeartFaller({ config }: { config: any }) {
  const fall = useRef(new Animated.Value(0)).current;
  const swayT = useRef(new Animated.Value(0)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Gentle gravity — sin ease-in accelerates the fall without bombing;
      // these are hearts fluttering down, not confetti. Sway driver stays
      // linear: the sine shape lives in the interpolate below (120Hz note).
      Animated.timing(fall, { toValue: 1, duration: config.speed, delay: config.delay, easing: Easing.in(Easing.sin), useNativeDriver: true }),
      Animated.timing(swayT, { toValue: 1, duration: config.speed, delay: config.delay, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(rot, { toValue: config.spinDir, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
        Animated.delay(config.speed - 500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const translateY = fall.interpolate({ inputRange: [0, 1], outputRange: [-30, config.sh + 30] });
  const translateX = swayT.interpolate({ inputRange: SWAY_STOPS, outputRange: config.swayOut });
  const rotate = rot.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    >
      <GlowShape kind="heart" size={config.size} color={config.color} id={`ih-${config.key}`} />
    </Animated.View>
  );
}

/* ─── Flash — white → pink → transparent ─── */
function FlashEffect({ onComplete }: { onComplete?: () => void }) {
  const whiteOp = useRef(new Animated.Value(0)).current;
  const pinkOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(whiteOp, { toValue: 0.7, duration: 100, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(whiteOp, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(pinkOp, { toValue: 0.4, duration: 100, useNativeDriver: true }),
      ]),
      Animated.timing(pinkOp, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => { try { onComplete?.(); } catch {} }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', opacity: whiteOp }]} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#FF2E51', opacity: pinkOp }]} />
    </View>
  );
}

/* ─── Spiral — 16 sparkles converge on her corner ─── */
function SpiralEffect({ onComplete }: { onComplete?: () => void }) {
  const { width: sw, height: sh } = useWindowDimensions();
  const scale = effectScaleFor(sw, sh);
  const center = useMemo(() => getSenpaiCornerInfo().center, []);
  const COLORS = ['#FF2E51', '#5158FF', '#FFF666', '#D260FF'];
  const sparkles = useMemo(() =>
    Array.from({ length: 16 }).map((_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return {
        key: i,
        startX: Math.cos(angle) * 200 * scale,
        startY: Math.sin(angle) * 200 * scale,
        color: COLORS[i % COLORS.length],
        // i*30 alone made a perfectly even clock sweep; the deterministic
        // (i*13)%4 jitter breaks the mechanical cadence. Max delay is 495ms,
        // so the last sparkle's 1000ms opacity run still beats the 1500ms
        // onComplete unmount.
        delay: i * 30 + ((i * 13) % 4) * 15,
      };
    }),
  [scale]);

  const flashScale = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(1100),
      Animated.parallel([
        Animated.timing(flashScale, { toValue: 2, duration: 150, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 1, duration: 100, useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
    const t = setTimeout(() => { try { onComplete?.(); } catch {} }, 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {sparkles.map((s) => (
        <SpiralSparkle key={s.key} config={s} center={center} />
      ))}
      <Animated.View
        style={{
          position: 'absolute',
          left: center.x - 19,
          top: center.y - 19,
          opacity: flashOpacity,
          transform: [{ scale: flashScale }],
        }}
      >
        {/* the convergence payoff — a white glow star bloom at her corner */}
        <GlowShape kind="star" size={38} color="#FFFFFF" id="spiral-flash" />
      </Animated.View>
    </View>
  );
}

function SpiralSparkle({ config, center }: { config: any; center: { x: number; y: number } }) {
  const translateX = useRef(new Animated.Value(config.startX)).current;
  const translateY = useRef(new Animated.Value(config.startY)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, { toValue: 0.8, duration: 100, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.parallel([
          // accelerating convergence — sparkles get sucked INTO her corner;
          // the old linear glide had no pull.
          Animated.timing(translateX, { toValue: 0, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.timing(rotation, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.3, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: center.x - 12,
        top: center.y - 12,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate }, { scale }],
      }}
    >
      <GlowShape kind="star" size={24} color={config.color} id={`sw-${config.key}`} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99988,
    overflow: 'hidden',
  },
});
