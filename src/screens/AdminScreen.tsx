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
import { FadeInView, PressableScale } from '../components';
import { MEMBERS } from '../data/members';
import { useProducts } from '../context/ProductContext';
import { countOpenReports } from '../services/firebaseModeration';

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
          <View style={[styles.adminCardIcon, { backgroundColor: accentColor + '20', width: 52, height: 52, borderRadius: 16 }]}>
            <Ionicons name={icon} size={26} color={accentColor} />
          </View>
          <Text style={[styles.adminCardCount, { color: accentColor, fontSize: 28, fontWeight: '800' }]}>{count}</Text>
        </View>
        <Text style={[styles.adminCardTitle, { color: colors.textPrimary, fontSize: 17, fontWeight: '700' }]}>{title}</Text>
        <Text style={[styles.adminCardSubtitle, { color: colors.textMuted, fontSize: 13 }]}>{subtitle}</Text>
        <View style={styles.adminCardFooter}>
          <Text style={[styles.adminCardAction, { color: accentColor }]}>Manage</Text>
          <Ionicons name="chevron-forward" size={16} color={accentColor} />
        </View>
      </View>
    </PressableScale>
  );
}

export function AdminScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { products: PRODUCTS } = useProducts();
  const { todayVisitors } = useAttendance();

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: 34, fontWeight: '800' }]}>Admin Panel</Text>
          <View style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]} />
        </View>

        {/* Welcome */}
        <FadeInView delay={0} slideUp={10}>
          <View style={[styles.welcomeCard, { backgroundColor: colors.redMuted, borderColor: colors.red + '25' }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.red} />
            <View style={styles.welcomeText}>
              <Text style={[styles.welcomeTitle, { color: colors.red }]}>Owner Dashboard</Text>
              <Text style={[styles.welcomeDesc, { color: colors.red }]}>
                Manage your dojo members, store, and schedule
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
        <View style={[styles.grid, { gap: 14 }]}>
          <FadeInView delay={60} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="people-outline"
              title="Members"
              subtitle="Add, edit, belts & stripes"
              count={MEMBERS.length}
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
        <View style={[styles.grid, { gap: 14 }]}>
          <FadeInView delay={180} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="calendar-outline"
              title="Schedule"
              subtitle="Classes, times, instructors"
              count={7}
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
        <View style={[styles.grid, { gap: 14 }]}>
          <FadeInView delay={280} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="megaphone-outline"
              title="Broadcast"
              subtitle="Push notifications to members"
              count={0}
              accentColor={colors.warning}
              onPress={() => navigation.navigate('AdminBroadcast')}
            />
          </FadeInView>
          <FadeInView delay={320} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="newspaper-outline"
              title="Announcements"
              subtitle="Edit notices on Home screen"
              count={0}
              accentColor={colors.gold}
              onPress={() => navigation.navigate('AdminAnnouncements')}
            />
          </FadeInView>
        </View>
        <View style={[styles.grid, { gap: 14 }]}>
          <FadeInView delay={360} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="checkmark-circle-outline"
              title="Appointments"
              subtitle="Approve & manage bookings"
              count={0}
              accentColor={colors.success}
              onPress={() => navigation.navigate('AdminAppointments')}
            />
          </FadeInView>
          <FadeInView delay={400} slideUp={12} style={styles.gridItem}>
            <AdminCard
              icon="list-outline"
              title="Employee Tasks"
              subtitle="Daily + time-sensitive checklist"
              count={0}
              accentColor={colors.info}
              onPress={() => navigation.navigate('AdminEmployeeTasks')}
            />
          </FadeInView>
        </View>
        <View style={[styles.grid, { gap: 14 }]}>
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
            <Text style={[styles.sectionLabel, { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }]}>QUICK ACTIONS</Text>
            {[
              { icon: 'person-add-outline' as const, label: 'Add New Member', screen: 'AdminMembers' },
              { icon: 'add-circle-outline' as const, label: 'Add New Product', screen: 'AdminProducts' },
              { icon: 'time-outline' as const, label: 'Edit Schedule', screen: 'AdminSchedule' },
            ].map((action) => (
              <SoundPressable
                key={action.label}
                style={[styles.quickAction, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1.5, padding: 20 }]}
                onPress={() => navigation.navigate(action.screen)}
              >
                <View style={[styles.quickActionIcon, { backgroundColor: colors.gold + '20', width: 52, height: 52, borderRadius: 16 }]}>
                  <Ionicons name={action.icon} size={22} color={colors.gold} />
                </View>
                <Text style={[styles.quickActionLabel, { color: colors.textPrimary, fontSize: 17, fontWeight: '700' }]}>
                  {action.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SoundPressable>
            ))}
          </View>
        </FadeInView>

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  title: { ...typography.sectionTitle },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    padding: spacing.md + 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  welcomeText: { flex: 1 },
  welcomeTitle: { ...typography.body, fontWeight: '700' },
  welcomeDesc: { ...typography.bodySmall, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: 14,
  },
  gridItem: { flex: 1 },
  adminCard: {
    // Fixed height so siblings in a row align regardless of title/subtitle
    // wrap. justifyContent docks the Manage chevron to the bottom so the
    // header (icon + count) stays put even when content above varies.
    height: 180,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    justifyContent: 'space-between',
  },
  adminCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  adminCardIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardCount: { fontWeight: '800' },
  adminCardTitle: { ...typography.cardTitle },
  adminCardSubtitle: { ...typography.bodySmall, marginTop: 2 },
  adminCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: 4,
  },
  adminCardAction: { ...typography.label, fontSize: 11 },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  sectionLabel: { ...typography.label, marginBottom: spacing.md },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  quickActionLabel: { ...typography.body, fontWeight: '700', flex: 1 },
  quickActionIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  whosHereCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md + 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  whosHereHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  whosHereTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  whosHereEmpty: { fontSize: 14, fontWeight: '500' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveCount: { fontSize: 15, fontWeight: '800' },
  visitorScroll: { marginTop: 4 },
  visitorChip: { alignItems: 'center', marginRight: 16, width: 52 },
  visitorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorInitial: { fontSize: 18, fontWeight: '700' },
  visitorName: { fontSize: 11, fontWeight: '600', marginTop: 4 },
});
