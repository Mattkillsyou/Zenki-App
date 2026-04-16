import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, Alert, TextInput, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { getUserProfile, updateProfile, followUser, unfollowUser, isFollowing, getFollowerCount, getFollowingCount, UserProfile } from '../services/firebaseFollow';
import { getUserPosts, Post } from '../services/firebasePosts';
import { getCurrentUid } from '../services/firebaseAuth';

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - spacing.xs * 2) / 3;

export function UserProfileScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { userId } = route.params;
  const isOwnProfile = userId === getCurrentUid();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editTwitter, setEditTwitter] = useState('');
  const [editWebsite, setEditWebsite] = useState('');

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    const [p, userPosts, isFollow, fCount, fgCount] = await Promise.all([
      getUserProfile(userId),
      getUserPosts(userId),
      isFollowing(userId),
      getFollowerCount(userId),
      getFollowingCount(userId),
    ]);
    setProfile(p);
    setPosts(userPosts);
    setFollowing(isFollow);
    setFollowers(fCount);
    setFollowingCount(fgCount);
  };

  const handleFollow = async () => {
    if (following) {
      await unfollowUser(userId);
      setFollowing(false);
      setFollowers((p) => p - 1);
    } else {
      const result = await followUser(userId);
      if (result === 'requested') {
        Alert.alert('Request Sent', 'Follow request sent. Waiting for approval.');
      } else {
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
  const canSeePosts = isOwnProfile || !profile?.isPrivate || following;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
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
                <TouchableOpacity onPress={() => Linking.openURL(`https://instagram.com/${(profile as any).socialLinks.instagram}`)}>
                  <Ionicons name="logo-instagram" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {(profile as any).socialLinks.twitter && (
                <TouchableOpacity onPress={() => Linking.openURL(`https://x.com/${(profile as any).socialLinks.twitter}`)}>
                  <Ionicons name="logo-twitter" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {(profile as any).socialLinks.website && (
                <TouchableOpacity onPress={() => Linking.openURL((profile as any).socialLinks.website)}>
                  <Ionicons name="globe-outline" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
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
            <View style={styles.ownButtonsRow}>
              <TouchableOpacity
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
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: profile?.isPrivate ? colors.goldMuted : colors.surface, borderColor: colors.border, borderWidth: 1 }]}
                onPress={handleTogglePrivate}
              >
                <Ionicons name={profile?.isPrivate ? 'lock-closed' : 'lock-open-outline'} size={16} color={profile?.isPrivate ? colors.gold : colors.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.ownButtonsRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: following ? colors.surface : colors.red, borderColor: colors.border, borderWidth: following ? 1 : 0, flex: 1 }]}
                onPress={handleFollow}
              >
                <Text style={[styles.actionButtonText, { color: following ? colors.textPrimary : '#FFF' }]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, flex: 1 }]}
                onPress={() => navigation.navigate('MessagesChat', {
                  otherUserId: userId,
                  otherUserName: profile?.displayName,
                  otherUserAvatar: profile?.avatar,
                })}
              >
                <Ionicons name="paper-plane-outline" size={16} color={colors.textPrimary} />
                <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Message</Text>
              </TouchableOpacity>
            </View>
          )}
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
              <TouchableOpacity
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
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Posts Grid */}
        {canSeePosts ? (
          <View style={styles.postsGrid}>
            {posts.map((post) => (
              <TouchableOpacity key={post.id} style={styles.gridItem}>
                {post.mediaUrl ? (
                  <Image source={{ uri: post.mediaUrl }} style={styles.gridImage} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridImage, { backgroundColor: colors.surface, padding: 8, justifyContent: 'center', alignItems: 'center' }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: 10, fontWeight: '500', textAlign: 'center' }} numberOfLines={5}>
                      {post.caption}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
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
      </ScrollView>
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
    paddingVertical: spacing.md,
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
