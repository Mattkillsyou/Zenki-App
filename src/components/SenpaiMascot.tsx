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

  // Inline walkie-talkie chat state. HOLD senpai for 2s = start listening,
  // HOLD for 3s while listening = stop. The speech bubble above her doubles
  // as the chat surface (live transcript while you speak → her reply text
  // once the model returns), and TTS plays the audio of her response over
  // the speaker. No separate modal, no tap-to-toggle (that was removed
  // because the user couldn't tell whether their tap had registered as a
  // hold or a release).
  const {
    messages,
    loading: chatLoading,
    error: chatError,
    voiceEnabled,
    setVoiceEnabled,
    ttsPlaying,
    send: sendChat,
  } = useSenpaiChat();
  // `listening` = user's intent: "the mic should be on." Once on, it
  // stays on through silence, through senpai's replies, and through
  // re-arming, until the user holds for 3s to turn it off. We track
  // listeningRef in parallel so STT event callbacks (which capture state
  // by closure) read a fresh value rather than the stale render-time one.
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

    console.warn(
      '[SenpaiMascot] STT end fired. transcript:',
      JSON.stringify(finalTranscript),
      'listening:', listeningRef.current,
      'chatLoading:', chatLoading,
    );

    // Auto-send the captured speech as soon as STT detects end-of-turn.
    // Two guards beyond the obvious (transcript exists, chat not in flight):
    //   - listeningRef.current: stopListening() flips this BEFORE calling
    //     stop(), so a late 'result' arriving between can't trigger a
    //     send the user already abandoned.
    //   - !chargingRef.current: if the user is currently mid-hold to stop
    //     the mic, an STT silence-end firing in the middle of that hold
    //     shouldn't ship a message they're trying to abandon.
    if (
      finalTranscript &&
      !chatLoading &&
      listeningRef.current &&
      !chargingRef.current
    ) {
      sendChat(finalTranscript);
      return;
    }

    // No speech captured (silence timeout with nothing said). If user
    // still wants the mic on, re-arm after a short delay so the native
    // engine has a tick to settle.
    if (listeningRef.current && !chatLoading) {
      setTimeout(() => {
        if (!listeningRef.current || chatLoading) return;
        try {
          ExpoSpeechRecognitionModule.start({
            lang: 'en-US',
            interimResults: true,
            // Single-shot — iOS auto-stops on silence and fires 'end',
            // which is what triggers sendChat. Continuous mode wedges
            // the mic open and 'end' never fires until stop().
            continuous: false,
            requiresOnDeviceRecognition: false,
          });
        } catch (e) {
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
            continuous: false,
            requiresOnDeviceRecognition: false,
          });
        } catch {
          /* engine perma-dead; visual stays on, user can tap to stop */
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
        // Single-shot. iOS auto-stops on silence and fires 'end' →
        // sendChat. The 'end' handler re-arms while listeningRef is
        // still true, so the conversation flows like a walkie-talkie
        // without ever wedging the mic open. Continuous mode never
        // fires 'end' until stop(), so replies never landed.
        continuous: false,
        requiresOnDeviceRecognition: false,
      });
    } catch (e: any) {
      setListening(false);
      Alert.alert('Mic trouble', e?.message ?? 'Could not start listening.');
    }
  };

  const stopListening = () => {
    // User-initiated stop. Order matters:
    //   1. listeningRef false FIRST — so any late STT 'result' event that
    //      fires between here and the 'end' callback won't trigger a
    //      send (the 'end' handler now guards on listeningRef).
    //   2. Drop the pending transcript so we don't accidentally send
    //      half-formed speech.
    //   3. stop() the engine — this fires 'end' but we've already armed
    //      the guards above.
    //   4. Cut TTS audio. If the user tapped to stop while senpai was
    //      mid-reply, they want her to shut up too — not keep talking.
    listeningRef.current = false;
    setListening(false);
    transcriptRef.current = '';
    setLiveTranscript('');
    try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
    stopSenpaiAudio();
  };

  // Most recent settled assistant message — drives the bubble text after
  // a reply lands AND triggers the after-reply mic re-arm so the
  // conversation continues hands-free until the user holds 3s to stop.
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
    // Wait for TTS playback to actually finish — otherwise STT picks up
    // senpai's own voice through the speaker and transcribes garbage. The
    // old fixed 4500ms guess was reliably too short for bilingual replies
    // (Japanese + English easily runs 6–8s). ttsPlaying flips false in
    // the audio cleanup callback, so this effect re-runs and re-arms.
    if (ttsPlaying) return;
    lastReplyIdRef.current = lastAssistantMsg.id;
    // Small additional delay so the audio output buffer fully drains and
    // the speech engine sees clear silence before we open the mic again.
    const t = setTimeout(() => {
      if (!listeningRef.current || chatLoading) return;
      transcriptRef.current = '';
      setLiveTranscript('');
      try {
        ExpoSpeechRecognitionModule.start({
          lang: 'en-US',
          interimResults: true,
          continuous: false,
          requiresOnDeviceRecognition: false,
        });
      } catch {
        listeningRef.current = false;
        setListening(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAssistantMsg?.id, listening, ttsPlaying]);

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

  // Hold-to-toggle mic. Symmetric gesture model:
  //   - Hold for HOLD_ON_MS while idle    → mic ON  (charge ring fills, then explosion)
  //   - Hold for HOLD_OFF_MS while listening → mic OFF (discharge ring fills, then shutdown)
  // Tap does NOT toggle the mic — the user explicitly asked for hold to be
  // the only on/off gesture so a stray tap can never confusingly cut their
  // session mid-utterance. OFF is intentionally longer than ON so it can't
  // fire by accident if the user happens to rest a finger on the chibi.
  const HOLD_ON_MS = 2000;
  const HOLD_OFF_MS = 3000;
  const chargeAnim = useRef(new Animated.Value(0)).current;
  const explosionAnim = useRef(new Animated.Value(0)).current;
  // Discharge ring — mirrors the charge ring but in the orange shutdown
  // palette. Drives the hold-to-stop visual so the user gets the same
  // "I'm doing something with this hold" feedback they get for hold-to-start.
  const dischargeAnim = useRef(new Animated.Value(0)).current;
  // Shutdown burst — the inverse of explosion. Same ring + 8 sparkles,
  // but the ring shrinks (2.6 → 1) and sparkles collapse from a radius
  // back to center. Plays on hold-to-stop completion.
  const shutdownAnim = useRef(new Animated.Value(0)).current;
  const shutdownSparkleAnims = useRef(
    Array.from({ length: 8 }, () => new Animated.Value(0)),
  ).current;
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
    // While listening, tap is intentionally a no-op. The user explicitly
    // asked for hold-to-stop (3s), not tap-to-stop — a single tap toggling
    // the mic was confusing because they couldn't tell whether their press
    // had registered as a hold or a release. Cute reactions also stay
    // suppressed during listening so the mascot's expression stays "I am
    // listening to you", not "look at me look at me."
    if (listening) return;
    // Tap while chat is in flight — give the user feedback so they know
    // the system saw the tap. We can't truly cancel the upstream call
    // (Anthropic is already generating), but the AbortController in
    // sendSenpaiChat will clear chatLoading within 35s if the network
    // hangs. The reply, if it lands, still updates the bubble.
    if (chatLoading) {
      triggerReaction('encouraging', 'thinking... be patient senpai 💕', 1500);
      return;
    }
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

  const fireShutdown = () => {
    // Mirror of fireExplosion played backwards through interpolation:
    // shutdownRing scale goes 2.6 → 1, sparkles collapse from a radius
    // to (0,0). Same 700ms duration so on/off feel like one gesture.
    shutdownAnim.setValue(0);
    Animated.timing(shutdownAnim, {
      toValue: 1,
      duration: 700,
      useNativeDriver: true,
    }).start(() => shutdownAnim.setValue(0));
    shutdownSparkleAnims.forEach((a) => a.setValue(0));
    Animated.parallel(
      shutdownSparkleAnims.map((a) =>
        Animated.timing(a, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ),
    ).start(() => shutdownSparkleAnims.forEach((a) => a.setValue(0)));
  };

  const handleHoldOnComplete = () => {
    longPressFiredRef.current = true;
    chargingRef.current = false;
    // Snap charge ring to 1 then fade out, so the user sees the ring
    // "pop" full-bright at the moment the hold succeeds.
    chargeAnim.setValue(1);
    Animated.timing(chargeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
    fireExplosion();
    // Defensive: should never be entered with listening=true (onPressIn
    // routes the hold to handleHoldOffComplete in that case). If we're
    // somehow here while a chat is mid-flight, just bail — the user can
    // try again once the reply lands.
    if (chatLoading) return;
    triggerReaction('cheering', 'BOOTING UP — talk to me senpai 💕', 2500);
    startListening().catch((err) => {
      console.warn('[SenpaiMascot] startListening threw:', err);
    });
  };

  const handleHoldOffComplete = () => {
    longPressFiredRef.current = true;
    chargingRef.current = false;
    // Snap discharge ring to 1 then fade out — visual symmetry with
    // hold-on completion.
    dischargeAnim.setValue(1);
    Animated.timing(dischargeAnim, {
      toValue: 0,
      duration: 350,
      useNativeDriver: false,
    }).start();
    fireShutdown();
    triggerReaction('sleeping', 'mic off, going dark 💕', 2000);
    stopListening();
  };

  const onPressIn = () => {
    // Block hold-to-START during chat-in-flight (mic is closed waiting
    // for the reply; opening it now would be confusing). But ALLOW
    // hold-to-STOP even mid-flight — if the user wants to bail on the
    // conversation, they need a way to do it without waiting for the
    // 35s AbortController timeout.
    if (chatLoading && !listening) return;
    longPressFiredRef.current = false;
    chargingRef.current = true;
    if (chargeTimerRef.current) clearTimeout(chargeTimerRef.current);

    if (listening) {
      // Hold-to-stop path. Run the discharge animation in parallel with
      // a 3000ms timer; whichever wins (full hold → handleHoldOffComplete
      // | early release → onPressOut cancels) cleans the other up.
      dischargeAnim.setValue(0);
      Animated.timing(dischargeAnim, {
        toValue: 1,
        duration: HOLD_OFF_MS,
        useNativeDriver: false,
      }).start();
      chargeTimerRef.current = setTimeout(() => {
        chargeTimerRef.current = null;
        handleHoldOffComplete();
      }, HOLD_OFF_MS);
      return;
    }

    // Hold-to-start path. Same shape as above but on chargeAnim with
    // the shorter HOLD_ON_MS threshold.
    chargeAnim.setValue(0);
    Animated.timing(chargeAnim, {
      toValue: 1,
      duration: HOLD_ON_MS,
      useNativeDriver: false,
    }).start();
    chargeTimerRef.current = setTimeout(() => {
      chargeTimerRef.current = null;
      handleHoldOnComplete();
    }, HOLD_ON_MS);
  };

  const onPressOut = () => {
    if (chargeTimerRef.current) {
      clearTimeout(chargeTimerRef.current);
      chargeTimerRef.current = null;
    }
    if (!chargingRef.current) return;
    chargingRef.current = false;
    // Reset whichever ring was animating. Cheap to fire both — the one
    // that wasn't running is already at 0 and timing it back to 0 is a
    // no-op.
    Animated.timing(chargeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
    Animated.timing(dischargeAnim, {
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
            Priority: live transcript (you talking) → loading dots →
            error → senpai's reply → listening greeting → auto reaction.
            The reply must beat the listening greeting, otherwise once
            the mic is open the user never sees senpai answer. */}
        {(() => {
          const bubbleText = liveTranscript
            ? liveTranscript
            : chatLoading
            ? '...'
            : chatError
            ? "couldn't reach me — hold me again to retry 💕"
            : lastAssistantMsg?.content
            ? lastAssistantMsg.content
            : listening
            ? 'speak to me senpai 💕'
            : state.lastReaction;
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

        {/* Charge-up ring — fills during the hold-to-start (HOLD_ON_MS);
            fades on release. Pink → gold so the user sees a "warming up"
            color shift as the threshold approaches. */}
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

        {/* Discharge ring — fills during the hold-to-stop (HOLD_OFF_MS).
            Orange → deep red so the user reads it as a distinct "powering
            down" gesture, not a second start-up. Same geometry as the
            charge ring, separate Animated.Value so they can coexist
            without state conflicts. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            {
              borderWidth: dischargeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 6],
              }),
              borderColor: dischargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [
                  'rgba(255, 140, 0, 0)',
                  'rgba(255, 140, 0, 0.75)',
                  'rgba(220, 38, 38, 1)',
                ],
              }),
              opacity: dischargeAnim,
              transform: [
                {
                  scale: dischargeAnim.interpolate({
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

        {/* Shutdown ring — inverse of explosion: starts large + collapses
            to mascot silhouette, fades out. Played on tap-to-stop.
            Opacity goes 0 → 1 → 1 → 0 across the 700ms animation; the
            initial 0 keeps the ring invisible at rest (without it the
            ring would render full-size + opaque all the time). */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shutdownRing,
            {
              opacity: shutdownAnim.interpolate({
                inputRange: [0, 0.05, 0.8, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  scale: shutdownAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2.6, 1],
                  }),
                },
              ],
            },
          ]}
        />

        {/* Shutdown sparkles — orange dots collapsing inward from a
            radius back to the mascot center. Mirrors the gold burst. */}
        {shutdownSparkleAnims.map((anim, i) => {
          const angle = (i / shutdownSparkleAnims.length) * Math.PI * 2;
          const radius = MASCOT_SIZE * 0.85;
          const tx = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.cos(angle) * radius, 0],
          });
          const ty = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [Math.sin(angle) * radius, 0],
          });
          return (
            <Animated.View
              key={`shutdown-spark-${i}`}
              pointerEvents="none"
              style={[
                styles.shutdownSparkle,
                {
                  // Opacity 0 → 1 → 1 → 0 across the run; initial 0
                  // hides the sparkle at rest. Without this the 8 dots
                  // would always sit at the outer radius around the
                  // mascot.
                  opacity: anim.interpolate({
                    inputRange: [0, 0.05, 0.85, 1],
                    outputRange: [0, 1, 1, 0],
                  }),
                  transform: [
                    { translateX: tx },
                    { translateY: ty },
                    {
                      scale: anim.interpolate({
                        inputRange: [0, 0.6, 1],
                        outputRange: [0.6, 1, 0.3],
                      }),
                    },
                  ],
                },
              ]}
            />
          );
        })}

        {/* Animated mascot — gestures:
              - Short tap (idle):     cute reaction
              - Short tap (chatLoading): "thinking…" feedback
              - Short tap (listening): no-op (cute reactions silenced)
              - HOLD 2s (idle):       mic ON  (charge ring + boot explosion)
              - HOLD 3s (listening):  mic OFF (discharge ring + shutdown)
            Long thresholds + the live ring fill are intentional so a
            casual tap can never accidentally open OR close the mic. */}
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

  // Charge / discharge ring — same geometry, two consumers. Sits behind
  // the mascot. Border thickness, color, and scale are all driven by the
  // respective Animated.Value (0 → 1 over HOLD_ON_MS or HOLD_OFF_MS).
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

  // Shutdown ring — inverse of explosion. Orange to match the listening
  // glow palette, so on/off feel like one continuous color story.
  shutdownRing: {
    position: 'absolute',
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
    left: 0,
    bottom: 0,
    borderRadius: MASCOT_SIZE / 2,
    backgroundColor: 'rgba(255, 140, 0, 0.16)',
    borderColor: '#FF8C00',
    borderWidth: 3,
    zIndex: 5,
  },

  // Shutdown sparkle — same geometry as the explosion sparkle but orange.
  shutdownSparkle: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C00',
    left: MASCOT_SIZE / 2 - 6,
    bottom: MASCOT_SIZE / 2 - 6,
    zIndex: 6,
    // @ts-ignore — boxShadow web-only fallback
    boxShadow: '0 0 8px rgba(255, 140, 0, 0.9)',
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
