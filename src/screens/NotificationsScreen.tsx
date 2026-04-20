import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAnnouncements } from '../context/AnnouncementContext';
import { useAppointments } from '../context/AppointmentContext';
import { useAuth } from '../context/AuthContext';
import { useGamification } from '../context/GamificationContext';
import { spacing } from '../theme';

interface NotificationItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  timestamp: string;      // ISO
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
}

export function NotificationsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { announcements } = useAnnouncements();
  const { myAppointments } = useAppointments();
  const { state: gamState } = useGamification();

  // Compose notifications from multiple real sources
  const items = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // Upcoming appointments for the current user (within next 7 days)
    const now = Date.now();
    const inWeek = now + 7 * 86400000;
    myAppointments
      .filter((a) => a.memberId === user?.id && a.status !== 'cancelled' && a.status !== 'completed')
      .forEach((a) => {
        const t = new Date(a.startsAt).getTime();
        if (t > now && t < inWeek) {
          list.push({
            id: `appt-${a.id}`,
            icon: 'calendar-outline',
            iconColor: colors.gold,
            tint: colors.goldMuted,
            title: `${a.sessionType} with ${a.instructor}`,
            body: `${new Date(a.startsAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · ${a.status === 'pending' ? 'Awaiting confirmation' : 'Confirmed'}`,
            timestamp: a.createdAt,
            actionLabel: 'View',
            onAction: () => navigation.navigate('Schedule'),
          });
        }
      });

    // Active announcements
    announcements.forEach((a) => {
      list.push({
        id: `ann-${a.id}`,
        icon: 'megaphone-outline',
        iconColor: colors.gold,
        tint: colors.goldMuted,
        title: a.title,
        body: a.description || 'Tap to read more',
        timestamp: a.createdAt || new Date().toISOString(),
      });
    });

    // Pending celebration (unclaimed achievement)
    if (gamState.pendingCelebration) {
      const c = gamState.pendingCelebration;
      list.push({
        id: 'celebration',
        icon: (c.icon as any) || 'trophy-outline',
        iconColor: colors.gold,
        tint: colors.goldMuted,
        title: c.title,
        body: c.subtitle,
        timestamp: new Date().toISOString(),
        actionLabel: 'See',
        onAction: () => navigation.navigate('Achievements'),
      });
    }

    // Streak milestone reminder
    if (gamState.streak >= 3) {
      list.push({
        id: 'streak',
        icon: 'flame',
        iconColor: colors.flames,
        tint: colors.flames + '20',
        title: `${gamState.streak}-day streak. Keep it alive!`,
        body: `Train today to push it to ${gamState.streak + 1}. One missed day resets.`,
        timestamp: new Date().toISOString(),
      });
    }

    // Sort newest first
    return list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [myAppointments, announcements, gamState, user, colors, navigation]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="notifications-outline" size={44} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>You're all caught up</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            No new notifications right now. Booked classes, announcements, and achievements will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={item.onAction}
              activeOpacity={item.onAction ? 0.8 : 1}
            >
              <View style={[styles.iconBox, { backgroundColor: item.tint || colors.goldMuted }]}>
                <Ionicons name={item.icon} size={20} color={item.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.cardBody, { color: colors.textSecondary }]} numberOfLines={2}>
                  {item.body}
                </Text>
              </View>
              {item.actionLabel && (
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              )}
            </TouchableOpacity>
          ))}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/** Shared helper — used by HomeScreen bell to decide whether to render the red dot. */
export function useHasUnreadNotifications(): boolean {
  const { announcements } = useAnnouncements();
  const { myAppointments } = useAppointments();
  const { user } = useAuth();
  const { state } = useGamification();

  const now = Date.now();
  const weekOut = now + 7 * 86400000;
  const hasUpcoming = myAppointments.some(
    (a) => a.memberId === user?.id && a.status !== 'cancelled' && a.status !== 'completed'
      && (() => { const t = new Date(a.startsAt).getTime(); return t > now && t < weekOut; })(),
  );
  return hasUpcoming || announcements.length > 0 || !!state.pendingCelebration;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  iconBox: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBody: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
