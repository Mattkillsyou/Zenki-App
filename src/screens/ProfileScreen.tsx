import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius } from '../theme';
import { BeltDisplay, AchievementGrid } from '../components';
import { BELT_DISPLAY_COLORS } from '../data/members';
import { useGamification } from '../context/GamificationContext';
import { useSpinWheel } from '../context/SpinWheelContext';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'light',  label: 'Light',  icon: 'sunny-outline' },
  { value: 'dark',   label: 'Dark',   icon: 'moon-outline' },
  { value: 'system', label: 'Auto',   icon: 'phone-portrait-outline' },
];

export function ProfileScreen({ navigation }: any) {
  const { colors, mode, setMode } = useTheme();
  const { user } = useAuth();
  const { state: gamState, levelInfo } = useGamification();
  const { freeDrinkCredits, freeShirtCredits, consumeFreeDrink, consumeFreeShirt } = useSpinWheel();
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [showPhotoMenu, setShowPhotoMenu] = useState(false);
  const [activeVoucher, setActiveVoucher] = useState<null | 'drink' | 'shirt'>(null);

  const handleRedeemVoucher = () => {
    if (activeVoucher === 'drink') consumeFreeDrink();
    else if (activeVoucher === 'shirt') consumeFreeShirt();
    setActiveVoucher(null);
  };

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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* ── Profile header (avatar + name + badge) ── */}
        <View style={styles.header}>
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
                    <Ionicons name="person" size={32} color={colors.textMuted} />
                  )}
                </View>
              </View>
              <View style={[styles.editBadge, { backgroundColor: colors.gold, borderColor: colors.background }]}>
                <Ionicons name="camera" size={10} color="#000" />
              </View>
            </View>
          </TouchableOpacity>

          {showPhotoMenu && (
            <View style={[styles.photoMenu, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              <TouchableOpacity style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); handleTakePhoto(); }}>
                <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); handlePickPhoto(); }}>
                <Ionicons name="images-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.photoMenuText, { color: colors.textPrimary }]}>Choose from Library</Text>
              </TouchableOpacity>
              {profilePhoto && (
                <TouchableOpacity style={styles.photoMenuItem} onPress={() => { setShowPhotoMenu(false); setProfilePhoto(null); }}>
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

        {/* ── Achievements (under XP bar, above stats) ── */}
        <View style={styles.achievementsWrap}>
          <AchievementGrid achievements={gamState.achievements} maxShow={8} />
        </View>

        {/* ── Stats strip — 4 bold numbers ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="flame" size={18} color="#FF6B35" />
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
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{gamState.flames || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Flames</Text>
          </View>
          <View style={[styles.statTile, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
            <Ionicons name="diamond-outline" size={18} color={colors.gold} />
            <Text style={[styles.statNum, { color: colors.textPrimary }]}>{gamState.dojoPoints || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Diamonds</Text>
          </View>
        </View>

        {/* ── Vouchers (prizes won from the spin wheel) ── */}
        {(freeDrinkCredits > 0 || freeShirtCredits > 0) && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>VOUCHERS</Text>
            <View style={styles.voucherRow}>
              {freeDrinkCredits > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveVoucher('drink')}
                  style={[styles.voucherCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
                >
                  <View style={[styles.voucherIcon, { backgroundColor: colors.gold + '22' }]}>
                    <Ionicons name="cafe-outline" size={22} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.voucherTitle, { color: colors.textPrimary }]}>Free Drink</Text>
                    <Text style={[styles.voucherSub, { color: colors.textMuted }]}>Tap to redeem at counter</Text>
                  </View>
                  {freeDrinkCredits > 1 && (
                    <View style={[styles.voucherCountBadge, { backgroundColor: colors.gold }]}>
                      <Text style={styles.voucherCountText}>×{freeDrinkCredits}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
              {freeShirtCredits > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveVoucher('shirt')}
                  style={[styles.voucherCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
                >
                  <View style={[styles.voucherIcon, { backgroundColor: colors.gold + '22' }]}>
                    <Ionicons name="shirt-outline" size={22} color={colors.gold} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.voucherTitle, { color: colors.textPrimary }]}>Free Shirt</Text>
                    <Text style={[styles.voucherSub, { color: colors.textMuted }]}>Tap to redeem at counter</Text>
                  </View>
                  {freeShirtCredits > 1 && (
                    <View style={[styles.voucherCountBadge, { backgroundColor: colors.gold }]}>
                      <Text style={styles.voucherCountText}>×{freeShirtCredits}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* ── Appearance toggle — compact pill row ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
        <View style={[styles.themePillRow, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
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
                <Ionicons name={opt.icon} size={16} color={isActive ? colors.gold : colors.textMuted} />
                <Text style={[styles.themeOptionLabel, { color: isActive ? colors.gold : colors.textMuted }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Menu tiles (2 × 2 grid) ── */}
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MENU</Text>
        <View style={styles.menuGrid}>
          <MenuTile
            icon="trophy-outline"
            label="Achievements"
            sub={`${unlockedCount}/${gamState.achievements.length} · ${gamState.flames || 0} 🔥`}
            onPress={() => navigation.navigate('Achievements')}
          />
          <MenuTile
            icon="settings-outline"
            label="Settings"
            sub="Notifications, account"
            onPress={() => navigation.navigate('Settings')}
          />
          {isAdmin ? (
            <MenuTile
              icon="shield-outline"
              label="Admin Panel"
              sub="Members, products, schedule"
              onPress={() => navigation.navigate('Admin')}
            />
          ) : (
            <MenuTile
              icon="card-outline"
              label="Payment Methods"
              sub="Manage cards"
              onPress={() => navigation.navigate('PaymentMethods')}
            />
          )}
          <MenuTile
            icon="chatbubbles-outline"
            label="Contact IT"
            sub="Report a bug or idea"
            onPress={() => navigation.navigate('ContactSupport')}
            accent
          />
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Voucher redemption modal ──
           Member taps a voucher → large display appears. Employee taps the
           invisible hit zone in the bottom-right corner of the card to redeem
           (decrements the count in SpinWheelContext). No visible affordance
           for the redeem button — the member can't accidentally burn it. */}
      <Modal visible={activeVoucher !== null} animationType="fade" transparent onRequestClose={() => setActiveVoucher(null)}>
        <View style={styles.voucherModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActiveVoucher(null)} />
          <View style={[styles.voucherTicket, { backgroundColor: colors.gold }]}>
            {/* Notch decorations — punch-card feel */}
            <View style={[styles.voucherTicketNotchLeft, { backgroundColor: colors.background }]} />
            <View style={[styles.voucherTicketNotchRight, { backgroundColor: colors.background }]} />

            <View style={styles.voucherTicketHeader}>
              <Text style={styles.voucherTicketLabel}>ZENKI DOJO</Text>
              <Text style={styles.voucherTicketDivider}>·</Text>
              <Text style={styles.voucherTicketLabel}>VOUCHER</Text>
            </View>

            <View style={styles.voucherTicketBody}>
              <Ionicons
                name={activeVoucher === 'drink' ? 'cafe' : 'shirt'}
                size={72}
                color="#000"
              />
              <Text style={styles.voucherTicketTitle}>
                {activeVoucher === 'drink' ? 'FREE DRINK' : 'FREE SHIRT'}
              </Text>
              <Text style={styles.voucherTicketSub}>
                Hand this screen to staff
              </Text>
            </View>

            <View style={styles.voucherTicketFooter}>
              <Text style={styles.voucherTicketMember}>
                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member'}
              </Text>
              <Text style={styles.voucherTicketId}>
                #{String(Date.now()).slice(-6)}
              </Text>
            </View>

            {/* Hidden staff redeem button — bottom right, visually identical
                to the ticket background so members don't see it. */}
            <Pressable
              onPress={handleRedeemVoucher}
              style={styles.voucherRedeemZone}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            />
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
    <TouchableOpacity
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
    </TouchableOpacity>
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
  voucherRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  voucherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  voucherIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voucherTitle: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'left',
  },
  voucherSub: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'left',
    marginTop: 1,
  },
  voucherCountBadge: {
    minWidth: 28,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voucherCountText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },

  // Voucher redemption modal
  voucherModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  voucherTicket: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  voucherTicketNotchLeft: {
    position: 'absolute',
    left: -12,
    top: '50%',
    width: 24,
    height: 24,
    borderRadius: 12,
    transform: [{ translateY: -12 }],
  },
  voucherTicketNotchRight: {
    position: 'absolute',
    right: -12,
    top: '50%',
    width: 24,
    height: 24,
    borderRadius: 12,
    transform: [{ translateY: -12 }],
  },
  voucherTicketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  voucherTicketLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
    color: '#000',
  },
  voucherTicketDivider: { color: '#000', opacity: 0.5 },
  voucherTicketBody: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderStyle: 'dashed',
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  voucherTicketTitle: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#000',
    marginTop: 6,
  },
  voucherTicketSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    opacity: 0.75,
    letterSpacing: 0.5,
  },
  voucherTicketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 8,
  },
  voucherTicketMember: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  voucherTicketId: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    opacity: 0.6,
    fontFamily: 'Courier',
  },
  // Hidden redeem tap zone — bottom-right corner, no visible affordance.
  voucherRedeemZone: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 56,
    height: 56,
    // intentionally no backgroundColor — fully transparent
  },
});
