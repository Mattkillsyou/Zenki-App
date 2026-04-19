import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBlocks } from '../context/BlocksContext';
import { spacing } from '../theme';
import { Conversation, fetchUserProfile, subscribeToInbox } from '../services/firebaseMessages';

export function MessagesListScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isBlocked } = useBlocks();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  // Hide threads with blocked users
  const visibleConvs = convs.filter((c) => !c.otherUserId || !isBlocked(c.otherUserId));

  useEffect(() => {
    const unsub = subscribeToInbox(async (list) => {
      // Enrich with each other user's profile for display
      const enriched = await Promise.all(
        list.map(async (c) => {
          if (!c.otherUserId) return c;
          const profile = await fetchUserProfile(c.otherUserId);
          return {
            ...c,
            otherUserName: profile?.displayName || 'Member',
            otherUserAvatar: profile?.avatar || null,
          };
        }),
      );
      setConvs(enriched);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const renderItem = ({ item }: { item: Conversation }) => {
    const unread = user?.id ? item.unreadFor?.[user.id] || 0 : 0;
    const previewPrefix = item.lastSenderId === user?.id ? 'You: ' : '';
    const initials = (item.otherUserName || 'M').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    const time = item.lastMessageAt ? formatTimeAgo(item.lastMessageAt) : '';
    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() =>
          navigation.navigate('MessagesChat', {
            conversationId: item.id,
            otherUserId: item.otherUserId,
            otherUserName: item.otherUserName,
            otherUserAvatar: item.otherUserAvatar,
          })
        }
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
          {item.otherUserAvatar ? (
            <Image source={{ uri: item.otherUserAvatar }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.initials, { color: colors.gold }]}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.otherUserName || 'Member'}
            </Text>
            {time ? <Text style={[styles.time, { color: colors.textMuted }]}>{time}</Text> : null}
          </View>
          <Text
            style={[
              styles.preview,
              { color: unread > 0 ? colors.textPrimary : colors.textMuted, fontWeight: unread > 0 ? '700' : '400' },
            ]}
            numberOfLines={1}
          >
            {previewPrefix}{item.lastMessage || 'Say hello'}
          </Text>
        </View>
        {unread > 0 && (
          <View style={[styles.unreadDot, { backgroundColor: colors.red }]}>
            <Text style={styles.unreadText}>{unread}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Messages</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('UserSearch', { action: 'message' })}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="create-outline" size={20} color={colors.gold} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.textMuted }}>Loading…</Text>
        </View>
      ) : visibleConvs.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="paper-plane-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No messages yet</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Tap the pencil to start a conversation with a member.
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleConvs}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  list: { paddingHorizontal: spacing.lg, paddingTop: 8, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  initials: { fontSize: 14, fontWeight: '800' },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: { fontSize: 15, fontWeight: '700', flex: 1 },
  time: { fontSize: 11, fontWeight: '500', marginLeft: 8 },
  preview: { fontSize: 13, marginTop: 2 },
  unreadDot: {
    minWidth: 22, height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: '800' },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 4 },
});
