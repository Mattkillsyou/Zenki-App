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
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSpinWheel, WHEEL_SLICES, SpinPrize } from '../context/SpinWheelContext';
import { useSound } from '../context/SoundContext';

const SLICE_COUNT = 8;
const SLICE_ANGLE = 360 / SLICE_COUNT;
const WHEEL_SIZE = Math.min(Dimensions.get('window').width - 60, 300);

// Alternating slice colors for contrast
const SLICE_COLORS = ['#D4A017', '#1a1a1a', '#D4A017', '#C41E2A', '#D4A017', '#1a1a1a', '#D4A017', '#C41E2A'];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SpinWheelModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { spin } = useSpinWheel();
  const { play } = useSound();
  const rotation = useRef(new Animated.Value(0)).current;
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinPrize | null>(null);

  // Reset whenever modal opens
  useEffect(() => {
    if (visible) {
      setResult(null);
      rotation.setValue(0);
      setSpinning(false);
    }
  }, [visible, rotation]);

  const handleSpin = () => {
    if (spinning) return;
    play('tap');
    setSpinning(true);
    setResult(null);

    // Compute prize upfront and land the wheel on it
    const { sliceIndex, prize } = spin();
    // To land slice i under the pointer (top), rotate so that slice i centers at the top.
    // Slices are drawn starting at the top going clockwise; center of slice i is at angle:
    //   (i * SLICE_ANGLE) + SLICE_ANGLE / 2
    // We rotate counter-clockwise, so final rotation = 360 * N - centerAngle - jitter
    const spins = 6; // full rotations before landing
    const jitter = (Math.random() - 0.5) * (SLICE_ANGLE * 0.35); // small variance within slice
    const targetAngle = spins * 360 - (sliceIndex * SLICE_ANGLE + SLICE_ANGLE / 2) + jitter;

    Animated.timing(rotation, {
      toValue: targetAngle,
      duration: 3800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      setResult(prize);
      play('success');
    });
  };

  const spinDeg = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.backgroundElevated, borderColor: colors.gold }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>DAILY SPIN</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            One free spin every day. Win flames, points, or a free drink.
          </Text>

          {/* Wheel */}
          <View style={styles.wheelWrap}>
            {/* Pointer */}
            <View style={[styles.pointer, { borderTopColor: colors.red }]} />

            <Animated.View
              style={[
                styles.wheel,
                {
                  width: WHEEL_SIZE,
                  height: WHEEL_SIZE,
                  borderRadius: WHEEL_SIZE / 2,
                  borderColor: colors.gold,
                  transform: [{ rotate: spinDeg }],
                },
              ]}
            >
              {WHEEL_SLICES.map((slice, i) => {
                const angle = i * SLICE_ANGLE;
                return (
                  <View
                    key={i}
                    style={[
                      styles.slice,
                      {
                        width: WHEEL_SIZE,
                        height: WHEEL_SIZE,
                        transform: [{ rotate: `${angle}deg` }],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.sliceTri,
                        {
                          width: WHEEL_SIZE / 2,
                          borderLeftWidth: (WHEEL_SIZE / 2) * Math.tan((SLICE_ANGLE / 2) * (Math.PI / 180)),
                          borderRightWidth: (WHEEL_SIZE / 2) * Math.tan((SLICE_ANGLE / 2) * (Math.PI / 180)),
                          borderBottomWidth: WHEEL_SIZE / 2,
                          borderBottomColor: SLICE_COLORS[i],
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.sliceLabel,
                        {
                          color: i % 2 === 1 ? '#FFF' : '#000',
                          top: WHEEL_SIZE * 0.11,
                        },
                      ]}
                    >
                      {slice.label}
                    </Text>
                  </View>
                );
              })}
              {/* Hub */}
              <View style={[styles.hub, { backgroundColor: colors.gold, borderColor: colors.red }]}>
                <Ionicons name="flame" size={28} color="#000" />
              </View>
            </Animated.View>
          </View>

          {/* Result or Spin button */}
          {result ? (
            <View style={styles.resultWrap}>
              <Text style={[styles.resultTitle, { color: colors.gold }]}>You won</Text>
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
    maxWidth: 380,
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
    marginBottom: 8,
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
    paddingHorizontal: 12,
  },

  wheelWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
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
    zIndex: 10,
  },
  wheel: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  slice: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
  },
  sliceTri: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    alignSelf: 'center',
  },
  sliceLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  hub: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    zIndex: 5,
  },

  resultWrap: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  resultTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  resultPrize: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 16,
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
