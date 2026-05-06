import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
// Use expo-image-picker for both camera and photo-library permission
// requests — its imperative API is stable across SDKs, while expo-camera
// SDK 55+ moved camera permission to a hook (`useCameraPermissions`).
// The system dialog is the same NSCameraUsageDescription either way.
import * as ImagePicker from 'expo-image-picker';
import * as ExpoCalendar from 'expo-calendar';
import { SoundPressable } from '../../components/SoundPressable';
import { FadeInView } from '../../components';
import { useTheme } from '../../context/ThemeContext';
import { spacing, borderRadius } from '../../theme';
import { safeStorageSet } from '../../utils/safeStorage';
import { initHealthKit, ALL_HEALTH_CATEGORIES } from '../../services/healthKit';
import { registerForPushNotifications, savePushTokenToFirestore } from '../../services/pushNotifications';
import { useAuth } from '../../context/AuthContext';

// Persist key for the outcomes record. Used later by feature gates to know
// whether to show "you skipped this — re-enable in Settings" hints.
const OUTCOMES_KEY = '@zenki_permission_outcomes';

type Outcome = 'granted' | 'denied' | 'skipped';
type PermissionId =
  | 'camera'
  | 'microphone'
  | 'location'
  | 'bluetooth'
  | 'notifications'
  | 'photos'
  | 'calendar'
  | 'health';

type Outcomes = Partial<Record<PermissionId, Outcome>>;

// Speech recognition is a separate native package; we lazy-require so the
// JS bundle still builds if the user hasn't done a fresh native build.
function requestSpeechPermission(): Promise<{ granted: boolean }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
    return ExpoSpeechRecognitionModule.requestPermissionsAsync();
  } catch (e) {
    console.warn('[PermissionsOnboarding] expo-speech-recognition unavailable:', e);
    return Promise.resolve({ granted: false });
  }
}

interface PermissionStep {
  id: PermissionId;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  /** Whether this step should be shown on the current platform. */
  enabled?: () => boolean;
  /**
   * Trigger the system permission dialog. Returns the outcome for storage.
   * Don't return 'skipped' — that's reserved for the Skip button.
   */
  request: () => Promise<Outcome>;
}

const STEPS: PermissionStep[] = [
  {
    id: 'camera',
    icon: 'camera-outline',
    title: 'Camera',
    description:
      'Used to scan food barcodes, take progress and meal photos, and set your profile picture. Photos stay on your device unless you explicitly post them.',
    request: async () => {
      const r = await ImagePicker.requestCameraPermissionsAsync();
      return r.granted ? 'granted' : 'denied';
    },
  },
  {
    id: 'microphone',
    icon: 'mic-outline',
    title: 'Microphone',
    description:
      'Used for talking to Senpai in the chat. Audio is transcribed on-device and never uploaded.',
    request: async () => {
      const r = await requestSpeechPermission();
      return r.granted ? 'granted' : 'denied';
    },
  },
  {
    id: 'location',
    icon: 'location-outline',
    title: 'Location',
    description:
      'Used while the app is in use — to auto-log dojo visits and record route, distance, and pace during GPS-tracked workouts. Background tracking is OFF.',
    request: async () => {
      const r = await Location.requestForegroundPermissionsAsync();
      return r.status === 'granted' ? 'granted' : 'denied';
    },
  },
  {
    id: 'bluetooth',
    icon: 'bluetooth-outline',
    title: 'Bluetooth',
    description:
      'Used to connect to a Bluetooth heart-rate monitor during training. iOS will ask the next time you start a workout — granting now just confirms intent.',
    // iOS doesn't expose a direct "request bluetooth" API outside of an
    // active scan. Mark intent as granted; the real prompt fires on first
    // BLE scan via react-native-ble-plx.
    request: async () => 'granted',
  },
  {
    id: 'notifications',
    icon: 'notifications-outline',
    title: 'Notifications',
    description:
      'Used for class reminders, dojo broadcasts, medication reminders, and appointment confirmations. You can fine-tune which categories ping you in Settings later.',
    request: async () => {
      const r = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return r.granted || r.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED
        ? 'granted'
        : 'denied';
    },
  },
  {
    id: 'photos',
    icon: 'images-outline',
    title: 'Photos',
    description:
      'Used to pick a profile picture, attach photos to community posts, and upload bloodwork or DEXA scan PDFs. Read-only access — we never modify your library.',
    request: async () => {
      const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return r.granted ? 'granted' : 'denied';
    },
  },
  {
    id: 'calendar',
    icon: 'calendar-outline',
    title: 'Calendar',
    description:
      'Used to add booked classes and training sessions to your calendar so they show alongside your other events. You opt in per booking.',
    request: async () => {
      const r = await ExpoCalendar.requestCalendarPermissionsAsync();
      return r.status === 'granted' ? 'granted' : 'denied';
    },
  },
  {
    id: 'health',
    icon: 'fitness-outline',
    title: 'Apple Health',
    description:
      'Read steps, calories, active minutes, and heart rate from Apple Health. Write your logged workouts, weight, nutrition, and heart-rate sessions back so all your data lives in one place.',
    enabled: () => Platform.OS === 'ios',
    request: async () => {
      const ok = await initHealthKit(ALL_HEALTH_CATEGORIES);
      return ok ? 'granted' : 'denied';
    },
  },
];

export function PermissionsOnboardingScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();

  // Filter out steps disabled on this platform up-front so the pager
  // count + "step N of M" math is honest.
  const activeSteps = STEPS.filter((s) => !s.enabled || s.enabled());

  const [stepIdx, setStepIdx] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcomes>({});
  const [busy, setBusy] = useState(false);

  const step = activeSteps[stepIdx];
  const isLast = stepIdx === activeSteps.length - 1;

  const persist = useCallback((next: Outcomes) => {
    safeStorageSet(OUTCOMES_KEY, next, '[PermissionsOnboarding]');
  }, []);

  const advance = useCallback((next: Outcomes) => {
    if (isLast) {
      persist(next);
      navigation.replace('Main');
      return;
    }
    persist(next);
    setStepIdx((i) => i + 1);
  }, [isLast, navigation, persist]);

  const handleAllow = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    let result: Outcome = 'denied';
    try {
      result = await step.request();
    } catch (err) {
      console.warn(`[PermissionsOnboarding] ${step.id} request threw:`, err);
      result = 'denied';
    }
    // The notifications step's request() asks iOS for permission but does
    // NOT save an Expo push token to Firestore. Without that token, admin
    // broadcasts find no recipients. Register + save here right after the
    // grant, while we still have explicit user consent in scope.
    if (step.id === 'notifications' && result === 'granted' && user?.id) {
      try {
        const token = await registerForPushNotifications();
        if (token) await savePushTokenToFirestore(user.id, token);
      } catch (err) {
        console.warn('[PermissionsOnboarding] push token save failed:', err);
      }
    }
    const next = { ...outcomes, [step.id]: result };
    setOutcomes(next);
    setBusy(false);
    advance(next);
  }, [busy, step, outcomes, advance, user?.id]);

  const handleSkip = useCallback(() => {
    if (busy) return;
    const next = { ...outcomes, [step.id]: 'skipped' as Outcome };
    setOutcomes(next);
    advance(next);
  }, [busy, step, outcomes, advance]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <FadeInView style={styles.body}>
        {/* Step counter */}
        <Text style={[styles.stepCounter, { color: colors.textMuted }]}>
          Step {stepIdx + 1} of {activeSteps.length}
        </Text>

        {/* Big icon */}
        <View style={[styles.iconBubble, { backgroundColor: colors.gold + '18', borderColor: colors.gold }]}>
          <Ionicons name={step.icon} size={56} color={colors.gold} />
        </View>

        {/* Title + description */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>{step.title}</Text>
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {step.description}
        </Text>

        {/* Optional micro-copy reminder */}
        <Text style={[styles.optional, { color: colors.textMuted }]}>
          Optional · you can change this later in Settings.
        </Text>
      </FadeInView>

      {/* Pager dots */}
      <View style={styles.pager}>
        {activeSteps.map((_s, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor:
                  i === stepIdx ? colors.gold : i < stepIdx ? colors.gold + '66' : colors.border,
                width: i === stepIdx ? 22 : 6,
              },
            ]}
          />
        ))}
      </View>

      {/* Buttons */}
      <View style={styles.buttons}>
        <SoundPressable
          activeOpacity={0.85}
          onPress={handleAllow}
          disabled={busy}
          style={[
            styles.allowBtn,
            { backgroundColor: busy ? colors.surface : colors.gold, opacity: busy ? 0.6 : 1 },
          ]}
        >
          <Text style={styles.allowBtnText}>{busy ? 'WAITING…' : 'ALLOW'}</Text>
        </SoundPressable>
        <SoundPressable
          activeOpacity={0.7}
          onPress={handleSkip}
          disabled={busy}
          style={styles.skipBtn}
        >
          <Text style={[styles.skipBtnText, { color: colors.textMuted }]}>
            {isLast ? 'SKIP & FINISH' : 'SKIP FOR NOW'}
          </Text>
        </SoundPressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  stepCounter: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: spacing.lg,
  },
  iconBubble: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: spacing.xs,
  },
  optional: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginTop: spacing.md,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginVertical: spacing.lg,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  buttons: {
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  allowBtn: {
    paddingVertical: 16,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  allowBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  skipBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});
