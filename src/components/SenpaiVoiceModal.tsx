/**
 * SenpaiVoiceModal — a dedicated, hands-free VOICE chat surface.
 *
 * Separate from the text chat (SenpaiChatModal): no thread list, no keyboard.
 * Just the mascot, a big on-screen subtitle of the current exchange, and one
 * mic button. Walkie-talkie cadence: tap to talk, she answers out loud (TTS)
 * and the mic re-arms automatically when she's done, so you can have a fully
 * spoken back-and-forth without touching the screen.
 *
 * Shares the ONE conversation via useSenpaiChat, so anything said here also
 * shows up in the text chat and the floating bubble. Voice is forced on while
 * this surface is open (it's the whole point).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

import { useTheme } from '../context/ThemeContext';
import { useSenpai } from '../context/SenpaiContext';
import { useSenpaiChat } from '../hooks/useSenpaiChat';
import { stopSenpaiAudio } from '../services/senpaiAudio';
import { ANIM_ASSETS } from './senpaiMoodAssets';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const SEED_GREETING = 'tap the mic and talk to me, senpai 💕 I’m listening out loud';

export function SenpaiVoiceModal({ visible, onClose }: Props) {
  const { colors } = useTheme();
  const { state } = useSenpai();
  const {
    messages,
    loading,
    error,
    voiceEnabled,
    setVoiceEnabled,
    ttsPlaying,
    send,
    clear,
  } = useSenpaiChat();

  const [recording, setRecording] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const transcriptRef = useRef('');
  // Most recent assistant id we've already auto-re-armed after — prevents the
  // post-reply re-arm from firing on every history rehydrate.
  const reArmedAfterRef = useRef<string | null>(null);
  // True while the surface is closed/unmounting — checked after the async
  // permission await so a close mid-await can't open the mic on a dead component.
  const cancelledRef = useRef(false);
  // Force voice on AT MOST once per open, so a mid-session TTS auto-disable can
  // still latch off (instead of being re-enabled on every voiceEnabled flip).
  const didForceVoiceRef = useRef(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ─── STT events ───────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('result', (event) => {
    const t = event.results?.[0]?.transcript ?? '';
    if (!t) return;
    transcriptRef.current = t;
    setLiveTranscript(t);
  });

  useSpeechRecognitionEvent('end', () => {
    setRecording(false);
    const finalTranscript = transcriptRef.current.trim();
    transcriptRef.current = '';
    setLiveTranscript('');
    // Speech IS the send action — auto-send what they said on end-of-turn.
    if (finalTranscript && !loading) send(finalTranscript);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setRecording(false);
    transcriptRef.current = '';
    setLiveTranscript('');
    if (event?.error === 'aborted' || event?.error === 'no-speech') return;
    Alert.alert('Mic trouble', `Speech recognition error: ${event?.message ?? event?.error ?? 'unknown'}`);
  });

  // Track closed/unmounting state for the post-await mic guard in startRecording.
  useEffect(() => {
    cancelledRef.current = !visible;
  }, [visible]);

  // Force voice ON when the surface opens — hearing her reply is the whole
  // point. Do it AT MOST once per open (didForceVoiceRef) so a TTS auto-disable
  // that fires mid-session can still latch off, instead of being re-enabled on
  // every voiceEnabled flip (which would hammer a broken TTS endpoint forever).
  useEffect(() => {
    if (!visible) {
      didForceVoiceRef.current = false;
      return;
    }
    if (didForceVoiceRef.current) return;
    didForceVoiceRef.current = true;
    if (!voiceEnabled) setVoiceEnabled(true);
  }, [visible, voiceEnabled, setVoiceEnabled]);

  // Stop the mic + audio when the surface closes/unmounts.
  useEffect(() => {
    if (!visible) {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
      stopSenpaiAudio();
      setRecording(false);
      transcriptRef.current = '';
      setLiveTranscript('');
      reArmedAfterRef.current = null;
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
      stopSenpaiAudio();
    };
  }, []);

  // Pulse the mic button while recording.
  useEffect(() => {
    if (!recording) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulseAnim]);

  const startRecording = async () => {
    if (loading) return;
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (cancelledRef.current) return; // surface closed during the permission await
      if (!perms.granted) {
        Alert.alert(
          'Mic access needed',
          'Senpai needs microphone + speech-recognition permission to hear you. Enable both in iOS Settings → Zenki Dojo.',
        );
        return;
      }
      transcriptRef.current = '';
      setLiveTranscript('');
      setRecording(true);
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      setRecording(false);
      Alert.alert('Mic trouble', e?.message ?? 'Could not start listening.');
    }
  };

  const stopRecording = () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording) stopRecording();
    else startRecording();
  };

  // Latest settled assistant reply — drives the subtitle + the auto re-arm.
  const lastFinalAssistant = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && !m.pending && !m.error) return m;
    }
    return null;
  }, [messages]);

  // Auto-arm the mic on first open and again after she finishes talking
  // (ttsPlaying flips false) — true hands-free walkie-talkie cadence.
  useEffect(() => {
    if (!visible || recording || loading) return;
    if (!lastFinalAssistant) {
      if (reArmedAfterRef.current !== '__open__') {
        reArmedAfterRef.current = '__open__';
        startRecording();
      }
      return;
    }
    if (reArmedAfterRef.current !== lastFinalAssistant.id) {
      if (voiceEnabled && ttsPlaying) return; // still talking — wait for her
      reArmedAfterRef.current = lastFinalAssistant.id;
      const t = setTimeout(() => {
        if (visible) startRecording();
      }, 300);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, lastFinalAssistant, recording, loading, voiceEnabled, ttsPlaying]);

  const handleClear = () => {
    Alert.alert('Clear chat?', "This wipes the conversation. Senpai won't remember.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => clear() },
    ]);
  };

  // What the big subtitle shows, in priority order.
  const subtitle = loading
    ? 'thinking…'
    : liveTranscript
    ? liveTranscript
    : recording
    ? 'listening…'
    : error
    ? error.message
    : lastFinalAssistant?.content
    ? lastFinalAssistant.content
    : SEED_GREETING;

  const subtitleIsUser = !!liveTranscript && !loading;
  const moodSource = ANIM_ASSETS[state.mascotMood] ?? ANIM_ASSETS.idle;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn} accessibilityLabel="Close voice chat">
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Senpai · voice</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
              {loading ? 'thinking…' : recording ? 'listening…' : 'hands-free'}
            </Text>
          </View>
          <Pressable
            onPress={() => setVoiceEnabled(!voiceEnabled)}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel={voiceEnabled ? 'Mute Senpai voice' : 'Unmute Senpai voice'}
          >
            <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={handleClear} hitSlop={10} style={styles.headerBtn} accessibilityLabel="Clear chat">
            <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Stage — mascot + the current spoken line as a big subtitle */}
        <View style={styles.stage}>
          <Image source={moodSource} style={styles.mascot} contentFit="contain" />
          <Text
            style={[
              styles.subtitle,
              { color: subtitleIsUser ? colors.textMuted : colors.textPrimary },
              subtitleIsUser && styles.subtitleUser,
            ]}
          >
            {subtitle}
          </Text>
        </View>

        {/* Mic */}
        <View style={styles.talkRow}>
          <Text style={[styles.statusText, { color: colors.textMuted }]}>
            {loading ? 'thinking…' : recording ? 'listening — tap to send' : 'tap to talk'}
          </Text>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Pressable
              onPress={toggleRecording}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop and send' : 'Start talking'}
              style={[
                styles.talkBtn,
                {
                  backgroundColor: recording ? '#FF2E51' : loading ? colors.surfaceSecondary : colors.gold,
                  borderColor: recording ? '#FF2E51' : colors.gold,
                },
              ]}
            >
              <Ionicons
                name={recording ? 'mic' : loading ? 'hourglass-outline' : 'mic-outline'}
                size={52}
                color={recording ? '#FFF' : loading ? colors.textMuted : '#000'}
              />
            </Pressable>
          </Animated.View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerSubtitle: { fontSize: 11, marginTop: 1 },

  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 24 },
  mascot: { width: 180, height: 180 },
  subtitle: { fontSize: 22, lineHeight: 30, textAlign: 'center', fontWeight: '600' },
  subtitleUser: { fontStyle: 'italic', fontWeight: '400' },

  talkRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 28, gap: 12 },
  statusText: { fontSize: 13, letterSpacing: 0.5 },
  talkBtn: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    // @ts-ignore — boxShadow web-only on RN
    boxShadow: '0 0 30px rgba(212,160,23,0.35)',
  },
});
