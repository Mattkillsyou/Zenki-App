import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';

const { width: SW } = Dimensions.get('window');
const SH = Math.min(Dimensions.get('window').height, 932);

const STAR_GLYPH = '\u2605';       // ★
const GLINT_GLYPH = '\u2726';      // ✦
const MOON_GLYPH = '\u263D';       // ☽ (spec: waxing crescent)
const HEART_GLYPH = '\u2661';      // ♡

const AMBIENT_COLORS = ['#FFB3DF', '#5158FF', '#FFF666'];
const CONFETTI_COLORS = ['#FF2E51', '#FFB3DF', '#5158FF', '#FFF666', '#D260FF', '#FFFFFF'];

/**
 * SenpaiOverlay — layered magical-girl effects.
 * - Ambient layer: subtle stars/moons/shooting-stars when enabled + ambientEffects on.
 * - Reaction layer: hearts/kaomoji/sparkles/starburst/confetti during sparkleActive.
 */
export function SenpaiOverlay() {
  const { state } = useSenpai();
  if (!state.enabled) return null;

  const max = state.sparkleIntensity === 'maximum';
  const mood = state.mascotMood;

  return (
    <View style={styles.container} pointerEvents="none">
      {state.ambientEffects && (
        <>
          <AmbientStars max={max} />
          <AmbientMoons max={max} />
          <ShootingStarEmitter max={max} />
        </>
      )}
      {state.sparkleActive && (
        <>
          <FloatingHearts max={max} />
          <FloatingKaomoji max={max} />
          <SparkleParticles max={max} />
          <StarburstRing trigger={state.reactionExpiry} />
          {mood === 'celebrating' && <ConfettiBurst max={max} />}
        </>
      )}
    </View>
  );
}

const speedMult = (max: boolean) => (max ? 0.7 : 1);

/* ═══ AMBIENT LAYER ═══════════════════════════════════════════════════════ */

function AmbientStars({ max }: { max: boolean }) {
  const count = max ? 30 : 15;
  const stars = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      glyph: i % 2 === 0 ? STAR_GLYPH : GLINT_GLYPH,
      color: AMBIENT_COLORS[i % AMBIENT_COLORS.length],
      x: Math.random() * SW,
      startY: Math.random() * SH,
      size: 6 + Math.random() * 6,
      twinkleMs: 4000 + Math.random() * 4000,
      driftMs: 22000 + Math.random() * 12000,
      delay: Math.random() * 4000,
    })),
  [count]);

  return (
    <>
      {stars.map((s) => (
        <AmbientStarItem key={s.key} config={s} />
      ))}
    </>
  );
}

function AmbientStarItem({ config }: { config: any }) {
  const opacity = useRef(new Animated.Value(0.03)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const twinkle = () => {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.12, duration: config.twinkleMs * 0.5, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.03, duration: config.twinkleMs * 0.5, useNativeDriver: true }),
      ]).start(() => twinkle());
    };
    const doDrift = () => {
      drift.setValue(0);
      Animated.timing(drift, { toValue: 1, duration: config.driftMs, useNativeDriver: true }).start(() => doDrift());
    };
    const t = setTimeout(() => { twinkle(); doDrift(); }, config.delay);
    return () => clearTimeout(t);
  }, []);

  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: config.x,
        top: config.startY,
        fontSize: config.size,
        color: config.color,
        opacity,
        transform: [{ translateY }],
      }}
    >
      {config.glyph}
    </Animated.Text>
  );
}

function AmbientMoons({ max }: { max: boolean }) {
  const count = max ? 10 : 5;
  const moons = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: Math.random() * (SW - 20),
      y: 30 + Math.random() * (SH - 80),
      size: 10 + Math.random() * 4,
      driftMs: 30000 + Math.random() * 20000,
      delay: Math.random() * 5000,
    })),
  [count]);

  return (
    <>
      {moons.map((m) => (
        <AmbientMoonItem key={m.key} config={m} />
      ))}
    </>
  );
}

function AmbientMoonItem({ config }: { config: any }) {
  const drift = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 0.06, duration: 2000, useNativeDriver: true }).start();
    const doDrift = () => {
      drift.setValue(0);
      Animated.timing(drift, { toValue: 1, duration: config.driftMs, useNativeDriver: true }).start(() => doDrift());
    };
    const t = setTimeout(doDrift, config.delay);
    return () => clearTimeout(t);
  }, []);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        fontSize: config.size,
        color: '#FFB3DF',
        opacity,
        transform: [{ translateX }],
      }}
    >
      {MOON_GLYPH}
    </Animated.Text>
  );
}

function ShootingStarEmitter({ max }: { max: boolean }) {
  const [shootKey, setShootKey] = useState(0);

  useEffect(() => {
    const minWait = max ? 8000 : 15000;
    const maxWait = max ? 15000 : 30000;
    const wait = minWait + Math.random() * (maxWait - minWait);
    const t = setTimeout(() => setShootKey((k) => k + 1), wait);
    return () => clearTimeout(t);
  }, [shootKey, max]);

  return <ShootingStar key={shootKey} />;
}

function ShootingStar() {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const startX = useMemo(() => -40 + Math.random() * (SW * 0.3), []);
  const startY = useMemo(() => 20 + Math.random() * (SH * 0.2), []);
  const endX = startX + SW * 0.7;
  const endY = startY + 60;

  useEffect(() => {
    translateX.setValue(startX);
    translateY.setValue(startY);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateX, { toValue: endX, duration: 800, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: endY, duration: 800, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 150, useNativeDriver: true }),
        Animated.delay(400),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0, top: 0,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: -i * 8,
            top: i * 1.5,
            width: 5 - i,
            height: 5 - i,
            borderRadius: 3,
            backgroundColor: '#FFFFFF',
            opacity: 1 - i * 0.3,
          }}
        />
      ))}
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFFFFF' }} />
    </Animated.View>
  );
}

/* ═══ REACTION LAYER ══════════════════════════════════════════════════════ */

function FloatingHearts({ max }: { max: boolean }) {
  const count = max ? 24 : 12;
  const mult = speedMult(max);
  const hearts = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: 50 + Math.random() * (SW - 100),
      size: 12 + Math.random() * 10,
      speed: (1500 + Math.random() * 1500) * mult,
      delay: Math.random() * 1000,
      drift: (Math.random() - 0.5) * 40,
    })),
  [count, mult]);

  return (
    <>
      {hearts.map((h) => (
        <FloatingHeart key={h.key} config={h} />
      ))}
    </>
  );
}

function FloatingHeart({ config }: { config: any }) {
  const y = useRef(new Animated.Value(SH - 200)).current;
  const x = useRef(new Animated.Value(config.x)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      y.setValue(SH - 200);
      x.setValue(config.x);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(y, { toValue: SH - 500, duration: config.speed, useNativeDriver: true }),
        Animated.timing(x, { toValue: config.x + config.drift, duration: config.speed, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.8, duration: 300, useNativeDriver: true }),
          Animated.delay(Math.max(100, config.speed - 700)),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => animate());
    };
    const t = setTimeout(animate, config.delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        fontSize: config.size,
        color: '#FF69B4',
        opacity,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    >
      {HEART_GLYPH}
    </Animated.Text>
  );
}

function FloatingKaomoji({ max }: { max: boolean }) {
  const emotes = max
    ? ['\u2605', '\u2661', '\u2727', '!', '\u266A', '\u2606', '\u2764', '\u2728', '\u273F', '\u269B']
    : ['\u2605', '\u2661', '\u2727', '!', '\u266A', '\u2606', '\u2764'];
  const count = max ? 16 : 8;
  const mult = speedMult(max);
  const items = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      text: emotes[i % emotes.length],
      x: 30 + Math.random() * (SW - 60),
      speed: (1200 + Math.random() * 800) * mult,
      delay: Math.random() * 2000,
    })),
  [count, mult]);

  return (
    <>
      {items.map((item) => (
        <FloatingEmote key={item.key} config={item} />
      ))}
    </>
  );
}

function FloatingEmote({ config }: { config: any }) {
  const y = useRef(new Animated.Value(SH - 180)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      y.setValue(SH - 180);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(y, { toValue: SH - 400, duration: config.speed, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
          Animated.delay(Math.max(100, config.speed - 500)),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start(() => animate());
    };
    const t = setTimeout(animate, config.delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: config.x,
        fontSize: 16,
        color: '#FFD700',
        opacity,
        transform: [{ translateY: y }],
      }}
    >
      {config.text}
    </Animated.Text>
  );
}

function SparkleParticles({ max }: { max: boolean }) {
  const count = max ? 20 : 10;
  const mult = speedMult(max);
  const sparkles = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: 40 + Math.random() * (SW - 80),
      y: SH * 0.4 + Math.random() * (SH * 0.4),
      size: 6 + Math.random() * 6,
      speed: (600 + Math.random() * 600) * mult,
      delay: Math.random() * 1500,
    })),
  [count, mult]);

  return (
    <>
      {sparkles.map((s) => (
        <Sparkle key={s.key} config={s} />
      ))}
    </>
  );
}

function Sparkle({ config }: { config: any }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      scale.setValue(0);
      opacity.setValue(0);
      rotation.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.2, duration: config.speed * 0.3, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0, duration: config.speed * 0.7, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.9, duration: config.speed * 0.2, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.8, useNativeDriver: true }),
        ]),
        Animated.timing(rotation, { toValue: 1, duration: config.speed, useNativeDriver: true }),
      ]).start(() => {
        setTimeout(animate, 500 + Math.random() * 1500);
      });
    };
    const t = setTimeout(animate, config.delay);
    return () => clearTimeout(t);
  }, []);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        width: config.size,
        height: config.size,
        opacity,
        transform: [{ scale }, { rotate: spin }],
      }}
    >
      <View style={{
        position: 'absolute', width: '100%', height: '100%',
        backgroundColor: '#FFD700', borderRadius: 1,
      }} />
      <View style={{
        position: 'absolute', width: '100%', height: '100%',
        backgroundColor: '#FFD700', borderRadius: 1,
        transform: [{ rotate: '45deg' }],
      }} />
    </Animated.View>
  );
}

/* One-shot 8-star burst from bottom-right (mascot area) — replays each reaction */
function StarburstRing({ trigger }: { trigger: number }) {
  const CENTER_X = SW - 60;
  const CENTER_Y = SH - 140;
  const stars = useMemo(() =>
    Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const distance = 70 + Math.random() * 40;
      return {
        key: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        size: 12 + Math.random() * 6,
        color: ['#FF2E51', '#FFF666', '#5158FF', '#FFB3DF'][i % 4],
      };
    }),
  [trigger]);

  return (
    <>
      {stars.map((s) => (
        <StarburstStar key={s.key} config={s} center={{ x: CENTER_X, y: CENTER_Y }} />
      ))}
    </>
  );
}

function StarburstStar({ config, center }: { config: any; center: { x: number; y: number } }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    translateX.setValue(0);
    translateY.setValue(0);
    opacity.setValue(0.9);
    Animated.parallel([
      Animated.timing(translateX, { toValue: config.dx, duration: 600, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: config.dy, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: center.x,
        top: center.y,
        fontSize: config.size,
        color: config.color,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      {STAR_GLYPH}
    </Animated.Text>
  );
}

/* Celebrating-mood confetti: ~30 small rectangles falling from top for 2s */
function ConfettiBurst({ max }: { max: boolean }) {
  const count = max ? 60 : 30;
  const pieces = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: Math.random() * SW,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 4,
      speed: 1500 + Math.random() * 500,
      delay: Math.random() * 500,
      sway: (Math.random() - 0.5) * 40,
      spinDir: Math.random() < 0.5 ? 1 : -1,
    })),
  [count]);

  return (
    <>
      {pieces.map((p) => <ConfettiPiece key={p.key} config={p} />)}
    </>
  );
}

function ConfettiPiece({ config }: { config: any }) {
  const y = useRef(new Animated.Value(-20)).current;
  const x = useRef(new Animated.Value(config.x)).current;
  const rot = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(y, { toValue: SH + 20, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.timing(x, { toValue: config.x + config.sway, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.timing(rot, { toValue: config.spinDir * 3, duration: config.speed, delay: config.delay, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(config.delay),
        Animated.timing(opacity, { toValue: 0.9, duration: 150, useNativeDriver: true }),
        Animated.delay(config.speed - 500),
        Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const rotate = rot.interpolate({ inputRange: [-3, 3], outputRange: ['-1080deg', '1080deg'] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: config.size,
        height: config.size * 2,
        backgroundColor: config.color,
        borderRadius: 1,
        opacity,
        transform: [{ translateX: x }, { translateY: y }, { rotate }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99989,
    overflow: 'hidden',
  },
});
