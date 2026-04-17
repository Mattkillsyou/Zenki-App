import React, { useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { useSenpai } from '../context/SenpaiContext';

const { width: SW, height: SH } = Dimensions.get('window');

/**
 * SenpaiOverlay — fullscreen particle effects when Senpai Mode is active.
 * Hearts, sparkles, kaomoji float upward during cheering/celebrating moods.
 */
export function SenpaiOverlay() {
  const { state } = useSenpai();
  if (!state.enabled || !state.sparkleActive) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <FloatingHearts />
      <FloatingKaomoji />
      <SparkleParticles />
    </View>
  );
}

/* ─── Floating Hearts ─────────────────────────────────────────────────────── */

function FloatingHearts() {
  const hearts = useMemo(() =>
    Array.from({ length: 12 }).map((_, i) => ({
      key: i,
      x: 50 + Math.random() * (SW - 100),
      size: 12 + Math.random() * 10,
      speed: 1500 + Math.random() * 1500,
      delay: Math.random() * 1000,
      drift: (Math.random() - 0.5) * 40,
    })),
  []);

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
          Animated.delay(config.speed - 700),
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
      {'\u2661'}
    </Animated.Text>
  );
}

/* ─── Floating Kaomoji ────────────────────────────────────────────────────── */

function FloatingKaomoji() {
  const emotes = ['\u2605', '\u2661', '\u2727', '!', '\u266A', '\u2606', '\u2764'];
  const items = useMemo(() =>
    Array.from({ length: 8 }).map((_, i) => ({
      key: i,
      text: emotes[i % emotes.length],
      x: 30 + Math.random() * (SW - 60),
      speed: 1200 + Math.random() * 800,
      delay: Math.random() * 2000,
    })),
  []);

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
          Animated.delay(config.speed - 500),
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

/* ─── Sparkle Particles ───────────────────────────────────────────────────── */

function SparkleParticles() {
  const sparkles = useMemo(() =>
    Array.from({ length: 10 }).map((_, i) => ({
      key: i,
      x: 40 + Math.random() * (SW - 80),
      y: SH * 0.4 + Math.random() * (SH * 0.4),
      size: 6 + Math.random() * 6,
      speed: 600 + Math.random() * 600,
      delay: Math.random() * 1500,
    })),
  []);

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

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99989,
    overflow: 'hidden',
  },
});
