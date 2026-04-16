import React, { useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { Post } from '../services/firebasePosts';
import { typography, spacing } from '../theme';

interface PostCardProps {
  post: Post;
  onLike: (postId: string, liked: boolean) => void;
  onUserPress: (userId: string) => void;
}

/**
 * Instagram-style post card.
 * - Full-width media (edge to edge)
 * - Header: avatar + name + time, three-dot menu on right
 * - Action row: heart, comment, share (left), bookmark (right)
 * - Bold like count
 * - Inline caption with username prefix
 * - "View all comments" link
 */
export function PostCard({ post, onLike, onUserPress }: PostCardProps) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const heartAnim = useRef(new Animated.Value(1)).current;
  const dblTapRef = useRef<number>(0);

  const pulseHeart = () => {
    if (reduceMotion) return;
    heartAnim.setValue(0.9);
    Animated.sequence([
      Animated.timing(heartAnim, { toValue: 1.35, duration: 140, useNativeDriver: true }),
      Animated.spring(heartAnim, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
  };

  const handleLike = () => {
    pulseHeart();
    onLike(post.id, !post.liked);
  };

  // Double-tap image to like (Instagram behavior)
  const handleMediaTap = () => {
    const now = Date.now();
    if (now - dblTapRef.current < 300) {
      if (!post.liked) {
        pulseHeart();
        onLike(post.id, true);
      }
    }
    dblTapRef.current = now;
  };

  const timeAgo = getTimeAgo(post.createdAt);
  const initials = post.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerLeft} onPress={() => onUserPress(post.userId)} activeOpacity={0.7}>
          <View style={[styles.avatarRing, { borderColor: colors.gold }]}>
            <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
              {post.avatar ? (
                <Image source={{ uri: post.avatar }} style={styles.avatarImage} />
              ) : (
                <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
              )}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.displayName, { color: colors.textPrimary }]} numberOfLines={1}>
              {post.displayName}
            </Text>
            <Text style={[styles.timeAgo, { color: colors.textMuted }]}>{timeAgo}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Media (photo/video) OR text caption prominence */}
      {post.mediaUrl ? (
        <TouchableOpacity activeOpacity={0.98} onPress={handleMediaTap}>
          <Image source={{ uri: post.mediaUrl }} style={styles.media} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <View style={styles.textPostWrap}>
          <Text style={[styles.textPostBody, { color: colors.textPrimary }]}>
            {post.caption}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <View style={styles.actionsLeft}>
          <TouchableOpacity onPress={handleLike} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Animated.View style={{ transform: [{ scale: heartAnim }] }}>
              <Ionicons
                name={post.liked ? 'heart' : 'heart-outline'}
                size={26}
                color={post.liked ? colors.red : colors.textPrimary}
              />
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="bookmark-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Like count */}
      {post.likes > 0 && (
        <Text style={[styles.likeCount, { color: colors.textPrimary }]}>
          {post.likes.toLocaleString()} {post.likes === 1 ? 'like' : 'likes'}
        </Text>
      )}

      {/* Inline caption — only show below actions for media posts. Text-only already shows it above. */}
      {post.caption && post.mediaUrl ? (
        <Text style={[styles.captionLine, { color: colors.textPrimary }]} numberOfLines={3}>
          <Text style={{ fontWeight: '700' }}>{post.displayName}</Text>
          <Text style={{ color: colors.textSecondary }}>  {post.caption}</Text>
        </Text>
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
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    padding: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 12, fontWeight: '800' },
  displayName: { fontSize: 14, fontWeight: '700' },
  timeAgo: { fontSize: 11, fontWeight: '500', marginTop: 1 },

  media: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#000',
  },
  textPostWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
  },
  textPostBody: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  likeCount: {
    ...typography.body,
    fontWeight: '800',
    fontSize: 14,
    paddingHorizontal: 12,
    marginBottom: 3,
  },
  captionLine: {
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
});
