import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ADMIN_PASSWORD_OVERRIDE_KEY } from '../data/members';
import { typography, spacing, borderRadius } from '../theme';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function SettingsScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin === true;
  const [pushEnabled, setPushEnabled] = useState(true);
  const [classReminders, setClassReminders] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [calendarSync, setCalendarSync] = useState(false);

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

    setSaving(true);
    try {
      // Verify current password
      const raw = await AsyncStorage.getItem(ADMIN_PASSWORD_OVERRIDE_KEY);
      const overrides: Record<string, string> = raw ? JSON.parse(raw) : {};
      const expected = overrides[user.id] ?? 'password';
      if (currentPw !== expected) {
        Alert.alert('Incorrect password', 'Your current password is wrong.');
        setSaving(false);
        return;
      }

      // Save new password
      overrides[user.id] = newPw;
      await AsyncStorage.setItem(ADMIN_PASSWORD_OVERRIDE_KEY, JSON.stringify(overrides));

      setPwModalOpen(false);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      Alert.alert('Password updated', 'Your sign-in password has been changed.');
    } catch (err) {
      Alert.alert('Error', 'Could not save password. Please try again.');
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
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButtonStyled, { backgroundColor: colors.surface, borderColor: colors.border, width: 44, height: 44, borderRadius: 22, borderWidth: 1.5 }]}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: 34, fontWeight: '800' }]}>Settings</Text>
          <View style={styles.backButton} />
        </View>

        {/* Appearance */}
        {renderSectionHeader('APPEARANCE')}
        <View style={[styles.themeToggle, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {THEME_OPTIONS.map((opt, idx) => {
            const isActive = mode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  { borderRightWidth: idx < THEME_OPTIONS.length - 1 ? 1 : 0, borderRightColor: colors.border },
                  isActive && { backgroundColor: colors.gold + '15', borderColor: colors.gold },
                ]}
                onPress={() => setMode(opt.value)}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={isActive ? colors.gold : colors.textMuted}
                />
                <Text style={[
                  styles.themeOptionLabel,
                  { color: isActive ? colors.gold : colors.textMuted, fontWeight: isActive ? '700' : '500' },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
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
            'Email Updates',
            'Dojo news and schedule changes',
            emailUpdates,
            setEmailUpdates,
          )}
        </View>

        {/* Calendar */}
        {renderSectionHeader('CALENDAR')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderToggleRow(
            'Google Calendar Sync',
            'Add bookings to your calendar automatically',
            calendarSync,
            setCalendarSync,
          )}
        </View>

        {/* Account */}
        {renderSectionHeader('ACCOUNT')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('card-outline', 'Payment Methods', () =>
            navigation.navigate('PaymentMethods')
          )}
          {isAdmin && renderNavRow('key-outline', 'Change Password', () => setPwModalOpen(true))}
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
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.lg, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 0 }]}>
          {renderNavRow('log-out-outline', 'Sign Out', () => {
            navigation.replace('SignIn');
          }, true)}
        </View>

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>

      {/* Password Change Modal (admin-only) */}
      <Modal visible={pwModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Change Password</Text>
              <TouchableOpacity onPress={() => setPwModalOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Default admin password is "password" — change it here.
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
        </View>
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
    maxWidth: 400,
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
});
