import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius, shadows } from '../theme';
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock, StreakBadge, PointsBadge, XPProgressBar, AchievementGrid, CelebrationModal } from '../components';
import { useGamification } from '../context/GamificationContext';
import { useAnnouncements } from '../context/AnnouncementContext';
import { getDailyQuote } from '../data/quotes';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const UPCOMING_CLASSES = [
  { name: 'Jiu-Jitsu (Adults)', instructor: 'Sensei Tim', time: '12:00 PM', duration: '60 min', spotsLeft: 5, type: 'jiu-jitsu' as const },
  { name: 'Muay Thai', instructor: 'Carnage', time: '5:00 PM', duration: '60 min', spotsLeft: 6, type: 'muay-thai' as const },
];

export function HomeScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const isEmployee = user?.isEmployee === true;
  const { state: gamState, levelInfo, dismissCelebration } = useGamification();
  const { announcements } = useAnnouncements();
  const dailyQuote = getDailyQuote();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ─── Header (compact with corner logo) ─── */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <AnimatedLogo size={32} />
            <View style={styles.headerRight}>
              {!isEmployee && (
                <PointsBadge
                  points={gamState.dojoPoints || 0}
                  compact
                  onPress={() => navigation.navigate('Store')}
                />
              )}
              {!isEmployee && <StreakBadge streak={gamState.streak} compact />}
              <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.surface }]}>
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                <View style={[styles.notifDot, { backgroundColor: colors.red }]} />
              </TouchableOpacity>
            </View>
          </View>
        </FadeInView>

        {/* ─── Announcements (top of feed, admin-editable) ─── */}
        {!isEmployee && announcements.length > 0 && (
          <FadeInView delay={40} slideUp={12}>
            <View style={styles.announcementsWrap}>
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

        {/* ─── Welcome + Daily Japanese Quote ─── */}
        <FadeInView delay={80} slideUp={20}>
          <View style={styles.welcomeSection}>
            <Text style={styles.welcomeLine} numberOfLines={1}>
              <Text style={[styles.welcomeLabel, { color: colors.textTertiary }]}>Welcome back, </Text>
              <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>
                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member'}
              </Text>
            </Text>
            <View style={[styles.quoteCard, { backgroundColor: colors.surface }]}>
              <Ionicons name="chatbubble-outline" size={18} color={colors.gold} style={{ marginBottom: 8 }} />
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
            {/* XP Bar */}
            <FadeInView delay={220} slideUp={16}>
              <View style={styles.section}>
                <View style={[styles.sectionCard, { backgroundColor: colors.surface,  }]}>
                  <XPProgressBar level={levelInfo.level} currentXP={levelInfo.currentXP} nextLevelXP={levelInfo.nextLevelXP} progress={levelInfo.progress} totalXP={gamState.xp} />
                </View>
              </View>
            </FadeInView>

            {/* Today's Classes */}
            <FadeInView delay={340} slideUp={16}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Schedule</Text>
                  <TouchableOpacity style={[styles.seeAllButton, { backgroundColor: colors.accentTint }]} onPress={() => navigation.navigate('Schedule')}>
                    <Text style={[styles.seeAllText, { color: colors.gold }]}>See All</Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.gold} />
                  </TouchableOpacity>
                </View>
                {UPCOMING_CLASSES.map((cls) => (
                  <ClassCard key={cls.name} {...cls} onBook={() => navigation.navigate('Book')} />
                ))}
              </View>
            </FadeInView>

          </>
        )}

      </ScrollView>

      {!isEmployee && (
        <CelebrationModal celebration={gamState.pendingCelebration} onDismiss={dismissCelebration} />
      )}
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
    paddingTop: 8,
    paddingBottom: 12,
  },
  welcomeLine: {
    marginBottom: 20,
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
  quoteCard: {
    borderRadius: 16,
    padding: 24,
    gap: 4,
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 24,
    textAlign: 'center',
    letterSpacing: -0.1,
    fontStyle: 'italic',
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
    marginTop: 32,
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
});
