import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image,
  Alert, ActivityIndicator} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useBlocks } from '../context/BlocksContext';
import { fetchUserProfile } from '../services/firebaseMessages';
import { spacing, borderRadius, MAX_CONTENT_WIDTH } from '../theme';

interface PersonRow {
  uid: string;
  displayName: string;
  avatar: string | null;
}

async function resolveRows(uids: string[]): Promise<PersonRow[]> {
  const rows = await Promise.all(
    uids.map(async (uid) => {
      const profile = await fetchUserProfile(uid);
      return { uid, displayName: profile?.displayName || 'Member', avatar: profile?.avatar || null };
    }),
  );
  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function BlockedUsersScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { blockedIds, unblockUser, mutedIds, unmuteUser } = useBlocks();
  const [blockedRows, setBlockedRows] = useState<PersonRow[]>([]);
  const [mutedRows, setMutedRows] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [blocked, muted] = await Promise.all([
        resolveRows(Array.from(blockedIds)),
        resolveRows(Array.from(mutedIds)),
      ]);
      if (!cancelled) {
        setBlockedRows(blocked);
        setMutedRows(muted);
        setLoading(false);
      }
    })().catch((e) => {
      console.warn('[BlockedUsers] load failed:', e);
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [blockedIds, mutedIds]);

  const handleUnblock = (row: PersonRow) => {
    Alert.alert(
      `Unblock ${row.displayName}?`,
      'Their posts and messages will be visible to you again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unblock', onPress: () => unblockUser(row.uid) },
      ],
    );
  };

  const handleUnmute = (row: PersonRow) => {
    Alert.alert(
      `Unmute ${row.displayName}?`,
      'Their posts and comments will show in your feed again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unmute', onPress: () => unmuteUser(row.uid) },
      ],
    );
  };

  const renderRow = (item: PersonRow, action: 'unblock' | 'unmute') => {
    const initials = item.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <View key={item.uid} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
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
        <SoundPressable
          style={[styles.unblockBtn, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}
          onPress={() => (action === 'unblock' ? handleUnblock(item) : handleUnmute(item))}
        >
          <Text style={[styles.unblockText, { color: colors.textPrimary }]}>
            {action === 'unblock' ? 'Unblock' : 'Unmute'}
          </Text>
        </SoundPressable>
      </View>
    );
  };

  const isEmpty = blockedRows.length === 0 && mutedRows.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Blocked &amp; Muted</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : isEmpty ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No blocked or muted users</Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            Use the ••• menu on a post, comment, or profile to block (hide them and
            stop contact) or mute (hide their posts quietly).
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.xs, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}
        >
          {blockedRows.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>BLOCKED</Text>
              {blockedRows.map((r) => renderRow(r, 'unblock'))}
            </>
          )}
          {mutedRows.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: blockedRows.length ? spacing.lg : 0 }]}>MUTED</Text>
              {mutedRows.map((r) => renderRow(r, 'unmute'))}
            </>
          )}
        </ScrollView>
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

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: spacing.xs },

  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: borderRadius.md, borderWidth: 1,
    gap: spacing.md, marginBottom: spacing.xs,
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
