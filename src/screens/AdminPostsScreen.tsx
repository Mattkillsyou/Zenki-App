import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Alert,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { ScreenContainer } from '../components';
import { Post, listAllPostsForAdmin, deletePost } from '../services/firebasePosts';

/**
 * Admin → Community. Lists every community post (any author, public or private)
 * so the owner can moderate/delete from a desktop-free surface. Delete goes
 * through the deletePostCascade Cloud Function (post doc + likes/comments +
 * Storage media), the same path the Reports → Remove & Block action uses — but
 * here it works on ANY post, not just a reported one.
 */
// List is capped at the newest N posts (matching the web admin's page size).
// The header labels the cap when it's hit so the count never reads as a total.
const POSTS_CAP = 200;

export function AdminPostsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Audit 2.0.5 F4-family: null from the service = load FAILED — show an
  // error state instead of a false "No posts" on the moderation surface.
  const [loadError, setLoadError] = useState(false);
  const load = useCallback(async () => {
    const list = await listAllPostsForAdmin(POSTS_CAP);
    if (list === null) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setPosts(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await listAllPostsForAdmin(POSTS_CAP);
      if (!cancelled) {
        if (list === null) setLoadError(true);
        else { setLoadError(false); setPosts(list); }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const handleDelete = (post: Post) => {
    Alert.alert(
      'Delete post?',
      `Permanently delete this post by ${post.displayName}? This removes the post, its comments, its likes, and any photo/video. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(post.id);
            const res = await deletePost(post.id);
            setDeletingId(null);
            if (res.ok) {
              setPosts((prev) => prev.filter((p) => p.id !== post.id));
            } else {
              Alert.alert('Delete failed', res.error || 'Please try again.');
            }
          },
        },
      ],
    );
  };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const renderItem = ({ item }: { item: Post }) => {
    const isPhoto = item.mediaType === 'photo' && !!item.mediaUrl;
    const isVideo = item.mediaType === 'video';
    const captionText = item.caption?.trim();
    return (
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.thumbWrap, { backgroundColor: colors.backgroundElevated }]}>
          {isPhoto ? (
            <Image source={{ uri: item.mediaUrl as string }} style={styles.thumb} />
          ) : (
            <Ionicons
              name={isVideo ? 'videocam' : 'chatbox-ellipses-outline'}
              size={22}
              color={colors.textMuted}
            />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.displayName}
          </Text>
          <Text style={[styles.rowMeta, { color: colors.textMuted }]} numberOfLines={2}>
            {captionText || (isVideo ? 'Video post' : isPhoto ? 'Photo post' : 'Text post')}
          </Text>
          <Text style={[styles.rowDate, { color: colors.textTertiary }]}>{fmtDate(item.createdAt)}</Text>
        </View>
        <SoundPressable
          onPress={() => handleDelete(item)}
          disabled={deletingId === item.id}
          style={[styles.iconBtn, { backgroundColor: colors.backgroundElevated }]}
          hitSlop={8}
        >
          {deletingId === item.id ? (
            <ActivityIndicator size="small" color={colors.error} />
          ) : (
            <Ionicons name="trash-outline" size={18} color={colors.error} />
          )}
        </SoundPressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Community Posts</Text>
          <View style={{ width: 36 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.gold} />
          </View>
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
            }
            ListHeaderComponent={
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
                {posts.length >= POSTS_CAP
                  ? `NEWEST ${POSTS_CAP} POSTS · older posts not shown`
                  : `${posts.length} POST${posts.length === 1 ? '' : 'S'} · newest first`}
              </Text>
            }
            ListEmptyComponent={
              <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons
                  name={loadError ? 'alert-circle-outline' : 'images-outline'}
                  size={36}
                  color={loadError ? colors.error : colors.textMuted}
                />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                  {loadError ? "Couldn't load posts" : 'No posts'}
                </Text>
                <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                  {loadError
                    ? 'The query failed — this is not an empty feed. Check your connection and pull to retry.'
                    : 'The community feed is empty. Posts members create will appear here for moderation.'}
                </Text>
              </View>
            }
          />
        )}
      </ScreenContainer>
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
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    minHeight: 64,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 60 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  thumbWrap: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumb: { width: '100%', height: '100%' },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  rowDate: { fontSize: 11, marginTop: 3 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
});
