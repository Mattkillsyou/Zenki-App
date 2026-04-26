import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, Animated, Dimensions} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { borderRadius } from '../theme';

const TUTORIAL_KEY = '@zenki_tutorial_v2_completed';
const { width: SW, height: SH } = Dimensions.get('window');

export interface CoachmarkStep {
  /** Screen-space rect of the UI element to highlight. null = centered, no arrow. */
  target: { x: number; y: number; width: number; height: number } | null;
  title: string;
  body: string;
}

interface Props {
  visible: boolean;
  steps: CoachmarkStep[];
  onDone: () => void;
}

const BUBBLE_PADDING = 16;
const BUBBLE_MARGIN = 12; // distance from target to bubble
const ARROW_SIZE = 14;

export function CoachmarkTutorial({ visible, steps, onDone }: Props) {
  const { colors } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) setStepIdx(0);
  }, [visible]);

  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [stepIdx, fade]);

  if (!visible || steps.length === 0) return null;

  const step = steps[stepIdx];
  const isLast = stepIdx === steps.length - 1;

  const finish = async () => {
    try { await AsyncStorage.setItem(TUTORIAL_KEY, 'true'); } catch { /* ignore */ }
    onDone();
  };

  const next = () => { if (isLast) finish(); else setStepIdx((i) => i + 1); };
  const back = () => { if (stepIdx > 0) setStepIdx((i) => i - 1); };

  // Figure out where the bubble should go (above vs below the target)
  const target = step.target;
  // Bubble height estimate (based on content); we'll let flex sort it out,
  // but this guides the above-vs-below choice.
  const estBubbleHeight = 180;
  const showBelow = !target ? false : target.y + target.height + BUBBLE_MARGIN + estBubbleHeight < SH - 60;
  const centered = !target;

  const bubbleTop = (() => {
    if (centered) return SH / 2 - estBubbleHeight / 2;
    return showBelow
      ? target!.y + target!.height + BUBBLE_MARGIN + ARROW_SIZE
      : target!.y - BUBBLE_MARGIN - ARROW_SIZE - estBubbleHeight;
  })();

  // Arrow horizontal position (relative to bubble) pointing at target center
  const targetCenterX = target ? target.x + target.width / 2 : SW / 2;
  const bubbleWidth = Math.min(SW - 32, 340);
  const bubbleLeft = Math.max(16, Math.min(SW - bubbleWidth - 16, targetCenterX - bubbleWidth / 2));
  const arrowLeftWithinBubble = Math.max(16, Math.min(bubbleWidth - 16, targetCenterX - bubbleLeft - ARROW_SIZE / 2));

  return (
    <Modal visible animationType="fade" transparent onRequestClose={finish} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>

        {/* ── Dim overlay with a cutout around the target (4 rects) ── */}
        {target ? (
          <>
            {/* Top */}
            <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, target.y) }]} />
            {/* Bottom */}
            <View style={[styles.dim, { top: target.y + target.height, left: 0, right: 0, bottom: 0 }]} />
            {/* Left */}
            <View style={[styles.dim, { top: target.y, left: 0, width: Math.max(0, target.x), height: target.height }]} />
            {/* Right */}
            <View style={[styles.dim, {
              top: target.y,
              left: target.x + target.width,
              right: 0,
              height: target.height,
            }]} />
            {/* Gold ring around the target */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: target.x - 4,
                top: target.y - 4,
                width: target.width + 8,
                height: target.height + 8,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: colors.gold || '#D4A017',
              }}
            />
          </>
        ) : (
          <View style={[styles.dim, StyleSheet.absoluteFill]} />
        )}

        {/* ── Tap-to-advance layer BELOW the bubble, ABOVE the dim ── */}
        <SoundPressable
          style={StyleSheet.absoluteFill}
          onPress={next}
          activeOpacity={1}
        />

        {/* ── Bubble ── */}
        <Animated.View
          style={[
            styles.bubble,
            {
              position: 'absolute',
              top: Math.max(32, bubbleTop),
              left: bubbleLeft,
              width: bubbleWidth,
              backgroundColor: colors.backgroundElevated,
              borderColor: colors.gold || '#D4A017',
              opacity: fade,
              transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
            },
          ]}
        >
          {/* Arrow */}
          {target && (
            showBelow ? (
              <View
                style={[styles.arrowUp, {
                  left: arrowLeftWithinBubble,
                  borderBottomColor: colors.gold || '#D4A017',
                }]}
              />
            ) : (
              <View
                style={[styles.arrowDown, {
                  left: arrowLeftWithinBubble,
                  borderTopColor: colors.gold || '#D4A017',
                }]}
              />
            )
          )}

          <View style={styles.bubbleHeader}>
            <Text style={[styles.stepCounter, { color: colors.textMuted }]}>
              {stepIdx + 1} of {steps.length}
            </Text>
            <SoundPressable onPress={finish} hitSlop={{ top: 8, left: 8, bottom: 8, right: 8 }}>
              <Text style={[styles.skipText, { color: colors.textMuted }]}>Skip</Text>
            </SoundPressable>
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>

          <View style={styles.navRow}>
            {stepIdx > 0 ? (
              <SoundPressable onPress={back} style={styles.backBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-back" size={18} color={colors.textSecondary} />
                <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
              </SoundPressable>
            ) : <View style={{ width: 64 }} />}

            <SoundPressable
              onPress={next}
              activeOpacity={0.85}
              style={[styles.nextBtn, { backgroundColor: colors.gold || '#D4A017' }]}
            >
              <Text style={styles.nextText}>{isLast ? "Got it" : 'Next'}</Text>
              {!isLast && <Ionicons name="chevron-forward" size={16} color="#000" />}
            </SoundPressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** True if we should run the v2 coachmark tutorial for this user. */
export async function shouldShowCoachmarks(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_KEY);
    return v !== 'true';
  } catch {
    return false;
  }
}

/** Called from Help → Replay to re-show the tutorial next time Home mounts. */
export async function resetCoachmarks(): Promise<void> {
  try { await AsyncStorage.removeItem(TUTORIAL_KEY); } catch { /* ignore */ }
}

const styles = StyleSheet.create({
  dim: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.72)',
  },

  bubble: {
    padding: BUBBLE_PADDING,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 12,
  },
  // Triangle pointing UP (for bubbles placed BELOW the target)
  arrowUp: {
    position: 'absolute',
    top: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderBottomWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  // Triangle pointing DOWN (for bubbles placed ABOVE the target)
  arrowDown: {
    position: 'absolute',
    bottom: -ARROW_SIZE,
    width: 0,
    height: 0,
    borderLeftWidth: ARROW_SIZE,
    borderRightWidth: ARROW_SIZE,
    borderTopWidth: ARROW_SIZE,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },

  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  stepCounter: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  skipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  title: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
  },

  navRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 8,
  },
  backText: {
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
  },
  nextText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#000',
  },
});
