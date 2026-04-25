import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Image, Animated, Alert, ActionSheetIOS, Platform } from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { useBlocks } from '../context/BlocksContext';
import { useAuth } from '../context/AuthContext';
import { Post } from '../services/firebasePosts';
import { ReportModal } from './ReportModal';
import { typography } from '../theme';

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
  const { user } = useAuth();
  const { blockUser } = useBlocks();
  const heartAnim = useRef(new Animated.Value(1)).current;
  const dblTapRef = useRef<number>(0);
  const [reportOpen, setReportOpen] = useState(false);

  const isOwn = user?.id === post.userId;

  const openMenu = () => {
    // Skip menu on own posts for now (no edit/delete wired at card level yet)
    if (isOwn) return;

    const options = ['Report post', 'Block user', 'Cancel'];
    const cancelIndex = options.length - 1;
    const destructiveIndex = 1;

    const handleIndex = (idx?: number) => {
      if (idx === 0) setReportOpen(true);
      else if (idx === 1) confirmBlock();
    };

    if (Platform.OS === 'ios') {
      // showActionSheetFromView isn't in the type defs but exists at runtime
      (ActionSheetIOS as any).showActionSheetFromView?.(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex, title: post.displayName },
        handleIndex,
      ) ?? ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex, title: post.displayName },
        handleIndex,
      );
    } else {
      // Android / Web fallback — use Alert as an action sheet
      Alert.alert(post.displayName, undefined, [
        { text: 'Report post', onPress: () => handleIndex(0) },
        { text: 'Block user', style: 'destructive', onPress: () => handleIndex(1) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const confirmBlock = () => {
    Alert.alert(
      `Block ${post.displayName}?`,
      `You won't see their posts or messages anymore. You can unblock them later in Settings → Blocked Users.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            await blockUser(post.userId);
          },
        },
      ],
    );
  };

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

  // Track load errors so we gracefully fall back to initials / caption-only
  // instead of showing a broken-image icon if the remote URL is 404 / expired.
  const [avatarErrored, setAvatarErrored] = React.useState(false);
  const [mediaErrored, setMediaErrored] = React.useState(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable style={styles.headerLeft} onPress={() => onUserPress(post.userId)} activeOpacity={0.7}>
          <View style={[styles.avatarRing, { borderColor: colors.gold }]}>
            <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
              {post.avatar && !avatarErrored ? (
                <Image
                  source={{ uri: post.avatar }}
                  style={styles.avatarImage}
                  onError={() => setAvatarErrored(true)}
                />
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
        </SoundPressable>
        <SoundPressable
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          onPress={openMenu}
          accessibilityLabel={`Post options from ${post.displayName}`}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
        </SoundPressable>
      </View>

      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="post"
        targetId={post.id}
        targetUserId={post.userId}
        targetPreview={post.caption?.slice(0, 80)}
      />

      {/* Media (photo/video) OR text caption prominence */}
      {post.mediaUrl && !mediaErrored ? (
        <SoundPressable activeOpacity={0.98} onPress={handleMediaTap}>
          <Image
            source={{ uri: post.mediaUrl }}
            style={styles.media}
            resizeMode="cover"
            onError={() => setMediaErrored(true)}
          />
        </SoundPressable>
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
          <SoundPressable onPress={handleLike} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Animated.View style={{ transform: [{ scale: heartAnim }] }}>
              <Ionicons
                name={post.liked ? 'heart' : 'heart-outline'}
                size={26}
                color={post.liked ? colors.red : colors.textPrimary}
              />
            </Animated.View>
          </SoundPressable>
          <SoundPressable hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.textPrimary} />
          </SoundPressable>
          <SoundPressable hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Ionicons name="paper-plane-outline" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>
        <SoundPressable hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Ionicons name="bookmark-outline" size={24} color={colors.textPrimary} />
        </SoundPressable>
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
