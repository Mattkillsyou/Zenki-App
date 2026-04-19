import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useBlocks } from '../context/BlocksContext';
import { spacing } from '../theme';
import {
  Message,
  sendMessage,
  subscribeToThread,
  markConversationRead,
  getOrCreateConversation,
} from '../services/firebaseMessages';
import { ReportModal } from '../components/ReportModal';

export function MessagesChatScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isBlocked, blockUser, unblockUser } = useBlocks();
  const initial = route.params || {};
  const [conversationId, setConversationId] = useState<string | null>(initial.conversationId || null);
  const otherUserId: string | undefined = initial.otherUserId;
  const otherUserName: string = initial.otherUserName || 'Member';
  const otherUserAvatar: string | null | undefined = initial.otherUserAvatar;
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const blocked = !!otherUserId && isBlocked(otherUserId);

  const openChatMenu = () => {
    if (!otherUserId) return;
    Alert.alert(otherUserName, undefined, [
      {
        text: blocked ? 'Unblock user' : 'Block user',
        style: blocked ? 'default' : 'destructive',
        onPress: () => {
          if (blocked) {
            Alert.alert(`Unblock ${otherUserName}?`, '', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Unblock', onPress: () => unblockUser(otherUserId) },
            ]);
          } else {
            Alert.alert(
              `Block ${otherUserName}?`,
              `You won't see their messages anymore. You can unblock them later in Settings.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Block',
                  style: 'destructive',
                  onPress: async () => {
                    await blockUser(otherUserId);
                    navigation.goBack();
                  },
                },
              ],
            );
          }
        },
      },
      { text: 'Report conversation', onPress: () => setReportOpen(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // Ensure conversation exists
  useEffect(() => {
    (async () => {
      if (!conversationId && otherUserId) {
        const id = await getOrCreateConversation(otherUserId);
        if (id) setConversationId(id);
      }
    })();
  }, [conversationId, otherUserId]);

  // Subscribe to messages
  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeToThread(conversationId, (msgs) => {
      setMessages(msgs);
      markConversationRead(conversationId).catch(() => {});
      // Auto-scroll to bottom
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => unsub();
  }, [conversationId]);

  const handleSend = async () => {
    if (!draft.trim() || !conversationId || sending) return;
    setSending(true);
    const text = draft;
    setDraft('');
    try {
      await sendMessage(conversationId, text);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const isMe = item.senderId === user?.id;
    return (
      <View style={[styles.bubbleRow, { justifyContent: isMe ? 'flex-end' : 'flex-start' }]}>
        <View
          style={[
            styles.bubble,
            isMe
              ? { backgroundColor: colors.gold, borderTopRightRadius: 4 }
              : { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderTopLeftRadius: 4 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: isMe ? '#000' : colors.textPrimary }]}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const initials = otherUserName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerUser}
            onPress={() => otherUserId && navigation.navigate('UserProfile', { userId: otherUserId })}
            activeOpacity={0.7}
          >
            <View style={[styles.headerAvatar, { backgroundColor: colors.goldMuted }]}>
              {otherUserAvatar ? (
                <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatarImg} />
              ) : (
                <Text style={{ fontSize: 12, fontWeight: '800', color: colors.gold }}>{initials}</Text>
              )}
            </View>
            <Text style={[styles.headerName, { color: colors.textPrimary }]} numberOfLines={1}>
              {otherUserName}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openChatMenu}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityLabel="More options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <ReportModal
          visible={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="message"
          targetId={conversationId || 'unknown'}
          targetUserId={otherUserId || ''}
          targetPreview={`Conversation with ${otherUserName}`}
        />

        <FlatList
          ref={listRef}
          data={messages}
          renderItem={renderItem}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="paper-plane-outline" size={36} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Say hi to {otherUserName.split(' ')[0]}
              </Text>
            </View>
          }
        />

        {blocked ? (
          <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border, justifyContent: 'center' }]}>
            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
              You've blocked {otherUserName}. Unblock from the ••• menu above to resume messaging.
            </Text>
          </View>
        ) : (
        <View style={[styles.inputBar, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[
              styles.sendBtn,
              { backgroundColor: draft.trim() ? colors.gold : colors.surfaceSecondary, opacity: sending ? 0.6 : 1 },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={draft.trim() ? '#000' : colors.textMuted} />
          </TouchableOpacity>
        </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImg: { width: '100%', height: '100%' },
  headerName: { fontSize: 15, fontWeight: '700', maxWidth: 180 },

  list: { paddingHorizontal: spacing.md, paddingVertical: spacing.md, gap: 4, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubble: {
    maxWidth: '76%',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 80 },
  emptyText: { fontSize: 14, fontWeight: '500' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 0.5,
  },
  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
