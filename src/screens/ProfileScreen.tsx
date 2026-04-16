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
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius } from '../theme';
import { Card, BeltDisplay } from '../components';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function ProfileScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);

  // Demo data — in production this comes from member context/API
  const memberBelt = user?.belt ?? 'white';
  const memberStripes = user?.stripes ?? 0;
  const isAdmin = user?.isAdmin === true;

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
            <View style={[styles.avatarOuter, { borderColor: colors.gold }]}>
              <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={40} color={colors.textMuted} />
                )}
                <View style={[styles.editBadge, { backgroundColor: colors.gold }]}>
                  <Ionicons name="camera" size={12} color={colors.textInverse} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
          {showPhotoMenu && (
            <View style={[styles.photoMenu, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
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

        {/* Belt Progress (read-only — admins update via Admin Panel) */}
        <View style={styles.section}>
          <Card variant="elevated">
            <Text style={[styles.beltTitle, { color: colors.textPrimary }]}>
              Jiu-Jitsu Progress
            </Text>
            <View style={styles.beltDisplayContainer}>
              <BeltDisplay belt={memberBelt} stripes={memberStripes} width={240} />
            </View>
            <Text style={[styles.beltHint, { color: colors.textMuted }]}>
              Belts and stripes are awarded by your instructor.
            </Text>
          </Card>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="flame-outline" size={24} color={colors.gold} />
              </View>
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>12</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Week{'\n'}Streak
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="time-outline" size={24} color={colors.gold} />
              </View>
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>186h</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Total{'\n'}Training
              </Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                <Ionicons name="star-outline" size={24} color={colors.gold} />
              </View>
              <Text style={[styles.statNum, { color: colors.textPrimary }]}>8</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                Badges{'\n'}Earned
              </Text>
            </View>
          </View>
        </View>

        {/* Appearance / Theme Toggle */}
        <View style={styles.section}>
          <Text style={[styles.settingsLabel, { color: colors.textPrimary }]}>APPEARANCE</Text>
          <View style={[styles.themeToggle, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
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
              style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={item.onPress}
            >
              <View style={[styles.iconCircle, { backgroundColor: colors.gold + '18' }]}>
                <Ionicons name={item.icon as any} size={20} color={colors.gold} />
              </View>
              <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.gold} />
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
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
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
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  memberSince: {
    fontSize: 15,
    marginTop: 4,
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.sm,
    gap: 6,
  },
  memberType: {
    ...typography.label,
    fontSize: 11,
  },
  section: {
    paddingHorizontal: 24,
    marginBottom: spacing.lg,
    marginTop: 32,
  },
  beltTitle: {
    ...typography.cardTitle,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  beltDisplayContainer: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  beltHint: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  avatarOuter: {
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 24,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statNum: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  statLabel: {
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    fontWeight: '500',
  },
  settingsLabel: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
    marginTop: 0,
  },
  themeToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: 4,
    gap: 4,
    borderWidth: 1,
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
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    padding: 18,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginLeft: spacing.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBackground: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMenu: {
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    width: '90%',
    maxWidth: 280,
    borderWidth: 1,
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
