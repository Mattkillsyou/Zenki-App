import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { ALL_THEMES } from '../theme/themes';
import type { ThemeDefinition } from '../theme/colors';
import { useAuth } from '../context/AuthContext';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';
import { useSenpai } from '../context/SenpaiContext';
import { senpaiJingle } from '../sounds/synth';
import { randomDialogue } from '../data/senpaiDialogue';
import { typography, spacing, borderRadius } from '../theme';
import { AI_FUNCTION_BASE_URL } from '../config/api';
import { FIREBASE_CONFIGURED, auth as firebaseAuth } from '../config/firebase';
import { resetCoachmarks } from '../components/CoachmarkTutorial';
import {
  firebaseDeleteCurrentUser,
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

// Old THEME_OPTIONS removed — replaced by visual theme picker grid using ALL_THEMES


export function SettingsScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user, signOut } = useAuth();
  const isAdmin = user?.isAdmin === true;

  // ── Real sign-out: clear local state + Firebase Auth session ──
  const handleSignOut = () => {
    Alert.alert('Sign Out?', 'You will need to sign back in next time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut(); // clears Firebase session + local identity
          } catch {
            /* ignore */
          }
          navigation.replace('SignIn');
        },
      },
    ]);
  };

  // ── Delete Account (Apple 5.1.1(v) requirement) ──
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account?',
      'This permanently deletes your account, posts, messages, attendance history, and all training data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => confirmDeleteAccount(),
        },
      ],
    );
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Really?',
      'Tap Delete again to confirm. Your data will be gone immediately and cannot be recovered.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Ask the server to cascade-delete Firestore docs + Storage
              if (FIREBASE_CONFIGURED) {
                const token = await getCurrentIdToken();
                if (token) {
                  try {
                    await fetch(`${AI_FUNCTION_BASE_URL}/deleteAccount`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                      },
                      body: JSON.stringify({}),
                    });
                  } catch {
                    /* network failure — still proceed with local cleanup */
                  }
                }

                // Client-side Firebase Auth user deletion
                try {
                  await firebaseDeleteCurrentUser();
                } catch (e: any) {
                  if (e?.code === 'auth/requires-recent-login') {
                    Alert.alert(
                      'Sign in again',
                      'For security, please sign out and sign back in, then try deleting your account again.',
                    );
                    return;
                  }
                  // Other errors — continue with local cleanup anyway
                }
              }

              // Local wipe — clear every stored @zenki_* key
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
              navigation.replace('SignIn');
            } catch {
              Alert.alert('Could not delete account', 'Please try again or contact support.');
            }
          },
        },
      ],
    );
  };

  useScreenSoundTheme('settings');
  const { play } = useSound();
  const {
    state: senpaiState,
    setEnabled: setSenpaiEnabled,
    triggerReaction,
    setVolume: setSenpaiVolume,
    setSparkleIntensity: setSenpaiSparkle,
    setAmbientEffects: setSenpaiAmbientEffects,
    clearMemoryLog: clearSenpaiMemory,
  } = useSenpai();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [classReminders, setClassReminders] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [streakAlerts, setStreakAlerts] = useState(true);
  const [achievementAlerts, setAchievementAlerts] = useState(true);
  const [weeklyReportNotif, setWeeklyReportNotif] = useState(true);
  const [calendarSync, setCalendarSync] = useState(false);

  // Load notification prefs
  useEffect(() => {
    AsyncStorage.getItem('@zenki_notif_prefs').then((raw) => {
      if (!raw) return;
      try {
        const p = JSON.parse(raw);
        if (p.pushEnabled !== undefined) setPushEnabled(p.pushEnabled);
        if (p.classReminders !== undefined) setClassReminders(p.classReminders);
        if (p.emailUpdates !== undefined) setEmailUpdates(p.emailUpdates);
        if (p.streakAlerts !== undefined) setStreakAlerts(p.streakAlerts);
        if (p.achievementAlerts !== undefined) setAchievementAlerts(p.achievementAlerts);
        if (p.weeklyReportNotif !== undefined) setWeeklyReportNotif(p.weeklyReportNotif);
        if (p.calendarSync !== undefined) setCalendarSync(p.calendarSync);
      } catch {}
    });
  }, []);

  // Persist notification prefs on change
  useEffect(() => {
    AsyncStorage.setItem('@zenki_notif_prefs', JSON.stringify({
      pushEnabled, classReminders, emailUpdates, streakAlerts,
      achievementAlerts, weeklyReportNotif, calendarSync,
    }));
  }, [pushEnabled, classReminders, emailUpdates, streakAlerts, achievementAlerts, weeklyReportNotif, calendarSync]);

  // Preferences
  const [unitPref, setUnitPref] = useState<UnitPref>('imperial');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundTheme, setSoundTheme] = useState<SoundTheme>('default');

  useEffect(() => {
    AsyncStorage.getItem(UNITS_KEY).then((v) => { if (v === 'metric') setUnitPref('metric'); });
    AsyncStorage.getItem(SOUND_ENABLED_KEY).then((v) => { if (v === 'false') setSoundEnabled(false); });
    AsyncStorage.getItem(SOUND_THEME_KEY).then((v) => { if (v) setSoundTheme(v as SoundTheme); });
  }, []);

  const handleUnitChange = (u: UnitPref) => {
    setUnitPref(u);
    AsyncStorage.setItem(UNITS_KEY, u);
  };
  const handleSoundToggle = (val: boolean) => {
    setSoundEnabled(val);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={64}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButtonStyled, { backgroundColor: colors.surface, borderColor: colors.border, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 }]}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: 34, fontWeight: '800' }]}>Settings</Text>
          <View style={styles.backButton} />
        </View>

        {/* Visual Theme Picker */}
        {renderSectionHeader('VISUAL THEME')}
        {senpaiState.enabled && (
          <Text style={{
            color: colors.textMuted,
            fontSize: 12,
            fontStyle: 'italic',
            paddingHorizontal: 20,
            paddingBottom: 8,
          }}>
            Senpai Mode controls the theme. Disable Senpai to change.
          </Text>
        )}
        <View
          style={[styles.themeGrid, senpaiState.enabled && { opacity: 0.45 }]}
          pointerEvents={senpaiState.enabled ? 'none' : 'auto'}
        >
          {ALL_THEMES.filter((t) => !['system', 'clean-light', 'clean-dark', 'senpai'].includes(t.id)).map((t: ThemeDefinition) => {
            const isActive = mode === t.id;
            const c = t.colors;
            return (
              <TouchableOpacity
                key={t.id}
                disabled={senpaiState.enabled}
                style={[
                  styles.themeCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isActive ? colors.accent : colors.border,
                    borderWidth: isActive ? 2 : 1,
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

        {/* Preferences */}
        {renderSectionHeader('PREFERENCES')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {/* Units toggle */}
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Units</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Distance, weight, elevation display</Text>
            </View>
            <View style={[styles.unitToggle, { backgroundColor: colors.backgroundElevated }]}>
              <TouchableOpacity
                onPress={() => handleUnitChange('imperial')}
                style={[styles.unitBtn, unitPref === 'imperial' && { backgroundColor: colors.gold }]}
              >
                <Text style={[styles.unitBtnText, { color: unitPref === 'imperial' ? '#000' : colors.textSecondary }]}>mi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleUnitChange('metric')}
                style={[styles.unitBtn, unitPref === 'metric' && { backgroundColor: colors.gold }]}
              >
                <Text style={[styles.unitBtnText, { color: unitPref === 'metric' ? '#000' : colors.textSecondary }]}>km</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Sound toggle */}
          {renderToggleRow(
            'Sound Effects',
            'Plays audio on actions and transitions',
            soundEnabled,
            handleSoundToggle,
          )}
        </View>

        {/* Notifications */}
        {renderSectionHeader('NOTIFICATIONS')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderToggleRow(
            'Push Notifications',
            'Receive alerts on your device',
            pushEnabled,
            setPushEnabled,
          )}
          {renderToggleRow(
            'Class Reminders',
            '30 min before your booked class',
            classReminders,
            setClassReminders,
          )}
          {renderToggleRow(
            'Streak Alerts',
            'Reminder if your streak is about to end',
            streakAlerts,
            setStreakAlerts,
          )}
          {renderToggleRow(
            'Achievement Unlocks',
            'When you earn a new badge',
            achievementAlerts,
            setAchievementAlerts,
          )}
          {renderToggleRow(
            'Weekly Report',
            'Summary delivered every Monday',
            weeklyReportNotif,
            setWeeklyReportNotif,
          )}
          {renderToggleRow(
            'Email Updates',
            'Dojo news and schedule changes',
            emailUpdates,
            setEmailUpdates,
          )}
        </View>

        {/* Calendar — admin-only */}
        {isAdmin && (
          <>
            {renderSectionHeader('CALENDAR')}
            <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
              {renderToggleRow(
                'Block busy times from booking',
                "When on, members can't book slots you already have an event for",
                calendarSync,
                setCalendarSync,
              )}
            </View>
          </>
        )}

        {/* Learn */}
        {renderSectionHeader('LEARN')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('school-outline', 'Training', () => navigation.navigate('TrainingHome'))}
        </View>

        {/* Privacy & Safety */}
        {renderSectionHeader('PRIVACY & SAFETY')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('person-remove-outline', 'Blocked Users', () => navigation.navigate('BlockedUsers'))}
        </View>

        {/* Account */}
        {isAdmin && renderSectionHeader('ACCOUNT')}
        {isAdmin && (
          <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
            {renderNavRow('key-outline', 'Change Password', () => setPwModalOpen(true))}
          </View>
        )}

        {/* Data */}
        {renderSectionHeader('DATA')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('download-outline', 'Export All Data', () => {
            Alert.alert('Export Data', 'This will compile all your data into a downloadable JSON file.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Export', onPress: async () => {
                try {
                  const keys = await AsyncStorage.getAllKeys();
                  const stores = await AsyncStorage.multiGet(keys);
                  const data: Record<string, any> = {};
                  for (const [key, val] of stores) {
                    if (key.startsWith('@zenki_') && val) {
                      try { data[key] = JSON.parse(val); } catch { data[key] = val; }
                    }
                  }
                  Alert.alert('Data Ready', `Exported ${Object.keys(data).length} data stores. In production, this would download as a JSON file.`);
                } catch {
                  Alert.alert('Error', 'Could not export data.');
                }
              }},
            ]);
          })}
          {renderNavRow('trash-outline', 'Clear Workout History', () => {
            Alert.alert('Clear Workouts?', 'This will delete all workout logs. This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => {
                AsyncStorage.removeItem('@zenki_workout_logs');
                Alert.alert('Cleared', 'Workout history has been reset.');
              }},
            ]);
          }, true)}
          {renderNavRow('trash-outline', 'Clear Nutrition Data', () => {
            Alert.alert('Clear Nutrition?', 'This will delete all macro entries and weight logs. This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => {
                AsyncStorage.removeItem('@zenki_macro_entries');
                AsyncStorage.removeItem('@zenki_weight_entries');
                Alert.alert('Cleared', 'Nutrition data has been reset.');
              }},
            ]);
          }, true)}
        </View>

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
          <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
            <View style={styles.settingInfo}>
              <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Mode</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>Your personal anime cheerleader</Text>
            </View>
            <Switch
              value={senpaiState.enabled}
              onValueChange={(val) => {
                setSenpaiEnabled(val);
                if (val) {
                  senpaiJingle();
                  triggerReaction('celebrating', 'SENPAI NOTICED ME!!', 4000);
                  Alert.alert(
                    '\u26A0\uFE0F Warning',
                    'May contain excessive enthusiasm and sparkles. Not responsible for increased motivation.',
                  );
                }
              }}
              trackColor={{ false: colors.surfaceSecondary, true: '#FF2E51' }}
              thumbColor={colors.background}
            />
          </View>

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
                            borderColor: active ? '#FF2E51' : colors.border,
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
                            borderColor: active ? '#FF2E51' : colors.border,
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

              {/* Outfit picker — placeholder */}
              <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
                <View style={styles.settingInfo}>
                  <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Outfit</Text>
                  <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                    {'Default uniform \u00B7 more coming soon'}
                  </Text>
                </View>
                <View style={{
                  backgroundColor: 'rgba(255, 46, 81, 0.12)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 46, 81, 0.25)',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 10,
                }}>
                  <Text style={{ color: '#FF2E51', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 }}>1 / 1</Text>
                </View>
              </View>

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
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('information-circle-outline', 'About Zenki Dojo', () =>
            Linking.openURL('http://www.zenkidojo.com')
          )}
          {renderNavRow('document-text-outline', 'Terms of Service', () =>
            Linking.openURL('http://www.zenkidojo.com/terms')
          )}
          {renderNavRow('shield-outline', 'Privacy Policy', () =>
            Linking.openURL('http://www.zenkidojo.com/privacy')
          )}
        </View>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            Zenki Dojo v1.0.0
          </Text>
        </View>

        {/* Danger Zone */}
        {renderSectionHeader('DANGER ZONE')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('log-out-outline', 'Sign Out', handleSignOut, true)}
          {renderNavRow('person-remove-outline', 'Delete Account', handleDeleteAccount, true)}
        </View>

        {/* Credit */}
        <Text style={[styles.creditText, { color: colors.textMuted }]}>
          Created by Matt Brown · 2026
        </Text>

        <View style={{ height: spacing.xxl * 2 }} />
        </ScrollView>
      </KeyboardAvoidingView>

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
    paddingVertical: spacing.md,
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
