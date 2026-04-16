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
  /** Vertical offset from top of screen where the bell icon sits (in px).
   *  Used to anchor the chat-bubble tail under the bell. Defaults to a
   *  reasonable value for the Home header. */
  anchorTop?: number;
  /** Horizontal offset of the bell from the right edge (in px). */
  anchorRight?: number;
}

export function NotificationsModal({
  visible,
  onClose,
  navigation,
  anchorTop = 60,
  anchorRight = 20,
}: Props) {
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
        onAction: () => { onClose(); navigation.navigate('Achievements'); },
      });
    }

    if (gamState.streak >= 3) {
      list.push({
        id: 'streak',
        icon: 'flame',
        iconColor: '#FF6B35',
        tint: '#FF6B3520',
        title: `${gamState.streak}-day streak`,
        body: `Train today to push it to ${gamState.streak + 1}. Missed days reset.`,
        timestamp: new Date().toISOString(),
      });
    }

    return list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [myAppointments, announcements, gamState, user, colors, navigation, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Chat bubble anchored near the bell (top-right area) */}
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.bubbleWrap,
            { top: anchorTop, right: anchorRight },
          ]}
        >
          {/* Little tail pointing up to the bell */}
          <View style={styles.tailWrap}>
            <View
              style={[
                styles.tailOutline,
                { borderBottomColor: colors.border },
              ]}
            />
            <View
              style={[
                styles.tailFill,
                { borderBottomColor: colors.backgroundElevated },
              ]}
            />
          </View>

          <View
            style={[
              styles.bubble,
              {
                backgroundColor: colors.backgroundElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Notifications
              </Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {items.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="notifications-outline"
                  size={26}
                  color={colors.textMuted}
                />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  All caught up
                </Text>
                <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                  Nothing new right now.
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 360 }}
              >
                {items.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={item.onAction}
                    activeOpacity={item.onAction ? 0.8 : 1}
                  >
                    <View
                      style={[
                        styles.iconBox,
                        { backgroundColor: item.tint || colors.goldMuted },
                      ]}
                    >
                      <Ionicons name={item.icon} size={14} color={item.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.cardTitle, { color: colors.textPrimary }]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        style={[styles.cardBody, { color: colors.textSecondary }]}
                        numberOfLines={2}
                      >
                        {item.body}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const BUBBLE_WIDTH = 300;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bubbleWrap: {
    position: 'absolute',
    width: BUBBLE_WIDTH,
  },
  // Chat-bubble tail pointing up at the bell
  tailWrap: {
    position: 'absolute',
    top: -9,
    right: 14,
    width: 20,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tailOutline: {
    position: 'absolute',
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  tailFill: {
    position: 'absolute',
    top: 1.5,
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  bubble: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    // Soft shadow for that popup-from-bell feel
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 12, fontWeight: '700' },
  cardBody: { fontSize: 11, marginTop: 1, lineHeight: 14 },

  empty: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 6,
  },
  emptyTitle: { fontSize: 13, fontWeight: '800' },
  emptyBody: { fontSize: 11, textAlign: 'center' },
});
