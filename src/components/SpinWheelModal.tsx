import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import Svg, {
  Path,
  Circle,
  G,
  Defs,
  RadialGradient,
  Stop,
  LinearGradient,
} from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSpinWheel, WHEEL_SLICES, SpinPrize } from '../context/SpinWheelContext';
import { useSound } from '../context/SoundContext';
import { Confetti } from './Confetti';

const SLICE_COUNT = 8;
const SLICE_ANGLE = 360 / SLICE_COUNT;
const WHEEL_SIZE = Math.min(Dimensions.get('window').width - 80, 280);
const CENTER = WHEEL_SIZE / 2;
const RADIUS = WHEEL_SIZE / 2 - 6;

// Vibrant per-slice colors — each slice a distinct hue.
// Ordered to alternate warm/cool around the wheel for visual rhythm.
const SLICE_COLORS = [
  '#E63946', // 0 — red       (50 Diamonds)
  '#3B82F6', // 1 — blue      (3 Flames)
  '#22C55E', // 2 — green     (100 Diamonds)
  '#8B5CF6', // 3 — purple    (Free Drink)
  '#F97316', // 4 — orange    (200 Diamonds)
  '#EC4899', // 5 — pink      (10 Flames)
  '#14B8A6', // 6 — teal      (Jackpot)
  '#D4A017', // 7 — gold      (Free Shirt)
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Build an SVG path for a pie slice centered at (CENTER,CENTER). */
function sliceArc(startDeg: number, endDeg: number): string {
  const startRad = ((startDeg - 90) * Math.PI) / 180;
  const endRad = ((endDeg - 90) * Math.PI) / 180;
  const x1 = CENTER + RADIUS * Math.cos(startRad);
  const y1 = CENTER + RADIUS * Math.sin(startRad);
  const x2 = CENTER + RADIUS * Math.cos(endRad);
  const y2 = CENTER + RADIUS * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER},${CENTER} L ${x1.toFixed(3)},${y1.toFixed(3)} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
}

/** Position for the icon at the center of a slice, pushed out from the hub. */
function labelPos(sliceIdx: number): { x: number; y: number } {
  const centerDeg = sliceIdx * SLICE_ANGLE + SLICE_ANGLE / 2;
  const centerRad = ((centerDeg - 90) * Math.PI) / 180;
  const distance = RADIUS * 0.66;
  return {
    x: CENTER + distance * Math.cos(centerRad),
    y: CENTER + distance * Math.sin(centerRad),
  };
}

/** Map a slice index to an Ionicons glyph name. */
function getSliceIcon(idx: number): keyof typeof Ionicons.glyphMap {
  const slice = WHEEL_SLICES[idx];
  if (slice.type === 'points' && slice.amount >= 1000) return 'trophy';
  if (slice.type === 'points') return 'diamond';
  if (slice.type === 'flames') return 'flame';
  if (slice.type === 'item' && slice.itemKey === 'free_drink') return 'cafe';
  if (slice.type === 'item' && slice.itemKey === 'free_shirt') return 'shirt';
  return 'gift';
}

/** Map the prize result to an Ionicons glyph for the result display. */
function getResultIcon(prize: SpinPrize): keyof typeof Ionicons.glyphMap {
  if (prize.type === 'points' && prize.amount >= 1000) return 'trophy';
  if (prize.type === 'points') return 'diamond';
  if (prize.type === 'flames') return 'flame';
  if (prize.type === 'item' && prize.itemKey === 'free_drink') return 'cafe';
  if (prize.type === 'item' && prize.itemKey === 'free_shirt') return 'shirt';
  return 'gift';
}

export function SpinWheelModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { spin } = useSpinWheel();
  const { play } = useSound();
  const rotation = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinPrize | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (visible) {
      setResult(null);
      rotation.setValue(0);
      setSpinning(false);
      setShowConfetti(false);
    }
  }, [visible, rotation]);

  // Idle pulse on the TAP TO SPIN button
  useEffect(() => {
    if (!visible || spinning || result) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spinning, result, pulseAnim]);

  const handleSpin = () => {
    if (spinning) return;
    play('tap');
    setSpinning(true);
    setResult(null);

    const { sliceIndex, prize } = spin();
    const spins = 6;
    const jitter = (Math.random() - 0.5) * (SLICE_ANGLE * 0.3);
    const targetAngle =
      spins * 360 - (sliceIndex * SLICE_ANGLE + SLICE_ANGLE / 2) + jitter;

    // Two-phase animation: long deceleration, then a small overshoot bounce
    // so the wheel "settles" into its final position with a subtle wobble.
    Animated.sequence([
      Animated.timing(rotation, {
        toValue: targetAngle + 14,
        duration: 3800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rotation, {
        toValue: targetAngle,
        duration: 360,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSpinning(false);
      setResult(prize);
      play('success');
      if (prize.confetti) {
        setShowConfetti(false);
        setTimeout(() => setShowConfetti(true), 30);
      }
    });
  };

  const spinDeg = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Confetti active={showConfetti} />

        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.backgroundElevated,
              borderColor: colors.gold,
              shadowColor: colors.gold,
              // @ts-ignore — boxShadow web only
              boxShadow: '0 0 40px rgba(212,160,23,0.25)',
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>DAILY SPIN</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            One free spin every day.
          </Text>

          {/* Wheel */}
          <View style={styles.wheelWrap}>
            {/* Pointer — gold downward triangle with dark border for depth */}
            <View style={styles.pointerOuter} />
            <View style={[styles.pointer, { borderTopColor: colors.gold }]} />
            <View style={[styles.pointerKnob, { backgroundColor: colors.gold, borderColor: '#000' }]} />

            <Animated.View style={[styles.wheelOuter, { transform: [{ rotate: spinDeg }] }]}>
              <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
                <Defs>
                  {/* Inner shine — bright at upper-center fading out */}
                  <RadialGradient
                    id="wheel-shine"
                    cx="50%"
                    cy="35%"
                    rx="55%"
                    ry="55%"
                    fx="50%"
                    fy="35%"
                  >
                    <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" />
                    <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.08" />
                    <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </RadialGradient>
                  {/* Subtle outer rim gradient */}
                  <LinearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#F8D77B" />
                    <Stop offset="1" stopColor="#A07910" />
                  </LinearGradient>
                </Defs>

                {/* Outer rim ring (gold gradient) */}
                <Circle cx={CENTER} cy={CENTER} r={RADIUS + 4} fill="url(#rim)" />

                {/* Pie slices — vibrant colors */}
                <G>
                  {WHEEL_SLICES.map((_slice, i) => {
                    const start = i * SLICE_ANGLE;
                    const end = (i + 1) * SLICE_ANGLE;
                    return (
                      <Path
                        key={`slice-${i}`}
                        d={sliceArc(start, end)}
                        fill={SLICE_COLORS[i]}
                        stroke="rgba(0,0,0,0.35)"
                        strokeWidth={1}
                      />
                    );
                  })}
                </G>

                {/* Glossy radial shine overlay (sits on top of the slices) */}
                <Circle
                  cx={CENTER}
                  cy={CENTER}
                  r={RADIUS}
                  fill="url(#wheel-shine)"
                  pointerEvents="none"
                />
              </Svg>

              {/* Slice icons — Ionicons positioned absolutely.
                  These rotate with the wheel because they live inside
                  this same Animated.View. */}
              {WHEEL_SLICES.map((_slice, i) => {
                const { x, y } = labelPos(i);
                const iconSize = Math.round(WHEEL_SIZE * 0.115);
                return (
                  <View
                    key={`icon-${i}`}
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      left: x - iconSize / 2,
                      top: y - iconSize / 2,
                      width: iconSize,
                      height: iconSize,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={getSliceIcon(i)} size={iconSize} color="#FFFFFF" />
                  </View>
                );
              })}
            </Animated.View>

            {/* Hub (doesn't rotate) — gold disc with flame */}
            <View
              pointerEvents="none"
              style={[
                styles.hub,
                {
                  backgroundColor: colors.gold,
                  borderColor: '#000',
                  // @ts-ignore — web glow
                  boxShadow: '0 0 12px rgba(212,160,23,0.6)',
                },
              ]}
            >
              <Ionicons name="flame" size={24} color="#000" />
            </View>
          </View>

          {/* Result or Spin button */}
          {result ? (
            <View style={styles.resultWrap}>
              <View style={[styles.resultIconBubble, { backgroundColor: colors.gold + '22', borderColor: colors.gold }]}>
                <Ionicons name={getResultIcon(result)} size={32} color={colors.gold} />
              </View>
              <Text style={[styles.resultTitle, { color: colors.gold }]}>YOU WON</Text>
              <Text style={[styles.resultPrize, { color: colors.textPrimary }]}>{result.label}</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
                onPress={onClose}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>COLLECT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Animated.View style={{ transform: [{ scale: pulseAnim }], width: '100%' }}>
              <TouchableOpacity
                onPress={handleSpin}
                disabled={spinning}
                activeOpacity={0.85}
                style={[
                  styles.primaryBtn,
                  styles.primaryBtnLarge,
                  {
                    backgroundColor: spinning ? colors.surface : colors.gold,
                    opacity: spinning ? 0.7 : 1,
                    shadowColor: colors.gold,
                    // @ts-ignore — web glow
                    boxShadow: spinning ? 'none' : '0 4px 20px rgba(212,160,23,0.45)',
                  },
                ]}
              >
                <View style={styles.primaryBtnRow}>
                  {!spinning && <Ionicons name="sparkles" size={16} color="#000" />}
                  <Text style={styles.primaryBtnText}>
                    {spinning ? 'SPINNING…' : 'TAP TO SPIN'}
                  </Text>
                  {!spinning && <Ionicons name="sparkles" size={16} color="#000" />}
                </View>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 2,
    padding: 22,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 22,
  },

  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    position: 'relative',
  },
  // Pointer — gold downward triangle with subtle drop
  pointer: {
    position: 'absolute',
    top: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 14,
    borderRightWidth: 14,
    borderTopWidth: 24,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 22,
  },
  // Black outline behind the pointer for contrast
  pointerOuter: {
    position: 'absolute',
    top: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 16,
    borderRightWidth: 16,
    borderTopWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#000',
    zIndex: 21,
  },
  // Tiny knob at the very top above the pointer
  pointerKnob: {
    position: 'absolute',
    top: -16,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    zIndex: 23,
  },
  wheelOuter: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    position: 'relative',
  },
  hub: {
    position: 'absolute',
    top: CENTER - 24,
    left: CENTER - 24,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    zIndex: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },

  resultWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  resultIconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  resultPrize: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 14,
    textAlign: 'center',
  },

  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryBtnLarge: {
    paddingVertical: 18,
    borderRadius: 16,
  },
  primaryBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
