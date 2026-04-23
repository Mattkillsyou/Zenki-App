import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, StyleSheet, Animated, Dimensions, Text, Easing } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { playSynth } from '../sounds/synth';

const { width: SW } = Dimensions.get('window');
const SH = Math.min(Dimensions.get('window').height, 932);
const CX = SW / 2;
const CY = SH / 2;

const TOTAL_MS = 4000;
const STAR_GLYPH = '\u2605';
const GLINT_GLYPH = '\u2726';
const HEART_GLYPH = '\u2661';
const MOON_GLYPH = '\u263E';

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
 */
export function SenpaiTransformation() {
  const { state, markTransformationPlayed, triggerReaction } = useSenpai();
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

  return (
    <View style={styles.container} pointerEvents="none">
      <WhiteFlash progress={progress} />
      <BlueSilhouette progress={progress} />
      <ColorMarbles progress={progress} />
      <RibbonSwirl progress={progress} />
      <SparkleBurst progress={progress} />
      <CatchphraseText progress={progress} text={catchphraseRef.current} />
      <MascotStarburst progress={progress} />
      <CompleteText progress={progress} />
    </View>
  );
}

/* ─── Phase 5: starburst ring expanding where mascot will appear (bottom-right) ─── */
function MascotStarburst({ progress }: { progress: Animated.Value }) {
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
        right: 30,
        bottom: 120,
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
function CompleteText({ progress }: { progress: Animated.Value }) {
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
        top: SH * 0.62,
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
function BlueSilhouette({ progress }: { progress: Animated.Value }) {
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.30, 0.55, 0.90, 1],
    outputRange: [0, 0, 1, 1, 0.3, 0],
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1E2670', opacity }]}>
      <SparklingBluePoints progress={progress} />
    </Animated.View>
  );
}

function SparklingBluePoints({ progress }: { progress: Animated.Value }) {
  const points = useMemo(() =>
    Array.from({ length: 40 }).map((_, i) => ({
      key: i,
      x: Math.random() * SW,
      y: Math.random() * SH,
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

/* ─── Phase 2 overlay: kaleidoscopic color marbles (0.15 – 0.45) ─── */
function ColorMarbles({ progress }: { progress: Animated.Value }) {
  const marbles = [
    { color: '#FF2E51', x: SW * 0.25, y: SH * 0.30, size: 320, phaseStart: 0.15, peak: 0.25 },
    { color: '#5158FF', x: SW * 0.75, y: SH * 0.35, size: 360, phaseStart: 0.18, peak: 0.28 },
    { color: '#D260FF', x: SW * 0.50, y: SH * 0.55, size: 340, phaseStart: 0.20, peak: 0.30 },
    { color: '#FFF666', x: SW * 0.30, y: SH * 0.65, size: 260, phaseStart: 0.22, peak: 0.32 },
    { color: '#FFB3DF', x: SW * 0.70, y: SH * 0.62, size: 300, phaseStart: 0.24, peak: 0.34 },
  ];
  return (
    <>
      {marbles.map((m, i) => {
        const op = progress.interpolate({
          inputRange: [0, m.phaseStart, m.peak, 0.48, 1],
          outputRange: [0, 0, 0.55, 0, 0],
        });
        const scale = progress.interpolate({
          inputRange: [0, m.phaseStart, m.peak, 0.48],
          outputRange: [0.2, 0.4, 1, 1.4],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: m.x - m.size / 2,
              top: m.y - m.size / 2,
              width: m.size,
              height: m.size,
              borderRadius: m.size / 2,
              backgroundColor: m.color,
              opacity: op,
              transform: [{ scale }],
            }}
          />
        );
      })}
    </>
  );
}

/* ─── Phase 3: ribbon swirl (0.40 – 0.68) ─── */
function RibbonSwirl({ progress }: { progress: Animated.Value }) {
  const ribbons = useMemo(() =>
    Array.from({ length: 10 }).map((_, i) => ({
      key: i,
      baseAngle: (i / 10) * 360,
      color: i % 2 === 0 ? '#FF2E51' : '#5EE1FF',
      length: 160 + (i % 3) * 40,
      thickness: 6 + (i % 2) * 4,
    })),
  []);
  const rotate = progress.interpolate({
    inputRange: [0, 0.40, 0.68, 1],
    outputRange: ['0deg', '0deg', '270deg', '270deg'],
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
        left: CX, top: CY,
        width: 0, height: 0,
        opacity,
        transform: [{ rotate }, { scale }],
      }}
    >
      {ribbons.map((r) => (
        <View
          key={r.key}
          style={{
            position: 'absolute',
            left: -r.thickness / 2,
            top: -r.length,
            width: r.thickness,
            height: r.length,
            borderRadius: r.thickness / 2,
            backgroundColor: r.color,
            transform: [{ rotate: `${r.baseAngle}deg` }, { translateY: r.length / 2 }],
          }}
        />
      ))}
    </Animated.View>
  );
}

/* ─── Phase 4: sparkle burst (0.60 – 0.92) ─── */
function SparkleBurst({ progress }: { progress: Animated.Value }) {
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
      };
    });
  }, []);
  return (
    <>
      {sparkles.map((s) => {
        const translateX = progress.interpolate({
          inputRange: [0, 0.60, 0.90, 1],
          outputRange: [0, 0, s.dx, s.dx],
          extrapolate: 'clamp',
        });
        const translateY = progress.interpolate({
          inputRange: [0, 0.60, 0.90, 1],
          outputRange: [0, 0, s.dy, s.dy],
          extrapolate: 'clamp',
        });
        const opacity = progress.interpolate({
          inputRange: [0, 0.60, 0.68, 0.88, 1],
          outputRange: [0, 0, 1, 0, 0],
        });
        const scale = progress.interpolate({
          inputRange: [0, 0.60, 0.72, 0.90],
          outputRange: [0, 0, 1.3, 0.4],
          extrapolate: 'clamp',
        });
        return (
          <Animated.Text
            key={s.key}
            style={{
              position: 'absolute',
              left: CX,
              top: CY,
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
function CatchphraseText({ progress, text }: { progress: Animated.Value; text: string }) {
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
        top: SH * 0.38,
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
