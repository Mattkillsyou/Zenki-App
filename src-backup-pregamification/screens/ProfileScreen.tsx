import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Card } from '../components';
import { BELT_DISPLAY_COLORS } from '../data/members';

const BELT_COLORS = BELT_DISPLAY_COLORS;

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function ProfileScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Demo data — in production this comes from member context/API
  const memberBelt = 'white';
  const memberStripes = 3;
  const isAdmin = true;

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take a profile photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setProfilePhoto(result.assets[0].uri);
    }
  };

  const [showPhotoMenu, setShowPhotoMenu] = useState(false);

  const handleChangePhoto = () => {
    setShowPhotoMenu(!showPhotoMenu);
  };

  const MENU_ITEMS = [
    { icon: 'settings-outline', label: 'Settings', onPress: () => navigation.navigate('Settings') },
    ...(isAdmin
      ? [{ icon: 'shield-outline', label: 'Admin Panel', onPress: () => navigation.navigate('Admin') }]
      : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={handleChangePhoto} activeOpacity={0.7}>
            <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.red }]}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={40} color={colors.textMuted} />
              )}
              <View style={[styles.editBadge, { backgroundColor: colors.gold }]}>
                <Ionicons name="camera" size={12} color={colors.textInverse} />
              </View>
            </View>
          </TouchableOpacity>
          {showPhotoMenu && (
            <View style={[styles.photoMenu, { backgroundColor: colors.surface }]}>
              <TouchableOpacity
                style={styles.photoMenuItem}
                onPress={() => { setShowPhotoMenu(false); handleTakePhoto(); }}
              >
                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoMenuItem}
                onPress={() => { setShowPhotoMenu(false); handlePickPhoto(); }}
              >
                <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Choose from Library</Text>
              </TouchableOpacity>
              {profilePhoto && (
                <TouchableOpacity
                  style={styles.photoMenuItem}
                  onPress={() => { setShowPhotoMenu(false); setProfilePhoto(null); }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={[styles.photoMenuText, { color: colors.error }]}>Remove Photo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={[styles.name, { color: colors.textPrimary }]}>Matt B</Text>
          <Text style={[styles.memberSince, { color: colors.textMuted }]}>
            Member since 2024
          </Text>
          <View style={[styles.memberBadge, { backgroundColor: colors.redMuted }]}>
            <Ionicons name="diamond-outline" size={14} color={colors.red} />
            <Text style={[styles.memberType, { color: colors.red }]}>Founding Member</Text>
          </View>
        </View>

        {/* Belt Progress */}
        <View style={styles.section}>
          <Card variant="elevated">
            <Text style={[styles.beltTitle, { color: colors.textPrimary }]}>
              Jiu-Jitsu Progress
            </Text>
            <View style={styles.beltRow}>
              {Object.entries(BELT_COLORS).map(([name, color]) => {
                const isCurrent = name === memberBelt;
                return (
                  <View key={name} style={styles.beltItem}>
                    <View
                      style={[
                        styles.beltDot,
                        { backgroundColor: color },
                        isCurrent && { opacity: 1, borderWidth: 2, borderColor: colors.gold },
                      ]}
                    >
                      {isCurrent && (
                        <Ionicons name="checkmark" size={12} color={name === 'white' ? '#333' : '#FFF'} />
                      )}
                    </View>
                    <Text style={[styles.beltName, { color: colors.textMuted }]}>{name}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.stripeRow}>
              <Text style={[styles.stripeLabel, { color: colors.textSecondary }]}>Stripes:</Text>
              {[1, 2, 3, 4].map((s) => (
                <View
                  key={s}
                  style={[
                    styles.stripeBar,
                    { backgroundColor: s <= memberStripes ? colors.gold : colors.surfaceSecondary },
                  ]}
                />
              ))}
            </View>
          </Card>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="flame-outline" size={24} color={colors.gold} />
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>12</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Week{'\n'}Streak
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="time-outline" size={24} color={colors.gold} />
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>186h</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Total{'\n'}Training
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="star-outline" size={24} color={colors.gold} />
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>8</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Badges{'\n'}Earned
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance / Theme Toggle */}
        <View style={styles.section}>
          <Text style={[styles.settingsLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
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
                    size={18}
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
        </View>

        {/* Menu Items */}
        <View style={styles.section}>
          {MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.menuItem, { borderBottomColor: colors.divider }]}
              onPress={item.onPress}
            >
              <Ionicons name={item.icon as any} size={22} color={colors.textSecondary} />
              <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
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
  title: {
    ...typography.sectionTitle,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...typography.cardTitle,
    fontSize: 22,
  },
  memberSince: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
    gap: 6,
  },
  memberType: {
    ...typography.label,
    fontSize: 11,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  beltTitle: {
    ...typography.cardTitle,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  beltRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  beltItem: {
    alignItems: 'center',
  },
  beltDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.3,
  },
  beltName: {
    ...typography.label,
    marginTop: 4,
    fontSize: 9,
  },
  stripeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  stripeLabel: {
    ...typography.bodySmall,
  },
  stripeBar: {
    width: 24,
    height: 6,
    borderRadius: 3,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  statNum: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: spacing.sm,
  },
  statLabel: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 11,
  },
  settingsLabel: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  themeToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.md,
    padding: 4,
    gap: 4,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  themeOptionLabel: {
    ...typography.label,
    fontSize: 11,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  menuLabel: {
    ...typography.body,
    flex: 1,
    marginLeft: spacing.md,
  },
  photoMenu: {
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    width: '80%',
  },
  photoMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  photoMenuText: {
    ...typography.body,
    fontSize: 14,
  },
});
