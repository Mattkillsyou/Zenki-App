import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Linking,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView, ScreenContainer, FadeInView } from '../components';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { ALL_THEMES } from '../theme/themes';
import type { ThemeDefinition } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { useHealthKit } from '../context/HealthKitContext';
import { useHeartRate } from '../context/HeartRateContext';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';
import { useSenpai } from '../context/SenpaiContext';
import { useNutrition } from '../context/NutritionContext';
import { useSenpaiChat } from '../hooks/useSenpaiChat';
import { senpaiJingle } from '../sounds/synth';
import Constants from 'expo-constants';
import { typography, spacing } from '../theme';
import { AI_FUNCTION_BASE_URL, PRIVACY_URL } from '../config/api';
import { FIREBASE_CONFIGURED, auth as firebaseAuth } from '../config/firebase';
import { resetCoachmarks } from '../components/CoachmarkTutorial';
import {
  getCurrentIdToken,
  emailForMember,
} from '../services/firebaseAuth';
import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from 'firebase/auth';

const UNITS_KEY = '@zenki_units_pref';
const SOUND_ENABLED_KEY = '@zenki_sound_enabled';
const SOUND_THEME_KEY = '@zenki_sound_theme';

type UnitPref = 'imperial' | 'metric';
type SoundTheme = 'default' | 'retro' | 'zen' | 'pipboy';

// React Native Web's Alert.alert with multiple buttons collapses to a single-
// button window.alert, making destructive confirmations un-confirmable in the
// browser preview. Use window.confirm on web, Alert.alert on native.
function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

// Old THEME_OPTIONS removed — replaced by visual theme picker grid using ALL_THEMES


export function SettingsScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user, isGuest, signOut } = useAuth();
  const {
    shareHealthWithTrainers, setShareHealthWithTrainers,
    shareSensitiveWithTrainers, setShareSensitiveWithTrainers,
  } = useNutrition();
  const isAdmin = user?.isAdmin === true;

  // Apple HealthKit — controls a clearly-labeled section so users (and
  // App Review) can see exactly what HealthKit data this app touches.
  const healthKit = useHealthKit();

  // Heart-rate monitor (BLE) — drives the DEVICES section's live status
  // subtitle. Reads only; the full picker lives in BluetoothDevicesScreen.
  const {
    bleStatus,
    bleReason,
    connectedDeviceName,
    currentBpm,
    batteryLevel,
  } = useHeartRate();

  // Dynamic subtitle — shared status copy from BLE_CONTRACT.md.
  const bleSubtitle = ((): string => {
    if (bleStatus === 'connected') {
      const base = `Connected — ${connectedDeviceName ?? 'Monitor'} · ${currentBpm > 0 ? `${currentBpm} bpm` : '— bpm'}`;
      return batteryLevel != null ? `${base} · ${batteryLevel}%` : base;
    }
    if (bleStatus === 'scanning') return 'Scanning…';
    if (bleStatus === 'connecting') return 'Connecting…';
    if (bleReason === 'poweredOff') return 'Bluetooth is off';
    if (bleReason === 'unauthorized') return 'Permission needed';
    if (bleReason === 'unsupported' || bleStatus === 'unavailable') return 'Not available on this device';
    if (bleReason === 'noDeviceFound') return 'No monitor found';
    if (bleReason === 'noHrService') return 'No heart-rate signal';
    if (bleReason === 'dropped') return 'Monitor disconnected';
    return 'Not connected';
  })();

  // ── Real sign-out: clear local state + Firebase Auth session ──
  const handleSignOut = () => {
    confirmDestructive(
      'Sign Out?',
      'You will need to sign back in next time.',
      'Sign Out',
      async () => {
        try {
          await signOut(); // clears Firebase session + local identity
        } catch {
          /* ignore */
        }
        // reset (not replace) — replace() left the signed-out Main mounted
        // beneath SignIn, piling a duplicate TabNavigator per auth cycle.
        navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
      },
    );
  };

  // ── Delete Account (Apple 5.1.1(v) requirement) ──
  const handleDeleteAccount = () => {
    confirmDestructive(
      'Delete Account?',
      'This permanently deletes your account, posts, messages, attendance history, and all training data. This cannot be undone.',
      'Delete Forever',
      () => confirmDeleteAccount(),
    );
  };

  const confirmDeleteAccount = () => {
    confirmDestructive(
      'Really?',
      'Tap Delete again to confirm. Your data will be gone immediately and cannot be recovered.',
      'Delete',
      async () => {
            try {
              // The server `deleteAccount` Cloud Function is the single source
              // of truth for deletion: it cascade-deletes the user's Firestore
              // docs + Storage AND deletes the Firebase Auth user itself via the
              // Admin SDK (admin.auth().deleteUser) as its final step. The Admin
              // SDK has no recent-login requirement, so we no longer attempt a
              // client-side user.delete() (which threw auth/requires-recent-login
              // AFTER the server had already wiped the data, leaving a
              // re-loginable account with zero data — Apple 5.1.1(v) failure).
              //
              // We therefore gate local cleanup + sign-out on the CF actually
              // succeeding. If it can't be reached or returns an error, we abort
              // WITHOUT touching local state so the user can retry on a real
              // account rather than being signed out of a half-deleted one.
              if (FIREBASE_CONFIGURED) {
                const token = await getCurrentIdToken();
                if (!token) {
                  Alert.alert(
                    'Sign in again',
                    'Your session has expired. Please sign out and back in, then try deleting your account again.',
                  );
                  return;
                }
                let res: Response;
                try {
                  res = await fetch(`${AI_FUNCTION_BASE_URL}/deleteAccount`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({}),
                  });
                } catch {
                  Alert.alert(
                    'Could not delete account',
                    "We couldn't reach the server. Check your connection and try again.",
                  );
                  return;
                }
                if (!res.ok) {
                  Alert.alert(
                    'Could not delete account',
                    'The server could not complete the deletion. Please try again or contact support.',
                  );
                  return;
                }
              }

              // Server confirmed (or Firebase isn't configured at all) — safe to
              // wipe every stored @zenki_* key and clear the local session.
              try {
                const keys = await AsyncStorage.getAllKeys();
                const zenkiKeys = keys.filter((k) => k.startsWith('@zenki_'));
                await AsyncStorage.multiRemove(zenkiKeys);
              } catch {
                try {
                  await AsyncStorage.clear();
                } catch { /* ignore */ }
              }

              await signOut();
              navigation.reset({ index: 0, routes: [{ name: 'SignIn' }] });
            } catch {
              Alert.alert('Could not delete account', 'Please try again or contact support.');
            }
      },
    );
  };

  useScreenSoundTheme('settings');
  const { play, enabled: soundCtxEnabled, setEnabled: setSoundCtxEnabled } = useSound();
  const {
    state: senpaiState,
    setEnabled: setSenpaiEnabled,
    triggerReaction,
    setVolume: setSenpaiVolume,
    setSparkleIntensity: setSenpaiSparkle,
    setAmbientEffects: setSenpaiAmbientEffects,
    clearMemoryLog: clearSenpaiMemory,
  } = useSenpai();
  const {
    voiceEnabled: senpaiVoiceEnabled,
    setVoiceEnabled: setSenpaiVoiceEnabled,
    resetTtsFailures: resetSenpaiTtsFailures,
  } = useSenpaiChat();
  // The old NOTIFICATIONS toggles (@zenki_notif_prefs) and the admin
  // "Block busy times" switch were removed: nothing in the app ever read
  // those prefs, so the switches controlled nothing. Don't re-add a toggle
  // here until the backing feature actually consults it.

  // Preferences
  const [unitPref, setUnitPref] = useState<UnitPref>('imperial');
  // Audit 2.0.5 P1: the Sound Effects toggle used to write its OWN key
  // (@zenki_sound_enabled) and local state, which nothing in SoundContext
  // ever read — a complete no-op (sounds kept playing; the switch rendered
  // stale after restart). Drive the real SoundContext pref instead: it is
  // the value every play() call checks, and it persists itself.
  const soundEnabled = soundCtxEnabled;
  const [soundTheme, setSoundTheme] = useState<SoundTheme>('default');

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then((v) => { if (v === 'metric') setUnitPref('metric'); });
    AsyncStorage.getItem(SOUND_THEME_KEY).then((v) => { if (v) setSoundTheme(v as SoundTheme); });
  }, []);

  const handleUnitChange = (u: UnitPref) => {
    setUnitPref(u);
    AsyncStorage.setItem(UNITS_KEY, u);
  };
  const handleSoundToggle = (val: boolean) => {
    setSoundCtxEnabled(val);
    // Keep the legacy key in sync for anything that may read it later.
    AsyncStorage.setItem(SOUND_ENABLED_KEY, String(val));
  };
  const handleSoundTheme = (theme: SoundTheme) => {
    setSoundTheme(theme);
    AsyncStorage.setItem(SOUND_THEME_KEY, theme);
  };

  // Password change state
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async () => {
    if (!user) return;
    if (!currentPw || !newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }
    if (newPw.length < 6) {
      Alert.alert('Too short', 'New password must be at least 6 characters.');
      return;
    }

    if (!FIREBASE_CONFIGURED || !firebaseAuth?.currentUser) {
      Alert.alert(
        'Not signed in',
        'Your Firebase session is missing. Please sign out and back in, then try again.',
      );
      return;
    }

    setSaving(true);
    try {
      const currentUser = firebaseAuth.currentUser;
      const email = currentUser.email ?? emailForMember(user);

      // Firebase requires a recent sign-in for sensitive ops — re-authenticate
      // with the user's current password first.
      const credential = EmailAuthProvider.credential(email, currentPw);
      await reauthenticateWithCredential(currentUser, credential);

      // Issue the password change
      await updatePassword(currentUser, newPw);

      setPwModalOpen(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      Alert.alert('Password updated', 'Your sign-in password has been changed.');
    } catch (err: any) {
      const code = err?.code ?? '';
      const msg =
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Your current password is wrong.'
          : code === 'auth/weak-password'
            ? 'Firebase considers that password too weak.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Wait a minute and try again.'
              : code === 'auth/network-request-failed'
                ? 'Network error. Check your connection.'
                : 'Could not save password. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const renderSectionHeader = (title: string) => (
    <Text style={[styles.sectionLabel, { color: colors.gold, letterSpacing: 1.5 }]}>{title}</Text>
  );

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (val: boolean) => void,
  ) => (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.settingDesc, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.surfaceSecondary, true: colors.gold }}
        thumbColor={colors.background}
      />
    </View>
  );

  const renderNavRow = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    destructive?: boolean,
  ) => (
    <TouchableOpacity
      style={[styles.settingRow, { borderBottomColor: colors.border, paddingHorizontal: 18, paddingVertical: 18 }]}
      onPress={onPress}
    >
      <View style={styles.navRowLeft}>
        <View style={[styles.navIconCircle, { width: 44, height: 44, borderRadius: 12, backgroundColor: destructive ? colors.error + '20' : colors.gold + '15' }]}>
          <Ionicons
            name={icon}
            size={20}
            color={destructive ? colors.error : colors.gold}
          />
        </View>
        <Text style={[
          styles.settingLabel,
          { color: destructive ? colors.error : colors.textPrimary, marginLeft: 14, fontSize: 16, fontWeight: '600' },
        ]}>
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer maxWidth="form">
      <KeyboardAwareScrollView offset={64}>
        {/* Two-tier entrance: header (chrome) at 0, the settings body (content) at ~60ms. */}
        {/* Header */}
        <FadeInView role="header">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButtonStyled, { backgroundColor: colors.surface, borderColor: colors.border, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 }]}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: 34, fontWeight: '800' }]}>Settings</Text>
          <View style={styles.backButton} />
        </View>
        </FadeInView>

        <FadeInView baseDelay={60} index={0}>
        {/* Visual Theme Picker — the theme is a free choice on its own,
            independent of the Senpai companion toggle below: her theme is a
            normal option here, and the mascot works on ANY theme. */}
        {renderSectionHeader('VISUAL THEME')}
        <View style={styles.themeGrid}>
          {ALL_THEMES.filter((t) => !['system', 'clean-light', 'clean-dark'].includes(t.id)).map((t: ThemeDefinition) => {
            const isActive = mode === t.id;
            const c = t.colors;
            return (
              <TouchableOpacity
                key={t.id}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: colors.surface,
                    // Only render a border when active — a transparent
                    // borderWidth of 2 still produces a faint anti-aliased
                    // edge on iOS, which read as "darker outline" on the
                    // inactive cards.
                    ...(isActive
                      ? { borderColor: colors.accent, borderWidth: 2 }
                      : {}),
                  },
                ]}
                onPress={() => { play('navigate'); setMode(t.id as ThemeMode); }}
                activeOpacity={0.7}
              >
                {/* Color swatch — 4 circles */}
                <View style={styles.themeSwatches}>
                  <View style={[styles.themeSwatch, { backgroundColor: c.background }]} />
                  <View style={[styles.themeSwatch, { backgroundColor: c.accent || c.gold }]} />
                  <View style={[styles.themeSwatch, { backgroundColor: c.textPrimary }]} />
                  <View style={[styles.themeSwatch, { backgroundColor: c.surface }]} />
                </View>
                <Text style={[styles.themeCardName, { color: isActive ? colors.accent : colors.textPrimary }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Text style={[styles.themeCardDesc, { color: colors.textMuted }]} numberOfLines={1}>
                  {t.description}
                </Text>
                {isActive && (
                  <View style={[styles.themeCheck, { backgroundColor: colors.accent }]}>
                    <Ionicons name="checkmark" size={10} color={colors.textInverse} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Senpai Mode toggle — the COMPANION only: it spawns the floating
            chibi and no longer touches the visual theme (pick her theme
            above if you want the full reskin too). The expanded senpai
            controls (volume, sparkles, memory) still live in the
            SECRET LAB section further down. */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: senpaiState.enabled ? 'rgba(255, 46, 81, 0.04)' : colors.surface,
              borderRadius: 20,
              padding: 0,
              marginTop: spacing.md,
            },
          ]}
        >
          <View style={[styles.settingRow, { borderBottomColor: colors.border, borderBottomWidth: senpaiState.enabled ? StyleSheet.hairlineWidth : 0 }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Mode</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                Your personal anime cheerleader
              </Text>
            </View>
            <Switch
              value={senpaiState.enabled}
              onValueChange={(val) => {
                setSenpaiEnabled(val);
                if (val) {
                  senpaiJingle();
                  triggerReaction('celebrating', 'SENPAI NOTICED ME!!', 4000);
                  Alert.alert(
                    '⚠️ Warning',
                    'May contain excessive enthusiasm and sparkles. Not responsible for increased motivation.',
                  );
                }
              }}
              trackColor={{ false: colors.surfaceSecondary, true: '#FF2E51' }}
              thumbColor={colors.background}
            />
          </View>

          {/* Senpai voice (TTS) — only meaningful when Senpai Mode is on.
              Persisted to AsyncStorage. Auto-disables after consecutive
              TTS failures (e.g. ElevenLabs free-tier blocked) so the user
              can flip it back on here once their account is healthy. */}
          {senpaiState.enabled && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Voice</Text>
                <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                  Hear her replies out loud (ElevenLabs TTS)
                </Text>
              </View>
              <Switch
                value={senpaiVoiceEnabled}
                onValueChange={(val) => {
                  setSenpaiVoiceEnabled(val);
                  // Re-enabling clears the auto-disable failure counter
                  // — the next reply will get a fresh shot at TTS.
                  if (val) resetSenpaiTtsFailures();
                }}
                trackColor={{ false: colors.surfaceSecondary, true: '#FF2E51' }}
                thumbColor={colors.background}
              />
            </View>
          )}
        </View>

        {/* Preferences */}
        {renderSectionHeader('PREFERENCES')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
          {/* Sound toggle */}
          {renderToggleRow(
            'Sound Effects',
            'Plays audio on actions and transitions',
            soundEnabled,
            handleSoundToggle,
          )}
        </View>

        {/* Learn */}
        {renderSectionHeader('LEARN')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
          {renderNavRow('school-outline', 'Training', () => navigation.navigate('TrainingHome'))}
        </View>

        {/* Apple Health — clearly identified per App Review guideline 2.5.1 */}
        {Platform.OS === 'ios' && (
          <>
            {renderSectionHeader('APPLE HEALTH')}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
              <View style={styles.healthRow}>
                <View style={styles.healthRowLeft}>
                  <Ionicons name="heart" size={22} color="#FF3B30" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.healthRowTitle, { color: colors.textPrimary }]}>
                      Connect to Apple Health
                    </Text>
                    <Text style={[styles.healthRowSubtitle, { color: colors.textMuted }]}>
                      {!healthKit.available
                        ? 'Available on iPhone only.'
                        : healthKit.enabled
                          ? healthKit.authorized
                            ? 'Connected — syncing workouts, weight, nutrition, and heart rate.'
                            : 'Enabled — tap to grant permissions.'
                          : 'Off. Turn on to sync workouts, weight, nutrition, and heart rate with Apple Health.'}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={healthKit.enabled}
                  onValueChange={async (on) => {
                    healthKit.setEnabled(on);
                    if (on && !healthKit.authorized) {
                      await healthKit.authorize();
                    }
                  }}
                  disabled={!healthKit.available}
                  trackColor={{ false: colors.border, true: colors.gold }}
                  thumbColor="#FFFFFF"
                />
              </View>
              {healthKit.enabled && healthKit.available && (
                <>
                  <View style={[styles.healthDataRow, { borderTopColor: colors.divider }]}>
                    <Text style={[styles.healthDataLabel, { color: colors.textMuted }]}>READS FROM HEALTH</Text>
                    <Text style={[styles.healthDataValue, { color: colors.textSecondary }]}>
                      Steps · Active Energy · Heart Rate · Body Mass
                    </Text>
                  </View>
                  <View style={[styles.healthDataRow, { borderTopColor: colors.divider }]}>
                    <Text style={[styles.healthDataLabel, { color: colors.textMuted }]}>WRITES TO HEALTH</Text>
                    <Text style={[styles.healthDataValue, { color: colors.textSecondary }]}>
                      Workouts · Weight · Nutrition · Heart-Rate Sessions
                    </Text>
                  </View>
                </>
              )}
            </View>
          </>
        )}

        {/* Devices — live heart-rate-monitor status + full picker. Mirrors
            the Apple Health section's structure (sectionCard + a status row
            with a dynamic subtitle). Hidden on web, where BLE is unavailable. */}
        {Platform.OS !== 'web' && (
          <>
            {renderSectionHeader('DEVICES')}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
              <View style={styles.healthRow}>
                <View style={styles.healthRowLeft}>
                  <Ionicons
                    name={bleStatus === 'connected' ? 'bluetooth' : 'bluetooth-outline'}
                    size={22}
                    color={bleStatus === 'connected' ? colors.success : colors.gold}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.healthRowTitle, { color: colors.textPrimary }]}>
                      Heart-Rate Monitor
                    </Text>
                    <Text style={[styles.healthRowSubtitle, { color: colors.textMuted }]}>
                      {bleSubtitle}
                    </Text>
                  </View>
                </View>
              </View>
              {renderNavRow('bluetooth-outline', 'Manage Devices', () => navigation.navigate('BluetoothDevices'))}
            </View>
          </>
        )}

        {/* Privacy & Safety */}
        {renderSectionHeader('PRIVACY & SAFETY')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
          {renderToggleRow(
            'Share training & body data with my trainer',
            'Off by default. When on, your coaches can see your DEXA scans, bloodwork, heart-rate sessions, and GPS activities — including route maps, which show where you run. Your weight and food logs are never shared. You can turn this off anytime.',
            shareHealthWithTrainers,
            (val) => { setShareHealthWithTrainers(val); },
          )}
          {renderToggleRow(
            'Share medication & cycle data with my trainer',
            'Off by default, and separate from the switch above — turning that one on does NOT share this. When on, your coaches can see your medication list, dose history, and cycle tracking. You can turn this off anytime.',
            shareSensitiveWithTrainers,
            (val) => { setShareSensitiveWithTrainers(val); },
          )}
          {renderNavRow('person-remove-outline', 'Blocked Users', () => navigation.navigate('BlockedUsers'))}
        </View>

        {/* Account */}
        {isAdmin && renderSectionHeader('ACCOUNT')}
        {isAdmin && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
            {renderNavRow('key-outline', 'Change Password', () => setPwModalOpen(true))}
          </View>
        )}

        {/* Audit 2.0.5: the DATA section was removed — "Export All Data" was a
            shipped placeholder ("in production this would download…") and the
            Clear buttons removed storage keys that the live contexts immediately
            re-persisted, so nothing actually cleared. Honest data controls
            (real export / real clear) are tracked for a future pass; account
            deletion below remains the real data-removal path. */}

        {/* Secret Lab / Senpai Headquarters */}
        {renderSectionHeader(senpaiState.enabled ? 'SENPAI HEADQUARTERS \u263D' : 'SECRET LAB \uD83E\uDDEA')}
        <View style={[
          styles.sectionCard,
          {
            backgroundColor: senpaiState.enabled ? 'rgba(255, 46, 81, 0.04)' : colors.surface,
            borderColor: senpaiState.enabled ? 'rgba(255, 46, 81, 0.20)' : colors.border,
            borderRadius: 20,
            borderWidth: 1.5,
            padding: 0,
          },
        ]}>
          {/* Senpai Mode toggle moved up under the Theme picker; the
              expanded controls below only render when she's already on. */}

          {/* Senpai sub-settings — only visible when enabled */}
          {senpaiState.enabled && (
            <>
              {/* Volume picker */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={[styles.settingInfo, { marginRight: 0, marginBottom: 10 }]}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Reaction Frequency</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    {senpaiState.volume === 'low' ? 'Senpai is shy' : senpaiState.volume === 'med' ? 'Senpai notices things' : 'SENPAI NEVER MISSES'}
                  </Text>
                </View>
                <View style={styles.senpaiSegmented}>
                  {(['low', 'med', 'high'] as const).map((v) => {
                    const active = senpaiState.volume === v;
                    const label = v === 'low' ? 'Low' : v === 'med' ? 'Med' : 'High';
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setSenpaiVolume(v)}
                        activeOpacity={0.7}
                        style={[
                          styles.senpaiSegment,
                          {
                            backgroundColor: active ? '#FF2E51' : colors.surfaceSecondary,
                            borderColor: active ? '#FF2E51' : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[styles.senpaiSegmentLabel, { color: active ? '#000' : colors.textSecondary }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Sparkle intensity */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={[styles.settingInfo, { marginRight: 0, marginBottom: 10 }]}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Sparkle Intensity</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    {senpaiState.sparkleIntensity === 'maximum' ? 'MY EYES' : 'Tasteful sparkles'}
                  </Text>
                </View>
                <View style={styles.senpaiSegmented}>
                  {(['normal', 'maximum'] as const).map((v) => {
                    const active = senpaiState.sparkleIntensity === v;
                    const label = v === 'normal' ? 'Normal' : 'MAXIMUM';
                    return (
                      <TouchableOpacity
                        key={v}
                        onPress={() => setSenpaiSparkle(v)}
                        activeOpacity={0.7}
                        style={[
                          styles.senpaiSegment,
                          {
                            backgroundColor: active ? '#FF2E51' : colors.surfaceSecondary,
                            borderColor: active ? '#FF2E51' : 'transparent',
                          },
                        ]}
                      >
                        <Text style={[styles.senpaiSegmentLabel, { color: active ? '#000' : colors.textSecondary }]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Ambient effects toggle */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Background Effects</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    {senpaiState.ambientEffects ? 'Stars & moons drifting \u263D' : 'Ambient effects off'}
                  </Text>
                </View>
                <Switch
                  value={senpaiState.ambientEffects}
                  onValueChange={(val) => setSenpaiAmbientEffects(val)}
                  trackColor={{ false: colors.surfaceSecondary, true: '#FF2E51' }}
                  thumbColor={colors.background}
                />
              </View>

              {/* Chat is now always-on via hold-to-talk on the mascot
                  herself \u2014 no toggle needed. The character IS the chat. */}

              {/* Memory log entry */}
              <TouchableOpacity
                style={[styles.settingRow, { borderBottomColor: colors.border }]}
                onPress={() => navigation.navigate('SenpaiMemory')}
                activeOpacity={0.7}
              >
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Memory Log</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    {senpaiState.memoryLog.length} {senpaiState.memoryLog.length === 1 ? 'memory' : 'memories'} recorded
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              {/* Clear memory */}
              <TouchableOpacity
                style={[styles.settingRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  Alert.alert(
                    'Clear Senpai Memory?',
                    'All reaction history will be erased. Senpai will forget everything.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Clear', style: 'destructive', onPress: () => clearSenpaiMemory() },
                    ],
                  );
                }}
                activeOpacity={0.7}
              >
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Clear Memory</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    Erase all {senpaiState.memoryLog.length} {senpaiState.memoryLog.length === 1 ? 'memory' : 'memories'}
                  </Text>
                </View>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={[styles.settingRow, { borderBottomWidth: 0 }]}
            onPress={async () => {
              await resetCoachmarks();
              Alert.alert('Tutorial reset', 'It will show next time you open Home.');
            }}
            activeOpacity={0.7}
          >
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Replay tutorial</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Show the first-run walkthrough again</Text>
            </View>
            <Ionicons name="refresh" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* About */}
        {renderSectionHeader('ABOUT')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 0 }]}>
          {renderNavRow('information-circle-outline', 'About Zenki Dojo', () =>
            Linking.openURL('https://zenki-dojo.web.app')
          )}
          {renderNavRow('shield-outline', 'Privacy Policy', () =>
            Linking.openURL(PRIVACY_URL)
          )}
        </View>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm, borderRadius: 20, padding: 0 }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            Zenki Dojo v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>

        {/* Account — guests have no account to sign out of or delete (5.1.1(v)),
            so show a single Sign In / Create Account row instead of Danger Zone. */}
        {isGuest ? (
          <>
            {renderSectionHeader('ACCOUNT')}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm, borderRadius: 20, padding: 0 }]}>
              {renderNavRow('log-in-outline', 'Sign In / Create Account', () => navigation.navigate('SignIn'))}
            </View>
          </>
        ) : (
          <>
            {/* Danger Zone */}
            {renderSectionHeader('DANGER ZONE')}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm, borderRadius: 20, padding: 0 }]}>
              {renderNavRow('log-out-outline', 'Sign Out', handleSignOut, true)}
              {renderNavRow('person-remove-outline', 'Delete Account', handleDeleteAccount, true)}
            </View>
          </>
        )}

        {/* Credit */}
        <Text style={[styles.creditText, { color: colors.textMuted }]}>
          Created by Matt Brown · 2026
        </Text>

        <View style={{ height: spacing.xxl * 2 }} />
        </FadeInView>
      </KeyboardAwareScrollView>
      </ScreenContainer>

      {/* Password Change Modal (admin-only) */}
      <Modal visible={pwModalOpen} animationType="slide" transparent>
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModalOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Default admin password is "password". Change it here.
            </Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Current password"
              placeholderTextColor={colors.textMuted}
              value={currentPw}
              onChangeText={setCurrentPw}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="New password"
              placeholderTextColor={colors.textMuted}
              value={newPw}
              onChangeText={setNewPw}
              secureTextEntry
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textMuted}
              value={confirmPw}
              onChangeText={setConfirmPw}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: colors.red, opacity: saving ? 0.6 : 1 }]}
              onPress={handleChangePassword}
              disabled={saving}
            >
              <Text style={styles.modalBtnText}>{saving ? 'Saving…' : 'Update Password'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  backButtonStyled: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    letterSpacing: -0.3,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
    paddingHorizontal: spacing.lg,
    marginTop: 28,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  settingDesc: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  navRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // ── Apple Health section (transparency for App Review 2.5.1) ──
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  healthRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 12,
  },
  healthRowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  healthRowSubtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 17,
  },
  healthDataRow: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  healthDataLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  healthDataValue: {
    fontSize: 13,
    marginTop: 4,
  },
  navIconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    gap: 0,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    gap: 6,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  themeOptionLabel: {
    ...typography.label,
    fontSize: 12,
  },
  versionText: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    padding: spacing.lg,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 22, fontWeight: '800' },
  modalSubtitle: { fontSize: 13, fontWeight: '500', marginBottom: spacing.sm },
  modalInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 4,
  },
  modalBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  modalBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  creditText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    opacity: 0.7,
  },

  // ── Theme picker grid ──
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  themeCard: {
    width: '31%',
    borderRadius: 14,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    position: 'relative',
  },
  themeSwatches: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
  },
  themeSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  themeCardName: {
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  themeCardDesc: {
    fontSize: 8,
    fontWeight: '500',
    textAlign: 'center',
  },
  themeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Unit toggle ──
  unitToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 2,
    gap: 2,
  },
  unitBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },

  // ── Sound theme ──
  soundThemeRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  soundThemeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  soundThemeLabel: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Senpai segmented control ──
  senpaiSegmented: {
    flexDirection: 'row',
    gap: 6,
  },
  senpaiSegment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senpaiSegmentLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
