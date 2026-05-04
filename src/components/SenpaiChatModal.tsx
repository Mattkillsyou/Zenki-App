/**
 * SenpaiChatModal — full-screen chat with the Senpai mascot.
 *
 * Phase 2 of the Senpai AI chat feature. See SENPAI_AI_CHAT_PROMPT.md for
 * the design + persona reference. Hidden behind the SECRET LAB chat flag
 * in Settings; opened by tapping the floating mascot when that flag is on.
 *
 * Behavior:
 *   - First open shows a one-time disclaimer (AsyncStorage gate).
 *   - Thread is an inverted FlatList — newest at the bottom, KeyboardAvoidingView
 *     keeps the input above the keyboard.
 *   - User bubbles right-aligned, Senpai bubbles left-aligned with a small
 *     mood label so the bit lands.
 *   - "Clear chat" wipes both local state and AsyncStorage history.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { useTheme } from '../context/ThemeContext';
import { useSenpaiChat, type ChatThreadMessage } from '../hooks/useSenpaiChat';
import { stopSenpaiAudio } from '../services/senpaiAudio';

const DISCLAIMER_KEY = '@senpai_chat_disclaimer_v1';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Reveal `fullText` one character at a time at ~30 chars/sec when `animate`
 * is true; otherwise return the full string immediately. Phase 4 typing
 * effect — purely cosmetic since the API returns the full reply at once.
 *
 * Per-bubble: bubbles for messages rehydrated from AsyncStorage pass
 * animate=false and never tick; only the message just returned from the
 * cloud function (lastArrivedId from the hook) animates.
 */
function useTypingReveal(fullText: string, animate: boolean, charsPerSecond = 30): string {
  const [revealed, setRevealed] = useState(animate ? fullText.slice(0, 1) : fullText);

  useEffect(() => {
    if (!animate || !fullText) {
      setRevealed(fullText);
      return;
    }
    let i = 1;
    setRevealed(fullText.slice(0, i));
    const intervalMs = Math.max(8, Math.round(1000 / charsPerSecond));
    const timer = setInterval(() => {
      i++;
      if (i >= fullText.length) {
        setRevealed(fullText);
        clearInterval(timer);
      } else {
        setRevealed(fullText.slice(0, i));
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [fullText, animate, charsPerSecond]);

  return revealed;
}

export function SenpaiChatModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const {
    messages,
    loading,
    error,
    lastArrivedId,
    voiceEnabled,
    setVoiceEnabled,
    send,
    clear,
  } = useSenpaiChat();
  const [draft, setDraft] = useState('');
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [recording, setRecording] = useState(false);
  // Track the draft text at recording-start time so live STT results can be
  // appended (rather than overwriting) anything the user typed manually.
  const draftAtRecordStartRef = useRef('');

  // Live STT events from expo-speech-recognition. These hooks are no-ops
  // until ExpoSpeechRecognitionModule.start() is called.
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    const prefix = draftAtRecordStartRef.current;
    setDraft(prefix ? `${prefix} ${transcript}` : transcript);
  });

  useSpeechRecognitionEvent('end', () => {
    setRecording(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setRecording(false);
    // Don't surface aborted-by-user errors as alerts
    if (event?.error === 'aborted' || event?.error === 'no-speech') return;
    Alert.alert(
      'Mic trouble',
      `Speech recognition error: ${event?.message ?? event?.error ?? 'unknown'}`,
    );
  });

  // Stop recording + audio when modal closes
  useEffect(() => {
    if (!visible) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {
        /* ignore */
      }
      stopSenpaiAudio();
      setRecording(false);
    }
  }, [visible]);

  const startRecording = async () => {
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        Alert.alert(
          'Mic access needed',
          'Senpai needs microphone + speech-recognition permission to hear you. Enable both in Settings → Zenki Dojo.',
        );
        return;
      }
      draftAtRecordStartRef.current = draft.trim();
      setRecording(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      setRecording(false);
      Alert.alert('Mic trouble', e?.message ?? 'Could not start recording.');
    }
  };

  const stopRecording = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      /* ignore */
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  // Disclaimer gate — show on first open until accepted
  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem(DISCLAIMER_KEY).then((v) => {
      if (v !== 'accepted') setShowDisclaimer(true);
    });
  }, [visible]);

  const handleAcceptDisclaimer = () => {
    AsyncStorage.setItem(DISCLAIMER_KEY, 'accepted').catch(() => {});
    setShowDisclaimer(false);
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || loading) return;
    setDraft('');
    send(text);
  };

  const handleClear = () => {
    Alert.alert('Clear chat?', "This wipes the conversation. Senpai won't remember.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clear() },
    ]);
  };

  // Inverted FlatList — newest first in the data, renders at the bottom
  const inverted = useMemo(() => [...messages].reverse(), [messages]);

  const renderMessage = ({ item }: { item: ChatThreadMessage }) => (
    <ChatBubble message={item} colors={colors} animate={item.id === lastArrivedId} />
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Senpai</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {loading ? 'thinking...' : recording ? 'listening...' : 'always tired'}
            </Text>
          </View>
          <Pressable
            onPress={() => setVoiceEnabled(!voiceEnabled)}
            hitSlop={12}
            style={styles.headerBtn}
            accessibilityLabel={voiceEnabled ? 'Mute voice replies' : 'Enable voice replies'}
          >
            <Ionicons
              name={voiceEnabled ? 'volume-high' : 'volume-mute-outline'}
              size={22}
              color={voiceEnabled ? colors.gold : colors.textMuted}
            />
          </Pressable>
          <Pressable onPress={handleClear} hitSlop={12} style={styles.headerBtn}>
            <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
          {/* Thread */}
          {messages.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>...hi.</Text>
              <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
                You opened the chat. Now what.
              </Text>
            </View>
          ) : (
            <FlatList
              data={inverted}
              keyExtractor={(m) => m.id}
              renderItem={renderMessage}
              inverted
              contentContainerStyle={styles.threadContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            />
          )}

          {/* Error toast */}
          {error && (
            <View style={[styles.errorBar, { backgroundColor: colors.error + '20', borderColor: colors.error }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error.message}</Text>
            </View>
          )}

          {/* Input row */}
          <View style={[styles.inputRow, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
            <Pressable
              onPress={toggleRecording}
              disabled={loading}
              accessibilityLabel={recording ? 'Stop recording' : 'Start voice input'}
              style={[
                styles.micBtn,
                {
                  backgroundColor: recording
                    ? '#FF2E51'
                    : loading
                    ? colors.surfaceSecondary
                    : colors.surface,
                  borderColor: recording ? '#FF2E51' : colors.border,
                },
              ]}
            >
              <Ionicons
                name={recording ? 'stop' : 'mic-outline'}
                size={20}
                color={recording ? '#FFF' : loading ? colors.textMuted : colors.textPrimary}
              />
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={recording ? 'listening...' : 'say something...'}
              placeholderTextColor={colors.textMuted}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.surface,
                  borderColor: recording ? '#FF2E51' : colors.border,
                },
              ]}
              multiline
              maxLength={1000}
              editable={!loading}
              returnKeyType="send"
              onSubmitEditing={handleSend}
              blurOnSubmit
            />
            <Pressable
              onPress={handleSend}
              disabled={loading || draft.trim().length === 0}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    loading || draft.trim().length === 0 ? colors.surfaceSecondary : colors.gold,
                },
              ]}
            >
              <Ionicons
                name="arrow-up"
                size={20}
                color={loading || draft.trim().length === 0 ? colors.textMuted : '#000'}
              />
            </Pressable>
          </View>
        </KeyboardAvoidingView>

        {/* Disclaimer overlay (first open only) */}
        {showDisclaimer && (
          <View style={styles.disclaimerOverlay}>
            <View style={[styles.disclaimerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.disclaimerTitle, { color: colors.textPrimary }]}>
                Heads up.
              </Text>
              <Text style={[styles.disclaimerBody, { color: colors.textSecondary }]}>
                Senpai is a chibi mascot powered by an AI. She's not a doctor, therapist, or
                dietitian. For medical, dietary, or mental-health advice, please talk to a real
                professional.
              </Text>
              <Pressable
                onPress={handleAcceptDisclaimer}
                style={[styles.disclaimerBtn, { backgroundColor: colors.gold }]}
              >
                <Text style={[styles.disclaimerBtnText, { color: '#000' }]}>got it</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

/* ─── ChatBubble ─────────────────────────────────────────────────────── */

function ChatBubble({
  message,
  colors,
  animate,
}: {
  message: ChatThreadMessage;
  colors: any;
  animate: boolean;
}) {
  const isUser = message.role === 'user';

  // Only animate fresh assistant replies. User bubbles, errors, pending
  // placeholders, and rehydrated history all bypass the typing effect.
  const shouldAnimate =
    animate && !isUser && !message.pending && !message.error && message.content.length > 0;
  const displayText = useTypingReveal(message.content, shouldAnimate);

  return (
    <View style={[styles.bubbleRow, { justifyContent: isUser ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          isUser
            ? { backgroundColor: colors.gold, borderColor: colors.gold }
            : { backgroundColor: colors.surface, borderColor: colors.border },
          message.error && { borderColor: colors.error },
        ]}
      >
        {!isUser && message.mood && !message.pending && (
          <Text style={[styles.moodTag, { color: colors.textMuted }]}>{message.mood}</Text>
        )}
        <Text
          style={[
            styles.bubbleText,
            { color: isUser ? '#000' : colors.textPrimary },
            message.pending && { color: colors.textMuted, fontStyle: 'italic' },
          ]}
        >
          {message.pending ? '...' : isUser ? message.content : displayText}
        </Text>
      </View>
    </View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 11, marginTop: 1 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontSize: 28, fontWeight: '700', marginBottom: 6 },
  emptyBody: { fontSize: 14, textAlign: 'center' },

  threadContent: { paddingHorizontal: 12, paddingVertical: 16 },

  bubbleRow: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  moodTag: {
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
    fontWeight: '600',
  },
  bubbleText: { fontSize: 15, lineHeight: 20 },

  errorBar: {
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { fontSize: 13 },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  disclaimerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  disclaimerCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  disclaimerTitle: { fontSize: 22, fontWeight: '800', marginBottom: 10 },
  disclaimerBody: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  disclaimerBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  disclaimerBtnText: { fontSize: 15, fontWeight: '700' },
});
