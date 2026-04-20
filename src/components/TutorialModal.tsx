import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';

const TUTORIAL_KEY = '@zenki_tutorial_v1_completed';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TutorialStep {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string; // override default gold
  title: string;
  body: string;
}

const STEPS: TutorialStep[] = [
  {
    icon: 'home',
    title: 'Your home, your way',
    body: 'Everything that matters today — training, streaks, classes, and announcements — lives on Home. Tap Edit next to your name to drag sections around or hide anything you don\'t use.',
  },
  {
    icon: 'calendar',
    title: 'Book classes + private sessions',
    body: 'The Schedule tab shows the week at a glance. Tap a class to reserve it, or tap Book to request a 1:1 with an instructor. Payment happens in person at the dojo.',
  },
  {
    icon: 'barbell',
    title: 'Train smarter',
    body: 'Log workouts, heart-rate sessions, and GPS activities. Snap a food photo, upload a DEXA scan, or drop a bloodwork PDF — AI reads them and pulls the numbers for you.',
  },
  {
    icon: 'people',
    iconColor: '#FF6B6B',
    title: 'Connect with the dojo',
    body: 'Follow members, share training wins, and DM friends in the Community tab. You can block or report anything with a ••• tap.',
  },
  {
    icon: 'flame',
    iconColor: '#F97316',
    title: 'Build your streak',
    body: 'Train every day to keep your streak alive. Earn Dojo Points (💎) for rewards in the store, unlock achievements, and spin the daily wheel for bonuses.',
  },
];

interface Props {
  visible: boolean;
  onDone: () => void;
}

export function TutorialModal({ visible, onDone }: Props) {
  const { colors } = useTheme();
  const [stepIdx, setStepIdx] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  // Fade each step in
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [stepIdx, fade]);

  useEffect(() => {
    if (visible) setStepIdx(0);
  }, [visible]);

  const step = STEPS[stepIdx];
  const isLast = stepIdx === STEPS.length - 1;
  const iconColor = step.iconColor ?? colors.gold;

  const finish = async () => {
    try { await AsyncStorage.setItem(TUTORIAL_KEY, 'true'); } catch { /* ignore */ }
    onDone();
  };

  const next = () => {
    if (isLast) finish();
    else setStepIdx((i) => i + 1);
  };

  const back = () => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={finish}>
      <View style={[styles.backdrop, { backgroundColor: colors.background }]}>
        {/* Skip — top right */}
        <TouchableOpacity
          onPress={finish}
          style={[styles.skipBtn, { backgroundColor: colors.surface }]}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          accessibilityLabel="Skip tutorial"
        >
          <Text style={[styles.skipText, { color: colors.textSecondary }]}>Skip</Text>
        </TouchableOpacity>

        {/* Center card */}
        <Animated.View style={[styles.card, { opacity: fade }]}>
          <View style={[styles.iconWrap, { backgroundColor: iconColor + '22', borderColor: iconColor + '55' }]}>
            <Ionicons name={step.icon} size={56} color={iconColor} />
          </View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{step.body}</Text>
        </Animated.View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === stepIdx ? (colors.gold || '#D4A017') : colors.surface,
                  width: i === stepIdx ? 24 : 8,
                },
              ]}
            />
          ))}
        </View>

        {/* Nav row */}
        <View style={styles.navRow}>
          <TouchableOpacity
            onPress={back}
            disabled={stepIdx === 0}
            style={[styles.backBtn, { opacity: stepIdx === 0 ? 0 : 1 }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
            <Text style={[styles.backText, { color: colors.textSecondary }]}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={next}
            activeOpacity={0.85}
            style={[styles.nextBtn, { backgroundColor: colors.gold || '#D4A017' }]}
          >
            <Text style={styles.nextText}>{isLast ? "Let's go" : 'Next'}</Text>
            {!isLast && <Ionicons name="chevron-forward" size={18} color="#000" />}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Call on app start to decide whether the tutorial should run for this user. */
export async function shouldShowTutorial(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(TUTORIAL_KEY);
    return v !== 'true';
  } catch {
    return false;
  }
}

/** Reset so the tutorial runs again next launch. Wired to Settings → Secret Lab. */
export async function resetTutorial(): Promise<void> {
  try { await AsyncStorage.removeItem(TUTORIAL_KEY); } catch { /* ignore */ }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  skipBtn: {
    position: 'absolute',
    top: spacing.xl + 8,
    right: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  skipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  card: {
    alignItems: 'center',
    maxWidth: 360,
  },
  iconWrap: {
    width: 112,
    height: 112,
    borderRadius: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '400',
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 360,
    paddingHorizontal: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: borderRadius.md,
  },
  nextText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: '#000',
  },
});
