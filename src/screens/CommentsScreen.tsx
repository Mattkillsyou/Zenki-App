import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SoundPressable } from '../components/SoundPressable';
import { KeyboardView } from '../components';
import { ReportModal } from '../components/ReportModal';
import { useTheme } from '../context/ThemeContext';
import { useBlocks } from '../context/BlocksContext';
import { spacing, typography, MAX_CONTENT_WIDTH } from '../theme';
import { Comment, addComment, listComments } from '../services/firebasePosts';
import { getCurrentUid } from '../services/firebaseAuth';

export function CommentsScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { blockUser, muteUser, filterHidden, blockedIds, mutedIds } = useBlocks();
  const postId: string = route?.params?.postId;
  const myUid = getCurrentUid();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportTarget, setReportTarget] = useState<Comment | null>(null);

  // Hide comments from blocked + muted authors (P0-12). Re-runs when the
  // blocked/muted sets change (e.g. the user blocks someone from the menu
  // below) so their comments disappear without a reload.
  const visibleComments = useMemo(
    () => filterHidden(comments, 'userId'),
    [comments, filterHidden, blockedIds, mutedIds],
  );

  const reload = useCallback(async () => {
    if (!postId) return;
    const list = await listComments(postId);
    setComments(list);
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listComments(postId);
      if (!cancelled) {
        setComments(list);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [postId]);

  const handleSubmit = async () => {
    const trimmed = text.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await addComment(postId, trimmed);
      if (created) {
        setComments((prev) => [...prev, created]);
        setText('');
      }
    } catch (err: any) {
      const code = err?.code || err?.message || '';
      Alert.alert(
        "Couldn't post comment",
        code === 'not-signed-in'
          ? 'Sign out and sign back in to comment.'
          : 'Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const confirmBlock = (comment: Comment) => {
    Alert.alert(
      `Block ${comment.displayName}?`,
      `You won't see their posts, comments, or messages anymore. You can unblock them later in Settings → Blocked Users.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => { blockUser(comment.userId).catch(() => {}); },
        },
      ],
    );
  };

  const openCommentMenu = (comment: Comment) => {
    // No report/block/mute on your own comment.
    if (comment.userId === myUid) return;

    const options = ['Report comment', 'Mute user', 'Block user', 'Cancel'];
    const cancelIndex = options.length - 1;
    const destructiveIndex = 2;

    const handleIndex = (idx?: number) => {
      if (idx === 0) setReportTarget(comment);
      else if (idx === 1) muteUser(comment.userId).catch(() => {});
      else if (idx === 2) confirmBlock(comment);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: cancelIndex, destructiveButtonIndex: destructiveIndex, title: comment.displayName },
        handleIndex,
      );
    } else {
      // Android / Web fallback — Alert as an action sheet
      Alert.alert(comment.displayName, undefined, [
        { text: 'Report comment', onPress: () => handleIndex(0) },
        { text: 'Mute user', onPress: () => handleIndex(1) },
        { text: 'Block user', style: 'destructive', onPress: () => handleIndex(2) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const renderItem = ({ item }: { item: Comment }) => {
    const isOwn = item.userId === myUid;
    return (
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.avatarText, { color: colors.textPrimary }]}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.body}>
          <Text style={[styles.line, { color: colors.textPrimary }]}>
            <Text style={{ fontWeight: '700' }}>{item.displayName}</Text>
            <Text>  {item.text}</Text>
          </Text>
          <Text style={[styles.timestamp, { color: colors.textSecondary }]}>
            {formatTimestamp(item.createdAt)}
          </Text>
        </View>
        {!isOwn && (
          <SoundPressable
            onPress={() => openCommentMenu(item)}
            onLongPress={() => openCommentMenu(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Comment options from ${item.displayName}`}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
          </SoundPressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardView style={styles.kav}>
        <View style={[styles.header, { borderColor: colors.borderSubtle }]}>
          <SoundPressable onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Comments</Text>
          <View style={{ width: 26 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.gold} />
          </View>
        ) : visibleComments.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Be the first to comment.
            </Text>
          </View>
        ) : (
          <FlatList
            data={visibleComments}
            keyExtractor={(c) => c.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            contentInsetAdjustmentBehavior="automatic"
          />
        )}

        <View style={[styles.composer, { borderColor: colors.borderSubtle, backgroundColor: colors.surface }]}>
          <TextInput
            style={[styles.input, { color: colors.textPrimary }]}
            placeholder="Add a comment…"
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            editable={!submitting}
          />
          <SoundPressable
            onPress={handleSubmit}
            disabled={!text.trim() || submitting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text
              style={[
                styles.send,
                { color: text.trim() && !submitting ? colors.gold : colors.textSecondary },
              ]}
            >
              {submitting ? 'Posting…' : 'Post'}
            </Text>
          </SoundPressable>
        </View>

        <ReportModal
          visible={reportTarget !== null}
          onClose={() => setReportTarget(null)}
          targetType="comment"
          targetId={reportTarget?.id ?? ''}
          targetUserId={reportTarget?.userId ?? ''}
          parentId={postId}
          targetPreview={reportTarget?.text}
        />
      </KeyboardView>
    </SafeAreaView>
  );
}

function formatTimestamp(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...typography.h2, fontSize: 17, fontWeight: '700' },
  kav: { flex: 1 },
  list: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '700' },
  body: { flex: 1 },
  line: { fontSize: 14, lineHeight: 19 },
  timestamp: { fontSize: 11, marginTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  empty: { fontSize: 14 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    maxHeight: 96,
    paddingVertical: 6,
  },
  send: { fontSize: 14, fontWeight: '700' },
});
