import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAttendance } from '../context/AttendanceContext';
import { typography, spacing, borderRadius } from '../theme';
import { FadeInView, PressableScale, ScreenContainer } from '../components';
import { MEMBERS } from '../data/members';
import { useProducts } from '../context/ProductContext';
import { useSchedule } from '../context/ScheduleContext';
import { useAnnouncements } from '../context/AnnouncementContext';
import { useAppointments } from '../context/AppointmentContext';
import { useEmployeeTasks } from '../context/EmployeeTaskContext';
import { countOpenReports } from '../services/firebaseModeration';
import { subscribeToAllMembers } from '../services/memberSync';

interface AdminCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  count: number;
  accentColor: string;
  onPress: () => void;
}

function AdminCard({ icon, title, subtitle, count, accentColor, onPress }: AdminCardProps) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress}>
      <View style={[styles.adminCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.adminCardTop}>
          <View style={[styles.adminCardIcon, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={icon} size={22} color={accentColor} />
          </View>
          <Text style={[styles.adminCardCount, { color: accentColor }]} numberOfLines={1}>{count}</Text>
        </View>
        <Text style={[styles.adminCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.adminCardSubtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
      </View>
    </PressableScale>
  );
}

export function AdminScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { products: PRODUCTS } = useProducts();
  const { todayVisitors } = useAttendance();
  const { schedule } = useSchedule();
  const { announcements } = useAnnouncements();
  const { pendingForAdmin } = useAppointments();
  const { tasks } = useEmployeeTasks();
  const scheduleCount = Object.values(schedule).reduce((sum, dayClasses) => sum + dayClasses.length, 0);

  // Live badge: number of open reports. Refresh every time this screen mounts.
  const [openReportsCount, setOpenReportsCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    countOpenReports().then((n) => {
      if (!cancelled) setOpenReportsCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live members count from /members (was hard-wired to MEMBERS.length, the
  // seed-array length — which never reflected admin-added or self-signup
  // members and showed a misleading "5" on the Admin Panel tile).
  const [membersCount, setMembersCount] = useState<number>(MEMBERS.length);
  useEffect(() => {
    const unsub = subscribeToAllMembers((remote) => {
      if (remote.length > 0) setMembersCount(remote.length);
    });
    return unsub;
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xxl * 2 }}>
        {/* Header — iOS-nav-bar style: 22pt title, balanced spacing, no risk of clipping */}
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            hitSlop={6}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </SoundPressable>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Admin Panel
          </Text>
          <View style={{ width: 36, height: 36 }} />
        </View>

        {/* Owner pill — subtle band with accent left bar instead of full red-tinted card */}
        <FadeInView delay={0} slideUp={8}>
          <View style={[styles.ownerPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.ownerAccent, { backgroundColor: colors.red }]} />
            <Ionicons name="shield-checkmark" size={18} color={colors.red} />
            <View style={styles.welcomeText}>
              <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]} numberOfLines={1}>Owner Dashboard</Text>
              <Text style={[styles.welcomeDesc, { color: colors.textMuted }]} numberOfLines={1}>
                Manage your dojo
              </Text>
            </View>
          </View>
        </FadeInView>

        {/* Who's Here */}
        <FadeInView delay={50} slideUp={10}>
          <View style={[styles.whosHereCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.whosHereHeader}>
              <Ionicons name="location" size={18} color={colors.success} />
              <Text style={[styles.whosHereTitle, { color: colors.textPrimary }]}>Who's Here</Text>
              <View style={[styles.liveBadge, { backgroundColor: colors.success + '20' }]}>
                <View style={[styles.liveDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.liveCount, { color: colors.success }]}>{todayVisitors.length}</Text>
              </View>
            </View>
            {todayVisitors.length === 0 ? (
              <Text style={[styles.whosHereEmpty, { color: colors.textMuted }]}>No one has checked in today</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.visitorScroll}>
                {todayVisitors.map((v) => (
                  <View key={v.id} style={styles.visitorChip}>
                    <View style={[styles.visitorAvatar, { backgroundColor: colors.gold + '20' }]}>
                      <Text style={[styles.visitorInitial, { color: colors.gold }]}>{v.memberName[0]}</Text>
                    </View>
                    <Text style={[styles.visitorName, { color: colors.textSecondary }]} numberOfLines={1}>
                      {v.memberName.split(' ')[0]}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </FadeInView>

        {/* Admin Cards Grid */}
        <View style={styles.grid}>
          <FadeInView delay={60} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="people-outline"
              title="Members"
              subtitle="Add, edit, belts & stripes"
              count={membersCount}
              accentColor={colors.gold}
              onPress={() => navigation.navigate('AdminMembers')}
            />
          </FadeInView>
          <FadeInView delay={120} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="bag-outline"
              title="Store"
              subtitle="Products, pricing, stock"
              count={PRODUCTS.length}
              accentColor={colors.red}
              onPress={() => navigation.navigate('AdminProducts')}
            />
          </FadeInView>
        </View>
        <View style={styles.grid}>
          <FadeInView delay={180} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="calendar-outline"
              title="Schedule"
              subtitle="Classes, times, instructors"
              count={scheduleCount}
              accentColor={colors.success}
              onPress={() => navigation.navigate('AdminSchedule')}
            />
          </FadeInView>
          <FadeInView delay={240} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="location-outline"
              title="Attendance"
              subtitle="Visit history & tracking"
              count={todayVisitors.length}
              accentColor={colors.info}
              onPress={() => navigation.navigate('AttendanceHistory')}
            />
          </FadeInView>
        </View>
        <View style={styles.grid}>
          <FadeInView delay={280} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="megaphone-outline"
              title="Broadcast"
              subtitle="Push notifications to members"
              count={membersCount}
              accentColor={colors.warning}
              onPress={() => navigation.navigate('AdminBroadcast')}
            />
          </FadeInView>
          <FadeInView delay={320} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="newspaper-outline"
              title="Announcements"
              subtitle="Edit notices on Home screen"
              count={announcements.length}
              accentColor={colors.gold}
              onPress={() => navigation.navigate('AdminAnnouncements')}
            />
          </FadeInView>
        </View>
        <View style={styles.grid}>
          <FadeInView delay={360} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="checkmark-circle-outline"
              title="Appointments"
              subtitle="Approve & manage bookings"
              count={pendingForAdmin.length}
              accentColor={colors.success}
              onPress={() => navigation.navigate('AdminAppointments')}
            />
          </FadeInView>
          <FadeInView delay={400} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="list-outline"
              title="Employee Tasks"
              subtitle="Daily + time-sensitive checklist"
              count={tasks.length}
              accentColor={colors.info}
              onPress={() => navigation.navigate('AdminEmployeeTasks')}
            />
          </FadeInView>
        </View>
        <View style={styles.grid}>
          <FadeInView delay={440} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="flag-outline"
              title={openReportsCount && openReportsCount > 0
                ? `Reports (${openReportsCount} open)`
                : 'Reports'}
              subtitle="Moderate user-reported content"
              count={openReportsCount ?? 0}
              accentColor={openReportsCount && openReportsCount > 0 ? colors.red : colors.warning}
              onPress={() => navigation.navigate('AdminReports')}
            />
          </FadeInView>
        </View>

        {/* Quick Actions */}
        <FadeInView delay={300} slideUp={12}>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>QUICK ACTIONS</Text>
            {[
              { icon: 'person-add-outline' as const, label: 'Add New Member', screen: 'AdminMembers' },
              { icon: 'add-circle-outline' as const, label: 'Add New Product', screen: 'AdminProducts' },
              { icon: 'time-outline' as const, label: 'Edit Schedule', screen: 'AdminSchedule' },
            ].map((action) => (
              <SoundPressable
                key={action.label}
                style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.gold + '18' }]}>
                  <Ionicons name={action.icon} size={18} color={colors.gold} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                  {action.label}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </SoundPressable>
            ))}
          </View>
        </FadeInView>

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
      </ScreenContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Nav-bar style header — 22pt title with adjustsFontSizeToFit, generous
  // top padding (sits on top of SafeAreaView's dynamic-island inset) so the
  // title can't crowd the status bar even on iPhone Pro Max.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    minHeight: 64,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3 },

  // Owner pill — replaces the loud full-tinted welcome card.
  ownerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    paddingVertical: 12,
    paddingRight: 14,
    paddingLeft: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  ownerAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 3,
  },
  welcomeText: { flex: 1 },
  welcomeTitle: { fontSize: 14, fontWeight: '700' },
  welcomeDesc: { fontSize: 12, marginTop: 1 },

  // Cards grid
  grid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: 12,
    gap: 12,
  },
  gridItem: { flex: 1 },
  adminCard: {
    height: 132,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  adminCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  adminCardIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardCount: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  adminCardTitle: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  adminCardSubtitle: { fontSize: 12, marginTop: 2 },

  // Quick Actions
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickActionLabel: { fontSize: 15, fontWeight: '600', flex: 1 },
  quickActionIcon: {
    width: 36, height: 36, borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Who's Here
  whosHereCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  whosHereHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  whosHereTitle: { fontSize: 14, fontWeight: '700', flex: 1, letterSpacing: 0.2 },
  whosHereEmpty: { fontSize: 12, fontWeight: '500' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveCount: { fontSize: 12, fontWeight: '700' },
  visitorScroll: { marginTop: 2 },
  visitorChip: { alignItems: 'center', marginRight: 14, width: 48 },
  visitorAvatar: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorInitial: { fontSize: 16, fontWeight: '700' },
  visitorName: { fontSize: 10, fontWeight: '600', marginTop: 4 },
});
