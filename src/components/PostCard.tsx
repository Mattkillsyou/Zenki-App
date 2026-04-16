import React, { useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { Post } from '../services/firebasePosts';
import { typography, spacing, borderRadius } from '../theme';

interface PostCardProps {
  post: Post;
  onLike: (postId: string, liked: boolean) => void;
  onUserPress: (userId: string) => void;
}

export function PostCard({ post, onLike, onUserPress }: PostCardProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const heartAnim = useRef(new Animated.Value(1)).current;

  const handleLike = () => {
    if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(heartAnim, { toValue: 1.3, duration: 100, useNativeDriver: true }),
        Animated.spring(heartAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
      ]).start();
    }
    onLike(post.id, !post.liked);
  };

  const timeAgo = getTimeAgo(post.createdAt);
  const initials = post.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border, marginHorizontal: 24 }]}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={() => onUserPress(post.userId)}>
        <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
          {post.avatar ? (
            <Image source={{ uri: post.avatar }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={[styles.displayName, { color: colors.textPrimary }]}>{post.displayName}</Text>
          <Text style={[styles.timeAgo, { color: colors.textMuted }]}>{timeAgo}</Text>
        </View>
      </TouchableOpacity>

      {/* Media */}
      <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity onPress={handleLike} style={styles.likeButton}>
          <Animated.View style={{ transform: [{ scale: heartAnim }] }}>
            <Ionicons
              name={post.liked ? 'heart' : 'heart-outline'}
              size={28}
              color={post.liked ? colors.red : colors.textPrimary}
            />
          </Animated.View>
          {post.likes > 0 && (
            <Text style={[styles.likeCount, { color: colors.textSecondary }]}>{post.likes}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.caption ? (
        <View style={styles.captionRow}>
          <Text style={[styles.captionName, { color: colors.textPrimary }]}>{post.displayName}</Text>
          <Text style={[styles.captionText, { color: colors.textSecondary }]}> {post.caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w`;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: spacing.smd,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  headerInfo: {
    flex: 1,
  },
  displayName: {
    fontWeight: '700',
    fontSize: 16,
  },
  timeAgo: {
    fontSize: 12,
    fontWeight: '400',
  },
  media: {
    width: '100%',
    aspectRatio: 1,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 20,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  likeCount: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 15,
  },
  captionRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexWrap: 'wrap',
  },
  captionName: {
    ...typography.body,
    fontWeight: '800',
    fontSize: 15,
  },
  captionText: {
    ...typography.body,
    fontSize: 14,
  },
});
