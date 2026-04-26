import React, { useState, useEffect, useCallback } from 'react';
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
import { spacing, typography } from '../theme';
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
  const { filterBlocked, blockedIds } = useBlocks();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const feed = await getFeed();
      setPosts(feed);
    } catch (error) {
      console.log('[Community] Feed error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-filter whenever the blocked list changes so unblocks show instantly.
  const visiblePosts = filterBlocked(posts, 'userId');
  // (blockedIds referenced so the hook re-runs derived render on block changes)
  void blockedIds;

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
          <SoundPressable
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => navigation.navigate('MessagesList')}
          >
            <Ionicons name="paper-plane-outline" size={24} color={colors.textPrimary} />
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
            <PostCard post={item} onLike={handleLike} onUserPress={handleUserPress} />
          )}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />
          }
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
    bottom: 100,
    right: spacing.lg,
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
