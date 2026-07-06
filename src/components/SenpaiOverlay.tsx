import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';
import { getSenpaiCornerInfo } from './senpaiCornerStore';

const STAR_GLYPH = '\u2605';       // ★
const GLINT_GLYPH = '\u2726';      // ✦
const MOON_GLYPH = '\u263D';       // ☽ (spec: waxing crescent)
const HEART_GLYPH = '\u2661';      // ♡

const CONFETTI_COLORS = ['#FF2E51', '#FFB3DF', '#5158FF', '#FFF666', '#D260FF', '#FFFFFF'];

// H5: time-aware ambient palette — her magic dust (glow/aura layer ONLY, the
// app theme is untouched) takes a subtle tint by time of day. 'day' is the
// classic set that used to be the hardcoded AMBIENT_COLORS.
const AMBIENT_PALETTES = {
  morning: ['#FFD9A8', '#FFB3DF', '#FFF6B8'], // sunrise gold / peach
  day:     ['#FFB3DF', '#5158FF', '#FFF666'], // the classic set
  evening: ['#FFB37E', '#FF7EB3', '#FFE08A'], // dusk orange / warm pink
  night:   ['#8FA0FF', '#C9B8FF', '#FFB3DF'], // moonlit indigo / lavender
} as const;
type AmbientBucket = keyof typeof AMBIENT_PALETTES;

// Night wraps midnight (22:00–04:59), so it's tested FIRST — a plain
// ascending-hour ternary chain routed 0–4am into the 'day' branch.
const ambientBucket = (h: number): AmbientBucket =>
  h >= 22 || h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : 'evening';

// Re-checks the hour every 5 minutes; re-renders only when the bucket flips
// (≤4 times/day), so long sessions drift from morning gold into evening amber.
function useAmbientPalette(): readonly string[] {
  const [bucket, setBucket] = useState<AmbientBucket>(() => ambientBucket(new Date().getHours()));
  useEffect(() => {
    const id = setInterval(() => {
      const next = ambientBucket(new Date().getHours());
      setBucket((prev) => (prev === next ? prev : next));
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return AMBIENT_PALETTES[bucket];
}

// D3: live window dims (the old module-level `Math.min(height, 932)` clamp
// compressed every effect into the top ~70% of an iPad) + a gentle area-based
// particle-count scale, clamped so 1024-1366pt screens get "a bit more rain",
// not a proportional blizzard.
interface Dims { sw: number; sh: number; areaScale: number }

/**
 * SenpaiOverlay — layered magical-girl effects.
 * - Ambient layer: subtle stars/moons/shooting-stars when enabled + ambientEffects on.
 * - Reaction layer: hearts/kaomoji/sparkles/starburst/confetti during sparkleActive.
 * Fully skipped under system Reduce Motion (D5) — this whole file is decoration.
 */
export function SenpaiOverlay() {
  const { state } = useSenpai();
  const { reduceMotion } = useMotion();
  const { width, height } = useWindowDimensions();
  const palette = useAmbientPalette();
  const dims = useMemo<Dims>(
    () => ({
      sw: width,
      sh: height,
      areaScale: Math.min(1.6, Math.max(1, (width * height) / (390 * 844))),
    }),
    [width, height],
  );

  if (!state.enabled || reduceMotion) return null;

  const max = state.sparkleIntensity === 'maximum';
  const mood = state.mascotMood;

  return (
    <View style={styles.container} pointerEvents="none">
      {state.ambientEffects && (
        <>
          <AmbientStars max={max} dims={dims} palette={palette} />
          <AmbientMoons max={max} dims={dims} palette={palette} />
          <ShootingStarEmitter max={max} dims={dims} />
        </>
      )}
      {state.sparkleActive && (
        <ReactionLayer mood={mood} max={max} trigger={state.reactionExpiry} dims={dims} />
      )}
    </View>
  );
}

// H5 earned intensity: milestone tier rides D2's source-tagging — only
// milestone-sourced reactions set sparkleActive, and the milestone's mood
// encodes its weight (celebrating = level-up > impressed = PR > cheering =
// workout done). Scales the celebration particle counts so a level-up
// visibly out-rains a routine workout.
const MILESTONE_TIER: Partial<Record<MascotMood, number>> = {
  celebrating: 1,
  impressed: 0.8,
  cheering: 0.6,
};

/**
 * ReactionLayer — the sparkleActive effects, with H4 beat timing.
 * Since D2's source tiers, sparkleActive is set ONLY by milestone-sourced
 * reactions, so every mount of this layer IS a milestone — and it staggers
 * its effects to match the mascot's runReactionScript beats instead of
 * detonating everything at once:
 *   +150ms  starburst (lands with the mascot's pose swap)
 *   +550ms  ambient rain — hearts / kaomoji / sparkles / confetti
 *   (the speech bubble pops at +300ms, in between)
 * Timing hooks only — no new effects. `trigger` (reactionExpiry) changes per
 * reaction, so back-to-back milestones restart the beats (and remount
 * StarburstRing, which also lets its one-shot animation actually replay).
 * Known small edge: a chat reply landing INSIDE a milestone's window also
 * changes `trigger` and restarts the beats — a brief re-pop of effects that
 * are already celebrating, which is fine; when no milestone is active,
 * sparkleActive is false and chat replies mount nothing.
 */
function ReactionLayer({ mood, max, trigger, dims }: { mood: MascotMood; max: boolean; trigger: number; dims: Dims }) {
  // beat 0 = nothing yet, 1 = burst, 2 = full rain.
  const [beat, setBeat] = useState(0);
  const tier = MILESTONE_TIER[mood] ?? 0.6;

  useEffect(() => {
    setBeat(0);
    const t1 = setTimeout(() => setBeat(1), 150);
    const t2 = setTimeout(() => setBeat(2), 550);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [trigger]);

  return (
    <>
      {beat >= 1 && <StarburstRing trigger={trigger} />}
      {beat >= 2 && (
        <>
          <FloatingHearts max={max} dims={dims} tier={tier} />
          <FloatingKaomoji max={max} dims={dims} tier={tier} />
          <SparkleParticles max={max} dims={dims} tier={tier} />
          {mood === 'celebrating' && <ConfettiBurst max={max} dims={dims} />}
        </>
      )}
    </>
  );
}

const speedMult = (max: boolean) => (max ? 0.7 : 1);
// Particle-count helper: base × maximum toggle × milestone tier × screen area.
const scaledCount = (base: number, mult: number) => Math.max(1, Math.round(base * mult));

/* ═══ AMBIENT LAYER ═══════════════════════════════════════════════════════ */

function AmbientStars({ max, dims, palette }: { max: boolean; dims: Dims; palette: readonly string[] }) {
  const count = scaledCount(max ? 30 : 15, dims.areaScale);
  const stars = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      glyph: i % 2 === 0 ? STAR_GLYPH : GLINT_GLYPH,
      color: palette[i % palette.length],
      x: Math.random() * dims.sw,
      startY: Math.random() * dims.sh,
      size: 6 + Math.random() * 6,
      twinkleMs: 4000 + Math.random() * 4000,
      driftMs: 22000 + Math.random() * 12000,
      delay: Math.random() * 4000,
    })),
  [count, dims, palette]);

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
    // Self-rescheduling loops must bail after unmount, or .start() recurses
    // forever on a detached component (these unmount when ambientEffects/enabled flip off).
    let cancelled = false;
    const twinkle = () => {
      if (cancelled) return;
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.12, duration: config.twinkleMs * 0.5, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.03, duration: config.twinkleMs * 0.5, useNativeDriver: true }),
      ]).start(() => { if (!cancelled) twinkle(); });
    };
    const doDrift = () => {
      if (cancelled) return;
      drift.setValue(0);
      Animated.timing(drift, { toValue: 1, duration: config.driftMs, useNativeDriver: true }).start(() => { if (!cancelled) doDrift(); });
    };
    const t = setTimeout(() => { twinkle(); doDrift(); }, config.delay);
    return () => { cancelled = true; clearTimeout(t); };
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

function AmbientMoons({ max, dims, palette }: { max: boolean; dims: Dims; palette: readonly string[] }) {
  const count = scaledCount(max ? 10 : 5, dims.areaScale);
  const moons = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      color: palette[0],
      x: Math.random() * (dims.sw - 20),
      y: 30 + Math.random() * (dims.sh - 80),
      size: 10 + Math.random() * 4,
      driftMs: 30000 + Math.random() * 20000,
      delay: Math.random() * 5000,
    })),
  [count, dims, palette]);

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
    let cancelled = false;
    Animated.timing(opacity, { toValue: 0.06, duration: 2000, useNativeDriver: true }).start();
    const doDrift = () => {
      if (cancelled) return;
      drift.setValue(0);
      Animated.timing(drift, { toValue: 1, duration: config.driftMs, useNativeDriver: true }).start(() => { if (!cancelled) doDrift(); });
    };
    const t = setTimeout(doDrift, config.delay);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, 40] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        fontSize: config.size,
        color: config.color,
        opacity,
        transform: [{ translateX }],
      }}
    >
      {MOON_GLYPH}
    </Animated.Text>
  );
}

function ShootingStarEmitter({ max, dims }: { max: boolean; dims: Dims }) {
  const [shootKey, setShootKey] = useState(0);

  useEffect(() => {
    const minWait = max ? 8000 : 15000;
    const maxWait = max ? 15000 : 30000;
    const wait = minWait + Math.random() * (maxWait - minWait);
    const t = setTimeout(() => setShootKey((k) => k + 1), wait);
    return () => clearTimeout(t);
  }, [shootKey, max]);

  return <ShootingStar key={shootKey} dims={dims} />;
}

function ShootingStar({ dims }: { dims: Dims }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const startX = useMemo(() => -40 + Math.random() * (dims.sw * 0.3), []);
  const startY = useMemo(() => 20 + Math.random() * (dims.sh * 0.2), []);
  const endX = startX + dims.sw * 0.7;
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

function FloatingHearts({ max, dims, tier }: { max: boolean; dims: Dims; tier: number }) {
  const count = scaledCount(max ? 24 : 12, tier * dims.areaScale);
  const mult = speedMult(max);
  const hearts = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      sh: dims.sh,
      x: 50 + Math.random() * (dims.sw - 100),
      size: 12 + Math.random() * 10,
      speed: (1500 + Math.random() * 1500) * mult,
      delay: Math.random() * 1000,
      drift: (Math.random() - 0.5) * 40,
    })),
  [count, mult, dims]);

  return (
    <>
      {hearts.map((h) => (
        <FloatingHeart key={h.key} config={h} />
      ))}
    </>
  );
}

function FloatingHeart({ config }: { config: any }) {
  const y = useRef(new Animated.Value(config.sh - 200)).current;
  const x = useRef(new Animated.Value(config.x)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      y.setValue(config.sh - 200);
      x.setValue(config.x);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(y, { toValue: config.sh - 500, duration: config.speed, useNativeDriver: true }),
        Animated.timing(x, { toValue: config.x + config.drift, duration: config.speed, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.8, duration: 300, useNativeDriver: true }),
          Animated.delay(Math.max(100, config.speed - 700)),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
      ]).start(() => { if (!cancelled) animate(); });
    };
    const t = setTimeout(animate, config.delay);
    return () => { cancelled = true; clearTimeout(t); };
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

function FloatingKaomoji({ max, dims, tier }: { max: boolean; dims: Dims; tier: number }) {
  const emotes = max
    ? ['\u2605', '\u2661', '\u2727', '!', '\u266A', '\u2606', '\u2764', '\u2728', '\u273F', '\u269B']
    : ['\u2605', '\u2661', '\u2727', '!', '\u266A', '\u2606', '\u2764'];
  const count = scaledCount(max ? 16 : 8, tier * dims.areaScale);
  const mult = speedMult(max);
  const items = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      sh: dims.sh,
      text: emotes[i % emotes.length],
      x: 30 + Math.random() * (dims.sw - 60),
      speed: (1200 + Math.random() * 800) * mult,
      delay: Math.random() * 2000,
    })),
  [count, mult, dims]);

  return (
    <>
      {items.map((item) => (
        <FloatingEmote key={item.key} config={item} />
      ))}
    </>
  );
}

function FloatingEmote({ config }: { config: any }) {
  const y = useRef(new Animated.Value(config.sh - 180)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      y.setValue(config.sh - 180);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(y, { toValue: config.sh - 400, duration: config.speed, useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }),
          Animated.delay(Math.max(100, config.speed - 500)),
          Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start(() => { if (!cancelled) animate(); });
    };
    const t = setTimeout(animate, config.delay);
    return () => { cancelled = true; clearTimeout(t); };
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

function SparkleParticles({ max, dims, tier }: { max: boolean; dims: Dims; tier: number }) {
  const count = scaledCount(max ? 20 : 10, tier * dims.areaScale);
  const mult = speedMult(max);
  const sparkles = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      x: 40 + Math.random() * (dims.sw - 80),
      y: dims.sh * 0.4 + Math.random() * (dims.sh * 0.4),
      size: 6 + Math.random() * 6,
      speed: (600 + Math.random() * 600) * mult,
      delay: Math.random() * 1500,
    })),
  [count, mult, dims]);

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
    // Self-rescheduling loop: bail after unmount via `cancelled` and track the
    // rescheduling timer so cleanup clears it. Otherwise the loop keeps firing
    // .start() forever on a detached component (Sparkle unmounts routinely when
    // sparkleActive/enabled flip off).
    let cancelled = false;
    let rescheduleTimer: ReturnType<typeof setTimeout> | undefined;
    const animate = () => {
      if (cancelled) return;
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
        if (cancelled) return;
        rescheduleTimer = setTimeout(animate, 500 + Math.random() * 1500);
      });
    };
    const t = setTimeout(animate, config.delay);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (rescheduleTimer) clearTimeout(rescheduleTimer);
    };
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

/* One-shot 8-star burst from the mascot's ACTUAL dock corner (D4a/H5 — it
   used to hardcode bottom-right, erupting from empty space when she was
   docked elsewhere). Replays each reaction: stars are keyed by trigger (D4b)
   AND the whole ring remounts per beat cycle. */
function StarburstRing({ trigger }: { trigger: number }) {
  // Read at mount — this component remounts per reaction, so it always
  // reflects the corner she is docked in when the milestone fires.
  const center = useMemo(() => getSenpaiCornerInfo().center, []);
  const stars = useMemo(() =>
    Array.from({ length: 8 }).map((_, i) => {
      const angle = (i / 8) * Math.PI * 2;
      const distance = 70 + Math.random() * 40;
      return {
        key: `${trigger}-${i}`,
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
        <StarburstStar key={s.key} config={s} center={center} />
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

/* Celebrating-mood confetti: small rectangles falling from the top, spanning
   the REAL window width/height (D3). */
function ConfettiBurst({ max, dims }: { max: boolean; dims: Dims }) {
  const count = scaledCount(max ? 60 : 30, dims.areaScale);
  const pieces = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      sh: dims.sh,
      x: Math.random() * dims.sw,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 4,
      speed: 1500 + Math.random() * 500,
      delay: Math.random() * 500,
      sway: (Math.random() - 0.5) * 40,
      spinDir: Math.random() < 0.5 ? 1 : -1,
    })),
  [count, dims]);

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
      Animated.timing(y, { toValue: config.sh + 20, duration: config.speed, delay: config.delay, useNativeDriver: true }),
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
