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
    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
  );

  const renderToggleRow = (
    label: string,
    description: string,
    value: boolean,
    onToggle: (val: boolean) => void,
  ) => (
    <View style={[styles.settingRow, { borderBottomColor: colors.divider }]}>
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
      style={[styles.settingRow, { borderBottomColor: colors.divider }]}
      onPress={onPress}
    >
      <View style={styles.navRowLeft}>
        <Ionicons
          name={icon}
          size={20}
          color={destructive ? colors.error : colors.textSecondary}
        />
        <Text style={[
          styles.settingLabel,
          { color: destructive ? colors.error : colors.textPrimary, marginLeft: spacing.md },
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
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Settings</Text>
          <View style={styles.backButton} />
        </View>

        {/* Appearance */}
        {renderSectionHeader('APPEARANCE')}
        <View style={[styles.themeToggle, { backgroundColor: colors.surface }]}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = mode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeOption,
                  isActive && { backgroundColor: colors.goldMuted, borderColor: colors.gold },
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
                  { color: isActive ? colors.gold : colors.textMuted },
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Notifications */}
        {renderSectionHeader('NOTIFICATIONS')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          {renderToggleRow(
            'Google Calendar Sync',
            'Add bookings to your calendar automatically',
            calendarSync,
            setCalendarSync,
          )}
        </View>

        {/* Account */}
        {renderSectionHeader('ACCOUNT')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
          {renderNavRow('card-outline', 'Payment Methods', () =>
            navigation.navigate('PaymentMethods')
          )}
        </View>

        {/* About */}
        {renderSectionHeader('ABOUT')}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.sm }]}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            Zenki Dojo v1.0.0
          </Text>
        </View>

        {/* Danger Zone */}
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, marginTop: spacing.lg }]}>
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.sectionTitle,
    fontSize: 20,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 11,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
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
  themeToggle: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    padding: 4,
    gap: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.sm,
    gap: 6,
    borderWidth: 1,
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
