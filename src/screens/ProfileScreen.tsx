import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius } from '../theme';
import { Card, BeltDisplay } from '../components';
import { BELT_DISPLAY_COLORS } from '../data/members';
import { useGamification } from '../context/GamificationContext';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

export function ProfileScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const { state: gamState } = useGamification();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  const memberBelt = user?.belt ?? 'white';
  const memberStripes = user?.stripes ?? 0;
  const isAdmin = user?.isAdmin === true;
  const unlockedCount = gamState.achievements.filter((a) => a.unlocked).length;

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
    if (!result.canceled && result.assets[0]) setProfilePhoto(result.assets[0].uri);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take a profile photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setProfilePhoto(result.assets[0].uri);
  };

  const gotoPage = (i: number) => {
    setPageIdx(i);
    pagerRef.current?.scrollTo({ x: i * pageWidth, animated: true });
  };

  const MENU_ITEMS = [
    { icon: 'trophy-outline' as const, label: 'Achievements', sub: `${unlockedCount}/${gamState.achievements.length} unlocked · ${gamState.flames || 0} 🔥`, onPress: () => navigation.navigate('Achievements') },
    { icon: 'settings-outline' as const, label: 'Settings', sub: 'Appearance, notifications, account', onPress: () => navigation.navigate('Settings') },
    ...(isAdmin ? [{ icon: 'shield-outline' as const, label: 'Admin Panel', sub: 'Members, products, schedule', onPress: () => navigation.navigate('Admin') }] : []),
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Page indicator pills */}
      <View style={styles.pageIndicator}>
        <TouchableOpacity onPress={() => gotoPage(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={[styles.pageDot, { backgroundColor: pageIdx === 0 ? colors.gold : colors.textMuted, width: pageIdx === 0 ? 22 : 6 }]} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => gotoPage(1)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <View style={[styles.pageDot, { backgroundColor: pageIdx === 1 ? colors.gold : colors.textMuted, width: pageIdx === 1 ? 22 : 6 }]} />
        </TouchableOpacity>
      </View>

      <View
        style={{ flex: 1 }}
        onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
      >
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            if (!pageWidth) return;
            setPageIdx(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
          }}
        >
          {/* ═════ PAGE 1: You ═════ */}
          <View style={{ width: pageWidth || undefined }}>
            <View style={styles.profileSection}>
              <TouchableOpacity onPress={() => setShowPhotoMenu(!showPhotoMenu)} activeOpacity={0.7}>
                <View style={styles.avatarWrapper}>
                  <View
                    style={[
                      styles.avatarOuter,
                      { borderColor: memberBelt === 'none' ? colors.border : BELT_DISPLAY_COLORS[memberBelt] },
                    ]}
                  >
                    <View style={[styles.avatar, { backgroundColor: colors.surface }]}>
                      {profilePhoto ? (
                        <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                      ) : (
                        <Ionicons name="person" size={40} color={colors.textMuted} />
                      )}
                    </View>
                  </View>
                  <View style={[styles.editBadge, { backgroundColor: colors.gold, borderColor: colors.background }]}>
                    <Ionicons name="camera" size={12} color={colors.textInverse} />
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

              <Text style={[styles.name, { color: colors.textPrimary }]}>
                {user?.firstName ?? 'Member'} {user?.lastName ?? ''}
              </Text>
              {user?.nickname ? (
                <Text style={[styles.nickname, { color: colors.gold }]}>"{user.nickname}"</Text>
              ) : null}
              {user?.funFact ? (
                <Text style={[styles.funFactInline, { color: colors.textSecondary }]} numberOfLines={2}>
                  {user.funFact}
                </Text>
              ) : null}
              <Text style={[styles.memberSince, { color: colors.textMuted }]}>
                Member since {user?.memberSince?.split('-')[0] ?? '2024'}
              </Text>
              <View style={[styles.memberBadge, { backgroundColor: colors.redMuted }]}>
                <Ionicons name="diamond-outline" size={14} color={colors.red} />
                <Text style={[styles.memberType, { color: colors.red }]}>Founding Member</Text>
              </View>
            </View>

            {/* Belt progress */}
            {memberBelt !== 'none' && (
              <View style={[styles.section, { marginTop: 12 }]}>
                <Card variant="elevated">
                  <Text style={[styles.beltTitle, { color: colors.textPrimary }]}>
                    Jiu-Jitsu Progress
                  </Text>
                  <View style={styles.beltDisplayContainer}>
                    <BeltDisplay belt={memberBelt} stripes={memberStripes} width={220} />
                  </View>
                </Card>
              </View>
            )}

            {/* Stats */}
            <View style={[styles.section, { marginTop: 10 }]}>
              <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                  <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                    <Ionicons name="flame-outline" size={22} color={colors.gold} />
                  </View>
                  <Text style={[styles.statNum, { color: colors.textPrimary }]}>{gamState.streak}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    Day{'\n'}Streak
                  </Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                  <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                    <Ionicons name="barbell-outline" size={22} color={colors.gold} />
                  </View>
                  <Text style={[styles.statNum, { color: colors.textPrimary }]}>{gamState.totalSessions}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    Total{'\n'}Sessions
                  </Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                  <View style={[styles.iconBackground, { backgroundColor: colors.goldMuted }]}>
                    <Ionicons name="trophy-outline" size={22} color={colors.gold} />
                  </View>
                  <Text style={[styles.statNum, { color: colors.textPrimary }]}>{unlockedCount}</Text>
                  <Text style={[styles.statLabel, { color: colors.textMuted }]}>
                    Badges{'\n'}Earned
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity onPress={() => gotoPage(1)} style={styles.swipeHint}>
              <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
                Swipe for settings →
              </Text>
            </TouchableOpacity>
          </View>

          {/* ═════ PAGE 2: Settings + Menu ═════ */}
          <View style={{ width: pageWidth || undefined }}>
            <View style={[styles.section, { marginTop: 20 }]}>
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

            <View style={styles.section}>
              {MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[styles.menuItem, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={item.onPress}
                >
                  <View style={[styles.iconCircle, { backgroundColor: colors.gold + '18' }]}>
                    <Ionicons name={item.icon} size={20} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={[styles.menuLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                    <Text style={[styles.menuSub, { color: colors.textMuted }]} numberOfLines={1}>{item.sub}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.gold} />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={() => gotoPage(0)} style={styles.swipeHint}>
              <Text style={[styles.swipeHintText, { color: colors.textMuted }]}>
                ← Back to profile
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  pageIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    paddingBottom: 4,
  },
  pageDot: {
    height: 6,
    borderRadius: 3,
  },

  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  avatarWrapper: {
    width: 108,
    height: 108,
    marginBottom: spacing.sm,
    position: 'relative',
  },
  avatarOuter: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  editBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  memberSince: { fontSize: 13, marginTop: 3 },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs + 4,
    gap: 6,
  },
  memberType: { ...typography.label, fontSize: 11 },

  section: {
    paddingHorizontal: 24,
    marginBottom: spacing.md,
  },
  beltTitle: { ...typography.cardTitle, marginBottom: spacing.sm, fontSize: 15 },
  beltDisplayContainer: { alignItems: 'center', paddingVertical: 4 },
  nickname: {
    fontSize: 14,
    fontWeight: '600',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  funFactInline: {
    fontSize: 12,
    fontWeight: '400',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: spacing.lg,
    lineHeight: 16,
  },

  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  statNum: { fontSize: 24, fontWeight: '800', marginTop: 6 },
  statLabel: {
    textAlign: 'center',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '500',
  },
  iconBackground: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  settingsLabel: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
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
  themeOptionLabel: { ...typography.label, fontSize: 11 },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  menuLabel: { fontSize: 15, fontWeight: '700' },
  menuSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
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
  photoMenuText: { ...typography.body, fontSize: 14 },

  swipeHint: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  swipeHintText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
