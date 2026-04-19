import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useBlocks } from '../context/BlocksContext';
import { fetchUserProfile } from '../services/firebaseMessages';
import { spacing, borderRadius } from '../theme';

interface BlockedRow {
  uid: string;
  displayName: string;
  avatar: string | null;
}

export function BlockedUsersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { blockedIds, unblockUser } = useBlocks();
  const [rows, setRows] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const uids = Array.from(blockedIds);
      const results = await Promise.all(
        uids.map(async (uid) => {
          const profile = await fetchUserProfile(uid);
          return {
            uid,
            displayName: profile?.displayName || 'Member',
            avatar: profile?.avatar || null,
          };
        }),
      );
      if (!cancelled) {
        setRows(results.sort((a, b) => a.displayName.localeCompare(b.displayName)));
        setLoading(false);
      }
    })().catch((e) => {
      console.warn('[BlockedUsers] load failed:', e);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [blockedIds]);

  const handleUnblock = (row: BlockedRow) => {
    Alert.alert(
      `Unblock ${row.displayName}?`,
      'Their posts and messages will be visible to you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: () => unblockUser(row.uid),
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: BlockedRow }) => {
    const initials = item.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <TouchableOpacity
          style={[styles.unblockBtn, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}
          onPress={() => handleUnblock(item)}
        >
          <Text style={[styles.unblockText, { color: colors.textPrimary }]}>Unblock</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Blocked Users</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No blocked users</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            You haven't blocked anyone yet. Use the ••• menu on a post or profile to block.
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.uid}
          renderItem={renderItem}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs }}
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
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  initials: { fontSize: 14, fontWeight: '800' },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  unblockBtn: {
    paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: borderRadius.sm, borderWidth: 1,
  },
  unblockText: { fontSize: 13, fontWeight: '700' },

  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: spacing.sm },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
