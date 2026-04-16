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
import Svg, { Path, Circle, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSpinWheel, WHEEL_SLICES, SpinPrize } from '../context/SpinWheelContext';
import { useSound } from '../context/SoundContext';
import { Confetti } from './Confetti';

const SLICE_COUNT = 8;
const SLICE_ANGLE = 360 / SLICE_COUNT;
const WHEEL_SIZE = Math.min(Dimensions.get('window').width - 80, 280);
const CENTER = WHEEL_SIZE / 2;
const RADIUS = WHEEL_SIZE / 2 - 4;

// Two alternating colors only — simple, clean.
const SLICE_COLORS = ['#D4A017', '#1A1A1A', '#D4A017', '#1A1A1A', '#D4A017', '#1A1A1A', '#D4A017', '#1A1A1A'];
const SLICE_TEXT_COLOR = ['#000', '#D4A017', '#000', '#D4A017', '#000', '#D4A017', '#000', '#D4A017'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

/** Build an SVG path for a pie slice centered at (CENTER,CENTER) with given start/end angles (degrees, 0 = top, clockwise). */
function sliceArc(startDeg: number, endDeg: number): string {
  const startRad = ((startDeg - 90) * Math.PI) / 180;
  const endRad   = ((endDeg - 90) * Math.PI) / 180;
  const x1 = CENTER + RADIUS * Math.cos(startRad);
  const y1 = CENTER + RADIUS * Math.sin(startRad);
  const x2 = CENTER + RADIUS * Math.cos(endRad);
  const y2 = CENTER + RADIUS * Math.sin(endRad);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CENTER},${CENTER} L ${x1.toFixed(3)},${y1.toFixed(3)} A ${RADIUS},${RADIUS} 0 ${largeArc} 1 ${x2.toFixed(3)},${y2.toFixed(3)} Z`;
}

/** Position for the text label at the center of a slice, pushed out from the hub.
 *  Labels stay upright (no rotation) for maximum legibility. */
function labelPos(sliceIdx: number): { x: number; y: number } {
  const centerDeg = sliceIdx * SLICE_ANGLE + SLICE_ANGLE / 2;
  const centerRad = ((centerDeg - 90) * Math.PI) / 180;
  const distance = RADIUS * 0.68;
  return {
    x: CENTER + distance * Math.cos(centerRad),
    y: CENTER + distance * Math.sin(centerRad),
  };
}

export function SpinWheelModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { spin } = useSpinWheel();
  const { play } = useSound();
  const rotation = useRef(new Animated.Value(0)).current;
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

  const handleSpin = () => {
    if (spinning) return;
    play('tap');
    setSpinning(true);
    setResult(null);

    const { sliceIndex, prize } = spin();
    const spins = 6;
    const jitter = (Math.random() - 0.5) * (SLICE_ANGLE * 0.3);
    const targetAngle = spins * 360 - (sliceIndex * SLICE_ANGLE + SLICE_ANGLE / 2) + jitter;

    Animated.timing(rotation, {
      toValue: targetAngle,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      setResult(prize);
      play('success');
      // Rare prizes (Free Drink, Free Shirt, 500pts jackpot) fire the confetti cannon
      if (prize.confetti) {
        setShowConfetti(false);          // reset first
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
        {/* Confetti lives ABOVE the card so it rains over everything */}
        <Confetti active={showConfetti} />

        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.gold }]}>
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
            {/* Pointer (red triangle pointing down from the top) */}
            <View style={[styles.pointer, { borderTopColor: colors.red }]} />

            <Animated.View style={[styles.wheelOuter, { transform: [{ rotate: spinDeg }] }]}>
              <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
                {/* Outer gold ring */}
                <Circle cx={CENTER} cy={CENTER} r={RADIUS + 3} fill={colors.gold} />

                {/* Pie slices */}
                <G>
                  {WHEEL_SLICES.map((slice, i) => {
                    const start = i * SLICE_ANGLE;
                    const end = (i + 1) * SLICE_ANGLE;
                    return (
                      <Path
                        key={i}
                        d={sliceArc(start, end)}
                        fill={SLICE_COLORS[i]}
                        stroke={colors.gold}
                        strokeWidth={1}
                      />
                    );
                  })}
                </G>

                {/* Slice icons — UPRIGHT emoji, no rotation.
                    Only the icon is shown on the wheel; the full prize name
                    is revealed in the result display after winning. */}
                <G>
                  {WHEEL_SLICES.map((slice, i) => {
                    const { x, y } = labelPos(i);
                    const fs = WHEEL_SIZE * 0.14;
                    return (
                      <SvgText
                        key={`t-${i}`}
                        x={x}
                        y={y}
                        dy={fs * 0.35}
                        fontSize={fs}
                        textAnchor="middle"
                      >
                        {slice.icon}
                      </SvgText>
                    );
                  })}
                </G>
              </Svg>
            </Animated.View>

            {/* Hub (doesn't rotate) */}
            <View pointerEvents="none" style={[styles.hub, { backgroundColor: colors.gold, borderColor: colors.red }]}>
              <Ionicons name="flame" size={22} color="#000" />
            </View>
          </View>

          {/* Result or Spin button */}
          {result ? (
            <View style={styles.resultWrap}>
              <Text style={[styles.resultTitle, { color: colors.gold }]}>YOU WON</Text>
              <Text style={[styles.resultPrize, { color: colors.textPrimary }]}>{result.label}</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
                onPress={onClose}
              >
                <Text style={styles.primaryBtnText}>COLLECT</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleSpin}
              disabled={spinning}
              style={[styles.primaryBtn, { backgroundColor: spinning ? colors.surface : colors.gold, opacity: spinning ? 0.7 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>
                {spinning ? 'SPINNING…' : 'TAP TO SPIN'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 2,
    padding: 20,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 20,
  },

  wheelWrap: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  pointer: {
    position: 'absolute',
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 20,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    zIndex: 20,
  },
  wheelOuter: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
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
  },

  resultWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  resultTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  resultPrize: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginBottom: 14,
  },

  primaryBtn: {
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
