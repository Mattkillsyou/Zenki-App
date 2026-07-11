import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, Animated, Text, Easing, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { useSenpai } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { playSynth } from '../sounds/synth';
import { getSenpaiCornerInfo } from './senpaiCornerStore';

const TOTAL_MS = 4000;
const STAR_GLYPH = '\u2605';
const GLINT_GLYPH = '\u2726';
const HEART_GLYPH = '\u2661';
const MOON_GLYPH = '\u263E';

// D3: geometry passed down per-render from useWindowDimensions — the old
// module-level `Math.min(height, 932)` clamp pushed the catchphrase, marbles,
// and burst center into the top ~70% of an iPad.
interface Dims { sw: number; sh: number; cx: number; cy: number }

/**
 * SenpaiTransformation — plays a condensed Sailor Moon transformation when
 * Senpai Mode is toggled ON (not on app relaunch with already-enabled state).
 *
 * Five phases over ~4s:
 *   0.00–0.12  white flash + "Moon Prism Power... MAKE UP!" catchphrase
 *   0.12–0.40  sparkling blue silhouette with kaleidoscopic color marbling
 *   0.40–0.65  pink/blue ribbons swirling outward from center
 *   0.65–0.88  sparkle burst (stars/hearts/moons fanning outward)
 *   0.88–1.00  fade out, mascot emotes via triggerReaction('cheering')
 *
 * D5: under system Reduce Motion the strobing cinematic (0.95-opacity white
 * flash!) is skipped entirely — the toggle still marks the transformation
 * played and hands the moment to the mascot's pose + bubble.
 */
export function SenpaiTransformation() {
  const { state, markTransformationPlayed, triggerReaction } = useSenpai();
  const { reduceMotion } = useMotion();
  const { width: sw, height: sh } = useWindowDimensions();
  const [playing, setPlaying] = useState(false);
  const prevEnabledRef = useRef<boolean | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const catchphraseRef = useRef<string>('Moon Prism Power... MAKE UP! \u2727');

  useEffect(() => {
    const prev = prevEnabledRef.current;
    prevEnabledRef.current = state.enabled;

    // Skip initial mount — only play on genuine false→true toggle
    if (prev === null) return;
    if (state.enabled && !prev && !state.transformationPlayed) {
      catchphraseRef.current = randomDialogue('transformation');
      if (reduceMotion) {
        // Reduce Motion: no strobe, no ribbons — just the greeting beat.
        markTransformationPlayed();
        try { triggerReaction('cheering', catchphraseRef.current, 3500); } catch { /* ignore */ }
        return;
      }
      setPlaying(true);
      progress.setValue(0);
      try { playSynth('senpai', 'transform'); } catch { /* ignore */ }
      Animated.timing(progress, {
        toValue: 1,
        duration: TOTAL_MS,
        useNativeDriver: true,
        easing: Easing.linear,
      }).start(() => {
        setPlaying(false);
        markTransformationPlayed();
        try { triggerReaction('cheering', catchphraseRef.current, 3500); } catch { /* ignore */ }
      });
    }
  }, [state.enabled]);

  if (!playing) return null;

  const dims: Dims = { sw, sh, cx: sw / 2, cy: sh / 2 };

  return (
    <View style={styles.container} pointerEvents="none">
      <WhiteFlash progress={progress} />
      <BlueSilhouette progress={progress} dims={dims} />
      <ColorMarbles progress={progress} dims={dims} />
      <RibbonSwirl progress={progress} dims={dims} />
      <SparkleBurst progress={progress} dims={dims} />
      <CatchphraseText progress={progress} text={catchphraseRef.current} dims={dims} />
      <MascotStarburst progress={progress} />
      <CompleteText progress={progress} dims={dims} />
    </View>
  );
}

/* ─── Phase 5: starburst ring expanding where the mascot will appear — her
       ACTUAL persisted dock corner (senpaiCornerStore), not hardcoded
       bottom-right ─── */
function MascotStarburst({ progress }: { progress: Animated.Value }) {
  const center = useMemo(() => getSenpaiCornerInfo().center, []);
  const scale = progress.interpolate({
    inputRange: [0, 0.80, 0.95, 1],
    outputRange: [0, 0, 3, 3],
    extrapolate: 'clamp',
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.80, 0.85, 1],
    outputRange: [0, 0, 0.6, 0],
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: center.x - 35,
        top: center.y - 35,
        width: 70,
        height: 70,
        borderRadius: 35,
        borderWidth: 2,
        borderColor: '#FF2E51',
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

/* ─── Phase 5: brief "TRANSFORMATION COMPLETE!" text ─── */
function CompleteText({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.82, 0.86, 0.96, 1],
    outputRange: [0, 0, 1, 0, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.82, 0.90, 1],
    outputRange: [0.8, 0.8, 1.05, 1.05],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: dims.sh * 0.62,
        alignItems: 'center',
        opacity,
        transform: [{ scale }],
      }}
    >
      <Text
        style={{
          fontSize: 20,
          fontWeight: '800',
          color: '#FFFFFF',
          letterSpacing: 2,
          // @ts-ignore web-only glow
          textShadow: '0 0 6px #FF2E51, 0 0 16px rgba(255,46,81,0.7)',
        }}
      >
        TRANSFORMATION COMPLETE! {'\u2727'}
      </Text>
    </Animated.View>
  );
}

/* ─── Phase 1: white flash (0.00 – 0.12) ─── */
function WhiteFlash({ progress }: { progress: Animated.Value }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.05, 0.12, 1],
    outputRange: [0, 0.95, 0, 0],
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFFFFF', opacity }]} />
  );
}

/* ─── Phase 2: sparkling blue silhouette (0.12 – 0.45) ─── */
function BlueSilhouette({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.30, 0.55, 0.90, 1],
    outputRange: [0, 0, 1, 1, 0.3, 0],
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1E2670', opacity }]}>
      <SparklingBluePoints progress={progress} dims={dims} />
    </Animated.View>
  );
}

function SparklingBluePoints({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  const points = useMemo(() =>
    Array.from({ length: 40 }).map((_, i) => ({
      key: i,
      x: Math.random() * dims.sw,
      y: Math.random() * dims.sh,
      size: 2 + Math.random() * 4,
      phase: Math.random(),
    })),
  []);
  return (
    <>
      {points.map((p) => {
        const pointOp = progress.interpolate({
          inputRange: [0, 0.15, 0.15 + p.phase * 0.3, 0.55, 1],
          outputRange: [0, 0, 0.95, 0, 0],
        });
        return (
          <Animated.View
            key={p.key}
            style={{
              position: 'absolute',
              left: p.x, top: p.y,
              width: p.size, height: p.size,
              borderRadius: p.size / 2,
              backgroundColor: '#FFFFFF',
              opacity: pointOp,
            }}
          />
        );
      })}
    </>
  );
}

/* ─── Phase 2 overlay: kaleidoscopic color marbles (0.15 – 0.45) ───
   Soft radial-gradient orbs on two counter-rotating layers. The gradients
   are static SVG fills — only the Animated wrappers (opacity/scale/rotate)
   move, so the whole phase stays on the native driver. */

// Marble offsets are fractions of screen size FROM CENTER (not absolute
// corners, cf. the D3 note) so the layer rotation swings each orb along a
// gentle arc instead of leaving it parked on a flat grid.
const MARBLE_LAYERS = [
  {
    key: 'front',
    // Counter-rotation between the two layers is what sells the depth —
    // keep the angles small so orbs drift rather than visibly orbit.
    spin: '16deg',
    marbles: [
      { color: '#FF2E51', core: '#FFD1DA', ox: -0.25, oy: -0.20, size: 320, phaseStart: 0.15, peak: 0.25 },
      { color: '#D260FF', core: '#F3CFFF', ox: 0.00, oy: 0.05, size: 340, phaseStart: 0.20, peak: 0.30 },
      { color: '#FFB3DF', core: '#FFECF6', ox: 0.20, oy: 0.12, size: 280, phaseStart: 0.24, peak: 0.34 },
    ],
  },
  {
    key: 'back',
    spin: '-12deg',
    marbles: [
      { color: '#5158FF', core: '#C9CCFF', ox: 0.25, oy: -0.15, size: 380, phaseStart: 0.18, peak: 0.28 },
      { color: '#FFF666', core: '#FFFDE0', ox: -0.20, oy: 0.15, size: 230, phaseStart: 0.22, peak: 0.32 },
      { color: '#5EE1FF', core: '#E2FAFF', ox: 0.05, oy: -0.32, size: 170, phaseStart: 0.26, peak: 0.36 },
    ],
  },
];

function ColorMarbles({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  return (
    <>
      {MARBLE_LAYERS.map((layer) => {
        const layerSpin = progress.interpolate({
          inputRange: [0, 0.15, 0.48, 1],
          outputRange: ['0deg', '0deg', layer.spin, layer.spin],
        });
        return (
          <Animated.View
            key={layer.key}
            style={{
              position: 'absolute',
              left: dims.cx, top: dims.cy,
              width: 0, height: 0,
              transform: [{ rotate: layerSpin }],
            }}
          >
            {layer.marbles.map((m, i) => {
              // Per-marble stagger preserved from the flat-circle version —
              // gradient edges are already transparent so peak opacity can sit
              // higher than the old 0.55 without turning into a paint wall.
              const op = progress.interpolate({
                inputRange: [0, m.phaseStart, m.peak, 0.48, 1],
                outputRange: [0, 0, 0.9, 0, 0],
              });
              const scale = progress.interpolate({
                inputRange: [0, m.phaseStart, m.peak, 0.48],
                outputRange: [0.2, 0.4, 1, 1.4],
                extrapolate: 'clamp',
              });
              const gradId = `senpaiMarble-${layer.key}-${i}`;
              return (
                <Animated.View
                  key={i}
                  style={{
                    position: 'absolute',
                    left: m.ox * dims.sw - m.size / 2,
                    top: m.oy * dims.sh - m.size / 2,
                    width: m.size,
                    height: m.size,
                    opacity: op,
                    transform: [{ scale }],
                  }}
                >
                  <Svg width={m.size} height={m.size}>
                    <Defs>
                      {/* Unique id per orb — duplicate gradient ids across Svg roots collide on web */}
                      <RadialGradient id={gradId} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={m.core} stopOpacity="0.95" />
                        <Stop offset="0.45" stopColor={m.color} stopOpacity="0.55" />
                        <Stop offset="1" stopColor={m.color} stopOpacity="0" />
                      </RadialGradient>
                    </Defs>
                    <Circle cx={m.size / 2} cy={m.size / 2} r={m.size / 2} fill={`url(#${gradId})`} />
                  </Svg>
                </Animated.View>
              );
            })}
          </Animated.View>
        );
      })}
    </>
  );
}

/* ─── Phase 3: ribbon swirl (0.40 – 0.68) ─── */

// Ribbon canvas width — wide enough for the bezier S-sway plus the base taper.
const RIBBON_W = 30;

// Tapered ribbon path: a point at the tip flowing into a swaying bezier body,
// so it reads as trailing fabric instead of a rotating rectangle. Static per
// ribbon — all motion happens on the Animated wrapper.
function ribbonPath(length: number, baseWidth: number): string {
  const mid = RIBBON_W / 2;
  const sway = 8; // lateral S-curve offset shared by both edges
  const half = baseWidth / 2;
  return [
    `M ${mid} 0`,
    `C ${mid - sway} ${length * 0.33} ${mid + sway} ${length * 0.66} ${mid - half} ${length}`,
    `L ${mid + half} ${length}`,
    // Return edge follows the same sway offset by a width that tapers to the tip
    `C ${mid + sway + half * 0.6} ${length * 0.66} ${mid - sway + half * 0.3} ${length * 0.33} ${mid} 0`,
    'Z',
  ].join(' ');
}

function RibbonSwirl({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  const ribbons = useMemo(() =>
    Array.from({ length: 10 }).map((_, i) => ({
      key: i,
      baseAngle: (i / 10) * 360,
      color: i % 2 === 0 ? '#FF2E51' : '#5EE1FF',
      // Tip fades toward a pale sister tone so the gradient reads as sheen
      tip: i % 2 === 0 ? '#FFB3DF' : '#E2FAFF',
      length: 160 + (i % 3) * 40,
      baseWidth: 10 + (i % 3) * 4,
      // Alternate curl direction so ribbons splay rather than comb flat
      curl: `${(i % 2 === 0 ? 1 : -1) * (12 + (i % 3) * 4)}deg`,
    })),
  []);
  // Master sweep is keyframed ease-in-out (slow start → sweep → settle). The
  // shaping lives in the interpolate node, not the timing easing, so the
  // 60Hz-presampled timing curve stays linear (safe at 120Hz).
  const rotate = progress.interpolate({
    inputRange: [0, 0.40, 0.50, 0.60, 0.68, 1],
    outputRange: ['0deg', '0deg', '49deg', '245deg', '270deg', '270deg'],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.40, 0.56, 0.68, 1],
    outputRange: [0, 0, 1.3, 2.2, 2.2],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.40, 0.48, 0.62, 0.70, 1],
    outputRange: [0, 0, 0.85, 0.85, 0, 0],
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: dims.cx, top: dims.cy,
        width: 0, height: 0,
        opacity,
        transform: [{ rotate }, { scale }],
      }}
    >
      {ribbons.map((r) => {
        // Radial drift (translateY runs along the ribbon's rotated axis) rides
        // on top of the group sweep, so each ribbon travels an arc — never a
        // straight line outward. length/2 is the old "anchored at center" pose.
        const drift = progress.interpolate({
          inputRange: [0, 0.40, 0.54, 0.68],
          outputRange: [r.length / 2, r.length / 2, r.length * 0.1, -r.length * 0.15],
          extrapolate: 'clamp',
        });
        const curl = progress.interpolate({
          inputRange: [0, 0.44, 0.68, 1],
          outputRange: ['0deg', '0deg', r.curl, r.curl],
        });
        const gradId = `senpaiRibbon-${r.key}`;
        return (
          <Animated.View
            key={r.key}
            style={{
              position: 'absolute',
              left: -RIBBON_W / 2,
              top: -r.length,
              width: RIBBON_W,
              height: r.length,
              transform: [{ rotate: `${r.baseAngle}deg` }, { translateY: drift }, { rotate: curl }],
            }}
          >
            <Svg width={RIBBON_W} height={r.length}>
              <Defs>
                <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={r.tip} stopOpacity="0" />
                  <Stop offset="0.35" stopColor={r.tip} stopOpacity="0.85" />
                  <Stop offset="1" stopColor={r.color} stopOpacity="0.95" />
                </LinearGradient>
              </Defs>
              <Path d={ribbonPath(r.length, r.baseWidth)} fill={`url(#${gradId})`} />
            </Svg>
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

/* ─── Phase 4: sparkle burst (0.60 – 0.92) ─── */
function SparkleBurst({ progress, dims }: { progress: Animated.Value; dims: Dims }) {
  const sparkles = useMemo(() => {
    const glyphs = [STAR_GLYPH, GLINT_GLYPH, HEART_GLYPH, MOON_GLYPH];
    const colors = ['#FF2E51', '#FFB3DF', '#5EE1FF', '#FFF666', '#D260FF', '#FFFFFF'];
    return Array.from({ length: 60 }).map((_, i) => {
      const angle = (i / 60) * Math.PI * 2 + Math.random() * 0.4;
      const distance = 200 + Math.random() * 260;
      return {
        key: i,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        glyph: glyphs[i % glyphs.length],
        color: colors[i % colors.length],
        size: 12 + Math.random() * 16,
        // Launch in five staggered waves so the burst blooms outward
        // instead of firing as one mechanical wall.
        start: 0.60 + (i % 5) * 0.016,
      };
    });
  }, []);
  return (
    <>
      {sparkles.map((s) => {
        // Native interpolation ignores a JS `easing` option, so the
        // Easing.out(Easing.cubic) curve is baked in as sampled keyframes
        // (t = .25/.5 of travel → 57.8%/87.5% of distance). The shaping lives
        // in the interpolate node, keeping the 60Hz-presampled timing curve
        // linear (safe at 120Hz).
        const seg = 0.90 - s.start;
        const travelIn = [0, s.start, s.start + seg * 0.25, s.start + seg * 0.5, 0.90, 1];
        const translateX = progress.interpolate({
          inputRange: travelIn,
          outputRange: [0, 0, s.dx * 0.578, s.dx * 0.875, s.dx, s.dx],
          extrapolate: 'clamp',
        });
        const translateY = progress.interpolate({
          inputRange: travelIn,
          outputRange: [0, 0, s.dy * 0.578, s.dy * 0.875, s.dy, s.dy],
          extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
          inputRange: [0, s.start, s.start + 0.05, 0.74, 0.88, 1],
          outputRange: [0, 0, 1, 0.85, 0, 0],
        });
        // Overshoot then settle — the ease-out(back) pop, keyframed.
        const scale = progress.interpolate({
          inputRange: [0, s.start, s.start + seg * 0.2, s.start + seg * 0.5, 0.90],
          outputRange: [0, 0, 1.45, 1.0, 0.35],
          extrapolate: 'clamp',
        });
        return (
          <Animated.Text
            key={s.key}
            style={{
              position: 'absolute',
              left: dims.cx,
              top: dims.cy,
              fontSize: s.size,
              color: s.color,
              opacity,
              transform: [{ translateX }, { translateY }, { scale }],
            }}
          >
            {s.glyph}
          </Animated.Text>
        );
      })}
    </>
  );
}

/* ─── Catchphrase text overlay (0.02 – 0.60) ─── */
function CatchphraseText({ progress, text, dims }: { progress: Animated.Value; text: string; dims: Dims }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.04, 0.15, 0.50, 0.62, 1],
    outputRange: [0, 1, 1, 1, 0, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.04, 0.62, 1],
    outputRange: [0.7, 1.0, 1.15, 1.15],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: dims.sh * 0.38,
        alignItems: 'center',
        opacity,
        transform: [{ scale }],
      }}
    >
      <Text
        style={{
          fontSize: 28,
          fontWeight: '800',
          color: '#FFFFFF',
          textAlign: 'center',
          letterSpacing: 1,
          paddingHorizontal: 20,
          // @ts-ignore web-only glow
          textShadow: '0 0 8px #FF2E51, 0 0 20px rgba(255,46,81,0.6), 0 0 40px rgba(81,88,255,0.4)',
        }}
      >
        {text}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    overflow: 'hidden',
  },
});
