import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Platform, Animated, Dimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const { height: SCREEN_H } = Dimensions.get('window');

/**
 * ThemeOverlay — renders scanlines, vignette, flicker, particles, and textures
 * based on the active theme's overlay config.
 *
 * Placed in App.tsx as the last child, positioned absolutely over all content.
 * pointerEvents="none" ensures no touch interception.
 *
 * Web-only effects use injected <style> tags. Native falls back to RN Animated.
 */
export function ThemeOverlay() {
  const { overlay } = useTheme();

  // No effects needed
  if (
    !overlay.scanlines &&
    !overlay.flicker &&
    !overlay.vignette &&
    overlay.particles === 'none' &&
    overlay.texture === 'none'
  ) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {overlay.scanlines && <Scanlines color={overlay.scanlineColor} opacity={overlay.scanlineOpacity} />}
      {overlay.vignette && <Vignette color={overlay.vignetteColor} />}
      {overlay.flicker && <Flicker intensity={overlay.flickerIntensity} />}
      {overlay.texture !== 'none' && <Texture type={overlay.texture} opacity={overlay.textureOpacity} />}
      {overlay.particles !== 'none' && (
        <Particles type={overlay.particles} color={overlay.particleColor} opacity={overlay.particleOpacity} />
      )}
    </View>
  );
}

/* ─── Scanlines ──────────────────────────────────────────────────────────── */

function Scanlines({ color, opacity }: { color: string; opacity: number }) {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.fullScreen,
          {
            // @ts-ignore — web-only
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${color} 2px, ${color} 4px)`,
            opacity,
          },
        ]}
      />
    );
  }
  // Native: approximate with semi-transparent bars
  return (
    <View style={[styles.fullScreen, { opacity }]}>
      {Array.from({ length: Math.floor(SCREEN_H / 4) }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 2,
            marginBottom: 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

/* ─── Vignette ───────────────────────────────────────────────────────────── */

function Vignette({ color }: { color: string }) {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.fullScreen,
          {
            // @ts-ignore — web-only
            backgroundImage: `radial-gradient(ellipse at center, transparent 50%, ${color} 100%)`,
          },
        ]}
      />
    );
  }
  // Native: approximate with border overlay
  return (
    <View
      style={[
        styles.fullScreen,
        {
          borderWidth: 60,
          borderColor: color,
          borderRadius: 0,
          opacity: 0.5,
        },
      ]}
    />
  );
}

/* ─── Flicker ────────────────────────────────────────────────────────────── */

function Flicker({ intensity }: { intensity: number }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const flickerLoop = () => {
      const dip = intensity + Math.random() * (1 - intensity);
      const dur = 50 + Math.random() * 200;
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: dip,
          duration: dur,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: dur * 0.6,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Random pause between flickers
        setTimeout(flickerLoop, 500 + Math.random() * 3000);
      });
    };
    const timer = setTimeout(flickerLoop, 1000);
    return () => clearTimeout(timer);
  }, [intensity]);

  return (
    <Animated.View
      style={[
        styles.fullScreen,
        {
          backgroundColor: 'rgba(0,0,0,0.15)',
          opacity: Animated.subtract(1, opacity),
        },
      ]}
    />
  );
}

/* ─── Texture ────────────────────────────────────────────────────────────── */

function Texture({ type, opacity }: { type: string; opacity: number }) {
  if (Platform.OS !== 'web') return null; // texture only on web

  let backgroundStyle: any = {};

  switch (type) {
    case 'noise':
      // SVG filter noise via inline data URI
      backgroundStyle = {
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='${opacity}'/%3E%3C/svg%3E")`,
        backgroundSize: '200px 200px',
      };
      break;
    case 'grid':
      backgroundStyle = {
        backgroundImage: `
          repeating-linear-gradient(0deg, rgba(255,255,255,${opacity}) 0px, transparent 1px, transparent 40px),
          repeating-linear-gradient(90deg, rgba(255,255,255,${opacity}) 0px, transparent 1px, transparent 40px)
        `,
      };
      break;
    case 'hex':
      // Simple hex pattern via repeating SVG
      backgroundStyle = {
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='28' height='49' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 0l14 24.5L14 49 0 24.5z' fill='none' stroke='rgba(255,255,255,${opacity})' stroke-width='0.5'/%3E%3C/svg%3E")`,
        backgroundSize: '28px 49px',
      };
      break;
    case 'paper':
      backgroundStyle = {
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='p'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3CfeColorMatrix values='0 0 0 0 0.95 0 0 0 0 0.92 0 0 0 0 0.87 0 0 0 ${opacity} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23p)'/%3E%3C/svg%3E")`,
        backgroundSize: '100px 100px',
      };
      break;
    default:
      return null;
  }

  return <View style={[styles.fullScreen, backgroundStyle]} />;
}

/* ─── Particles ──────────────────────────────────────────────────────────── */

function Particles({ type, color, opacity }: { type: string; color: string; opacity: number }) {
  switch (type) {
    case 'matrix-rain':
      return <MatrixRain color={color} opacity={opacity} />;
    case 'static-noise':
      return <StaticNoise color={color} opacity={opacity} />;
    case 'sheikah-runes':
      return <SheikahRunes color={color} opacity={opacity} />;
    case 'moon-sparkle':
      return <MoonSparkle color={color} opacity={opacity} />;
    default:
      return null;
  }
}

/* ─── Matrix Rain (Web Canvas) ───────────────────────────────────────────── */

function MatrixRain({ color, opacity }: { color: string; opacity: number }) {
  const canvasRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const styleId = 'zenki-matrix-rain';
    let existing = document.getElementById(styleId);
    if (existing) existing.remove();

    const canvas = document.createElement('canvas');
    canvas.id = styleId;
    canvas.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 99999; opacity: ${opacity};
    `;
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(1);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

    let animId: number;
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      canvas.remove();
    };
  }, [color, opacity]);

  return null; // Rendered via DOM canvas
}

/* ─── Static Noise ───────────────────────────────────────────────────────── */

function StaticNoise({ color, opacity }: { color: string; opacity: number }) {
  if (Platform.OS !== 'web') return null;

  return (
    <View
      style={[
        styles.fullScreen,
        {
          opacity,
          // @ts-ignore — web-only SVG filter
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' seed='${Math.floor(Math.random() * 100)}'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.55 0 0 0 0 0 0 0 0 0.3 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23s)'/%3E%3C/svg%3E")`,
          backgroundSize: '256px 256px',
        },
      ]}
    />
  );
}

/* ─── Sheikah Runes (Zelda BotW) ─────────────────────────────────────────── */

function SheikahRunes({ color, opacity }: { color: string; opacity: number }) {
  const runes = useMemo(() => {
    const shapes: ('circle' | 'diamond' | 'triangle')[] = ['circle', 'diamond', 'triangle'];
    return Array.from({ length: 12 }).map((_, i) => ({
      key: i,
      shape: shapes[i % 3],
      x: 5 + Math.random() * 90,
      startY: 33 + Math.random() * 67, // lower 2/3 of screen
      size: 4 + Math.random() * 4,
      speed: 8000 + Math.random() * 7000, // 8-15 seconds
      delay: Math.random() * 5000,
      rotationSpeed: 20000 + Math.random() * 10000, // 20-30 seconds per rotation
    }));
  }, []);

  return (
    <View style={[styles.fullScreen, { opacity }]}>
      {runes.map((r) => (
        <SheikahRune key={r.key} rune={r} color={color} />
      ))}
    </View>
  );
}

function SheikahRune({ rune, color }: { rune: any; color: string }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Slow continuous rotation
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: rune.rotationSpeed,
        useNativeDriver: true,
      }),
    ).start();

    // Float upward cycle
    const animate = () => {
      const startPx = (rune.startY / 100) * SCREEN_H;
      translateY.setValue(startPx);
      fade.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -20,
          duration: rune.speed,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(fade, { toValue: 1, duration: rune.speed * 0.2, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 1, duration: rune.speed * 0.6, useNativeDriver: true }),
          Animated.timing(fade, { toValue: 0, duration: rune.speed * 0.2, useNativeDriver: true }),
        ]),
      ]).start(() => animate());
    };

    const timer = setTimeout(animate, rune.delay);
    return () => clearTimeout(timer);
  }, []);

  const rotateInterpolation = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Shape rendering
  const shapeStyle: any = {
    width: rune.size,
    height: rune.size,
    backgroundColor: color,
  };

  if (rune.shape === 'circle') {
    shapeStyle.borderRadius = rune.size / 2;
  } else if (rune.shape === 'diamond') {
    shapeStyle.transform = [{ rotate: '45deg' }];
    shapeStyle.borderRadius = 1;
  } else {
    // Triangle: use border trick
    return (
      <Animated.View
        style={{
          position: 'absolute',
          left: `${rune.x}%`,
          opacity: fade,
          transform: [{ translateY }, { rotate: rotateInterpolation }],
        }}
      >
        <View style={{
          width: 0, height: 0,
          borderLeftWidth: rune.size / 2,
          borderRightWidth: rune.size / 2,
          borderBottomWidth: rune.size,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }} />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: `${rune.x}%`,
        opacity: fade,
        transform: [{ translateY }, { rotate: rotateInterpolation }],
      }}
    >
      <View style={shapeStyle} />
    </Animated.View>
  );
}

/* ─── Moon Sparkle (Senpai Mode) ─────────────────────────────────────────── */

const MOON_SPARKLE_GLYPHS = ['\u263D', '\u2605', '\u2726', '\u2661']; // ☽ ★ ✦ ♡
const MOON_SPARKLE_COLORS = ['#FFB3DF', '#5158FF', '#FFF666', '#D8B3FF'];

function MoonSparkle({ color: _color, opacity }: { color: string; opacity: number }) {
  const items = useMemo(() =>
    Array.from({ length: 14 }).map((_, i) => ({
      key: i,
      glyph: MOON_SPARKLE_GLYPHS[i % MOON_SPARKLE_GLYPHS.length],
      color: MOON_SPARKLE_COLORS[i % MOON_SPARKLE_COLORS.length],
      x: Math.random() * 100,
      startY: Math.random() * SCREEN_H,
      size: 10 + Math.random() * 14,
      speed: 18000 + Math.random() * 14000,
      twinkleMs: 2200 + Math.random() * 2400,
      delay: Math.random() * 4000,
    })),
  []);

  return (
    <View style={[styles.fullScreen, { opacity }]}>
      {items.map((it) => (
        <MoonSparkleItem key={it.key} item={it} />
      ))}
    </View>
  );
}

function MoonSparkleItem({ item }: { item: any }) {
  const translateY = useRef(new Animated.Value(item.startY)).current;
  const twinkle = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const drift = () => {
      translateY.setValue(item.startY);
      Animated.timing(translateY, {
        toValue: -40,
        duration: item.speed,
        useNativeDriver: true,
      }).start(() => drift());
    };
    const shimmer = () => {
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 0.85, duration: item.twinkleMs * 0.5, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0.15, duration: item.twinkleMs * 0.5, useNativeDriver: true }),
      ]).start(() => shimmer());
    };
    const t = setTimeout(() => { drift(); shimmer(); }, item.delay);
    return () => clearTimeout(t);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: `${item.x}%`,
        fontSize: item.size,
        color: item.color,
        opacity: twinkle,
        transform: [{ translateY }],
      }}
    >
      {item.glyph}
    </Animated.Text>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    overflow: 'hidden',
  },
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
  },
});
