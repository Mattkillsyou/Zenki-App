import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SoundPressable } from '../components/SoundPressable';
import { KeyboardView } from '../components';
import { useTheme } from '../context/ThemeContext';
import { spacing, typography } from '../theme';
import { Comment, addComment, listComments } from '../services/firebasePosts';

export function CommentsScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const postId: string = route?.params?.postId;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const renderItem = ({ item }: { item: Comment }) => (
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
    </View>
  );

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
        ) : comments.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.textSecondary} />
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              Be the first to comment.
            </Text>
          </View>
        ) : (
          <FlatList
            data={comments}
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
  list: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
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
