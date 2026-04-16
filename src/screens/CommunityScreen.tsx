import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { PostCard } from '../components/PostCard';
import { Post, getFeed, likePost, unlikePost } from '../services/firebasePosts';
import { getCurrentUid } from '../services/firebaseAuth';

export function CommunityScreen({ navigation }: any) {
  const { colors } = useTheme();
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
    } catch (error) {
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Community</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.gold} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Community</Text>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={() => navigation.navigate('UserProfile', { userId: getCurrentUid() })}
        >
          <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {posts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Welcome to the Community</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Follow other members to see their posts.{'\n'}Tap + to share your first post.
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          renderItem={({ item }) => (
            <PostCard post={item} onLike={handleLike} onUserPress={handleUserPress} />
          )}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.gold} />
          }
        />
      )}

      {/* Floating Create Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.gold }]}
        onPress={() => navigation.navigate('CreatePost')}
      >
        <Ionicons name="add" size={28} color={colors.textInverse} />
      </TouchableOpacity>
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
    paddingVertical: spacing.md + 4,
  },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    gap: spacing.lg,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    bottom: 100,
    right: spacing.lg,
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
