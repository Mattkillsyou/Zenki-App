import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, Animated, PanResponder, Dimensions, Pressable} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useSenpai } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { useTheme } from '../context/ThemeContext';
import { useSenpaiChat } from '../hooks/useSenpaiChat';
import { stopSenpaiAudio } from '../services/senpaiAudio';

const { width: SW, height: SH } = Dimensions.get('window');
const POS_KEY = '@zenki_senpai_pos';
const MASCOT_SIZE = 140;

// Default position is bottom: 110, right: 16. basePos.x>0 = drag right,
// basePos.y>0 = drag down. Clamp so at least VISIBLE_MARGIN of the mascot
// stays on screen — otherwise a fast drag flings her past the edge and
// the persisted offscreen position keeps her invisible across launches.
const VISIBLE_MARGIN = 40;
const clampPos = (x: number, y: number) => ({
  x: Math.max(VISIBLE_MARGIN + 16 - SW, Math.min(MASCOT_SIZE - VISIBLE_MARGIN + 16, x)),
  y: Math.max(VISIBLE_MARGIN + 110 - SH, Math.min(MASCOT_SIZE - VISIBLE_MARGIN + 110, y)),
});

/* ─── Animation asset map ────────────────────────────────────────────────── */

// STATIC PNG strategy. Both animated WebP and animated PNG via expo-image
// produced the same broken render on Apple-silicon iOS 26 simulators
// (black-box bounding rectangle + heavy nearest-neighbor pixelation as if
// decoded at thumbnail resolution and upscaled). Rather than keep chasing
// the decoder bug, we ship a single first-frame PNG per mood and animate
// liveness via the JS-side `bounce` Animated.Value below — same
// expressiveness in practice, none of the native-decoder fragility, and
// senpai assets shrink from ~58 MB → ~2 MB.
const ANIM_ASSETS: Record<string, any> = {
  idle: require('../assets/senpai/senpai_idle.png'),
  cheering: require('../assets/senpai/senpai_cheering.png'),
  impressed: require('../assets/senpai/senpai_impressed.png'),
  encouraging: require('../assets/senpai/senpai_encouraging.png'),
  celebrating: require('../assets/senpai/senpai_celebrating.png'),
  sleeping: require('../assets/senpai/senpai_sleep.png'),
  disappointed: require('../assets/senpai/senpai_cry.png'),
  // Extra animations available (asset still bundled, just not wired):
  // think: require('../assets/senpai/senpai_think.png'),
  // wave: require('../assets/senpai/senpai_wave.png'),
};

/**
 * Senpai Mode mascot — animated chibi character using Ziggle WebP animations.
 * Floats on screen, reacts to user actions, shows speech bubbles.
 * Draggable, with idle/sleep timers.
 */
export function SenpaiMascot() {
  const { state, triggerReaction } = useSenpai();
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(false);
  const [showClose, setShowClose] = useState(false);

  // Inline walkie-talkie chat state. Tap on senpai = start listening; the
  // speech bubble above her doubles as the chat surface (live transcript
  // while you speak → her reply text once the model returns), and TTS
  // plays the audio of her response over the speaker. No separate modal.
  const {
    messages,
    loading: chatLoading,
    error: chatError,
    voiceEnabled,
    setVoiceEnabled,
    send: sendChat,
  } = useSenpaiChat();
  // `listening` = user's intent: "the mic should be on." Once on, it
  // stays on through silence, through senpai's replies, and through
  // re-arming, until the user double-taps to turn it off. `sttActive`
  // is the lower-level state of whether STT is currently engaged with
  // the OS — we transition this internally as the system loops.
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);
  // The most recent assistant reply id we've already scheduled a
  // re-arm-after for — prevents firing the timer twice on the same turn.
  const lastReplyIdRef = useRef<string | null>(null);

  // Voice-only mode: force TTS playback on the moment we mount.
  useEffect(() => {
    if (!voiceEnabled) setVoiceEnabled(true);
  }, [voiceEnabled, setVoiceEnabled]);

  // Live STT — accumulate transcript in a ref AND mirror to state so the
  // speech bubble shows what you're saying as you say it.
  useSpeechRecognitionEvent('result', (event) => {
    const t = event.results?.[0]?.transcript ?? '';
    if (!t) return;
    transcriptRef.current = t;
    setLiveTranscript(t);
  });

  useSpeechRecognitionEvent('end', () => {
    const finalTranscript = transcriptRef.current.trim();
    transcriptRef.current = '';
    setLiveTranscript('');

    // Auto-send the captured speech as soon as STT detects end-of-turn.
    // The mic itself doesn't go off — the `listening` flag is the user's
    // intent and stays true until they hold to turn it off.
    if (finalTranscript && !chatLoading) {
      sendChat(finalTranscript);
      // Don't re-arm yet — wait for senpai's reply (the lastAssistantMsg
      // effect below schedules the re-arm with a TTS-friendly delay).
      return;
    }

    // No speech captured (silence timeout). If user still wants the mic
    // on, re-arm. Use a short delay so the native engine has a tick to
    // settle before we ask it to start again — synchronous re-arms tend
    // to throw on iOS Simulator and silently flap `listening` off.
    if (listeningRef.current && !chatLoading) {
      setTimeout(() => {
        if (!listeningRef.current || chatLoading) return;
        try {
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
            requiresOnDeviceRecognition: false,
          });
        } catch (e) {
          // Engine permanently dead — keep the visual indicator on
          // (user intent) but log so we can see it.
          console.warn('[SenpaiMascot] STT re-arm failed:', e);
        }
      }, 250);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    transcriptRef.current = '';
    setLiveTranscript('');
    // We do NOT flip `listening` off on engine errors anymore. `listening`
    // is the user's intent — only stopListening() (their explicit hold)
    // turns it off. Engine errors fire every few hundred ms in iOS
    // Simulator's mic mock and were flickering the indicator off the
    // moment after the hold completed. If user still wants the mic on,
    // try to re-arm; if the engine is permanently dead, the indicator
    // stays on (which matches user intent) and we log the failure.
    if (event?.error === 'aborted' || event?.error === 'no-speech') {
      // Benign — let 'end' handle re-arm.
      return;
    }
    console.warn('[SenpaiMascot] STT error:', event?.error, event?.message);
    if (listeningRef.current && !chatLoading) {
      setTimeout(() => {
        if (!listeningRef.current || chatLoading) return;
        try {
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            continuous: true,
            requiresOnDeviceRecognition: false,
          });
        } catch {
          /* engine perma-dead; visual stays on, user can hold to stop */
        }
      }, 400);
    }
  });

  // Stop listening + audio when the mascot itself unmounts (senpai disabled).
  useEffect(() => {
    return () => {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
      stopSenpaiAudio();
    };
  }, []);

  const startListening = async () => {
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        Alert.alert(
          'Mic access needed',
          'Senpai needs microphone + speech-recognition permission to hear you. Enable both in iOS Settings → Zenki Dojo.',
        );
        return;
      }
      transcriptRef.current = '';
      setLiveTranscript('');
      setListening(true);
      listeningRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        // Continuous so the mic stays open until the user explicitly
        // taps to stop. iOS still drops the session on long silence —
        // the 'end' handler re-arms when that happens.
        continuous: true,
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      setListening(false);
      Alert.alert('Mic trouble', e?.message ?? 'Could not start listening.');
    }
  };

  const stopListening = () => {
    // User-initiated stop — clear intent so the 'end' handler doesn't
    // re-arm the mic. Drop any pending transcript on the floor.
    listeningRef.current = false;
    setListening(false);
    transcriptRef.current = '';
    setLiveTranscript('');
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
  };

  // Most recent settled assistant message — drives the bubble text after
  // a reply lands AND triggers the after-reply mic re-arm so the
  // conversation continues hands-free until the user double-taps off.
  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && !m.pending && !m.error) return m;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!listening) return;
    if (!lastAssistantMsg) return;
    if (lastReplyIdRef.current === lastAssistantMsg.id) return;
    lastReplyIdRef.current = lastAssistantMsg.id;
    // Wait for TTS audio to actually start playing before re-opening
    // the mic — otherwise STT picks up senpai's own voice. Tunable.
    const t = setTimeout(() => {
      if (!listeningRef.current || chatLoading) return;
      transcriptRef.current = '';
      setLiveTranscript('');
      try {
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: true,
          requiresOnDeviceRecognition: false,
        });
      } catch {
        listeningRef.current = false;
        setListening(false);
      }
    }, 4500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAssistantMsg?.id, listening]);

  // Position state
  const [basePos, setBasePos] = useState({ x: 0, y: 0 });
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // PanResponder is built in a useRef and captures basePos by closure on
  // first render; read through this ref instead so each drag accumulates
  // onto the *current* basePos rather than replacing it.
  const basePosRef = useRef(basePos);
  basePosRef.current = basePos;

  // Drag trail — 3 colored dots trailing behind the mascot during drag
  const trailPositions = useRef([
    new Animated.ValueXY({ x: 0, y: 0 }),
    new Animated.ValueXY({ x: 0, y: 0 }),
    new Animated.ValueXY({ x: 0, y: 0 }),
  ]).current;
  const trailOpacities = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const trailBufRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const lastSnapRef = useRef(0);

  // One-time cache invalidation: senpai_*.webp asset content has changed
  // (frame 1 alpha + dispose=background on every frame). expo-image keys
  // its disk cache by asset URI, so file content changes don't bust it on
  // their own. Bump VERSION any time the senpai assets change.
  useEffect(() => {
    const KEY = '@senpai_asset_cache_v';
    const VERSION = '7';
    AsyncStorage.getItem(KEY).then((v) => {
      if (v !== VERSION) {
        Image.clearMemoryCache();
        Image.clearDiskCache();
        AsyncStorage.setItem(KEY, VERSION);
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      const parsed = safeParseJSON<{ x: number; y: number } | null>(raw, null, (v) =>
        typeof v === 'object' && v !== null && typeof (v as { x?: unknown }).x === 'number' && typeof (v as { y?: unknown }).y === 'number',
      );
      if (parsed) setBasePos(clampPos(parsed.x, parsed.y));
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      // Only claim responder when (a) the user has clearly started a drag
      // (>5px movement on either axis), AND (b) the touch origin is within
      // the mascot's bounds. The locationX/Y check matters because the
      // container is positioned-absolute over the rest of the screen — if
      // we claimed responder for any movement anywhere we'd block the
      // underlying ScrollView from scrolling.
      onMoveShouldSetPanResponder: (evt, gs) => {
        const movedEnough = Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
        if (!movedEnough) return false;
        const { locationX, locationY } = evt.nativeEvent;
        return (
          locationX >= 0 && locationX <= MASCOT_SIZE &&
          locationY >= 0 && locationY <= MASCOT_SIZE
        );
      },
      onMoveShouldSetPanResponderCapture: (evt, gs) => {
        const movedEnough = Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5;
        if (!movedEnough) return false;
        const { locationX, locationY } = evt.nativeEvent;
        return (
          locationX >= 0 && locationX <= MASCOT_SIZE &&
          locationY >= 0 && locationY <= MASCOT_SIZE
        );
      },
      onPanResponderTerminationRequest: () => false,
      // Don't block the native scroll responder. Without this, claiming
      // pan responder once means the ScrollView underneath stops scrolling
      // for the rest of the gesture even after the mascot is dismissed.
      onShouldBlockNativeResponder: () => false,
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
        // Reset trail to mascot origin and show dots
        trailPositions.forEach((p) => p.setValue({ x: 0, y: 0 }));
        trailOpacities[0].setValue(0.40);
        trailOpacities[1].setValue(0.25);
        trailOpacities[2].setValue(0.10);
        trailBufRef.current = [];
        lastSnapRef.current = 0;
      },
      onPanResponderMove: (evt, gs) => {
        pan.setValue({ x: gs.dx, y: gs.dy });
        // Throttle trail snapshots to every ~60ms. Trail dots are children
        // of the transformed container, so their translation must cancel
        // the container's current pan to stay at the snapshot position.
        const now = Date.now();
        if (now - lastSnapRef.current > 60) {
          lastSnapRef.current = now;
          const buf = trailBufRef.current;
          buf.unshift({ x: gs.dx, y: gs.dy, t: now });
          if (buf.length > 5) buf.length = 5;
          if (buf[2]) trailPositions[0].setValue({ x: buf[2].x - gs.dx, y: buf[2].y - gs.dy });
          if (buf[3]) trailPositions[1].setValue({ x: buf[3].x - gs.dx, y: buf[3].y - gs.dy });
          if (buf[4]) trailPositions[2].setValue({ x: buf[4].x - gs.dx, y: buf[4].y - gs.dy });
        }
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        const dx = (pan.x as any)._value;
        const dy = (pan.y as any)._value;
        // pan.x/y after flattenOffset is just THIS drag's gesture delta
        // (offset was reset to 0 on grant). Accumulate onto current basePos
        // and clamp so a fast/long fling can't put her past the screen edge.
        const next = clampPos(basePosRef.current.x + dx, basePosRef.current.y + dy);
        setBasePos(next);
        pan.setValue({ x: 0, y: 0 });
        AsyncStorage.setItem(POS_KEY, JSON.stringify(next));
        // Fade trail out
        Animated.parallel(
          trailOpacities.map((o) => Animated.timing(o, { toValue: 0, duration: 200, useNativeDriver: true })),
        ).start();
      },
    }),
  ).current;

  // Idle timer
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!state.enabled) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);

    if (state.mascotMood !== 'idle' && state.mascotMood !== 'sleeping') {
      idleTimerRef.current = setTimeout(() => {
        triggerReaction('idle', randomDialogue('idle'), 5000);
        sleepTimerRef.current = setTimeout(() => {
          triggerReaction('sleeping', 'zzz...', 99999);
        }, 60000);
      }, 45000);
    }

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [state.mascotMood, state.enabled]);

  // Subtle bounce for the whole mascot (supplements the built-in animation)
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!state.enabled) return;
    const mood = state.mascotMood;
    const bounceDist = mood === 'sleeping' ? 1.5 : mood === 'cheering' || mood === 'celebrating' ? 3 : 2;
    const bounceDur = mood === 'sleeping' ? 4000 : mood === 'cheering' ? 600 : 2500;

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -bounceDist, duration: bounceDur / 2, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: bounceDur / 2, useNativeDriver: true }),
      ]),
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, [state.mascotMood, state.enabled]);

  // Hold-to-toggle mic. Pressable.onLongPress was unreliable inside
  // the bouncing absolutely-positioned mascot, so we run our own timer
  // off onPressIn/onPressOut. This also gives us hooks for the charge-up
  // ring and the boot-up explosion.
  const HOLD_MS = 2000;
  const chargeAnim = useRef(new Animated.Value(0)).current;
  const explosionAnim = useRef(new Animated.Value(0)).current;
  // Listening glow — pulses while the mic is open. Drives a large soft
  // ring around the mascot so the user always knows she's actively
  // hearing them.
  const glowAnim = useRef(new Animated.Value(0)).current;
  const sparkleAnims = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0)),
  ).current;
  const chargeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const chargingRef = useRef(false);

  const handleTap = () => {
    // The press-release that follows a completed long-hold fires
    // onPress too — swallow it so we don't double-fire the cute bubble.
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      return;
    }
    if (listening || chatLoading) return;
    triggerReaction('cheering', randomDialogue('mascotTap'), 2500);
  };

  const fireExplosion = () => {
    explosionAnim.setValue(0);
    Animated.timing(explosionAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start(() => explosionAnim.setValue(0));
    sparkleAnims.forEach((a) => a.setValue(0));
    Animated.parallel(
      sparkleAnims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ),
    ).start(() => sparkleAnims.forEach((a) => a.setValue(0)));
  };

  const handleHoldComplete = () => {
    longPressFiredRef.current = true;
    chargingRef.current = false;
    chargeAnim.setValue(1);
    Animated.timing(chargeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
    fireExplosion();
    // Guaranteed visible feedback so the user always sees SOMETHING when
    // the hold completes. If startListening succeeds, listening=true wins
    // the bubble priority and shows "speak to me senpai 💕" instead. If
    // startListening fails silently (perm denied / sim mic missing), this
    // boot message remains visible so the user knows the hold did fire.
    if (listening) {
      triggerReaction('sleeping', 'mic off, going dark 💕', 2000);
      stopListening();
    } else if (!chatLoading) {
      triggerReaction('cheering', 'BOOTING UP — talk to me senpai 💕', 2500);
      startListening().catch((err) => {
        console.warn('[SenpaiMascot] startListening threw:', err);
      });
    }
  };

  const onPressIn = () => {
    if (listening || chatLoading) return;
    longPressFiredRef.current = false;
    chargingRef.current = true;
    chargeAnim.setValue(0);
    Animated.timing(chargeAnim, {
      toValue: 1,
      duration: HOLD_MS,
      useNativeDriver: false,
    }).start();
    if (chargeTimerRef.current) clearTimeout(chargeTimerRef.current);
    chargeTimerRef.current = setTimeout(() => {
      chargeTimerRef.current = null;
      handleHoldComplete();
    }, HOLD_MS);
  };

  const onPressOut = () => {
    if (chargeTimerRef.current) {
      clearTimeout(chargeTimerRef.current);
      chargeTimerRef.current = null;
    }
    if (!chargingRef.current) return;
    chargingRef.current = false;
    Animated.timing(chargeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    return () => {
      if (chargeTimerRef.current) clearTimeout(chargeTimerRef.current);
    };
  }, []);

  // Pulsing glow whenever the mic is open. Loops until listening flips off.
  useEffect(() => {
    if (!listening) {
      glowAnim.stopAnimation();
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: false,
      }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 950,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.35,
          duration: 950,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, glowAnim]);

  if (!state.enabled || hidden) return null;

  const mood = state.mascotMood;
  const opacity = mood === 'sleeping' ? 0.85 : 1;
  const animSource = ANIM_ASSETS[mood] ?? ANIM_ASSETS.idle;

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            bottom: 110 - basePos.y,
            right: 16 - basePos.x,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { translateY: bounce },
            ],
            opacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Drag trail dots (pink → blue → purple) */}
        {[
          { idx: 0, color: '#FF2E51' },
          { idx: 1, color: '#5158FF' },
          { idx: 2, color: '#D260FF' },
        ].map(({ idx, color }) => (
          <Animated.View
            key={idx}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: color,
              left: MASCOT_SIZE / 2 - 4,
              top: MASCOT_SIZE / 2 - 4,
              opacity: trailOpacities[idx],
              transform: [
                { translateX: trailPositions[idx].x },
                { translateY: trailPositions[idx].y },
              ],
            }}
          />
        ))}

        {/* Speech bubble — chat surface + legacy reaction overlay.
            Priority: live transcript > listening greeting > thinking
            placeholder > error > latest assistant reply > auto reaction. */}
        {(() => {
          const bubbleText = listening
            ? liveTranscript || 'speak to me senpai 💕'
            : chatLoading
            ? '...'
            : chatError
            ? "couldn't reach me — tap to try again"
            : lastAssistantMsg?.content || state.lastReaction;
          return bubbleText ? <SpeechBubble text={bubbleText} colors={colors} /> : null;
        })()}

        {/* Listening glow — bright pulsing pink halo while the mic is open.
            Renders only while listening; fades when she goes quiet. */}
        {listening && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.listeningGlow,
              {
                opacity: glowAnim,
                transform: [
                  {
                    scale: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.95, 1.18],
                    }),
                  },
                ],
              },
            ]}
          />
        )}

        {/* (LIVE badge removed — the speech bubble already says "speak to
            me senpai 💕" while listening. Two indicators were redundant.) */}

        {/* Charge-up ring — fills clockwise during the 4s hold; fades on
            release. Sits behind the mascot, so the chibi reads as the
            "battery" being filled. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            {
              borderWidth: chargeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 6],
              }),
              borderColor: chargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [
                  'rgba(255, 46, 81, 0)',
                  'rgba(255, 46, 81, 0.7)',
                  'rgba(255, 215, 0, 1)',
                ],
              }),
              opacity: chargeAnim,
              transform: [
                {
                  scale: chargeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Boot-up explosion — quick gold ring burst on charge complete. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.explosionRing,
            {
              opacity: explosionAnim.interpolate({
                inputRange: [0, 0.2, 1],
                outputRange: [0, 1, 0],
              }),
              transform: [
                {
                  scale: explosionAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 2.6],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Sparkle particles — 8 dots fan out radially on explosion. */}
        {sparkleAnims.map((anim, i) => {
          const angle = (i / sparkleAnims.length) * Math.PI * 2;
          const radius = MASCOT_SIZE * 0.85;
          const tx = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.cos(angle) * radius],
          });
          const ty = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, Math.sin(angle) * radius],
          });
          return (
            <Animated.View
              key={`spark-${i}`}
              pointerEvents="none"
              style={[
                styles.sparkle,
                {
                  opacity: anim.interpolate({
                    inputRange: [0, 0.15, 0.85, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    { translateX: tx },
                    { translateY: ty },
                    {
                      scale: anim.interpolate({
                        inputRange: [0, 0.4, 1],
                        outputRange: [0.4, 1, 0.6],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Animated mascot — tap = cute reaction, hold 4 seconds = mic
            toggle (walkie-talkie). The long delay + charge-ring visual
            is intentional so a casual tap can never accidentally open
            the mic, AND so the user has clear feedback the hold is
            working. */}
        <Pressable
          onPress={handleTap}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
        >
          <Image
            source={animSource}
            style={styles.mascotImage}
            contentFit="contain"
            autoplay
            cachePolicy="memory-disk"
          />
        </Pressable>

        {/* Close button (on long press) */}
        {showClose && (
          <SoundPressable style={styles.closeBtn} onPress={() => setHidden(true)}>
            <Text style={styles.closeBtnText}>x</Text>
          </SoundPressable>
        )}
      </Animated.View>
    </>
  );
}

/* ─── Speech Bubble ──────────────────────────────────────────────────────── */

function SpeechBubble({ text, colors }: { text: string; colors: any }) {
  const scale = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [text]);

  return (
    <Animated.View
      style={[
        styles.bubble,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: fade,
          transform: [{ scale }],
        },
      ]}
    >
      <Text style={[styles.bubbleText, { color: colors.textPrimary }]} numberOfLines={3}>
        {text}
      </Text>
      <View style={[styles.bubbleArrow, { borderTopColor: colors.surface }]} />
    </Animated.View>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 99990,
    width: MASCOT_SIZE,
    alignItems: 'center',
  },

  mascotImage: {
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
  },

  // Listening glow — soft orange halo that hugs the mascot ONLY while the
  // mic is active. Just 5px past her silhouette so it reads as a subtle
  // warm aura around her rather than a separate object.
  listeningGlow: {
    position: 'absolute',
    width: MASCOT_SIZE + 10,
    height: MASCOT_SIZE + 10,
    left: -5,
    bottom: -5,
    borderRadius: (MASCOT_SIZE + 10) / 2,
    backgroundColor: 'rgba(255, 140, 0, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 165, 0, 0.55)',
    // @ts-ignore — boxShadow web only; native uses shadow* below
    boxShadow: '0 0 12px 2px rgba(255, 140, 0, 0.55)',
    shadowColor: '#FF8C00',
    shadowOpacity: 0.75,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    zIndex: 0,
  },

  // Charge-up ring — sits behind the mascot. Border thickness, color,
  // and scale are all driven by chargeAnim (0 → 1 over the 4s hold).
  chargeRing: {
    position: 'absolute',
    width: MASCOT_SIZE + 24,
    height: MASCOT_SIZE + 24,
    left: -12,
    bottom: -12,
    borderRadius: (MASCOT_SIZE + 24) / 2,
    zIndex: 1,
  },

  // Explosion burst — quick gold ring that expands + fades on charge complete.
  explosionRing: {
    position: 'absolute',
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
    left: 0,
    bottom: 0,
    borderRadius: MASCOT_SIZE / 2,
    backgroundColor: 'rgba(255, 215, 0, 0.18)',
    borderColor: '#FFD700',
    borderWidth: 3,
    zIndex: 5,
  },

  // Sparkle particle — radiates from mascot center outward on explosion.
  sparkle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFD700',
    left: MASCOT_SIZE / 2 - 6,
    bottom: MASCOT_SIZE / 2 - 6,
    zIndex: 6,
    // @ts-ignore — boxShadow web-only fallback
    boxShadow: '0 0 8px rgba(255, 215, 0, 0.9)',
  },

  // Speech bubble
  bubble: {
    position: 'absolute',
    bottom: MASCOT_SIZE + 8,
    right: -10,
    maxWidth: 180,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 10,
  },
  bubbleText: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
  bubbleArrow: {
    position: 'absolute',
    bottom: -6,
    right: 20,
    width: 0, height: 0,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },

  // Close button
  closeBtn: {
    position: 'absolute', top: -8, right: -8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  closeBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },
});
