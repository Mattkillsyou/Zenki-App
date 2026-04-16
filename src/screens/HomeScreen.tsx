import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius, shadows } from '../theme';
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock, StreakBadge, PointsBadge, XPProgressBar, AchievementGrid, CelebrationModal } from '../components';
import { SpinWheelModal } from '../components/SpinWheelModal';
import { NotificationsModal } from '../components/NotificationsModal';
import { useSpinWheel } from '../context/SpinWheelContext';
import { useGamification } from '../context/GamificationContext';
import { useAnnouncements } from '../context/AnnouncementContext';
import { useAppointments } from '../context/AppointmentContext';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';
import { getDailyQuote } from '../data/quotes';
import { getTodaysSchedule } from '../data/schedule';
import { useHasUnreadNotifications } from './NotificationsScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function sessionTypeToClassType(s: string): 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat' {
  const lc = s.toLowerCase();
  if (lc.includes('jiu') || lc.includes('bjj')) return 'jiu-jitsu';
  if (lc.includes('muay') || lc.includes('thai') || lc.includes('kickbox')) return 'muay-thai';
  if (lc.includes('pilates') || lc.includes('mobility')) return 'pilates';
  return 'open-mat';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Parse "12:00 PM" → minutes since midnight, used to sort. */
function parseTimeSort(label: string): number {
  const m = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 24 * 60 + 1; // "By Appointment" etc — push to end
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export function HomeScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isEmployee = user?.isEmployee === true;
  const { state: gamState, levelInfo, dismissCelebration, recordAppOpen } = useGamification();
  React.useEffect(() => { recordAppOpen(); }, [recordAppOpen]);
  const { announcements } = useAnnouncements();
  const { myAppointments } = useAppointments();
  const dailyQuote = getDailyQuote();
  const hasUnreadNotifications = useHasUnreadNotifications();

  useScreenSoundTheme('home');
  const { play } = useSound();
  const { hasSpunToday } = useSpinWheel();
  const [spinOpen, setSpinOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  // Spin wheel is now opened manually via the icon in the header
  // (previously auto-opened on first visit of the day)

  // User's confirmed/pending private bookings for today
  const todaysBookings = myAppointments
    .filter((a) => a.memberId === user?.id && a.status !== 'cancelled' && a.status !== 'completed')
    .filter((a) => isToday(a.startsAt))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Today's full studio schedule (group classes)
  const studioClasses = getTodaysSchedule();

  // Merged view: studio classes + user's private sessions, sorted by time
  const todaysFullSchedule = [
    ...studioClasses.map((cls) => ({
      key: `class-${cls.name}-${cls.time}`,
      name: cls.name,
      instructor: cls.instructor,
      time: cls.time,
      duration: cls.duration,
      spotsLeft: cls.spotsLeft,
      type: cls.type,
      sortKey: parseTimeSort(cls.time),
      booked: false as const,
      status: undefined as undefined,
    })),
    ...todaysBookings.map((a) => ({
      key: `booking-${a.id}`,
      name: a.sessionType,
      instructor: a.instructor,
      time: formatTime(a.startsAt),
      duration: `${a.durationMinutes} min`,
      spotsLeft: 0,
      type: sessionTypeToClassType(a.sessionType),
      sortKey: new Date(a.startsAt).getHours() * 60 + new Date(a.startsAt).getMinutes(),
      booked: true as const,
      status: a.status,
    })),
  ].sort((x, y) => x.sortKey - y.sortKey);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={{ flex: 1 }}>

        {/* ─── Header (compact with corner logo) ─── */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <AnimatedLogo size={56} />
            <View style={styles.headerRight}>
              {!isEmployee && (
                <PointsBadge
                  points={gamState.dojoPoints || 0}
                  compact
                  onPress={() => navigation.navigate('Store')}
                />
              )}
              {!isEmployee && (
                <View style={[styles.flamesChip, { backgroundColor: colors.surface }]}>
                  <Ionicons name="flame" size={16} color="#FF6B35" />
                  <Text style={[styles.flamesChipText, { color: colors.textPrimary }]}>
                    {(gamState.flames || 0).toLocaleString()}
                  </Text>
                </View>
              )}
              {!isEmployee && <StreakBadge streak={gamState.streak} compact />}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.surface }]}
                onPress={() => { play('navigate'); setNotifOpen(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                {hasUnreadNotifications && (
                  <View style={[styles.notifDot, { backgroundColor: colors.red }]} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </FadeInView>

        {/* ─── Welcome (above announcements) ─── */}
        <FadeInView delay={40} slideUp={12}>
          <View style={[styles.welcomeSection, { paddingBottom: 0 }]}>
            <Text style={styles.welcomeLine} numberOfLines={1}>
              <Text style={[styles.welcomeLabel, { color: colors.textTertiary }]}>Welcome back, </Text>
              <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>
                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member'}
              </Text>
            </Text>
          </View>
        </FadeInView>

        {/* ─── Announcements (admin-editable, below welcome) ─── */}
        {!isEmployee && announcements.length > 0 && (
          <FadeInView delay={80} slideUp={12}>
            <View style={[styles.announcementsWrap, { marginTop: 12 }]}>
              {announcements.slice(0, 3).map((a) => (
                <PressableScale key={a.id}>
                  <View style={[styles.announcementCard, { backgroundColor: colors.goldMuted }]}>
                    <View style={[styles.announcementIcon, { backgroundColor: colors.gold + '20' }]}>
                      <Ionicons name="megaphone-outline" size={20} color={colors.gold} />
                    </View>
                    <View style={styles.announcementContent}>
                      <Text style={[styles.announcementTitle, { color: colors.textPrimary }]} numberOfLines={2}>{a.title}</Text>
                      {a.description ? (
                        <Text style={[styles.announcementDesc, { color: colors.textSecondary }]} numberOfLines={2}>{a.description}</Text>
                      ) : null}
                    </View>
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ─── Compact XP + Daily Quote ─── */}
        <FadeInView delay={120} slideUp={20}>
          <View style={[styles.welcomeSection, { paddingTop: 12 }]}>

            {/* Compact XP row — only for members */}
            {!isEmployee && (
              <View style={[styles.compactXpRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.compactLevelCircle, { backgroundColor: colors.gold }]}>
                  <Text style={styles.compactLevelText}>{levelInfo.level}</Text>
                </View>
                <View style={styles.compactXpBody}>
                  <View style={styles.compactXpLabels}>
                    <Text style={[styles.compactXpText, { color: colors.textSecondary }]}>
                      Level {levelInfo.level}
                    </Text>
                    <Text style={[styles.compactXpText, { color: colors.gold }]}>
                      {levelInfo.currentXP} / {levelInfo.nextLevelXP} XP
                    </Text>
                  </View>
                  <View style={[styles.compactXpBarBg, { backgroundColor: colors.backgroundElevated }]}>
                    <View style={[styles.compactXpBarFill, {
                      backgroundColor: colors.gold,
                      width: `${Math.max(4, levelInfo.progress * 100)}%`,
                    }]} />
                  </View>
                </View>
              </View>
            )}

            <View style={[styles.quoteCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.quoteText, { color: colors.textPrimary }]}>"{dailyQuote.text}"</Text>
              <Text style={[styles.quoteAttr, { color: colors.gold }]}>— {dailyQuote.attribution}</Text>
            </View>
          </View>
        </FadeInView>

        {/* ─── Employee Clock ─── */}
        {isEmployee && (
          <FadeInView delay={120} slideUp={16}>
            <View style={styles.section}><TimeClock /></View>
          </FadeInView>
        )}

        {/* ─── Member Content ─── */}
        {!isEmployee && (
          <>
            {/* Today's Schedule — full studio classes + user bookings merged */}
            <FadeInView delay={340} slideUp={16}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Schedule</Text>
                  <TouchableOpacity style={[styles.seeAllButton, { backgroundColor: colors.accentTint }]} onPress={() => navigation.navigate('Schedule')}>
                    <Text style={[styles.seeAllText, { color: colors.gold }]}>See All</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.gold} />
                  </TouchableOpacity>
                </View>
                {todaysFullSchedule.length > 0 ? (
                  todaysFullSchedule.map((cls) => (
                    <ClassCard
                      key={cls.key}
                      name={cls.name}
                      instructor={cls.instructor}
                      time={cls.time}
                      duration={cls.duration}
                      spotsLeft={cls.spotsLeft}
                      type={cls.type}
                      booked={cls.booked}
                      status={cls.status}
                      onBook={() => navigation.navigate(cls.booked ? 'Schedule' : 'Book')}
                    />
                  ))
                ) : (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Schedule')}
                    activeOpacity={0.8}
                    style={[styles.noBookingsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.noBookingsIcon, { backgroundColor: colors.goldMuted }]}>
                      <Ionicons name="calendar-outline" size={22} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.noBookingsTitle, { color: colors.textPrimary }]}>Rest day</Text>
                      <Text style={[styles.noBookingsDesc, { color: colors.textSecondary }]}>No classes scheduled today. Browse the week.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </FadeInView>

          </>
        )}

      </View>

      {!isEmployee && (
        <CelebrationModal celebration={gamState.pendingCelebration} onDismiss={dismissCelebration} />
      )}

      {/* Floating spin wheel button — bottom left above the Home tab.
          Only shown when the user hasn't spun yet today. Once spun,
          disappears entirely until tomorrow. */}
      {!isEmployee && !hasSpunToday && (
        <TouchableOpacity
          onPress={() => { play('navigate'); setSpinOpen(true); }}
          activeOpacity={0.8}
          style={[
            styles.spinFab,
            {
              backgroundColor: colors.gold,
              // Sit flush above the tab bar (bottom-left corner of the content area)
              bottom: 60 + insets.bottom + 4,
              shadowColor: colors.gold,
            },
          ]}
        >
          <Ionicons name="disc-outline" size={24} color="#000" />
        </TouchableOpacity>
      )}

      {/* Daily Spin Wheel */}
      <SpinWheelModal visible={spinOpen} onClose={() => setSpinOpen(false)} />

      {/* Notifications popup */}
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Welcome + Quote
  welcomeSection: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
  },
  welcomeLine: {
    marginBottom: 12,
  },
  welcomeLabel: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  welcomeName: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  // Compact XP row under name
  compactXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  compactLevelCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLevelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  compactXpBody: {
    flex: 1,
    gap: 4,
  },
  compactXpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactXpText: {
    fontSize: 11,
    fontWeight: '600',
  },
  compactXpBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  compactXpBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  quoteCard: {
    borderRadius: 16,
    padding: 16,
    gap: 2,
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    letterSpacing: 0.2,
    fontStyle: 'italic',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  },
  quoteAttr: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 10,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Hero
  heroCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 44,
    gap: 22,
  },
  heroText: { alignItems: 'center' },
  heroTagline: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 5,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // Sections
  section: {
    paddingHorizontal: 24,
    marginTop: 14,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 22,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty-state card for "no bookings today"
  noBookingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  noBookingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noBookingsTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  noBookingsDesc: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
    lineHeight: 18,
  },

  // Announcements — top of feed, admin-editable
  announcementsWrap: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  announcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  announcementIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementContent: { flex: 1 },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  announcementDesc: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
    lineHeight: 18,
  },

  // Quick Actions — with colored icon backgrounds
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  actionFlex: { flex: 1 },
  actionCard: {
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 12,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  spinFab: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  flamesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  flamesChipText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
