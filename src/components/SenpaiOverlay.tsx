import React, { useEffect, useRef, useMemo, useState } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';
import { getSenpaiCornerInfo } from './senpaiCornerStore';

/* ═══ SVG GLOW PARTICLES ═══
   Particles used to be Animated.Text glyphs (star/glint/moon/heart) whose
   "glow" came from textShadow — which silently drops in the native renderer,
   so on device they read as flat colored type. Each particle is now a tiny
   react-native-svg shape filled with a RadialGradient (bright core →
   transparent edge): a real gradient brush on native, so the bloom actually
   ships. The Svg mounts once and NEVER re-renders per frame — all motion
   lives on the wrapping Animated.View (transform/opacity only, native
   driver). Mirrored in SenpaiImpactEffect.tsx; the two effect layers stay
   self-contained on purpose (they mount/unmount independently). */

type GlowShapeKind = 'star' | 'heart' | 'moon' | 'dot';

// Concave 4-point sparkle star — the classic anime glint (24×24 box).
const STAR4_D = 'M12 0C13.2 7.4 16.6 10.8 24 12C16.6 13.2 13.2 16.6 12 24C10.8 16.6 7.4 13.2 0 12C7.4 10.8 10.8 7.4 12 0Z';
// Filled heart (24×24 box).
const HEART_D = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
// Crescent moon (24×24 box) — spec: waxing crescent, replaces the old glyph.
const MOON_D = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';

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
        : <Path d={kind === 'star' ? STAR4_D : kind === 'heart' ? HEART_D : MOON_D} fill={fill} />}
    </Svg>
  );
}

// Pre-sampled sine for the hearts' x-sway. The native driver lerps between
// interpolate samples (SenpaiFlipbook.tsx header has the 120Hz note), so the
// wave shape lives HERE in the interpolate node — the driving timing stays a
// plain linear 0→1. Amplitude + phase are baked per particle so each heart
// traces its own slice of the wave.
const SWAY_STOPS = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const swayOutput = (amp: number, phase: number) =>
  SWAY_STOPS.map((t) => Math.sin((t + phase) * Math.PI * 2) * amp);

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
 * - Reaction layer: hearts/motes/sparkles/starburst/confetti during sparkleActive.
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
 *   +550ms  ambient rain — hearts / motes / sparkles / confetti
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
          <FloatingMotes max={max} dims={dims} tier={tier} />
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
      // alternate glint shapes: concave star / soft dot (was ★ / ✦ glyphs)
      kind: (i % 2 === 0 ? 'star' : 'dot') as GlowShapeKind,
      color: palette[i % palette.length],
      x: Math.random() * dims.sw,
      startY: Math.random() * dims.sh,
      // ~×1.3 vs the old glyph sizes — the gradient edge is transparent, so
      // the perceived footprint shrinks; this keeps the old visual weight.
      size: 8 + Math.random() * 8,
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
      // sin ease breathes; the old default easing read mechanical at 4-8s.
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.12, duration: config.twinkleMs * 0.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.03, duration: config.twinkleMs * 0.5, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
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
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        top: config.startY,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <GlowShape kind={config.kind} size={config.size} color={config.color} id={`amb-s-${config.key}`} />
    </Animated.View>
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
      // ~×1.3 vs the old glyph size (transparent gradient edge, see stars)
      size: 13 + Math.random() * 5,
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

  // Out-and-back half-sine drift: the old 0→1 loop snapped 40px home at each
  // cycle boundary. Sine samples live in the interpolate node (120Hz note).
  const translateX = drift.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, 28.3, 40, 28.3, 0],
  });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        top: config.y,
        opacity,
        transform: [{ translateX }],
      }}
    >
      <GlowShape kind="moon" size={config.size} color={config.color} id={`amb-m-${config.key}`} />
    </Animated.View>
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
      {/* glow head — radial-gradient dot; the flat #FFF View couldn't bloom */}
      <GlowShape kind="dot" size={10} color="#FFFFFF" id="shoot-head" />
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
      // ~×1.3 vs the old glyph sizes (transparent gradient edge)
      size: 16 + Math.random() * 12,
      speed: (1500 + Math.random() * 1500) * mult,
      delay: Math.random() * 1000,
      // sinusoidal x-sway (replaces the old linear drift): amplitude + phase
      // baked into the interpolate output, so no per-frame JS work.
      swayOut: swayOutput(8 + Math.random() * 10, i / count),
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
  const rise = useRef(new Animated.Value(0)).current;
  const swayT = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      rise.setValue(0);
      swayT.setValue(0);
      opacity.setValue(0);
      Animated.parallel([
        // Ease-out rise — hearts leave quickly then hang, like they're
        // buoyant; the old constant-speed rise read as a conveyor belt.
        Animated.timing(rise, { toValue: 1, duration: config.speed, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        // Sway driver stays LINEAR — the sine shape lives in the interpolate
        // below (stepping/shaping belongs in interpolate, per the 120Hz note).
        Animated.timing(swayT, { toValue: 1, duration: config.speed, easing: Easing.linear, useNativeDriver: true }),
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

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [config.sh - 200, config.sh - 500] });
  const translateX = swayT.interpolate({ inputRange: SWAY_STOPS, outputRange: config.swayOut });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        opacity,
        transform: [{ translateY }, { translateX }],
      }}
    >
      <GlowShape kind="heart" size={config.size} color="#FF69B4" id={`fh-${config.key}`} />
    </Animated.View>
  );
}

// (was FloatingKaomoji) The glyph grab-bag (music notes, "!", flowers…) is now
// a cycle of glow shapes at the same counts and rise band — Animated.Text
// can't glow on native, and the mixed glyph metrics made the layer look
// pasted-on next to the gradient particles.
function FloatingMotes({ max, dims, tier }: { max: boolean; dims: Dims; tier: number }) {
  const kinds: GlowShapeKind[] = max ? ['star', 'heart', 'dot', 'moon'] : ['star', 'heart', 'dot'];
  const colors = ['#FFD700', '#FFB3DF', '#FFF666'];
  const count = scaledCount(max ? 16 : 8, tier * dims.areaScale);
  const mult = speedMult(max);
  const items = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      sh: dims.sh,
      kind: kinds[i % kinds.length],
      color: colors[i % colors.length],
      x: 30 + Math.random() * (dims.sw - 60),
      speed: (1200 + Math.random() * 800) * mult,
      delay: Math.random() * 2000,
    })),
  [count, mult, dims]);

  return (
    <>
      {items.map((item) => (
        <FloatingMote key={item.key} config={item} />
      ))}
    </>
  );
}

function FloatingMote({ config }: { config: any }) {
  const rise = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const animate = () => {
      if (cancelled) return;
      rise.setValue(0);
      opacity.setValue(0);
      Animated.parallel([
        // ease-out rise, same physics as the hearts
        Animated.timing(rise, { toValue: 1, duration: config.speed, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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

  const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [config.sh - 180, config.sh - 400] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: config.x,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <GlowShape kind={config.kind} size={20} color={config.color} id={`fm-${config.key}`} />
    </Animated.View>
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
      // ~×1.5 vs the old crossed-Views size (transparent gradient edge)
      size: 9 + Math.random() * 9,
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
          // pop-in with a back(1.5) overshoot, then an accelerating collapse —
          // the old linear in/out read as a blinking cursor, not a glint.
          Animated.timing(scale, { toValue: 1, duration: config.speed * 0.35, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0, duration: config.speed * 0.65, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.9, duration: config.speed * 0.2, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: config.speed * 0.8, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
        opacity,
        transform: [{ scale }, { rotate: spin }],
      }}
    >
      <GlowShape kind="star" size={config.size} color="#FFD700" id={`sp-${config.key}`} />
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
        // ~×1.3 vs the old glyph sizes (transparent gradient edge)
        size: 16 + Math.random() * 8,
        color: ['#FF2E51', '#FFF666', '#5158FF', '#FFB3DF'][i % 4],
        // deterministic per-star duration stagger — 8 identical 600ms pops
        // read as a single mechanical unit; (i*53)%5 scatters 520–700ms while
        // keeping the whole ring inside the beat window.
        dur: 520 + ((i * 53) % 5) * 45,
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
      // ease-out throw: fast eruption that dies at the rim, like sparks —
      // the old linear fling had no sense of force.
      Animated.timing(translateX, { toValue: config.dx, duration: config.dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: config.dy, duration: config.dur, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        // hold bright through the throw, fade on the tail
        Animated.delay(config.dur * 0.4),
        Animated.timing(opacity, { toValue: 0, duration: config.dur * 0.6, useNativeDriver: true }),
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
      <GlowShape kind="star" size={config.size} color={config.color} id={`sb-${config.key}`} />
    </Animated.View>
  );
}

/* Celebrating-mood confetti: small rectangles falling from the top, spanning
   the REAL window width/height (D3). Confetti stays plain Views on purpose —
   flat paper flecks don't glow, and it keeps the biggest particle count off
   the Svg budget. */
function ConfettiBurst({ max, dims }: { max: boolean; dims: Dims }) {
  const count = scaledCount(max ? 60 : 30, dims.areaScale);
  const pieces = useMemo(() =>
    Array.from({ length: count }).map((_, i) => ({
      key: i,
      sh: dims.sh,
      x: Math.random() * dims.sw,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      // slight size/duration/delay scatter so the burst doesn't read as one
      // mechanical sheet of pixels
      size: 3 + Math.random() * 3,
      speed: 1300 + Math.random() * 900,
      delay: Math.random() * 650,
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
      // Gravity: pieces hang at the top of the throw then accelerate — the
      // old linear fall read as sliding down glass, not falling.
      Animated.timing(y, { toValue: config.sh + 20, duration: config.speed, delay: config.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
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
