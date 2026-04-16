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
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock, StreakBadge, XPProgressBar, AchievementGrid, CelebrationModal } from '../components';
import { useGamification } from '../context/GamificationContext';

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ─── Header ─── */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.greeting, { color: colors.textTertiary }]}>Welcome back</Text>
              <Text style={[styles.memberName, { color: colors.textPrimary }]} numberOfLines={1}>{user?.firstName ?? 'Member'}</Text>
            </View>
            <View style={styles.headerRight}>
              {!isEmployee && <StreakBadge streak={gamState.streak} compact />}
              <TouchableOpacity style={[styles.iconButton, { backgroundColor: colors.surface }]}>
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                <View style={[styles.notifDot, { backgroundColor: colors.red }]} />
              </TouchableOpacity>
            </View>
          </View>
        </FadeInView>

        {/* ─── Hero ─── */}
        <FadeInView delay={80} slideUp={20}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <AnimatedLogo size={110} />
            <View style={styles.heroText}>
              <Text style={[styles.heroTagline, { color: colors.textPrimary }]}>PRIVATE TRAINING</Text>
              <Text style={[styles.heroSub, { color: colors.textTertiary }]}>Est. 1997 · Los Feliz, LA</Text>
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
            {/* Stats */}
            <FadeInView delay={160} slideUp={16}>
              <View style={styles.statsRow}>
                {[
                  { value: '12', label: 'This Month', icon: 'flame-outline' as const, accent: true },
                  { value: '156', label: 'Sessions', icon: 'fitness-outline' as const, accent: false },
                  { value: '3', label: 'Stripes', icon: 'ribbon-outline' as const, accent: true },
                ].map((stat) => (
                  <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface,  }]}>
                    <Ionicons name={stat.icon} size={22} color={stat.accent ? colors.gold : colors.textMuted} style={{ marginBottom: 10 }} />
                    <Text style={[styles.statNumber, { color: stat.accent ? colors.gold : colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>{stat.value}</Text>
                    <Text style={[styles.statLabel, { color: colors.textTertiary }]} numberOfLines={1}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </FadeInView>

            {/* XP Bar */}
            <FadeInView delay={220} slideUp={16}>
              <View style={styles.section}>
                <View style={[styles.sectionCard, { backgroundColor: colors.surface,  }]}>
                  <XPProgressBar level={levelInfo.level} currentXP={levelInfo.currentXP} nextLevelXP={levelInfo.nextLevelXP} progress={levelInfo.progress} totalXP={gamState.xp} />
                </View>
              </View>
            </FadeInView>

            {/* Achievements */}
            <FadeInView delay={280} slideUp={16}>
              <View style={styles.section}>
                <View style={[styles.sectionCard, { backgroundColor: colors.surface,  }]}>
                  <AchievementGrid achievements={gamState.achievements} maxShow={8} />
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

            {/* Announcement */}
            <FadeInView delay={400} slideUp={16}>
              <View style={styles.section}>
                <PressableScale>
                  <View style={[styles.announcementCard, { backgroundColor: colors.goldMuted }]}>
                    <View style={[styles.announcementIcon, { backgroundColor: colors.gold + '20' }]}>
                      <Ionicons name="megaphone-outline" size={20} color={colors.gold} />
                    </View>
                    <View style={styles.announcementContent}>
                      <Text style={[styles.announcementTitle, { color: colors.textPrimary }]}>Mat Cleaning — Saturday 8AM</Text>
                      <Text style={[styles.announcementDesc, { color: colors.textSecondary }]}>Weekly deep clean. Open mat from 10 AM.</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </View>
                </PressableScale>
              </View>
            </FadeInView>

            {/* Quick Actions */}
            <FadeInView delay={460} slideUp={16}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: spacing.smd }]}>Quick Actions</Text>
                <View style={styles.actionsRow}>
                  {[
                    { icon: 'body-outline' as const, label: 'Book\nPrivate', screen: 'Book', color: colors.gold },
                    { icon: 'bag-outline' as const, label: 'Zenki\nGear', screen: 'Store', color: colors.redLight },
                    { icon: 'ribbon-outline' as const, label: 'My\nProgress', screen: 'Profile', color: colors.info },
                  ].map((action) => (
                    <PressableScale key={action.label} onPress={() => navigation.navigate(action.screen)} style={styles.actionFlex}>
                      <View style={[styles.actionCard, { backgroundColor: colors.surface,  }]}>
                        <View style={[styles.actionIconWrap, { backgroundColor: action.color + '15' }]}>
                          <Ionicons name={action.icon} size={24} color={action.color} />
                        </View>
                        <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>{action.label}</Text>
                      </View>
                    </PressableScale>
                  ))}
                </View>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  memberName: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.8,
    marginTop: 2,
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

  // Announcement — redesigned as a tinted banner
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
