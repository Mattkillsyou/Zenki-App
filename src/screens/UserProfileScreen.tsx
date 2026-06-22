import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Alert, TextInput, Linking } from 'react-native';
import { KeyboardAwareScrollView } from '../components';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useBlocks } from '../context/BlocksContext';
import { typography, spacing, borderRadius } from '../theme';
import { getUserProfile, updateProfile, followUser, unfollowUser, isFollowing, getFollowerCount, getFollowingCount, listFollowRequests, hasRequestedFollow, cancelFollowRequest, UserProfile } from '../services/firebaseFollow';
import { getUserPosts, Post } from '../services/firebasePosts';
import { getCurrentUid } from '../services/firebaseAuth';
import { requireAuth } from '../utils/requireAuth';
import { ReportModal } from '../components/ReportModal';

// Clamp grid width to MAX_CONTENT_WIDTH so post tiles don't blow up on
// iPad past the ScreenContainer cap (~700pt).
const SCREEN_WIDTH = Math.min(Dimensions.get('window').width, 700);
const GRID_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.xs * 2) / 3;

export function UserProfileScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { userId } = route.params;
  const isOwnProfile = userId === getCurrentUid();
  const { isBlocked, blockUser, unblockUser, isMuted, muteUser, unmuteUser } = useBlocks();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [requested, setRequested] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editTwitter, setEditTwitter] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [requestCount, setRequestCount] = useState(0);
  const userBlocked = !isOwnProfile && isBlocked(userId);
  const userMuted = !isOwnProfile && isMuted(userId);

  const handleMuteToggle = () => {
    if (userMuted) {
      unmuteUser(userId);
    } else {
      Alert.alert(
        `Mute ${profile?.displayName ?? 'this user'}?`,
        `Their posts and comments will be hidden from your feed. They won't be notified, and you can unmute anytime.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Mute', onPress: () => muteUser(userId) },
        ],
      );
    }
  };

  const handleBlockToggle = () => {
    if (userBlocked) {
      Alert.alert(
        `Unblock ${profile?.displayName ?? 'this user'}?`,
        `Their posts and messages will be visible to you again.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Unblock', onPress: () => unblockUser(userId) },
        ],
      );
    } else {
      Alert.alert(
        `Block ${profile?.displayName ?? 'this user'}?`,
        `You won't see their posts or messages anymore. You can unblock them later in Settings → Blocked Users.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: async () => {
              await blockUser(userId);
              if (following) {
                await unfollowUser(userId);
                setFollowing(false);
                setFollowers((p) => Math.max(0, p - 1));
              }
            },
          },
        ],
      );
    }
  };

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    // Load the profile + relationship first. These reads are always permitted
    // (/users, /following, /followers are signed-in-readable). Posts are loaded
    // SEPARATELY and only when allowed, because a private author's posts are
    // rule-denied to non-followers — issuing that query here used to reject the
    // whole Promise.all and leave the screen on a blank, anonymous PUBLIC view.
    const [p, isFollow, fCount, fgCount] = await Promise.all([
      getUserProfile(userId),
      isFollowing(userId),
      getFollowerCount(userId),
      getFollowingCount(userId),
    ]);
    setProfile(p);
    setFollowing(isFollow);
    setFollowers(fCount);
    setFollowingCount(fgCount);

    // Only fetch posts when the viewer may see them (own / public author /
    // approved follower). getUserPosts is also try/catch-safe as a backstop.
    const maySeePosts = isOwnProfile || (!!p && !p.isPrivate) || isFollow;
    setPosts(maySeePosts ? await getUserPosts(userId) : []);

    // Pending outbound follow request (private targets you've requested).
    if (!isOwnProfile && !isFollow) {
      setRequested(await hasRequestedFollow(userId).catch(() => false));
    }

    // Own profile only: surface a pending-follow-request count for the inbox
    // entry. Guarded so a transient failure never blocks the profile render.
    if (isOwnProfile) {
      try {
        const requests = await listFollowRequests();
        setRequestCount(requests.length);
      } catch (e) {
        console.warn('[UserProfile] follow-requests count failed:', e);
      }
    }
  };

  const handleFollow = async () => {
    // Safety guard — matches the inline !userBlocked guard on the Message
    // button. Belt-and-suspenders on top of the disabled={userBlocked} prop.
    if (userBlocked) return;
    // Following is account-based (5.1.1(v)); a guest is prompted to sign in
    // instead of silently no-opping (followUser returns '' for a null uid).
    if (!requireAuth(getCurrentUid(), navigation, 'follow members')) return;

    if (following) {
      await unfollowUser(userId);
      setFollowing(false);
      setFollowers((p) => p - 1);
    } else if (requested) {
      // Tap "Requested" to withdraw a pending request to a private account.
      await cancelFollowRequest(userId);
      setRequested(false);
    } else {
      const result = await followUser(userId);
      if (result === 'requested') {
        setRequested(true);
      } else if (result === 'followed') {
        setFollowing(true);
        setFollowers((p) => p + 1);
      }
    }
  };

  const handleTogglePrivate = async () => {
    if (!profile) return;
    const newPrivate = !profile.isPrivate;
    await updateProfile({ isPrivate: newPrivate });
    setProfile({ ...profile, isPrivate: newPrivate });
  };

  const initials = profile?.displayName?.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  // Fail CLOSED when the profile hasn't loaded (profile === null): treat as
  // not-visible rather than `!undefined === true`, which previously rendered a
  // private account as a blank public profile.
  const canSeePosts = isOwnProfile || (!!profile && !profile.isPrivate) || following;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAwareScrollView offset={64}>
        {/* Header */}
        <View style={styles.header}>
          <SoundPressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {profile?.displayName || 'Profile'}
          </Text>
          <View style={styles.backButton} />
        </View>

        {/* Profile Info */}
        <View style={styles.profileSection}>
          <View style={[styles.avatar, { backgroundColor: colors.goldMuted }]}>
            {profile?.avatar ? (
              <Image source={{ uri: profile.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={[styles.avatarText, { color: colors.gold }]}>{initials}</Text>
            )}
          </View>

          <Text style={[styles.displayName, { color: colors.textPrimary }]}>
            {profile?.displayName}
            {profile?.isPrivate && (
              <Text> <Ionicons name="lock-closed" size={16} color={colors.textMuted} /></Text>
            )}
          </Text>

          {profile?.bio ? (
            <Text style={[styles.bio, { color: colors.textSecondary }]}>{profile.bio}</Text>
          ) : null}

          {/* Social Links */}
          {(profile as any)?.socialLinks && (
            <View style={styles.socialLinksRow}>
              {(profile as any).socialLinks.instagram && (
                <SoundPressable onPress={() => Linking.openURL(`https://instagram.com/${(profile as any).socialLinks.instagram}`)}>
                  <Ionicons name="logo-instagram" size={22} color={colors.textSecondary} />
                </SoundPressable>
              )}
              {(profile as any).socialLinks.twitter && (
                <SoundPressable onPress={() => Linking.openURL(`https://x.com/${(profile as any).socialLinks.twitter}`)}>
                  <Ionicons name="logo-twitter" size={22} color={colors.textSecondary} />
                </SoundPressable>
              )}
              {(profile as any).socialLinks.website && (
                <SoundPressable onPress={() => Linking.openURL((profile as any).socialLinks.website)}>
                  <Ionicons name="globe-outline" size={22} color={colors.textSecondary} />
                </SoundPressable>
              )}
            </View>
          )}

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{posts.length}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Posts</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{followers}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Followers</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.textPrimary }]}>{followingCount}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Following</Text>
            </View>
          </View>

          {/* Follow / Edit Profile Buttons */}
          {isOwnProfile ? (
            <>
              <View style={styles.ownButtonsRow}>
                <SoundPressable
                  style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
                  onPress={() => {
                    setEditBio(profile?.bio || '');
                    setEditInstagram((profile as any)?.socialLinks?.instagram || '');
                    setEditTwitter((profile as any)?.socialLinks?.twitter || '');
                    setEditWebsite((profile as any)?.socialLinks?.website || '');
                    setShowEditProfile(!showEditProfile);
                  }}
                >
                  <Ionicons name="create-outline" size={16} color={colors.textPrimary} />
                  <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Edit Profile</Text>
                </SoundPressable>
                <SoundPressable
                  style={[styles.actionButton, { backgroundColor: profile?.isPrivate ? colors.goldMuted : colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                  onPress={handleTogglePrivate}
                >
                  <Ionicons name={profile?.isPrivate ? 'lock-closed' : 'lock-open-outline'} size={16} color={profile?.isPrivate ? colors.gold : colors.textMuted} />
                </SoundPressable>
              </View>
              {/* Follow-request inbox entry (own profile). Route registered by the lead. */}
              <SoundPressable
                style={[styles.requestsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate('FollowRequests')}
              >
                <Ionicons name="person-add-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.requestsLabel, { color: colors.textPrimary }]}>Follow requests</Text>
                {requestCount > 0 && (
                  <View style={[styles.requestsBadge, { backgroundColor: colors.red }]}>
                    <Text style={styles.requestsBadgeText}>{requestCount}</Text>
                  </View>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SoundPressable>
            </>
          ) : (
            <View style={styles.ownButtonsRow}>
              <SoundPressable
                style={[styles.actionButton, { backgroundColor: (following || requested) ? colors.surface : colors.red, borderColor: colors.border, borderWidth: (following || requested) ? 1 : 0, flex: 1 }]}
                onPress={handleFollow}
                disabled={userBlocked}
              >
                <Text style={[styles.actionButtonText, { color: (following || requested) ? colors.textPrimary : '#FFF', opacity: userBlocked ? 0.4 : 1 }]}>
                  {following ? 'Following' : requested ? 'Requested' : 'Follow'}
                </Text>
              </SoundPressable>
              <SoundPressable
                style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1, opacity: userBlocked ? 0.4 : 1 }]}
                onPress={() => {
                  if (userBlocked) return;
                  if (!requireAuth(getCurrentUid(), navigation, 'send messages')) return;
                  navigation.navigate('MessagesChat', {
                    otherUserId: userId,
                    otherUserName: profile?.displayName,
                    otherUserAvatar: profile?.avatar,
                  });
                }}
                disabled={userBlocked}
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Message</Text>
              </SoundPressable>
              <SoundPressable
                style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, paddingHorizontal: spacing.sm }]}
                onPress={() => {
                  Alert.alert(profile?.displayName || 'User', undefined, [
                    { text: userMuted ? 'Unmute user' : 'Mute user', onPress: handleMuteToggle },
                    { text: userBlocked ? 'Unblock user' : 'Block user', style: userBlocked ? 'default' : 'destructive', onPress: handleBlockToggle },
                    { text: 'Report user', onPress: () => setReportOpen(true) },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}
                accessibilityLabel="More options"
              >
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
              </SoundPressable>
            </View>
          )}

          {userBlocked && (
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.sm }}>
              <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: 'center' }}>
                You have blocked this user. Their posts and messages are hidden from you.
              </Text>
            </View>
          )}

          <ReportModal
            visible={reportOpen}
            onClose={() => setReportOpen(false)}
            targetType="user"
            targetId={userId}
            targetUserId={userId}
            targetPreview={profile?.displayName}
          />
        </View>

        {/* Edit Profile Section */}
        {showEditProfile && isOwnProfile && (
          <View style={[styles.editSection, { paddingHorizontal: spacing.lg }]}>
            <View style={[styles.editCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.editLabel, { color: colors.textMuted }]}>BIO</Text>
              <TextInput
                style={[styles.editInput, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="Write something about yourself..."
                placeholderTextColor={colors.textMuted}
                value={editBio}
                onChangeText={setEditBio}
                multiline
                maxLength={150}
              />
              <Text style={[styles.editLabel, { color: colors.textMuted, marginTop: spacing.md }]}>SOCIAL LINKS</Text>
              <View style={styles.socialInputRow}>
                <Ionicons name="logo-instagram" size={20} color="#E1306C" />
                <TextInput
                  style={[styles.socialInput, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary }]}
                  placeholder="Instagram username"
                  placeholderTextColor={colors.textMuted}
                  value={editInstagram}
                  onChangeText={setEditInstagram}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.socialInputRow}>
                <Ionicons name="logo-twitter" size={20} color="#1DA1F2" />
                <TextInput
                  style={[styles.socialInput, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary }]}
                  placeholder="X / Twitter username"
                  placeholderTextColor={colors.textMuted}
                  value={editTwitter}
                  onChangeText={setEditTwitter}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.socialInputRow}>
                <Ionicons name="globe-outline" size={20} color={colors.gold} />
                <TextInput
                  style={[styles.socialInput, { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary }]}
                  placeholder="Website URL"
                  placeholderTextColor={colors.textMuted}
                  value={editWebsite}
                  onChangeText={setEditWebsite}
                  autoCapitalize="none"
                />
              </View>
              <SoundPressable
                style={[styles.saveButton, { backgroundColor: colors.red }]}
                onPress={async () => {
                  await updateProfile({
                    bio: editBio,
                    ...({ socialLinks: { instagram: editInstagram, twitter: editTwitter, website: editWebsite } } as any),
                  });
                  setShowEditProfile(false);
                  loadProfile();
                }}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </SoundPressable>
            </View>
          </View>
        )}

        {/* Posts Grid */}
        {canSeePosts ? (
          <View style={styles.postsGrid}>
            {posts.map((post) => (
              <SoundPressable key={post.id} style={styles.gridItem}>
                {post.mediaUrl ? (
                  <Image source={{ uri: post.mediaUrl }} style={styles.gridImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridImage, { backgroundColor: colors.surface, padding: 8, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: 10, fontWeight: '500', textAlign: 'center' }} numberOfLines={5}>
                      {post.caption}
                    </Text>
                  </View>
                )}
              </SoundPressable>
            ))}
            {posts.length === 0 && (
              <View style={styles.noPostsContainer}>
                <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.noPosts, { color: colors.textMuted }]}>No posts yet</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.privateContainer}>
            <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.privateTitle, { color: colors.textPrimary }]}>This Account is Private</Text>
            <Text style={[styles.privateSubtitle, { color: colors.textMuted }]}>Follow to see their posts</Text>
          </View>
        )}
      </KeyboardAwareScrollView>
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
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...typography.cardTitle, fontSize: 18 },
  profileSection: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 28, fontWeight: '900' },
  displayName: { ...typography.cardTitle, fontSize: 20 },
  bio: { ...typography.body, textAlign: 'center', paddingHorizontal: spacing.xl },
  statsRow: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.sm },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '900' },
  statLabel: { ...typography.label, fontSize: 10, marginTop: 2 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  actionButtonText: { ...typography.button, fontSize: 13 },
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  gridImage: { width: '100%', height: '100%' },
  noPostsContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  noPosts: { ...typography.body },
  privateContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xxl * 2,
    gap: spacing.sm,
  },
  privateTitle: { ...typography.cardTitle, fontSize: 18 },
  privateSubtitle: { ...typography.body },
  socialLinksRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  ownButtonsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  requestsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'stretch',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  requestsLabel: { ...typography.button, fontSize: 13, flex: 1 },
  requestsBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  editSection: {
    marginBottom: spacing.md,
  },
  editCard: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  editLabel: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  editInput: {
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
    borderWidth: 1,
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  socialInput: {
    flex: 1,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
  },
  saveButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  saveButtonText: {
    ...typography.button,
    color: '#FFF',
    fontSize: 14,
  },
});
