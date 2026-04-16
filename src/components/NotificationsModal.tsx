import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable } from 'react-native';
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
  timestamp: string;
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  navigation: any;
}

export function NotificationsModal({ visible, onClose, navigation }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { announcements } = useAnnouncements();
  const { myAppointments } = useAppointments();
  const { state: gamState } = useGamification();

  const items = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];
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
            onAction: () => { onClose(); navigation.navigate('Schedule'); },
          });
        }
      });

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
        onAction: () => { onClose(); navigation.navigate('Achievements'); },
      });
    }

    if (gamState.streak >= 3) {
      list.push({
        id: 'streak',
        icon: 'flame',
        iconColor: '#FF6B35',
        tint: '#FF6B3520',
        title: `${gamState.streak}-day streak — keep it alive!`,
        body: `Train today to push it to ${gamState.streak + 1}. One missed day resets.`,
        timestamp: new Date().toISOString(),
      });
    }

    return list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [myAppointments, announcements, gamState, user, colors, navigation, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Notifications</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {items.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="notifications-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>You're all caught up</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                No new notifications. Booked classes, announcements, and achievements will appear here.
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={item.onAction}
                  activeOpacity={item.onAction ? 0.8 : 1}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.tint || colors.goldMuted }]}>
                    <Ionicons name={item.icon} size={18} color={item.iconColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.cardBody, { color: colors.textSecondary }]} numberOfLines={2}>
                      {item.body}
                    </Text>
                  </View>
                  {item.actionLabel && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: 16,
    paddingBottom: 32,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    maxHeight: '75%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  cardBody: { fontSize: 12, marginTop: 2, lineHeight: 16 },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 40,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptyBody: { fontSize: 12, textAlign: 'center', lineHeight: 16, paddingHorizontal: 24 },
});
