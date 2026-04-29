import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Alert,
  Modal,
  Pressable,
  TextInput} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius } from '../theme';
import { BeltDisplay, KeyboardAwareScrollView } from '../components';
import { BELT_DISPLAY_COLORS } from '../data/members';
import { useGamification } from '../context/GamificationContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import { useHeartRate } from '../context/HeartRateContext';
import { formatCount } from '../utils/formatCount';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'clean-light',  label: 'Light',  icon: 'sunny-outline' },
  { value: 'clean-dark',   label: 'Dark',   icon: 'moon-outline' },
  { value: 'system', label: 'Auto',   icon: 'phone-portrait-outline' },
];

export function ProfileScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const { state: gamState, levelInfo } = useGamification();
  const { myLogs } = useWorkouts();
  const { memberActivities } = useGpsActivity();
  const { memberSessions } = useHeartRate();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editGoals, setEditGoals] = useState('');

  // Training Summary
  const trainingSummary = useMemo(() => {
    if (!user) return null;
    const logs = myLogs(user.id);
    const gps = memberActivities(user.id);
    const hr = memberSessions(user.id);
    const totalSessions = logs.length + gps.length + hr.length;

    // Most trained day of week
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    for (const l of logs) { const d = new Date(l.date); dayCounts[d.getDay()]++; }
    for (const a of gps) { const d = new Date(a.startedAt); dayCounts[d.getDay()]++; }
    for (const s of hr) { const d = new Date(s.startedAt); dayCounts[d.getDay()]++; }
    const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const mostTrainedDay = dayCounts[maxDayIdx] > 0 ? dayNames[maxDayIdx] : 'N/A';

    // Best streak
    const bestStreak = gamState.longestStreak || gamState.streak || 0;

    return {
      totalSessions,
      mostTrainedDay,
      bestStreak,
      memberSince: user?.memberSince?.split('-')[0] ?? '2024',
    };
  }, [user, gamState]);

  const memberBelt = user?.belt ?? 'white';
  const memberStripes = user?.stripes ?? 0;
  const isAdmin = user?.isAdmin === true;
  const unlockedCount = gamState.achievements.filter((a) => a.unlocked).length;

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
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
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setProfilePhoto(result.assets[0].uri);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollView offset={64} contentContainerStyle={styles.scroll}>
        {/* ── Profile header (avatar + name + badge) ── */}
        <View style={styles.header}>
          {/* Edit Profile — pinned to the top-right corner */}
          <SoundPressable
            style={[styles.editProfileCornerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setEditOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="create-outline" size={14} color={colors.textSecondary} />
            <Text style={[styles.editProfileText, { color: colors.textSecondary }]}>Edit</Text>
          </SoundPressable>

          <SoundPressable onPress={() => setShowPhotoMenu(!showPhotoMenu)} activeOpacity={0.7}>
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
                    <Ionicons name="person" size={32} color={colors.textMuted} />
                  )}
                </View>
              </View>
              <View style={[styles.editBadge, { backgroundColor: colors.gold, borderColor: colors.background }]}>
                <Ionicons name="camera" size={10} color="#000" />
              </View>
            </View>
          </SoundPressable>

          {showPhotoMenu && (
            <View style={[styles.photoMenu, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <SoundPressable style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); handleTakePhoto(); }}>
                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Take Photo</Text>
              </SoundPressable>
              <SoundPressable style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); handlePickPhoto(); }}>
                <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Choose from Library</Text>
              </SoundPressable>
              {profilePhoto && (
                <SoundPressable style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); setProfilePhoto(null); }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                  <Text style={[styles.photoMenuText, { color: colors.error }]}>Remove Photo</Text>
                </SoundPressable>
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
            <Text style={[styles.bioText, { color: colors.textSecondary }]} numberOfLines={3}>
              {user.funFact}
            </Text>
          ) : null}
          <View style={[styles.memberBadge, { backgroundColor: colors.redMuted }]}>
            <Ionicons name="diamond-outline" size={11} color={colors.red} />
            <Text style={[styles.memberType, { color: colors.red }]}>FOUNDING MEMBER</Text>
          </View>
        </View>

        {/* ── Zenki Card — creative space-filler showing level, XP, progress ── */}
        <View style={[styles.zenkiCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.zenkiCardTop}>
            <View style={[styles.levelBadge, { backgroundColor: colors.gold }]}>
              <Text style={styles.levelNum}>{levelInfo.level}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.zenkiCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {user?.firstName?.toUpperCase() ?? 'MEMBER'} · LVL {levelInfo.level}
              </Text>
              <Text style={[styles.zenkiCardSub, { color: colors.textSecondary }]} numberOfLines={1}>
                {gamState.totalSessions} session{gamState.totalSessions === 1 ? '' : 's'} · Member since {user?.memberSince?.split('-')[0] ?? '2024'}
              </Text>
            </View>
          </View>
          {memberBelt !== 'none' && (
            <View style={styles.beltInline}>
              <BeltDisplay belt={memberBelt} stripes={memberStripes} width={200} />
            </View>
          )}
          {/* XP progress */}
          <View style={styles.xpRow}>
            <Text style={[styles.xpLabel, { color: colors.textMuted }]}>
              {levelInfo.currentXP} / {levelInfo.nextLevelXP} XP
            </Text>
            <Text style={[styles.xpLabel, { color: colors.gold }]}>
              {Math.round(levelInfo.progress * 100)}%
            </Text>
          </View>
          <View style={[styles.xpBarBg, { backgroundColor: colors.backgroundElevated }]}>
            <View style={[styles.xpBarFill, { backgroundColor: colors.gold, width: `${Math.max(4, levelInfo.progress * 100)}%` }]} />
          </View>
        </View>


        {/* ── Stats strip — 4 bold numbers ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="flame" size={18} color={colors.flames} />
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{gamState.streak}</Text>
            <Text style={[styles.statSub, { color: colors.gold }]}>{gamState.weekStreak || 0}w</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Streak</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="trophy" size={18} color={colors.gold} />
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{unlockedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Badges</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="flame-outline" size={18} color={colors.gold} />
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{formatCount(gamState.flames || 0)}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Flames</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="diamond-outline" size={18} color={colors.gold} />
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{formatCount(gamState.dojoPoints || 0)}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Diamonds</Text>
          </View>
        </View>

        {/* ── Training Summary ── */}
        {trainingSummary && trainingSummary.totalSessions > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRAINING SUMMARY</Text>
            <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.gold }]}>{trainingSummary.totalSessions}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Sessions</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{trainingSummary.bestStreak}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Best Streak</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary, fontSize: 14 }]}>{trainingSummary.mostTrainedDay}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Favorite Day</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.textPrimary, fontSize: 14 }]}>{trainingSummary.memberSince}</Text>
                  <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Member Since</Text>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Appearance toggle — compact pill row ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.themePillRow, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
          {THEME_OPTIONS.map((opt) => {
            const isActive = mode === opt.value;
            return (
              <SoundPressable
                key={opt.value}
                style={[
                  styles.themeOption,
                  isActive && { backgroundColor: colors.goldMuted, borderColor: colors.gold },
                ]}
                onPress={() => setMode(opt.value)}
              >
                <Ionicons name={opt.icon} size={16} color={isActive ? colors.gold : colors.textMuted} />
                <Text style={[styles.themeOptionLabel, { color: isActive ? colors.gold : colors.textMuted }]}>
                  {opt.label}
                </Text>
              </SoundPressable>
            );
          })}
        </View>

        {/* ── Menu tiles (2 × 2 grid) ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MENU</Text>
        <View style={styles.menuGrid}>
          <MenuTile
            icon="settings-outline"
            label="Settings"
            sub="Notifications, account"
            onPress={() => navigation.navigate('Settings')}
          />
          <MenuTile
            icon="help-circle-outline"
            label="Help"
            sub="FAQ, tutorial, privacy"
            onPress={() => navigation.navigate('Help')}
          />
          <MenuTile
            icon="chatbubbles-outline"
            label="Contact IT"
            sub="Report a bug or idea"
            onPress={() => navigation.navigate('ContactSupport')}
            accent
          />
          {isAdmin && (
            <MenuTile
              icon="shield-outline"
              label="Admin Panel"
              sub="Members, products, schedule"
              onPress={() => navigation.navigate('Admin')}
            />
          )}
        </View>

        <View style={{ height: 24 }} />
      </KeyboardAwareScrollView>

      {/* ── Edit Profile Modal ── */}
      <Modal visible={editOpen} animationType="slide" transparent onRequestClose={() => setEditOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setEditOpen(false)} />
          <View style={[styles.editModal, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={[styles.editModalTitle, { color: colors.textPrimary }]}>Edit Profile</Text>
              <SoundPressable onPress={() => setEditOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </SoundPressable>
            </View>

            <Text style={[styles.editLabel, { color: colors.textMuted }]}>BIO</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="Tell the dojo about yourself..."
              placeholderTextColor={colors.textMuted}
              value={editBio}
              onChangeText={setEditBio}
              multiline
              maxLength={140}
            />
            <Text style={[styles.editCharCount, { color: colors.textMuted }]}>{editBio.length}/140</Text>

            <Text style={[styles.editLabel, { color: colors.textMuted, marginTop: 12 }]}>TRAINING GOALS</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              placeholder="What are you working toward?"
              placeholderTextColor={colors.textMuted}
              value={editGoals}
              onChangeText={setEditGoals}
              multiline
              maxLength={200}
            />

            <SoundPressable
              style={[styles.editSaveBtn, { backgroundColor: colors.gold }]}
              onPress={() => {
                // Save to AsyncStorage (lightweight persistence)
                AsyncStorage.setItem('@zenki_profile_bio', editBio);
                AsyncStorage.setItem('@zenki_profile_goals', editGoals);
                setEditOpen(false);
                Alert.alert('Saved', 'Your profile has been updated.');
              }}
            >
              <Text style={styles.editSaveBtnText}>Save Changes</Text>
            </SoundPressable>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

interface MenuTileProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  onPress: () => void;
  accent?: boolean;
}
function MenuTile({ icon, label, sub, onPress, accent }: MenuTileProps) {
  const { colors } = useTheme();
  return (
    <SoundPressable
      style={[
        styles.menuTile,
        {
          backgroundColor: accent ? colors.goldMuted : colors.surface,
          borderColor: accent ? colors.gold : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.menuTileIcon, { backgroundColor: accent ? colors.gold : colors.gold + '22' }]}>
        <Ionicons name={icon} size={18} color={accent ? '#000' : colors.gold} />
      </View>
      <Text style={[styles.menuTileLabel, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.menuTileSub, { color: colors.textMuted }]} numberOfLines={1}>{sub}</Text>
    </SoundPressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingBottom: 24,
  },

  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  avatarWrapper: {
    width: 86,
    height: 86,
    marginBottom: spacing.xs,
    position: 'relative',
  },
  avatarOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, marginTop: 2 },
  nickname: { fontSize: 12, fontWeight: '600', fontStyle: 'italic', marginTop: 1 },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    marginTop: 6,
    gap: 4,
  },
  memberType: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },

  // Zenki Card
  zenkiCard: {
    marginHorizontal: spacing.lg,
    marginTop: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  zenkiCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  levelBadge: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  levelNum: { color: '#000', fontSize: 16, fontWeight: '900' },
  zenkiCardTitle: { fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  zenkiCardSub: { fontSize: 11, marginTop: 2 },
  beltInline: { alignItems: 'center', marginTop: 10, marginBottom: 6 },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 4,
  },
  xpLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  xpBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  xpBarFill: { height: '100%', borderRadius: 3 },

  // Stats strip
  achievementsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: spacing.lg,
    marginTop: 10,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  achievementsPillIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  achievementsPillTitle: { fontSize: 14, fontWeight: '800' },
  achievementsPillSub: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  achievementsWrap: {
    paddingHorizontal: spacing.lg,
    marginTop: 14,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: spacing.lg,
    marginTop: 10,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
  },
  statNum: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  statSub: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, marginTop: -2 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  // Appearance
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: spacing.lg,
  },
  themePillRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    padding: 3,
    gap: 3,
    borderWidth: 1,
  },
  themeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    gap: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  themeOptionLabel: { fontSize: 11, fontWeight: '700' },

  // Menu grid
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.lg,
  },
  menuTile: {
    width: '48.5%',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  menuTileIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  menuTileLabel: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  menuTileSub: { fontSize: 10, fontWeight: '500' },

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

  // Generic backdrop reused by the Edit Profile modal.
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },

  // ── Edit Profile ──
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 8,
  },
  bioText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 6,
    marginBottom: 6,
  },
  editProfileCornerBtn: {
    position: 'absolute',
    top: 4,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 10,
  },
  editProfileText: { fontSize: 12, fontWeight: '600' },
  editModal: {
    width: '90%',
    maxWidth: 360,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  editModalTitle: { fontSize: 20, fontWeight: '800' },
  editLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 4 },
  editInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editCharCount: { fontSize: 10, fontWeight: '600', textAlign: 'right', marginTop: 2 },
  editSaveBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  editSaveBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },

  // ── Training Summary ──
  summaryCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '900',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
