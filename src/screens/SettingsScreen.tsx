import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function SettingsScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [classReminders, setClassReminders] = useState(true);
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [calendarSync, setCalendarSync] = useState(false);

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
});
