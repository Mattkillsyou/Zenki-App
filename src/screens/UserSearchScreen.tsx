import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Image,
  ActivityIndicator} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme';
import { getAllMembers, MemberProfile } from '../services/firebaseUsers';
import { getOrCreateConversation } from '../services/firebaseMessages';

export function UserSearchScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const action: 'view' | 'message' = route?.params?.action || 'view';
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');

  useEffect(() => {
    (async () => {
      const list = await getAllMembers();
      setMembers(list);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [members, queryText]);

  const handlePress = async (member: MemberProfile) => {
    if (action === 'message') {
      const convId = await getOrCreateConversation(member.id);
      navigation.replace('MessagesChat', {
        conversationId: convId,
        otherUserId: member.id,
        otherUserName: member.displayName,
        otherUserAvatar: member.avatar,
      });
    } else {
      navigation.navigate('UserProfile', { userId: member.id });
    }
  };

  const renderItem = ({ item }: { item: MemberProfile }) => {
    const initials = item.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    return (
      <SoundPressable
        style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => handlePress(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.initials, { color: colors.gold }]}>{initials}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.displayName}
          </Text>
          {item.bio ? (
            <Text style={[styles.bio, { color: colors.textMuted }]} numberOfLines={1}>
              {item.bio}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={action === 'message' ? 'paper-plane-outline' : 'chevron-forward'}
          size={18}
          color={colors.textMuted}
        />
      </SoundPressable>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {action === 'message' ? 'New Message' : 'Members'}
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: colors.textPrimary }]}
          placeholder="Search members…"
          placeholderTextColor={colors.textMuted}
          value={queryText}
          onChangeText={setQueryText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {queryText ? (
          <SoundPressable onPress={() => setQueryText('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </SoundPressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.gold} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            {members.length === 0 ? 'No members yet' : 'No matches'}
          </Text>
          <Text style={[styles.emptySub, { color: colors.textMuted }]}>
            {members.length === 0
              ? 'Members will appear here once they sign up.'
              : 'Try a different search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
        />
      )}
    </SafeAreaView>
  );
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

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
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  initials: { fontSize: 13, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '700' },
  bio: { fontSize: 12, marginTop: 2 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 4 },
  emptySub: { fontSize: 13, textAlign: 'center' },
});
