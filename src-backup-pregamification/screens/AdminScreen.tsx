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
import { typography, spacing, borderRadius } from '../theme';
import { FadeInView, PressableScale } from '../components';
import { MEMBERS } from '../data/members';
import { PRODUCTS } from '../data/products';

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
      <View style={[styles.adminCard, { backgroundColor: colors.surface }]}>
        <View style={styles.adminCardTop}>
          <View style={[styles.adminCardIcon, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={icon} size={26} color={accentColor} />
          </View>
          <Text style={[styles.adminCardCount, { color: accentColor }]}>{count}</Text>
        </View>
        <Text style={[styles.adminCardTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.adminCardSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Admin Panel</Text>
          <View style={styles.backButton} />
        </View>

        {/* Welcome */}
        <FadeInView delay={0} slideUp={10}>
          <View style={[styles.welcomeCard, { backgroundColor: colors.redMuted }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.red} />
            <View style={styles.welcomeText}>
              <Text style={[styles.welcomeTitle, { color: colors.red }]}>Owner Dashboard</Text>
              <Text style={[styles.welcomeDesc, { color: colors.red }]}>
                Manage your dojo members, store, and schedule
              </Text>
            </View>
          </View>
        </FadeInView>

        {/* Admin Cards Grid */}
        <View style={styles.grid}>
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
        <View style={styles.grid}>
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
            <View style={[styles.adminCard, { backgroundColor: colors.surface, opacity: 0.5 }]}>
              <View style={styles.adminCardTop}>
                <View style={[styles.adminCardIcon, { backgroundColor: colors.goldMuted }]}>
                  <Ionicons name="analytics-outline" size={26} color={colors.textMuted} />
                </View>
              </View>
              <Text style={[styles.adminCardTitle, { color: colors.textMuted }]}>Analytics</Text>
              <Text style={[styles.adminCardSubtitle, { color: colors.textMuted }]}>Coming soon</Text>
            </View>
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
              <TouchableOpacity
                key={action.label}
                style={[styles.quickAction, { backgroundColor: colors.surface }]}
                onPress={() => navigation.navigate(action.screen)}
              >
                <Ionicons name={action.icon} size={20} color={colors.gold} />
                <Text style={[styles.quickActionLabel, { color: colors.textPrimary }]}>
                  {action.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
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
    paddingVertical: spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, fontSize: 20 },
  welcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  welcomeText: { flex: 1 },
  welcomeTitle: { ...typography.body, fontWeight: '700' },
  welcomeDesc: { ...typography.bodySmall, marginTop: 2 },
  grid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  gridItem: { flex: 1 },
  adminCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    minHeight: 150,
  },
  adminCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  adminCardIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminCardCount: { fontSize: 28, fontWeight: '900' },
  adminCardTitle: { ...typography.cardTitle, fontSize: 16 },
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
  sectionLabel: { ...typography.label, fontSize: 11, marginBottom: spacing.md },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  quickActionLabel: { ...typography.body, fontWeight: '500', flex: 1 },
});
