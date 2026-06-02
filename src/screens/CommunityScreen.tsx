import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Image} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBlocks } from '../context/BlocksContext';
import { spacing, MAX_CONTENT_WIDTH } from '../theme';
import { PostCard } from '../components/PostCard';
import { AnimatedLogo } from '../components/AnimatedLogo';
import { Post, getFeed, likePost, unlikePost } from '../services/firebasePosts';

interface StoryItem {
  userId: string;
  displayName: string;
  avatar?: string;
}

export function CommunityScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { filterHidden, blockedIds, mutedIds } = useBlocks();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // The pagination cursor (last post's createdAt) and an in-flight guard live
  // in refs so the FlatList onEndReached handler always sees the latest values
  // without re-creating the callback (and re-binding the list) on every change.
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  // Load the FIRST page (mount + pull-to-refresh). Resets the cursor.
  const loadFeed = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { posts: page, cursor, hasMore: more } = await getFeed();
      setPosts(page);
      cursorRef.current = cursor;
      setHasMore(more);
    } catch (error) {
      console.log('[Community] Feed error:', error);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Load the NEXT page (infinite scroll). Guarded against concurrent loads and
  // the no-more-pages case so we never hammer Firestore or duplicate posts.
  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const { posts: page, cursor, hasMore: more } = await getFeed({ cursor: cursorRef.current });
      setPosts((prev) => {
        // De-dupe by id in case a post shifted across the page boundary.
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.filter((p) => !seen.has(p.id))];
      });
      cursorRef.current = cursor;
      setHasMore(more);
    } catch (error) {
      console.log('[Community] Load-more error:', error);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  // Re-filter whenever the blocked/muted lists change so unblocks/unmutes show
  // instantly. filterHidden hides BOTH blocked and muted authors.
  const visiblePosts = filterHidden(posts, 'userId');
  // (referenced so the derived render re-runs on block/mute changes)
  void blockedIds;
  void mutedIds;

  // Load on mount only. We intentionally do NOT refetch the whole feed on every
  // tab focus — that double-loaded the feed (mount + focus) and re-paid ~100
  // reads on every revisit (P0-8). Newly created posts surface on next manual
  // pull-to-refresh.
  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed();
  };

  const handleLike = async (postId: string, liked: boolean) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, liked, likes: p.likes + (liked ? 1 : -1) } : p,
      ),
    );
    try {
      if (liked) await likePost(postId);
      else await unlikePost(postId);
    } catch {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked: !liked, likes: p.likes + (liked ? -1 : 1) } : p,
        ),
      );
    }
  };

  const handleUserPress = (userId: string) => {
    navigation.navigate('UserProfile', { userId });
  };

  // Stories rail — unique recent posters (blocked users excluded).
  const stories: StoryItem[] = Array.from(
    new Map(visiblePosts.map((p) => [p.userId, { userId: p.userId, displayName: p.displayName, avatar: p.avatar } as StoryItem])).values(),
  );

  const renderHeader = () =>
    stories.length === 0 ? null : (
      <View>
        <View style={[styles.storiesWrap, { borderBottomColor: colors.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storiesRow}
          >
            {stories.map((s) => (
              <SoundPressable
                key={s.userId}
                style={styles.storyItem}
                onPress={() => handleUserPress(s.userId)}
                activeOpacity={0.8}
              >
                <View style={[styles.storyRing, { borderColor: colors.gold }]}>
                  <View style={[styles.storyAvatar, { backgroundColor: colors.goldMuted }]}>
                    {s.avatar ? (
                      <Image source={{ uri: s.avatar }} style={styles.storyAvatarImage} />
                    ) : (
                      <Text style={[styles.storyInitials, { color: colors.gold }]}>
                        {s.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </Text>
                    )}
                  </View>
                </View>
                <Text
                  style={[styles.storyLabel, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {s.displayName.split(' ')[0]}
                </Text>
              </SoundPressable>
            ))}
          </ScrollView>
        </View>
      </View>
    );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top bar — Zenki logo mark, no redundant label */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <View style={styles.topBarLeft}>
          <AnimatedLogo size={40} />
        </View>
        <View style={styles.topBarRight}>
          <SoundPressable
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => navigation.navigate('UserSearch')}
          >
            <Ionicons name="search-outline" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      ) : visiblePosts.length === 0 ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />}
          contentContainerStyle={{ flex: 1 }}
        >
          {renderHeader()}
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={56} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>The Dojo Feed</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Be the first to share. Tap + to post a photo or video.
            </Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={visiblePosts}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={handleLike}
              onUserPress={handleUserPress}
              onCommentPress={(postId) => navigation.navigate('Comments', { postId })}
            />
          )}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.gold} />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />
          }
          // Aggressive memory caps — prior to these tunings, scrolling a feed
          // with several video posts froze the iPad: every PostCard mounted
          // an expo-video player (paused, but each one still consumes a
          // hardware decoder slot on iOS). Default windowSize of 21 meant
          // ~21 simultaneous decoders for a video-heavy feed. Capping the
          // window plus enabling clipped-subview removal keeps the working
          // set small enough that the H.264 budget never exhausts.
          windowSize={3}
          maxToRenderPerBatch={3}
          initialNumToRender={3}
          removeClippedSubviews
        />
      )}

      {/* Floating Create Button */}
      <SoundPressable
        style={[styles.fab, { backgroundColor: colors.gold }]}
        onPress={() => navigation.navigate('CreatePost')}
      >
        <Ionicons name="add" size={28} color="#000" />
      </SoundPressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  topBarLeft: {
    flex: 1,
  },
  // titleUnderline and screenTitle removed — unused dead code
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },

  storiesWrap: {
    borderBottomWidth: 0.5,
    paddingVertical: 10,
  },
  storiesRow: {
    paddingHorizontal: 12,
    gap: 12,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  storyAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storyAvatarImage: { width: '100%', height: '100%' },
  storyInitials: { fontSize: 16, fontWeight: '800' },
  storyLabel: {
    fontSize: 11,
    fontWeight: '500',
    maxWidth: 64,
    textAlign: 'center',
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerLoader: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
