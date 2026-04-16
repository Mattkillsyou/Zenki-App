import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius } from '../theme';
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock } from '../components';

const UPCOMING_CLASSES = [
  {
    name: 'Jiu-Jitsu (Adults)',
    instructor: 'Sensei Tim',
    time: '12:00 PM',
    duration: '60 min',
    spotsLeft: 5,
    type: 'jiu-jitsu' as const,
  },
  {
    name: 'Muay Thai',
    instructor: 'Carnage',
    time: '5:00 PM',
    duration: '60 min',
    spotsLeft: 6,
    type: 'muay-thai' as const,
  },
];

export function HomeScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isEmployee = user?.isEmployee === true;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.greeting, { color: colors.textMuted }]}>Welcome back</Text>
              <Text style={[styles.memberName, { color: colors.textPrimary }]}>{user?.firstName ?? 'Member'}</Text>
            </View>
            <TouchableOpacity style={[styles.notifButton, { backgroundColor: colors.surface }]}>
              <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
              <View style={[styles.notifBadge, { backgroundColor: colors.red }]} />
            </TouchableOpacity>
          </View>
        </FadeInView>

        {/* Hero — Logo */}
        <FadeInView delay={60} slideUp={16}>
          <View style={[styles.heroSection, { backgroundColor: colors.surface }]}>
            <AnimatedLogo size={160} />
            <View style={styles.heroText}>
              <Text style={[styles.heroTagline, { color: colors.textPrimary }]}>
                PRIVATE TRAINING
              </Text>
              <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
                Est. 1997 · Los Feliz, LA
              </Text>
            </View>
          </View>
        </FadeInView>

        {/* Employee Time Clock — only for employees */}
        {isEmployee && (
          <FadeInView delay={100} slideUp={14}>
            <View style={styles.section}>
              <TimeClock />
            </View>
          </FadeInView>
        )}

        {/* Member content — hidden for employees */}
        {!isEmployee && (
          <>
            {/* Quick Stats */}
            <FadeInView delay={140} slideUp={14}>
              <View style={styles.statsRow}>
                {[
                  { value: '12', label: 'This Month', highlight: true },
                  { value: '156', label: 'Total Sessions', highlight: false },
                  { value: '3', label: 'Stripes', highlight: true },
                ].map((stat) => (
                  <View key={stat.label} style={[styles.statCard, { backgroundColor: colors.surface }]}>
                    <Text style={[styles.statNumber, { color: stat.highlight ? colors.gold : colors.textPrimary }]}>
                      {stat.value}
                    </Text>
                    <Text style={[styles.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
                  </View>
                ))}
              </View>
            </FadeInView>

            {/* Today's Classes */}
            <FadeInView delay={220} slideUp={14}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('Schedule')}>
                    <Text style={[styles.sectionAction, { color: colors.gold }]}>Full Schedule</Text>
                  </TouchableOpacity>
                </View>
                {UPCOMING_CLASSES.map((cls) => (
                  <ClassCard key={cls.name} {...cls} onBook={() => navigation.navigate('Book')} />
                ))}
              </View>
            </FadeInView>

            {/* Announcement */}
            <FadeInView delay={300} slideUp={14}>
              <View style={styles.section}>
                <PressableScale>
                  <View style={[styles.announcementCard, { backgroundColor: colors.surface, borderLeftColor: colors.gold }]}>
                    <View style={styles.announcementContent}>
                      <Text style={[styles.announcementLabel, { color: colors.gold }]}>ANNOUNCEMENT</Text>
                      <Text style={[styles.announcementTitle, { color: colors.textPrimary }]}>
                        Mat Cleaning — Saturday 8AM
                      </Text>
                      <Text style={[styles.announcementDesc, { color: colors.textSecondary }]}>
                        Weekly deep clean. Open mat available from 10 AM.
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </View>
                </PressableScale>
              </View>
            </FadeInView>

            {/* Quick Actions */}
            <FadeInView delay={380} slideUp={14}>
              <View style={styles.section}>
                <View style={styles.actionsRow}>
                  <PressableScale onPress={() => navigation.navigate('Book')} style={styles.actionFlex}>
                    <View style={[styles.actionCard, { backgroundColor: colors.surface }]}>
                      <Ionicons name="body-outline" size={28} color={colors.gold} />
                      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Book{'\n'}Private</Text>
                    </View>
                  </PressableScale>
                  <PressableScale onPress={() => navigation.navigate('Store')} style={styles.actionFlex}>
                    <View style={[styles.actionCard, { backgroundColor: colors.surface }]}>
                      <Ionicons name="bag-outline" size={28} color={colors.gold} />
                      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>Zenki{'\n'}Gear</Text>
                    </View>
                  </PressableScale>
                  <PressableScale onPress={() => navigation.navigate('Profile')} style={styles.actionFlex}>
                    <View style={[styles.actionCard, { backgroundColor: colors.surface }]}>
                      <Ionicons name="ribbon-outline" size={28} color={colors.gold} />
                      <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>My{'\n'}Progress</Text>
                    </View>
                  </PressableScale>
                </View>
              </View>
            </FadeInView>
          </>
        )}

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
  greeting: {
    ...typography.bodySmall,
  },
  memberName: {
    ...typography.cardTitle,
    fontSize: 20,
    marginTop: 2,
  },
  notifButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroSection: {
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  heroText: {
    alignItems: 'center',
  },
  heroTagline: {
    ...typography.sectionTitle,
    fontSize: 18,
    letterSpacing: 4,
  },
  heroSub: {
    ...typography.bodySmall,
    marginTop: 4,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    ...typography.label,
    fontSize: 9,
    marginTop: 4,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.sectionTitle,
    fontSize: 20,
  },
  sectionAction: {
    ...typography.label,
  },
  announcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderLeftWidth: 3,
  },
  announcementContent: {
    flex: 1,
  },
  announcementLabel: {
    ...typography.label,
    fontSize: 10,
    marginBottom: 4,
  },
  announcementTitle: {
    ...typography.cardTitle,
    fontSize: 16,
  },
  announcementDesc: {
    ...typography.bodySmall,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: {
    flex: 1,
  },
  actionCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionLabel: {
    ...typography.label,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
});
