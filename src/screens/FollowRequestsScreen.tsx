import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Image,
  ActivityIndicator,
} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import {
  listFollowRequests, acceptFollowRequest, declineFollowRequest, getUserProfile,
} from '../services/firebaseFollow';
import { spacing, borderRadius, MAX_CONTENT_WIDTH } from '../theme';

interface RequestRow {
  requesterId: string;
  displayName: string;
  avatar: string | null;
  at: string;
}

export function FollowRequestsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-row in-flight guard so a double-tap can't fire Accept/Decline twice.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const requests = await listFollowRequests();
      const resolved = await Promise.all(
        requests.map(async (r) => {
          const profile = await getUserProfile(r.requesterId);
          return {
            requesterId: r.requesterId,
            displayName: profile?.displayName || 'Member',
            avatar: profile?.avatar || null,
            at: r.at,
          };
        }),
      );
      if (!cancelled) {
        // Newest request first (ISO timestamps sort lexicographically).
        setRows(resolved.sort((a, b) => b.at.localeCompare(a.at)));
        setLoading(false);
      }
    })().catch((e) => {
      console.warn('[FollowRequests] load failed:', e);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const removeRow = (requesterId: string) => {
    setRows((prev) => prev.filter((r) => r.requesterId !== requesterId));
  };

  const withBusy = async (requesterId: string, fn: () => Promise<void>) => {
    if (busy.has(requesterId)) return;
    setBusy((prev) => new Set(prev).add(requesterId));
    try {
      await fn();
      removeRow(requesterId);
    } catch (e) {
      console.warn('[FollowRequests] action failed:', e);
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(requesterId);
        return next;
      });
    }
  };

  const handleAccept = (row: RequestRow) =>
    withBusy(row.requesterId, () => acceptFollowRequest(row.requesterId));

  const handleDecline = (row: RequestRow) =>
    withBusy(row.requesterId, () => declineFollowRequest(row.requesterId));

  const renderItem = ({ item }: { item: RequestRow }) => {
    const initials = item.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    const isBusy = busy.has(item.requesterId);
    return (
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <SoundPressable
          style={styles.identity}
          onPress={() => navigation.navigate('UserProfile', { userId: item.requesterId })}
        >
          <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
            {item.avatar ? (
              <Image source={{ uri: item.avatar }} style={styles.avatarImg} />
            ) : (
              <Text style={[styles.initials, { color: colors.gold }]}>{initials}</Text>
            )}
          </View>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.displayName}
          </Text>
        </SoundPressable>
        <View style={styles.actions}>
          <SoundPressable
            style={[styles.acceptBtn, { backgroundColor: colors.red, opacity: isBusy ? 0.5 : 1 }]}
            onPress={() => handleAccept(item)}
            disabled={isBusy}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </SoundPressable>
          <SoundPressable
            style={[styles.declineBtn, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, opacity: isBusy ? 0.5 : 1 }]}
            onPress={() => handleDecline(item)}
            disabled={isBusy}
          >
            <Text style={[styles.declineText, { color: colors.textPrimary }]}>Decline</Text>
          </SoundPressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Follow Requests</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="person-add-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No follow requests</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            When someone asks to follow your private account, they'll show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.requesterId}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1,
    gap: spacing.md,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1, minWidth: 0 },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  initials: { fontSize: 14, fontWeight: '800' },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  acceptBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
  },
  acceptText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  declineBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
  declineText: { fontSize: 13, fontWeight: '700' },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: spacing.sm },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});

// The RootNavigator wires sibling screens via named import (e.g.
// `import { BlockedUsersScreen }`). A default export is provided as well so the
// lead can register the route either way.
export default FollowRequestsScreen;
