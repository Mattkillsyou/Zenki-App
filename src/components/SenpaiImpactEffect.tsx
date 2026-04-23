import React, { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions, Easing } from 'react-native';

const { width: SW } = Dimensions.get('window');
const SH = Math.min(Dimensions.get('window').height, 932);
const CX = SW / 2;
const CY = SH / 2;

export type ImpactType = 'explosion' | 'hearts' | 'flash' | 'spiral';

interface Props {
  type: ImpactType;
  onComplete?: () => void;
}

/**
 * One-shot dramatic overlay for major events.
 * - explosion: 12 stars burst outward + central flash (700ms). PR/achievement/level up.
 * - hearts: 25 hearts fall from top with drift + rotation (2500ms). Workout complete.
 * - flash: white → pink → transparent (400ms). Quick accent.
 * - spiral: 16 sparkles converge to center + final flash (1500ms). Streak milestone.
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

/* ─── Explosion — 12 stars burst + center flash ─── */
function ExplosionEffect({ onComplete }: { onComplete?: () => void }) {
  const COLORS = ['#FF2E51', '#FFF666', '#5158FF', '#FFB3DF'];
  const particles = useMemo(() =>
    Array.from({ length: 12 }).map((_, i) => {
      const baseAngle = (i / 12) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * (Math.PI / 18);
      const distance = 120 + Math.random() * 80;
      return {
        key: i,
        dx: Math.cos(baseAngle + jitter) * distance,
        dy: Math.sin(baseAngle + jitter) * distance,
        size: 14 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
      };
    }),
  []);

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
          left: CX - 15,
          top: CY - 15,
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: '#FFFFFF',
          opacity: flashOpacity,
          transform: [{ scale: flashScale }],
        }}
      />
      {particles.map((p) => (
        <ExplosionStar key={p.key} config={p} />
      ))}
    </View>
  );
}

function ExplosionStar({ config }: { config: any }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: config.dx, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: config.dy, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: CX,
        top: CY,
        fontSize: config.size,
        color: config.color,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      {'\u2605'}
    </Animated.Text>
  );
}

/* ─── Hearts — 25 hearts fall from top with rotation ─── */
function HeartsEffect({ onComplete }: { onComplete?: () => void }) {
  const COLORS = ['#FF2E51', '#FFB3DF', '#D260FF'];
  const hearts = useMemo(() =>
    Array.from({ length: 25 }).map((_, i) => ({
      key: i,
      x: Math.random() * SW,
      glyph: i % 2 === 0 ? '\u2661' : '\u2665',
      color: COLORS[i % COLORS.length],
      size: 12 + Math.random() * 8,
      speed: 1500 + Math.random() * 1000,
      delay: Math.random() * 500,
      sway: (Math.random() - 0.5) * 40,
      spinDir: Math.random() < 0.5 ? 1 : -1,
    })),
  []);

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
  const y = useRef(new Animated.Value(-30)).current;
  const x = useRef(new Animated.Value(config.x)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: SH + 30, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.timing(x, { toValue: config.x + config.sway, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.timing(rot, { toValue: config.spinDir, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
        Animated.delay(config.speed - 500),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const rotate = rot.interpolate({ inputRange: [-1, 1], outputRange: ['-360deg', '360deg'] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        fontSize: config.size,
        color: config.color,
        opacity,
        transform: [{ translateX: x }, { translateY: y }, { rotate }],
      }}
    >
      {config.glyph}
    </Animated.Text>
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

/* ─── Spiral — 16 sparkles converge to center ─── */
function SpiralEffect({ onComplete }: { onComplete?: () => void }) {
  const COLORS = ['#FF2E51', '#5158FF', '#FFF666', '#D260FF'];
  const sparkles = useMemo(() =>
    Array.from({ length: 16 }).map((_, i) => {
      const angle = (i / 16) * Math.PI * 2;
      return {
        key: i,
        startX: Math.cos(angle) * 200,
        startY: Math.sin(angle) * 200,
        color: COLORS[i % COLORS.length],
        delay: i * 30,
      };
    }),
  []);

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
        <SpiralSparkle key={s.key} config={s} />
      ))}
      <Animated.Text
        style={{
          position: 'absolute',
          left: CX,
          top: CY,
          fontSize: 28,
          color: '#FFFFFF',
          opacity: flashOpacity,
          transform: [{ scale: flashScale }, { translateX: -14 }, { translateY: -14 }],
        }}
      >
        {'\u2605'}
      </Animated.Text>
    </View>
  );
}

function SpiralSparkle({ config }: { config: any }) {
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
          Animated.timing(translateX, { toValue: 0, duration: 800, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 800, useNativeDriver: true }),
          Animated.timing(rotation, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: CX,
        top: CY,
        fontSize: 18,
        color: config.color,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate }, { scale }],
      }}
    >
      {'\u2726'}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99988,
    overflow: 'hidden',
  },
});
