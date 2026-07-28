import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Alert, Animated, Easing, PanResponder, Dimensions, Pressable, TextInput,
  Keyboard, Platform,
} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { useSenpai, type MascotMood } from '../context/SenpaiContext';
import { useAuth } from '../context/AuthContext';
import { useMotion } from '../context/MotionContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { useSenpaiChat } from '../hooks/useSenpaiChat';
import { stopSenpaiAudio, prewarmAudioSession } from '../services/senpaiAudio';
import { smallTick } from '../services/senpaiHaptics';
import { AI_FUNCTION_BASE_URL } from '../config/api';
import { ANIM_ASSETS, FLIPBOOK_ASSETS } from './senpaiMoodAssets';
import { SenpaiFlipbook } from './SenpaiFlipbook';
import { publishSenpaiCorner } from './senpaiCornerStore';

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

// In-place chat surface. She is draggable and snaps to the nearest of the 4
// screen corners; the chat "dock" (reply bubble + Type/Talk switch + text box)
// opens INWARD from whichever corner she's in, so it never runs off-screen.
// MODE_KEY used to be '@zenki_senpai_mode' — the SAME key SenpaiContext uses
// for its enabled flag ('true'/'false'), so flipping Type⟷Talk overwrote the
// enabled flag with 'type'/'talk' and silently disabled Senpai on the next
// launch. The restore effect below migrates a stranded value back.
const MODE_KEY = '@zenki_senpai_chat_mode';
const LEGACY_MODE_KEY = '@zenki_senpai_mode';
// One-time AI safety disclaimer gate (carried over from the deleted full-screen
// chat). PER-ACCOUNT: the real key is `${DISCLAIMER_KEY_BASE}:${accountId}`
// (guest bucket for guests) so a second member on the same device gets their
// own gate. The bare legacy key was device-global — it migrates once to the
// current account on first read, then is deleted.
const DISCLAIMER_KEY_BASE = '@senpai_chat_disclaimer_v1';
const DOCK_W = 264;
// Idle → quip → sleep pipeline (see the idle-timer effect below).
const IDLE_QUIP_MS = 45000;        // no interaction while idle → idle quip
const SLEEP_AFTER_QUIP_MS = 60000; // still nothing after the quip → 'zzz...'
// Open chat dock auto-collapses back to chibi-only after this much quiet.
const DOCK_IDLE_MS = 20000;
type CornerKey = 'br' | 'bl' | 'tr' | 'tl';
// basePos values that seat her flush in each corner. Derived from the
// default bottom:110/right:16 anchor + the MASCOT_SIZE box (16px side margins,
// ~60px top inset clear of the status bar).
const SNAP_LEFT_X = 32 + MASCOT_SIZE - SW; // basePos.x → left edge ≈ 16
const SNAP_TOP_Y = 170 + MASCOT_SIZE - SH; // basePos.y → top edge ≈ 60
const CORNER_TARGETS: Record<CornerKey, { x: number; y: number }> = {
  br: { x: 0, y: 0 },
  bl: { x: SNAP_LEFT_X, y: 0 },
  tr: { x: 0, y: SNAP_TOP_Y },
  tl: { x: SNAP_LEFT_X, y: SNAP_TOP_Y },
};
const nearestCorner = (pos: { x: number; y: number }): CornerKey => {
  // Reconstruct her on-screen center from the basePos offset, then pick the
  // nearest corner by which half of the screen the center falls in.
  const centerX = SW - (16 - pos.x) - MASCOT_SIZE / 2;
  const centerY = SH - (110 - pos.y) - MASCOT_SIZE / 2;
  const v = centerY < SH / 2 ? 't' : 'b';
  const h = centerX < SW / 2 ? 'l' : 'r';
  return (v + h) as CornerKey;
};

// Task 5: voice-goodbye intent. Conservative on purpose — a farewell token
// ("bye" etc.) mid-sentence ("I'll say bye to the gym and hit legs") must NOT
// trip a sign-off, so we require the WHOLE trimmed utterance to be short
// (≤5 words). "later"/"night" only count paired with "senpai" (bare "later"
// is too common mid-sentence). Matched goodbyes are handled locally — never
// sent to the model — so they cost zero tokens.
const GOODBYE_RE = /\b(?:good\s*bye|bye+(?:\s*bye+)?|see\s*(?:you|ya)|oyasumi|good\s*night|(?:later|laters|night)\s*senpai)\b/i;
const isGoodbyeIntent = (t: string): boolean => {
  const words = t.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return GOODBYE_RE.test(t);
};

// Task 6: a transcript with ≤1 real character (a stray syllable, pure
// punctuation, or mic noise the engine still handed over). Sending it wastes a
// round-trip and earns a confused reply, so we treat it as "didn't catch that"
// instead. Deliberately tight — "hi"/"ok"/"yo" (2 chars) are real messages and
// must pass through.
const isLikelyGarbage = (t: string): boolean =>
  t.replace(/[^\p{L}\p{N}]/gu, '').length <= 1;

// P2 (guest dead-end): chat needs a signed-in Firebase session — the CF
// rejects tokenless calls with 401. Guests used to burn the round-trip and
// land on "sign in expired — open the app fresh", which can never recover
// for someone who was never signed in. One honest line, shared by the dock's
// guest panel, the mic gate, and the no_auth error copy in the bubble.
const GUEST_SIGNIN_LINE = 'gotta sign in first senpai — then I can actually talk to you 💕';

// Boot the senpaiSpeak container while the user is still holding the mic.
// senpaiChat and senpaiSpeak are separate Cloud Run services with separate
// instance pools, and neither declares minInstances — so with a small member
// base the first turn of a session pays BOTH cold starts, SERIALLY (speak
// isn't contacted until the whole chat reply has returned). The client knows
// a senpaiSpeak call is 3-8s away the instant the button goes down, so an
// OPTIONS request here boots the container inside the time the user is
// talking. OPTIONS short-circuits at the top of the handler (204, pre-auth),
// so it costs no quota, no Firestore write, and no ElevenLabs characters —
// it only pays a cold start we would otherwise eat on the critical path.
let lastSpeakPrewarmAt = 0;
const prewarmSpeakFunction = () => {
  const now = Date.now();
  if (now - lastSpeakPrewarmAt < 60_000) return; // instances stay warm ~15min
  lastSpeakPrewarmAt = now;
  fetch(`${AI_FUNCTION_BASE_URL}/senpaiSpeak`, { method: 'OPTIONS' }).catch(() => {
    /* best effort — a failed prewarm just means we pay the cold start later */
  });
};

/* ─── Animation asset maps ───────────────────────────────────────────────── */
// ANIM_ASSETS (mood→static PNG) and FLIPBOOK_ASSETS (mood→sprite strip) live
// in ./senpaiMoodAssets — see that file's header for the static-WebP-strip
// rationale and the asset-versioning twin rule.

/**
 * Senpai Mode mascot — sprite-flipbook animation per mood (SenpaiFlipbook,
 * 12fps strips) with a static-PNG fallback (Reduce Motion / missing strip).
 * Floats on screen, reacts to user actions, shows speech bubbles. Draggable,
 * with idle/sleep timers.
 *
 * Thin gate: the heavy impl (STT event subscriptions, image-cache effect,
 * position reads, animation loops) must not mount when Senpai is off, since
 * this component is always rendered in App.tsx. An early-return *inside* the
 * impl still ran every hook; gating the mount here avoids all of it.
 */
export function SenpaiMascot() {
  const { state } = useSenpai();
  if (!state.enabled) return null;
  return <SenpaiMascotImpl />;
}

function SenpaiMascotImpl() {
  // setSenpaiListening: mascot-only writer for SenpaiContext's mic-open mirror
  // (state.listening) — aliased so it doesn't collide with the local
  // walkie-talkie `listening` useState below. Mirrored via an effect.
  const { state, triggerReaction, setListening: setSenpaiListening } = useSenpai();
  const { user } = useAuth();
  // System Reduce Motion (live — toggling in iOS Settings takes effect without
  // a restart). Gates the flipbook, breath/head-bob, rings/bursts, drag
  // trail, dock
  // spring and the milestone squash script (D5). Mirrored into a ref for the
  // once-created PanResponder closures.
  const { reduceMotion } = useMotion();
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;
  const [hidden, setHidden] = useState(false);
  const [showClose, setShowClose] = useState(false);
  // In-place chat surface: 'type' = inline text box you type into; 'talk' =
  // walkie-talkie voice (tap the chibi / the mic to talk). One switch flips
  // between them — there is NO separate full-screen page anymore.
  const [mode, setModeState] = useState<'type' | 'talk'>('type');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Chibi-only by default: the dock panel (Type/Talk switch + input/mic)
  // renders ONLY while dockOpen — tap her to summon it; it auto-collapses
  // after DOCK_IDLE_MS of quiet. Reaction bubbles still show while collapsed,
  // so she stays a character on every screen without being UI furniture.
  const [dockOpen, setDockOpen] = useState(false);
  const dockCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Typed-reply persistence: in Type mode her last settled reply HOLDS the
  // bubble after the 4s reaction mirror expires (it used to vanish with no
  // re-read surface anywhere — the chat modal is gone). Dismissed by tapping
  // her or by dock auto-collapse; reset on send/clear/mode-switch.
  const [replyDismissed, setReplyDismissed] = useState(false);
  // Wall-clock of the user's last direct interaction (tap / drag / keystroke /
  // speech / send / reply arrival). The idle-quip, sleep, and dock-collapse
  // timers re-check this when they fire, so she never quips mid-conversation
  // or collapses the dock mid-thought.
  const lastInteractionAtRef = useRef(Date.now());
  const bumpInteraction = () => { lastInteractionAtRef.current = Date.now(); };
  // Which screen corner she's snapped to — drives which side the chat dock
  // opens from so it always expands inward (never off-screen).
  const [corner, setCorner] = useState<CornerKey>('br');
  // One-time AI disclaimer gate (null = still loading; false = must accept
  // before chatting; true = accepted). Replaces the deleted modal's gate.
  // Keyed per account (guest bucket when signed out) — see DISCLAIMER_KEY_BASE.
  const [disclaimerOK, setDisclaimerOK] = useState<boolean | null>(null);
  const disclaimerKey = `${DISCLAIMER_KEY_BASE}:${user?.id ?? 'guest'}`;
  // Keyboard height while the text box is focused — used to lift the dock so
  // the input isn't hidden behind the keyboard at a bottom corner.
  const [kbHeight, setKbHeight] = useState(0);

  // Inline push-to-talk chat state. HOLD the dock's mic button while
  // speaking, RELEASE to send — like a walkie-talkie / Siri. The speech
  // bubble above her doubles as the chat surface (live transcript while you
  // speak → her reply text once the model returns), and TTS plays the audio
  // of her response over the speaker. voiceEnabled is the voice-mode master
  // switch: off = no TTS and no Talk mode at all.
  const {
    messages,
    loading: chatLoading,
    error: chatError,
    ttsPlaying,
    lastArrivedId,
    voiceEnabled,
    setVoiceEnabled,
    stopTts,
    send: sendChat,
    clear: clearChat,
    clearError: clearChatError,
  } = useSenpaiChat();
  // `listening` = the finger is down on the PTT button and the recognizer is
  // open. It never persists through thinking or replies anymore. We track
  // listeningRef in parallel so STT event callbacks (which capture state
  // by closure) read a fresh value rather than the stale render-time one.
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const transcriptRef = useRef('');
  const listeningRef = useRef(false);
  // PTT bookkeeping:
  //   holdActiveRef — finger is down (set in beginHold, cleared on release/
  //     cancel); guards the async engine-start against a release that lands
  //     before the recognizer actually opened.
  //   holdReleasedRef — the release wants the captured transcript SENT; the
  //     'end' handler / watchdog consume it exactly once (finalizeAndSend).
  //   finalizeTimerRef — iOS can delay 'end' while finalizing; this watchdog
  //     sends from transcriptRef directly if 'end' hasn't fired in time.
  //   holdStartedAtRef — distinguishes a too-short tap from a real hold.
  //   pressCommitTimerRef — slide-off-to-cancel disambiguation (onPressOut
  //     fires for both; onPress only when released inside the button).
  const holdActiveRef = useRef(false);
  const holdReleasedRef = useRef(false);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStartedAtRef = useRef(0);
  const pressCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Count of our own ExpoSpeechRecognitionModule.stop() calls whose 'end'
  // hasn't arrived yet. iOS can lag 'end' behind stop() by up to ~1s; if the
  // user starts a NEW hold in that window, the late 'end' must be attributed
  // to the stopped session — not misread as a self-end of the live one
  // (which would flip its refs and strand an invisible open mic).
  const pendingStopsRef = useRef(0);
  // Task 3: mirror the mic-open state into SenpaiContext so the reaction
  // bridge can hold ambient nudges (welcomeBack / streakAtRisk) while a voice
  // session is live. The cleanup resets it on unmount (senpai disabled) so a
  // stale `true` can't outlive the mascot.
  useEffect(() => {
    setSenpaiListening(listening);
  }, [listening, setSenpaiListening]);
  useEffect(() => () => setSenpaiListening(false), [setSenpaiListening]);
  // Short-lived bubble override. When the user taps the chibi we want
  // them to see the gesture hint EVEN IF a previous chat reply is
  // still cached in lastAssistantMsg (which would otherwise win the
  // bubble-text priority forever). Cleared by a timeout. Also used
  // for the chatLoading "thinking..." nudge so it actually displays.
  const [bubbleOverride, setBubbleOverride] = useState<string | null>(null);
  const bubbleOverrideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBubbleOverride = (text: string, ms: number) => {
    if (bubbleOverrideTimerRef.current) clearTimeout(bubbleOverrideTimerRef.current);
    setBubbleOverride(text);
    bubbleOverrideTimerRef.current = setTimeout(() => {
      setBubbleOverride(null);
      bubbleOverrideTimerRef.current = null;
    }, ms);
  };
  // P2 (guest dead-end): the mic-side "sign in to chat" beat. The dock panel
  // gates composition at the source (guest box in the panel below); this
  // covers the chibi tap-to-talk + the deferred TTS-finished open, so the
  // mic never arms into doomed 401 sends.
  const showGuestSignInGate = () => {
    triggerReaction('encouraging', GUEST_SIGNIN_LINE, 3000);
    showBubbleOverride(GUEST_SIGNIN_LINE, 3000);
  };
  // (Removed: force-on voice useEffect. It fought the auto-disable in
  // useSenpaiChat — every time TTS failures flipped voiceEnabled to
  // false, this effect would immediately set it back to true, causing
  // an infinite re-disable loop and burning round-trips on a known-bad
  // TTS endpoint. Voice now defaults true in the hook, persists 'false'
  // when auto-disabled, and the user can re-enable it in Settings once
  // TTS is healthy.)

  // Live STT — accumulate transcript in a ref AND mirror to state so the
  // speech bubble shows what you're saying as you say it.
  useSpeechRecognitionEvent('result', (event) => {
    const t = event.results?.[0]?.transcript ?? '';
    if (!t) return;
    bumpInteraction();
    transcriptRef.current = t;
    setLiveTranscript(t);
  });

  // PTT finalize — the single funnel for "the user released and wants this
  // sent". Reached from the STT 'end' handler (normal path) or the release
  // watchdog (iOS occasionally delays 'end' while finalizing). Idempotent:
  // holdReleasedRef is consumed on first entry, so end + watchdog can both
  // fire and only one send happens. A cancel never sets holdReleasedRef, so
  // this is a no-op for abandoned holds.
  const finalizeAndSend = (raw: string) => {
    if (!holdReleasedRef.current) return;
    holdReleasedRef.current = false;
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    transcriptRef.current = '';
    setLiveTranscript('');
    const t = raw.trim();
    const heldMs = Date.now() - holdStartedAtRef.current;
    if (!t) {
      // Nothing captured. A too-short press gets the how-to hint (also
      // absorbs the first-ever press that only opened the permission
      // dialog); a real hold that caught nothing gets the honest miss.
      if (heldMs < 700) {
        showBubbleOverride('hold the mic while you talk to me senpai 💕', 2500);
      } else {
        const line = randomDialogue('micMisheard');
        triggerReaction('encouraging', line, 2500);
        showBubbleOverride(line, 2500);
      }
      return;
    }
    // Task 5: a short farewell ("bye senpai", "oyasumi") signs off LOCALLY —
    // never sent to the model (zero tokens). The mic is already closed
    // (release did that); play a canon goodbye and collapse the dock.
    if (isGoodbyeIntent(t)) {
      const line = randomDialogue('micGoodbye');
      triggerReaction('cheering', line, 2500);
      showBubbleOverride(line, 2500);
      setDockOpen(false);
      return;
    }
    // Task 6: an ultra-short transcript (stray syllable / noise) isn't a
    // real message — admit the miss instead of burning a round-trip.
    if (isLikelyGarbage(t)) {
      const line = randomDialogue('micMisheard');
      triggerReaction('encouraging', line, 2500);
      showBubbleOverride(line, 2500);
      return;
    }
    setReplyDismissed(false);
    sendChat(t);
  };

  useSpeechRecognitionEvent('end', () => {
    if (pendingStopsRef.current > 0) {
      // This 'end' answers one of OUR stop() calls — consume it so a late
      // arrival can never be misattributed to a newer live session.
      pendingStopsRef.current--;
      finalizeAndSend(transcriptRef.current);
    } else if (listeningRef.current) {
      // The engine ended on its own mid-hold (session cap / audio-route
      // change) — treat it as a release so the captured speech still sends
      // instead of silently vanishing while the finger is still down.
      listeningRef.current = false;
      setListening(false);
      holdReleasedRef.current = true;
      holdActiveRef.current = false;
      finalizeAndSend(transcriptRef.current);
    }
    // Unconditionally drop whatever remains: stop() delivers a final
    // 'result' AFTER a cancel already cleared state, and liveTranscript
    // outranks nearly everything in the bubble — an abandoned transcript
    // would wedge the speech bubble indefinitely. (The send paths consumed
    // the transcript inside finalizeAndSend before this line.)
    transcriptRef.current = '';
    setLiveTranscript('');
  });

  useSpeechRecognitionEvent('error', (event) => {
    // Two error tiers now that push-to-talk owns the session lifecycle:
    //  1. Benign (aborted/no-speech): 'aborted' is a normal stop(); a
    //     'no-speech' on release still gets its 'end', where the empty
    //     transcript produces the honest miss line. Nothing to do here.
    //  2. Unrecoverable (audio-capture/service-not-allowed/language*):
    //     mic is unavailable — tear the hold down, surface an alert.
    //  Anything else: tear the hold down quietly (a scripted miss) —
    //  there is no re-arm loop anymore; the user just holds again.
    if (event?.error === 'aborted' || event?.error === 'no-speech') {
      return;
    }
    transcriptRef.current = '';
    setLiveTranscript('');
    holdActiveRef.current = false;
    holdReleasedRef.current = false;
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    listeningRef.current = false;
    setListening(false);
    const code = event?.error;
    const unrecoverable =
      code === 'audio-capture' ||
      code === 'service-not-allowed' ||
      code === 'not-allowed' ||
      code === 'language-not-supported' ||
      code === 'bad-grammar';
    if (unrecoverable) {
      console.warn('[SenpaiMascot] STT unrecoverable:', code, event?.message);
      try { ExpoSpeechRecognitionModule.stop(); pendingStopsRef.current++; } catch { /* ignore */ }
      Alert.alert(
        'Mic unavailable',
        code === 'audio-capture'
          ? 'iOS couldn\'t access the mic. On the simulator: Simulator menu → I/O → Audio Input → enable a source. On device: check Settings → Zenki Dojo → Microphone.'
          : `Speech recognition can't start (${code}). Check iOS Settings → Zenki Dojo → Speech Recognition + Microphone.`,
      );
      return;
    }
    console.warn('[SenpaiMascot] STT error:', code, event?.message);
    const line = randomDialogue('micMisheard');
    triggerReaction('encouraging', line, 2500);
    showBubbleOverride(line, 2500);
  });

  // Stop listening + audio + PTT timers when the mascot itself unmounts
  // (senpai disabled).
  useEffect(() => {
    return () => {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* ignore */ }
      stopSenpaiAudio();
      if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
      if (pressCommitTimerRef.current) clearTimeout(pressCommitTimerRef.current);
    };
  }, []);

  // Returns true once the mic is actually open, false on permission denial /
  // error. The caller (beginHold) uses this so the "mic's ON" flourish
  // only plays after the mic really started — not right before a denial alert.
  const startListening = async (): Promise<boolean> => {
    try {
      const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perms.granted) {
        Alert.alert(
          'Mic access needed',
          'Senpai needs microphone + speech-recognition permission to hear you. Enable both in iOS Settings → Zenki Dojo.',
        );
        return false;
      }
      transcriptRef.current = '';
      setLiveTranscript('');
      setListening(true);
      listeningRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        // Continuous: push-to-talk owns the session — the engine must NOT
        // self-stop on a mid-hold thinking pause. 'end' fires when the
        // release calls stop(), which is exactly the send moment. (The old
        // single-shot + silence-detection was the tap-toggle design.)
        continuous: true,
        requiresOnDeviceRecognition: false,
      });
      return true;
    } catch (e: any) {
      setListening(false);
      listeningRef.current = false;
      Alert.alert('Mic trouble', e?.message ?? 'Could not start listening.');
      return false;
    }
  };

  const stopListening = () => {
    // ABANDON path (cancel / mode switch / hide). Order matters:
    //   1. listeningRef + hold flags false FIRST — so the trailing 'end'
    //      event finds holdReleasedRef false and sends nothing.
    //   2. Drop the pending transcript so we don't accidentally send
    //      half-formed speech.
    //   3. stop() the engine — this fires 'end' but we've already armed
    //      the guards above.
    //   4. Cut TTS audio. Cancelling means "shut up too" — not keep talking.
    holdActiveRef.current = false;
    holdReleasedRef.current = false;
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    listeningRef.current = false;
    setListening(false);
    transcriptRef.current = '';
    setLiveTranscript('');
    try { ExpoSpeechRecognitionModule.stop(); pendingStopsRef.current++; } catch { /* ignore */ }
    stopTts(); // also discards a reply still mid-fetch, not just live audio
  };

  // RELEASE-SEND path — the finger lifted inside the button: close the mic
  // and send whatever was captured. iOS may keep finalizing for a beat after
  // stop(), so the actual send happens in 'end' (or the watchdog below if
  // 'end' stalls) via finalizeAndSend — never here directly.
  const finishHold = () => {
    holdActiveRef.current = false;
    if (!listeningRef.current) return;
    holdReleasedRef.current = true;
    listeningRef.current = false;
    setListening(false);
    try { ExpoSpeechRecognitionModule.stop(); pendingStopsRef.current++; } catch { /* ignore */ }
    if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current);
    finalizeTimerRef.current = setTimeout(() => {
      finalizeAndSend(transcriptRef.current);
    }, 1200);
  };

  // Most recent settled assistant message — drives the bubble text after
  // a reply lands AND triggers the after-reply mic re-arm so the
  // conversation continues hands-free until the user taps her to stop.
  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && !m.pending && !m.error) return m;
    }
    return null;
  }, [messages]);

  // A settled reply counts as conversation activity — it feeds the idle-quip
  // and dock-collapse timers so she doesn't quip / collapse right after
  // answering (the user is presumably reading).
  useEffect(() => {
    if (lastAssistantMsg) bumpInteraction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAssistantMsg?.id]);

  // (The hands-free after-reply re-arm loop is gone — push-to-talk only
  // listens while the finger is down, so there is nothing to re-arm and the
  // mic can never transcribe her own TTS.)

  // Safety net: if a chat error lands while the mic is somehow still open
  // (release raced the error), close it so the error bubble shows cleanly.
  // Guarded on listeningRef so a typed-mode send failure never touches the mic.
  useEffect(() => {
    if (chatError && listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      holdActiveRef.current = false;
      holdReleasedRef.current = false;
      try { ExpoSpeechRecognitionModule.stop(); pendingStopsRef.current++; } catch { /* ignore */ }
    }
  }, [chatError]);

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

  // One-shot expo-image cache clear when the senpai asset set changes (the
  // "black box / ghost trail" incident taught us stale caches ghost old
  // frames). TWIN RULE (senpaiMoodAssets.ts header): bump VERSION together
  // with the `_vN` in the flipbook strip filenames whenever any file under
  // src/assets/senpai/** changes bytes. History: '2' was the last shipped
  // value (commit b61357a) — never reuse ≤ '2' or already-updated installs
  // silently skip the clear.
  useEffect(() => {
    const KEY = '@senpai_asset_cache_v';
    const VERSION = '3';
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v !== VERSION) {
          Image.clearMemoryCache();
          Image.clearDiskCache();
          AsyncStorage.setItem(KEY, VERSION);
        }
      })
      .catch(() => { /* cache clear is best-effort */ });
  }, []);

  // Corner-aware effects (H5/D4): publish her true on-screen center so the
  // starburst (SenpaiOverlay) and milestone impacts (SenpaiImpactEffect)
  // erupt from HER dock corner, not a hardcoded bottom-right / screen center.
  // Same center reconstruction as nearestCorner above.
  useEffect(() => {
    publishSenpaiCorner({
      corner,
      center: {
        x: SW - (16 - basePos.x) - MASCOT_SIZE / 2,
        y: SH - (110 - basePos.y) - MASCOT_SIZE / 2,
      },
    });
  }, [corner, basePos]);

  useEffect(() => {
    AsyncStorage.getItem(POS_KEY).then((raw) => {
      const parsed = safeParseJSON<{ x: number; y: number } | null>(raw, null, (v) =>
        typeof v === 'object' && v !== null && typeof (v as { x?: unknown }).x === 'number' && typeof (v as { y?: unknown }).y === 'number',
      );
      if (parsed) {
        // Persisted spots predate corner-snapping — snap the stored position
        // to its nearest corner so she always reads as corner-docked.
        const key = nearestCorner(clampPos(parsed.x, parsed.y));
        setBasePos(CORNER_TARGETS[key]);
        setCorner(key);
      }
    });
  }, []);

  // Restore the last-used chat mode (type vs talk).
  useEffect(() => {
    (async () => {
      const m = await AsyncStorage.getItem(MODE_KEY);
      if (m === 'type' || m === 'talk') { setModeState(m); return; }
      // One-time migration off the collided key: if the legacy key holds a
      // mode value, it was ours — adopt it, move it to the new key, and hand
      // the legacy key back to SenpaiContext's enabled flag as 'true' (the
      // mascot was necessarily enabled to have written a mode there).
      const legacy = await AsyncStorage.getItem(LEGACY_MODE_KEY);
      if (legacy === 'type' || legacy === 'talk') {
        setModeState(legacy);
        AsyncStorage.setItem(MODE_KEY, legacy);
        AsyncStorage.setItem(LEGACY_MODE_KEY, 'true');
      }
    })();
  }, []);

  // Voice mode off ⇒ Talk mode ceases to exist — snap back to Type. Uses
  // setModeState directly (not setMode) so the toggle doesn't yank keyboard
  // focus; still persisted so the choice sticks. MUST tear down an active
  // hold first: voiceEnabled can flip false from OUTSIDE the dock toggle
  // (Settings switch, TTS strike-2 auto-disable) while the finger is on the
  // PTT button — unmounting the button then orphans an open mic whose
  // eventual self-end would auto-send ambient room audio (the audit-2.0.5
  // P1 hot-mic class).
  useEffect(() => {
    if (!voiceEnabled && mode === 'talk') {
      if (listeningRef.current) cancelHold(true);
      setModeState('type');
      AsyncStorage.setItem(MODE_KEY, 'type');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, mode]);

  // Restore the one-time AI disclaimer acceptance — PER ACCOUNT. Re-runs on
  // account switch (disclaimerKey embeds user.id) so a second member on the
  // same device gets their own gate instead of inheriting the first's.
  useEffect(() => {
    let cancelled = false;
    setDisclaimerOK(null); // account switched → gate unknown until read
    (async () => {
      try {
        const v = await AsyncStorage.getItem(disclaimerKey);
        if (v === 'accepted') {
          if (!cancelled) setDisclaimerOK(true);
          return;
        }
        // One-time migration: the legacy key was device-global. Credit it to
        // the CURRENT account only, then delete it — every other account on
        // this device must accept for themselves.
        const legacy = await AsyncStorage.getItem(DISCLAIMER_KEY_BASE);
        if (legacy === 'accepted') {
          await AsyncStorage.setItem(disclaimerKey, 'accepted');
          await AsyncStorage.removeItem(DISCLAIMER_KEY_BASE);
          if (!cancelled) setDisclaimerOK(true);
          return;
        }
        if (!cancelled) setDisclaimerOK(false);
      } catch {
        if (!cancelled) setDisclaimerOK(false);
      }
    })();
    return () => { cancelled = true; };
  }, [disclaimerKey]);

  // Track the keyboard so the dock can lift clear of it while typing.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
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
        // A drag has started — mark it so the trailing onPress (if any) is
        // swallowed by handleTap instead of toggling the mic. Dragging is an
        // interaction (keeps the idle/sleep timers from firing mid-gesture).
        didDragRef.current = true;
        bumpInteraction();
        // Halt any in-flight corner-snap spring and capture her TRUE current
        // position. A native-driven value's JS-side _value is stale mid-spring;
        // stopAnimation's callback delivers the real value per axis.
        pan.stopAnimation((v) => pan.setOffset(v));
        pan.setValue({ x: 0, y: 0 });
        // Reset trail to mascot origin and show dots (skipped under Reduce
        // Motion — the trail is pure decoration, D5).
        if (!reduceMotionRef.current) {
          trailPositions.forEach((p) => p.setValue({ x: 0, y: 0 }));
          trailOpacities[0].setValue(0.40);
          trailOpacities[1].setValue(0.25);
          trailOpacities[2].setValue(0.10);
        }
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
      onPanResponderRelease: (_evt, gs) => {
        pan.flattenOffset();
        const dx = (pan.x as any)._value;
        const dy = (pan.y as any)._value;
        // Where she was dropped (clamped on-screen), then snap to the nearest
        // of the 4 corners. The transform springs from the drop delta to the
        // corner; on settle we commit basePos (layout) and zero the pan so the
        // rendered spot is unchanged. Native driver so the snap never waits
        // on the JS thread mid-gesture.
        const dropped = clampPos(basePosRef.current.x + dx, basePosRef.current.y + dy);
        const key = nearestCorner(dropped);
        const target = CORNER_TARGETS[key];
        const delta = { x: target.x - basePosRef.current.x, y: target.y - basePosRef.current.y };
        // Reduce Motion: same settle contract, but a 0ms timing seats her
        // instantly instead of the springy flourish (D5).
        // friction 6 / tension 120: a touch under-damped, so she overshoots
        // the corner a hair and settles back — reads magnetic instead of the
        // old uniform damped glide (friction 7 / tension 80).
        const settle = reduceMotionRef.current
          ? Animated.timing(pan, { toValue: delta, duration: 0, useNativeDriver: true })
          : Animated.spring(pan, { toValue: delta, useNativeDriver: true, friction: 6, tension: 120 });
        settle.start(({ finished }) => {
          // If a new drag interrupted the snap, this fires with finished=false
          // — bail so we don't clobber the in-progress gesture.
          if (!finished) return;
          // Dock snap lands — a light tick sells the magnetic settle
          // (self-gated on sound prefs + Reduce Motion inside the util).
          smallTick();
          setBasePos(target);
          pan.setValue({ x: 0, y: 0 });
        });
        setCorner(key);
        AsyncStorage.setItem(POS_KEY, JSON.stringify(target));
        // Clear the drag flag on the next tick — long enough for any
        // press-release that trails this drag to fire (and be swallowed by
        // handleTap) first, so the *next* genuine tap still toggles the mic.
        setTimeout(() => { didDragRef.current = false; }, 60);
        // Fade trail out — a faster fling leaves the trail lingering a touch
        // longer (velocity is free on the gesture state), so the fade reads
        // as momentum rather than a fixed switch-off. vx/vy are px/ms;
        // clamped so a wild fling can't stretch the fade past ~400ms.
        const flingSpeed = Math.min(3, Math.hypot(gs.vx, gs.vy));
        Animated.parallel(
          trailOpacities.map((o) => Animated.timing(o, { toValue: 0, duration: 160 + flingSpeed * 80, useNativeDriver: true })),
        ).start();
      },
    }),
  ).current;

  // Idle timer
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    if (!state.enabled) return;

    // Arm while she's IDLE. (The old condition was inverted — it armed only
    // while a reaction was displaying, and every reaction auto-clears to
    // 'idle' within ≤8s, which re-ran this effect and its cleanup killed the
    // timer; the new run then armed nothing. The whole quip → sleep pipeline
    // was dead code.) The 45s quip keeps mood at 'idle', so this effect does
    // NOT re-run and the chained sleep timer survives; any real reaction
    // flips mood → cleanup cancels both; the auto-clear back to 'idle'
    // re-arms. Timers re-check lastInteractionAtRef when they fire so she
    // never quips or dozes off mid-conversation — they just re-arm for the
    // remainder of the quiet window.
    if (state.mascotMood !== 'idle') return;

    const armIdleQuip = (waitMs: number) => {
      idleTimerRef.current = setTimeout(() => {
        const sinceTouch = Date.now() - lastInteractionAtRef.current;
        if (listeningRef.current || sinceTouch < IDLE_QUIP_MS) {
          armIdleQuip(Math.max(IDLE_QUIP_MS - sinceTouch, 5000));
          return;
        }
        triggerReaction('idle', randomDialogue('idle'), 5000);
        sleepTimerRef.current = setTimeout(() => {
          const sinceQuip = Date.now() - lastInteractionAtRef.current;
          if (listeningRef.current || sinceQuip < SLEEP_AFTER_QUIP_MS) {
            // Interacted after the quip without a mood change (e.g. typing)
            // — restart the whole idle cycle instead of dozing off on them.
            armIdleQuip(IDLE_QUIP_MS);
            return;
          }
          // Infinity = terminal reaction (no auto-clear) — she stays asleep
          // until the next interaction wakes her.
          triggerReaction('sleeping', 'zzz...', Infinity);
        }, SLEEP_AFTER_QUIP_MS);
      }, waitMs);
    };
    armIdleQuip(IDLE_QUIP_MS);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    };
  }, [state.mascotMood, state.enabled]);

  // Breathing — a slow sine breath layered OVER the flipbook. (Replaces the
  // old secondary translateY bounce: its `FLIPBOOK_ASSETS[mood]` gate skipped
  // the loop whenever a strip existed — which is EVERY mood since all strips
  // shipped — so the whole block was dead code feeding a constant 0 into the
  // container transform. The gate is gone rather than repurposed: breathing
  // is designed to COMPOSE with the strip — the strip animates the pose, this
  // scales the body volume — so there is nothing left to gate on.)
  // Awake: subtle chest rise + a whisper of sway. Asleep: slower, deeper,
  // uniform belly breath (the sleep treatment also adds drifting z glyphs —
  // see zAnims below). Rests at 0 under Reduce Motion (D5) — the static PNG
  // then sits perfectly still.
  const breath = useRef(new Animated.Value(0)).current;
  const isAsleep = state.mascotMood === 'sleeping';
  useEffect(() => {
    if (!state.enabled || reduceMotion) {
      breath.stopAnimation();
      breath.setValue(0);
      return;
    }
    // Awake: ~3.5s full period. Asleep: 0.25Hz (4s) — the deep-sleep tempo.
    const half = isAsleep ? 2000 : 1750;
    // Eased sine halves — smooth easing only, per the 120Hz note in
    // SenpaiFlipbook's header (timing pre-samples easing at 60Hz and the
    // native driver lerps between samples, so stepped easings judder).
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state.enabled, isAsleep, reduceMotion, breath]);
  // The tilt maps 0 (rest) → 0deg at BOTH ends of the cycle so stopping the
  // loop never leaves her tilted — the -0.5° ↔ +0.5° swing lives mid-cycle
  // inside the interpolate node (curve shaping in interpolate, not in the
  // timing's easing — the SenpaiFlipbook 120Hz precedent).
  const breathScaleY = breath.interpolate({ inputRange: [0, 1], outputRange: isAsleep ? [1, 1.03] : [1, 1.015] });
  const breathScaleX = breath.interpolate({ inputRange: [0, 1], outputRange: isAsleep ? [1, 1.03] : [1, 1] });
  const breathTilt = breath.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: isAsleep ? ['0deg', '0deg', '0deg', '0deg'] : ['0deg', '-0.5deg', '0.5deg', '0deg'],
  });

  // Sleeping "z" drift — 2-3 typographic z's float up from her head, easing
  // out as they fade, on a staggered loop. Animated.Text is deliberate: the
  // z's ARE typography, not art assets. The stagger delay sits INSIDE each
  // loop so the three periods differ (2200 + 700i ms) and the glyphs slowly
  // de-sync — organic drift instead of a marching column. Replaces the old
  // flat 0.85-opacity dim, which read as a rendering bug, not sleep.
  // Reduce Motion: no drift — the static sleeping art alone carries it (D5).
  const zAnims = useRef(Array.from({ length: 3 }, () => new Animated.Value(0))).current;
  useEffect(() => {
    if (!state.enabled || !isAsleep || reduceMotion) {
      zAnims.forEach((a) => { a.stopAnimation(); a.setValue(0); });
      return;
    }
    const loops = zAnims.map((a, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(700 * i),
          Animated.timing(a, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [state.enabled, isAsleep, reduceMotion, zAnims]);

  // ─── Reaction choreography (milestone beats) ─────────────────────────────
  // Milestone reactions play a tiny runReactionScript() instead of
  // everything-at-once soup:
  //   t=0      anticipation squash on the CURRENT pose (150ms)
  //   t=150ms  pose swap + squash releases with an overshoot stretch
  //            (SenpaiOverlay delays its starburst to this same beat)
  //   t=300ms  speech bubble pops in (bubbleHold releases)
  //   t=550ms  ambient rain — hearts/kaomoji/confetti (delayed in the overlay)
  // Milestone detection coordinates with D2's source tiers: only
  // source==='milestone' reactions set sparkleActive (SenpaiContext), and it
  // lands in the SAME commit as the mood change this effect keys on — so
  // sparkleActive-at-commit ≙ "this reaction is a milestone". Chat mirrors and
  // ambient quips swap instantly, exactly as before. displayMood is what the
  // <Image> renders — it lags state.mascotMood by one beat only during a
  // milestone script.
  const [displayMood, setDisplayMood] = useState<MascotMood>(state.mascotMood);
  const [bubbleHold, setBubbleHold] = useState(false);
  const squashAnim = useRef(new Animated.Value(0)).current;
  const scriptTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearReactionScript = () => {
    scriptTimersRef.current.forEach(clearTimeout);
    scriptTimersRef.current = [];
  };

  useEffect(() => {
    const mood = state.mascotMood;
    clearReactionScript();
    // Reduce Motion: milestones swap instantly — no anticipation squash,
    // no delayed bubble (D5). The bubble + pose still land.
    const milestone = state.sparkleActive && !reduceMotion;
    if (!milestone) {
      // Instant swap — reset any half-played script.
      squashAnim.stopAnimation();
      squashAnim.setValue(0);
      setBubbleHold(false);
      setDisplayMood(mood);
      return;
    }
    // Beat 1: squash down on the current pose (anticipation).
    setBubbleHold(true);
    squashAnim.setValue(0);
    Animated.timing(squashAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    // Beat 2: swap the pose; release the squash with a springy overshoot
    // (the interpolation extrapolates past 0, so it reads as a stretch-pop).
    scriptTimersRef.current.push(setTimeout(() => {
      setDisplayMood(mood);
      Animated.spring(squashAnim, { toValue: 0, friction: 4, tension: 160, useNativeDriver: true }).start();
    }, 150));
    // Beat 3: let the bubble pop in.
    scriptTimersRef.current.push(setTimeout(() => setBubbleHold(false), 300));
    return clearReactionScript;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.mascotMood, reduceMotion]);

  const squashScaleX = squashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const squashScaleY = squashAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });
  const squashSink = squashAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

  // D7(b): talk head-bob — while TTS audio plays, a small translateY bob plus
  // a head tilt on an IRREGULAR four-beat rhythm (four timings, four
  // durations) so she reads as *talking*, not inflating (the old uniform
  // 1↔1.03 scale pulse read as a balloon). Rests under Reduce Motion.
  const talkAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ttsPlaying || reduceMotion) {
      talkAnim.stopAnimation();
      Animated.timing(talkAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    // Uneven beats — the 1040ms loop period deliberately avoids dividing
    // into the flipbook's 12fps cadence so the bob never locks step with it.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(talkAnim, { toValue: 1, duration: 190, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(talkAnim, { toValue: 0.3, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(talkAnim, { toValue: 0.8, duration: 170, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(talkAnim, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [ttsPlaying, reduceMotion, talkAnim]);
  const talkBobY = talkAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  // Same rest-at-neutral trick as breathTilt: 0deg at both ends so the
  // 150ms settle-to-0 after TTS never parks her tilted.
  const talkTilt = talkAnim.interpolate({
    inputRange: [0, 0.35, 0.8, 1],
    outputRange: ['0deg', '-1.5deg', '1.5deg', '0deg'],
  });

  // H5 wake-up arc: sleeping → tap → stretch/wave beat → greeting, instead of
  // an instant pose cut. artOverride swaps the ART only (mood machinery is
  // untouched — the cheering greet fires on the second beat). Guarded so a
  // double-tap during the arc doesn't stack timers.
  const [artOverride, setArtOverride] = useState<string | null>(null);
  const wakeArcTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playWakeArc = () => {
    if (wakeArcTimerRef.current) return; // arc already mid-play
    if (reduceMotionRef.current) {
      // Reduce Motion: no beat theater — straight to the greeting.
      triggerReaction('cheering', randomDialogue('wake'), 2500);
      return;
    }
    setArtOverride('wave');
    showBubbleOverride('*yawn* ...mm? ✨', 900);
    wakeArcTimerRef.current = setTimeout(() => {
      wakeArcTimerRef.current = null;
      setArtOverride(null);
      triggerReaction('cheering', randomDialogue('wake'), 2500);
    }, 900);
  };
  useEffect(() => {
    return () => { if (wakeArcTimerRef.current) clearTimeout(wakeArcTimerRef.current); };
  }, []);

  // Dock entrance/exit (D8): the panel scales/fades in from her side instead
  // of popping, and plays a quick fade-out before unmounting. dockRendered
  // keeps it mounted through the exit beat; Reduce Motion snaps both ways.
  const dockAnim = useRef(new Animated.Value(0)).current;
  const [dockRendered, setDockRendered] = useState(false);
  useEffect(() => {
    if (dockOpen) {
      setDockRendered(true);
      if (reduceMotion) { dockAnim.setValue(1); return; }
      Animated.spring(dockAnim, { toValue: 1, friction: 8, tension: 140, useNativeDriver: true }).start();
      return;
    }
    if (reduceMotion) { dockAnim.setValue(0); setDockRendered(false); return; }
    Animated.timing(dockAnim, { toValue: 0, duration: 140, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setDockRendered(false);
    });
  }, [dockOpen, reduceMotion, dockAnim]);

  // Tap-to-toggle mic. One clear tap on the chibi:
  //   - Tap while idle      → mic ON  (charge ring flash + boot explosion)
  //   - Tap while listening → mic OFF (discharge ring flash + shutdown)
  // Replaces the old press-and-hold (2s on / 3s off) — friendlier and
  // discoverable. A reposition drag never toggles: didDragRef (set when the
  // PanResponder grants a drag) makes the trailing onPress a no-op.
  const chargeAnim = useRef(new Animated.Value(0)).current;
  const explosionAnim = useRef(new Animated.Value(0)).current;
  // Discharge ring — mirrors the charge ring but in the orange shutdown
  // palette. Flashes on tap-to-stop so the user reads it as a distinct
  // "powering down", not a second boot-up.
  const dischargeAnim = useRef(new Animated.Value(0)).current;
  // Shutdown burst — the inverse of explosion. Same ring + 8 sparkles,
  // but the ring shrinks (2.6 → 1) and sparkles collapse from a radius
  // back to center. Plays on tap-to-stop.
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
  // Set true when a reposition drag is granted by the PanResponder; makes
  // the press-release that trails a drag a no-op so dragging the chibi
  // never opens or closes the mic. Reset shortly after the drag ends.
  const didDragRef = useRef(false);

  // setMode — flip the in-place surface between the text box and voice.
  // Entering 'type' closes the mic (if open) and focuses the box; entering
  // 'talk' drops keyboard focus. Persisted so it sticks across launches.
  const setMode = (m: 'type' | 'talk') => {
    bumpInteraction();
    setReplyDismissed(false);
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m);
    if (m === 'type') {
      if (listeningRef.current) cancelHold(true);
      setTimeout(() => inputRef.current?.focus(), 120);
    } else {
      inputRef.current?.blur();
    }
  };

  // submitType — send the typed message; her reply lands in the bubble.
  const submitType = () => {
    const t = draft.trim();
    if (!t || chatLoading || disclaimerOK !== true) return;
    bumpInteraction();
    setReplyDismissed(false); // a new send un-dismisses so the fresh reply shows
    clearChatError();
    setDraft('');
    sendChat(t);
  };

  // Accept the one-time AI disclaimer, unlocking chat (for THIS account).
  const acceptDisclaimer = () => {
    bumpInteraction();
    setDisclaimerOK(true);
    AsyncStorage.setItem(disclaimerKey, 'accepted');
    if (mode === 'type') setTimeout(() => inputRef.current?.focus(), 120);
  };

  // Clear the conversation — the only user-facing reset, mirroring the old
  // full-screen chat's trash button (history persists across launches).
  const confirmClear = () => {
    Alert.alert('Clear chat?', "this wipes our conversation — I'll still remember YOU, just not what we said 💕", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => { clearChatError(); setReplyDismissed(false); clearChat(); } },
    ]);
  };

  const handleTap = () => {
    // A reposition drag ends with a press-release that also fires onPress —
    // swallow that one so dragging the chibi never toggles the mic.
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    bumpInteraction();
    // Collapsed → the first tap just summons the dock ("a character who
    // comes when called"). Works pre-disclaimer too — the dock opens on the
    // disclaimer card. If she's asleep, the tap also wakes her.
    if (!dockOpen) {
      smallTick(); // dock summon — subtle ack (self-gated in the util)
      if (state.mascotMood === 'sleeping') {
        // Wake-up arc (H5): stretch/wave beat, then the 'wake' greeting —
        // this tap only summons the dock; the mic opens only while the
        // hold-to-talk button is held (beginHold).
        playWakeArc();
      }
      setDockOpen(true);
      return;
    }
    // Until the one-time AI disclaimer is accepted, the chibi does nothing
    // more (the disclaimer occupies the dock panel).
    if (disclaimerOK !== true) return;
    // In type mode the chibi isn't a mic — tapping her dismisses a held
    // reply bubble (if any), wakes her if asleep, and pops the keyboard on
    // the inline text box.
    if (mode === 'type') {
      if (state.mascotMood === 'sleeping') {
        // Wake-up arc (H5) — Type mode never opens the mic, so no "mic's ON" copy.
        playWakeArc();
      }
      setReplyDismissed(true);
      inputRef.current?.focus();
      return;
    }
    // Talk mode: the chibi is no longer a mic toggle — push-to-talk lives on
    // the dock's hold-to-talk button. A tap while she's speaking cuts her
    // off; while the finger is on the PTT button a stray chibi tap is a no-op.
    if (listening) return;
    if (ttsPlaying) {
      stopTts(); // covers the fetch window too, not just live playback
      showBubbleOverride("okay okay, I'll stop 💕", 1500);
      return;
    }
    // A reply is still in flight — acknowledge the tap so the user knows it
    // registered; the AbortController in sendSenpaiChat clears chatLoading
    // within 35s if the network hangs, and the reply still fills the bubble.
    if (chatLoading) {
      const msg = 'thinking... be patient senpai 💕';
      triggerReaction('encouraging', msg, 1500);
      showBubbleOverride(msg, 1500);
      return;
    }
    if (state.mascotMood === 'sleeping') playWakeArc();
    setReplyDismissed(true);
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

  // PRESS-IN — open the mic while the finger is down. Push-to-talk means
  // pressing while she's mid-reply is a barge-in: cut her TTS and listen.
  // The flourish (charge ring + explosion) only plays after the mic really
  // started — not right before a permission-denial alert.
  const beginHold = () => {
    // P2 (guest dead-end): no Firebase user → the mic would only ever
    // transcribe speech into 401s. Never open it for a guest.
    if (!user) {
      showGuestSignInGate();
      return;
    }
    if (chatLoading) return;               // thinking — button is disabled anyway
    if (listeningRef.current) return;      // double press-in guard
    // Boot the TTS container now, while the user talks — it's the last hop
    // of the turn and otherwise cold-starts on the critical path.
    prewarmSpeakFunction();
    if (holdReleasedRef.current) {
      // The PREVIOUS release is still finalizing ('end' hasn't landed).
      // Flush it right now so it can't be orphaned by this press resetting
      // the hold flags, and let this press bounce off the thinking state —
      // finalizeAndSend clears the watchdog and fires the send immediately.
      finalizeAndSend(transcriptRef.current);
      return;
    }
    bumpInteraction();
    // Clear any prior chat error so a new hold also escapes a stale error
    // bubble (the other escape is the 8s auto-dismiss inside useSenpaiChat).
    clearChatError();
    holdActiveRef.current = true;
    holdReleasedRef.current = false;
    holdStartedAtRef.current = Date.now();
    const bargedIn = ttsPlaying;
    // stopTts (not stopSenpaiAudio): ttsPlaying flips true BEFORE the TTS
    // fetch, so "playing" may really be "fetching" — only the generation
    // bump inside stopTts stops a reply whose audio hasn't arrived yet.
    if (bargedIn) stopTts();
    const doStart = () => {
      if (!holdActiveRef.current) return;  // released before the engine opened
      startListening()
        .then((started) => {
          if (!started) {
            holdActiveRef.current = false;
            return;
          }
          if (!holdActiveRef.current) {
            // Finger already lifted while the engine was starting (a quick
            // tap, or the first-ever press that only raised the permission
            // dialog). Close the mic and teach the gesture.
            listeningRef.current = false;
            setListening(false);
            try { ExpoSpeechRecognitionModule.stop(); pendingStopsRef.current++; } catch { /* ignore */ }
            showBubbleOverride('hold the mic while you talk to me senpai 💕', 2200);
            return;
          }
          smallTick(); // mic really opened — tactile ack
          if (!reduceMotionRef.current) {
            // Boot flourish is decoration — skipped under Reduce Motion (D5).
            chargeAnim.setValue(1);
            Animated.timing(chargeAnim, { toValue: 0, duration: 350, useNativeDriver: true }).start();
            fireExplosion();
          }
        })
        .catch((err) => {
          holdActiveRef.current = false;
          console.warn('[SenpaiMascot] startListening threw:', err);
        });
    };
    // After a barge-in the iOS audio session needs a beat to leave Playback
    // before STT can claim PlayAndRecord (see ensureAudioMode in senpaiAudio).
    if (bargedIn) setTimeout(doStart, 150);
    else doStart();
  };

  // CANCEL — the finger slid off the button (or a mode switch / hide closed
  // the mic mid-hold). Discharge flourish, drop the transcript, send nothing.
  const cancelHold = (silent = false) => {
    const wasListening = listeningRef.current;
    stopListening();
    if (!wasListening) return;
    smallTick(); // mic closing — tactile ack (mirrors the open tick)
    if (!reduceMotionRef.current) {
      // Snap discharge ring to full then fade — visual symmetry with the open.
      dischargeAnim.setValue(1);
      Animated.timing(dischargeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start();
      fireShutdown();
    }
    clearChatError();
    if (!silent) showBubbleOverride('cancelled — say it again whenever 💕', 2000);
  };

  // Pulsing glow whenever the mic is open. Loops until listening flips off.
  // The glow only ever drove opacity + scale, so nothing stops it running on
  // the native driver — the old useNativeDriver:false here was the same
  // JS-thread jank class as the border-animated rings (both fixed together).
  useEffect(() => {
    if (!listening) {
      glowAnim.stopAnimation();
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (reduceMotion) {
      // Reduce Motion: the glow is FUNCTIONAL (mic-open indicator), so keep
      // it visible — just steady instead of pulsing (D5).
      glowAnim.stopAnimation();
      glowAnim.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.35,
          duration: 950,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, glowAnim, reduceMotion]);

  // Auto-collapse the dock back to chibi-only after DOCK_IDLE_MS of quiet.
  // Deferred entirely (no timer armed) while the user is mid-something: mic
  // open, reply in flight, keyboard up, or an unsent draft in the box. The
  // timer re-checks lastInteractionAtRef when it fires and re-arms for the
  // remainder if the user touched anything since arming. Collapsing also
  // dismisses a held typed reply, so the bubble doesn't outlive the dock.
  useEffect(() => {
    if (!dockOpen) return;
    if (listening || chatLoading || ttsPlaying || kbHeight > 0 || draft.trim().length > 0) return;
    const armCollapse = (waitMs: number) => {
      dockCollapseTimerRef.current = setTimeout(() => {
        const sinceTouch = Date.now() - lastInteractionAtRef.current;
        if (sinceTouch < DOCK_IDLE_MS) {
          armCollapse(DOCK_IDLE_MS - sinceTouch);
          return;
        }
        setDockOpen(false);
        setReplyDismissed(true);
      }, waitMs);
    };
    armCollapse(DOCK_IDLE_MS);
    return () => {
      if (dockCollapseTimerRef.current) clearTimeout(dockCollapseTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockOpen, mode, listening, chatLoading, ttsPlaying, kbHeight, draft, lastAssistantMsg?.id, disclaimerOK]);

  if (hidden) return null;

  // (The old flat 0.85 sleep dim is gone — sleep now reads through the deep
  // breath + drifting z glyphs instead of a translucency that looked like a
  // rendering bug. Under Reduce Motion the static sleeping art carries it.)
  // Art selection: wake-arc override > think pose while a reply is in flight
  // (D7) > the scripted displayMood. displayMood (not mascotMood) lags one
  // beat behind during a milestone reaction script so the anticipation squash
  // plays on the OUTGOING pose; identical to mascotMood at all other times.
  // The asset maps use string keys, so 'think'/'wave' work without widening
  // MascotMood.
  const artKey = artOverride ?? (chatLoading ? 'think' : displayMood);

  // Which corner she's docked to → which side the chat dock opens from.
  const isTop = corner[0] === 't';
  const isLeft = corner[1] === 'l';
  // Lift the dock clear of the keyboard when typing at a BOTTOM corner (top
  // corners open downward and are already clear). Lift = how far the keyboard
  // top rises above the dock's bottom edge, plus a small margin.
  const dockBottomFromScreen = (110 - basePos.y) + MASCOT_SIZE + 6;
  const dockLift =
    mode === 'type' && !isTop && kbHeight > 0
      ? Math.max(0, kbHeight - dockBottomFromScreen + 12)
      : 0;

  // Bubble text priority: tap/loading override → live transcript → loading
  // dots → typed error → (milestone beat hold) → active reaction → held typed
  // reply → listening reply/greeting → auto reaction.
  const bubbleText = (() => {
    const errText = chatError
      ? chatError.code === 'no_auth'
        // P2 (guest dead-end): "expired" is a lie for someone who never
        // signed in, and reopening the app can't fix it — point guests at
        // the real remedy. Signed-in members keep the relaunch copy (their
        // token really did lapse and a fresh launch re-mints it).
        ? user
          ? 'sign in expired senpai — open the app fresh 💕'
          : GUEST_SIGNIN_LINE
        : chatError.code === 'no_network'
        ? chatError.message + ' 💕'
        : chatError.code === 'rate_limit'
        ? chatError.message + ' 💕'
        : chatError.code === 'server_error'
        ? `server hiccup (${chatError.message}) — try again 💕`
        : chatError.code === 'parse_error'
        ? `bad reply (${chatError.message}) — try again 💕`
        : `something broke: ${chatError.message} 💕`
      : null;
    // An ACTIVE reaction (reactionExpiry in the future) outranks the last chat
    // reply — otherwise lastAssistantMsg (never-expiring, persisted) permanently
    // shadows the reaction engine in the bubble (the audit's Root-Cause-A freeze).
    // Below the reaction branch, the last SETTLED reply may hold the bubble in
    // Type mode — but only a reply that arrived THIS session (id === lastArrivedId,
    // never rehydrated history) and only until dismissed (tap / dock collapse) —
    // so typed answers stop vanishing after the 4s reaction mirror with no
    // re-read surface anywhere. The reaction branch still outranks it, so the
    // old bubble-priority freeze cannot return.
    const reactionActive = !!state.lastReaction && state.reactionExpiry > Date.now();
    return bubbleOverride
      ? bubbleOverride
      : liveTranscript
      ? liveTranscript
      : chatLoading
      ? '...'
      : errText
      ? errText
      : bubbleHold
      ? null // milestone script beat 1–2: bubble pops in at beat 3
      : reactionActive
      ? state.lastReaction
      : mode === 'type' && !replyDismissed && lastAssistantMsg && lastAssistantMsg.id === lastArrivedId
      ? lastAssistantMsg.content
      : listening
      ? 'listening… release to send 💕'
      : state.lastReaction;
  })();

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
            ],
          },
        ]}
      >
        {/* Draggable cluster — the PanResponder lives on THIS wrapper, which
            holds ONLY the chibi + her effects. The chat dock (a sibling below)
            is therefore never in this responder's negotiation, so its TextInput
            and buttons can't be hijacked into a reposition drag (a draggy tap
            on a child reports child-relative locationX/Y, which previously
            fell inside the mascot bounds check). mascotHit is the hit box. */}
        <View style={styles.mascotHit} {...panResponder.panHandlers}>
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

        {/* Reply / live-transcript bubble now renders inside the chat dock below. */}

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

        {/* Charge ring — flashes pink → gold on tap-to-start, then fades.
            A quick boot flourish (no more multi-second charge-up).
            TWO pre-styled border skins cross-faded by opacity: as chargeAnim
            decays 1 → 0 the gold peak layer drops out first and the pink
            pass shows through — the same brighten-then-cool color story the
            old borderColor interpolation told, but every animated property
            is now transform/opacity, so the flash runs on the native driver
            (animating border props forced useNativeDriver:false and janked
            the JS thread — the class of thing this rebuild removes). */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            styles.chargeRingPink,
            {
              opacity: chargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.8, 0],
              }),
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
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            styles.chargeRingGold,
            {
              opacity: chargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.35, 1],
              }),
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

        {/* Discharge ring — flashes orange → deep red on tap-to-stop so the
            user reads it as a distinct "powering down", not a second
            start-up. Same geometry + dual-skin scheme as the charge ring
            (native-driven opacity/scale only), separate Animated.Value so
            they can coexist without state conflicts. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            styles.dischargeRingOrange,
            {
              opacity: dischargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.8, 0],
              }),
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
        <Animated.View
          pointerEvents="none"
          style={[
            styles.chargeRing,
            styles.dischargeRingRed,
            {
              opacity: dischargeAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.35, 1],
              }),
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

        {/* Sleeping z's — drift up from her head and fade (zAnims effect has
            the stagger rationale). Hidden during the wake arc (artOverride)
            and under Reduce Motion, matching the old sleep-dim guards. */}
        {isAsleep && !artOverride && !reduceMotion && zAnims.map((a, i) => (
          <Animated.Text
            key={`sleep-z-${i}`}
            pointerEvents="none"
            style={[
              styles.sleepZ,
              {
                // Fan the spawn points + sizes so the three z's read as a
                // trail (big near her head, small drifting away).
                right: 26 + i * 11,
                fontSize: 17 - i * 3,
                // Invisible at BOTH ends of the cycle, so the in-loop stagger
                // delay (value parked at 1) never shows a frozen glyph.
                opacity: a.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.9, 0.5, 0] }),
                transform: [
                  { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [0, -34] }) },
                  // Alternate the sideways drift so they don't stack rank.
                  { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [0, i % 2 === 0 ? 8 : -6] }) },
                  { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.15] }) },
                ],
              },
            ]}
          >
            z
          </Animated.Text>
        ))}

        {/* Animated mascot — gestures:
              - Tap (idle):        mic ON  (charge ring flash + boot explosion)
              - Tap (listening):   mic OFF (discharge ring flash + shutdown)
              - Tap (chatLoading): "thinking…" feedback (mic stays closed)
            A reposition drag is owned by the PanResponder and never toggles
            the mic — didDragRef swallows the press that trails a drag. */}
        <Pressable
          onPress={handleTap}
          onLongPress={() => setShowClose((v) => !v)}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={
            !dockOpen
              ? 'Open Senpai chat'
              : mode === 'type' ? 'Type to Senpai' : listening ? 'Stop talking to Senpai' : 'Talk to Senpai'
          }
          accessibilityHint={
            !dockOpen
              ? 'Opens the chat controls. Long-press to show a dismiss button.'
              : mode === 'type'
              ? 'Opens the keyboard. Long-press to show a dismiss button.'
              : listening
              ? 'Turns the microphone off. Long-press to show a dismiss button.'
              : 'Opens the microphone and starts listening. Long-press to show a dismiss button.'
          }
          hitSlop={8}
        >
          {/* Squash-and-stretch wrapper — the milestone reaction script
              (squashAnim rests at 0 otherwise), the always-on breath, and the
              D7 talk head-bob all compose here. Repeated transform keys are
              legal in RN — each entry is its own matrix op, multiplied in
              order — so the squash scaleY and breath scaleY stack cleanly.
              MascotArt below renders the flipbook strip (or the static PNG
              under Reduce Motion / missing strip) in the exact same
              MASCOT_SIZE box, so swaps never re-layout the dock, bubble, or
              hit boxes. */}
          <Animated.View
            style={{
              transform: [
                { translateY: squashSink },
                { scaleX: squashScaleX },
                { scaleY: squashScaleY },
                { rotate: breathTilt },
                { scaleX: breathScaleX },
                { scaleY: breathScaleY },
                { translateY: talkBobY },
                { rotate: talkTilt },
              ],
            }}
          >
            <MascotArt
              artKey={artKey}
              // D6: cross-fade mood swaps — EXCEPT mid-milestone-script, where
              // the hard pose-pop on the squash release is the comic beat.
              crossfade={!reduceMotion && !bubbleHold}
              reduceMotion={reduceMotion}
            />
          </Animated.View>
        </Pressable>
        </View>

        {/* In-place chat dock — anchored to her current corner, expands
            inward. Holds her reply bubble + the Type/Talk switch and (in
            Type mode) the inline text box. Replaces the old pills AND the
            full-screen chat page — nothing here opens a new screen.
            The PANEL is collapsed by default (chibi-only): tap her to summon
            it; it auto-collapses after DOCK_IDLE_MS of quiet. The reaction
            BUBBLE renders regardless, so quips/milestones still surface.
            box-none so empty space never blocks a drag on the mascot. */}
        <View
          pointerEvents="box-none"
          style={[
            styles.dock,
            isTop ? { top: MASCOT_SIZE + 6 } : { bottom: MASCOT_SIZE + 6 },
            isLeft ? { left: -10, alignItems: 'flex-start' } : { right: -10, alignItems: 'flex-end' },
            { transform: [{ translateY: -dockLift }] },
          ]}
        >
          {(() => {
            const bubbleEl = bubbleText ? <SpeechBubble key="bubble" text={bubbleText} /> : null;
            // dockRendered (not dockOpen) keeps the panel mounted through the
            // 140ms exit fade (D8); pointerEvents drop the moment it starts
            // closing so a mid-fade tap can't hit a dying control.
            const panelEl = !dockRendered ? null : (
              <Animated.View
                key="panel"
                pointerEvents={dockOpen ? 'auto' : 'none'}
                style={[
                  styles.dockPanel,
                  {
                    opacity: dockAnim,
                    transform: [
                      { translateY: dockAnim.interpolate({ inputRange: [0, 1], outputRange: [isTop ? -8 : 8, 0] }) },
                      { scale: dockAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                    ],
                  },
                ]}
              >
                {!user ? (
                  // P2 (guest dead-end): signed-out guests have no Firebase
                  // token, so every send 401s (the old "sign in expired —
                  // open the app fresh" copy could never recover). Gate BOTH
                  // input paths at the source — no text box, no mic button —
                  // with the honest sign-in line. Deliberately a dock-panel
                  // state (like the disclaimer) rather than a check inside
                  // submitType: any message that IS ever composed must still
                  // flow through sendChat's local crisis short-circuit.
                  <View style={styles.disclaimerBox}>
                    <Text style={styles.disclaimerText}>{GUEST_SIGNIN_LINE}</Text>
                  </View>
                ) : disclaimerOK === null ? null : !disclaimerOK ? (
                  // One-time AI safety disclaimer — must accept before chatting.
                  <View style={styles.disclaimerBox}>
                    <Text style={styles.disclaimerText}>
                      senpai's a chibi mascot powered by AI — not a doctor, therapist, or dietitian.
                      for medical, dietary, or mental-health advice, please talk to a real professional 💕
                    </Text>
                    <Pressable
                      onPress={acceptDisclaimer}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Acknowledge that Senpai is an AI, not a professional"
                      style={styles.disclaimerBtn}
                    >
                      <Text style={styles.disclaimerBtnText}>got it 💕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {/* Type ⟷ Talk switch + voice on/off + clear */}
                    <View style={styles.switchRow}>
                      <View style={styles.segWrap}>
                        <Pressable
                          onPress={() => setMode('type')}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel="Type to Senpai"
                          style={[styles.segBtn, mode === 'type' && styles.segBtnActive]}
                        >
                          <Text style={[styles.segText, mode === 'type' && styles.segTextActive]}>⌨ Type</Text>
                        </Pressable>
                        {voiceEnabled && (
                          <Pressable
                            onPress={() => setMode('talk')}
                            hitSlop={4}
                            accessibilityRole="button"
                            accessibilityLabel="Talk to Senpai"
                            style={[styles.segBtn, mode === 'talk' && styles.segBtnActive]}
                          >
                            <Text style={[styles.segText, mode === 'talk' && styles.segTextActive]}>🎤 Talk</Text>
                          </Pressable>
                        )}
                      </View>
                      {/* Voice mode on/off — her ears AND her voice. Off hides
                          Talk mode entirely and mutes TTS (same persisted flag
                          as the Settings "Senpai Voice" switch). */}
                      <Pressable
                        onPress={() => {
                          bumpInteraction();
                          if (listeningRef.current) cancelHold(true);
                          setVoiceEnabled(!voiceEnabled);
                        }}
                        hitSlop={6}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: voiceEnabled }}
                        accessibilityLabel="Senpai voice mode"
                        style={styles.clearBtn}
                      >
                        <Text style={styles.clearBtnText}>{voiceEnabled ? '🔊' : '🔇'}</Text>
                      </Pressable>
                      <Pressable
                        onPress={confirmClear}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Clear conversation"
                        style={styles.clearBtn}
                      >
                        <Text style={styles.clearBtnText}>🗑</Text>
                      </Pressable>
                    </View>
                    {mode === 'type' ? (
                      <View style={styles.inputRow}>
                        <TextInput
                          ref={inputRef}
                          value={draft}
                          onChangeText={(t) => { bumpInteraction(); setDraft(t); }}
                          onSubmitEditing={submitType}
                          placeholder="type to senpai…"
                          placeholderTextColor="rgba(255,255,255,0.5)"
                          returnKeyType="send"
                          blurOnSubmit={false}
                          editable={!chatLoading}
                          style={styles.input}
                        />
                        <Pressable
                          onPress={submitType}
                          disabled={chatLoading || !draft.trim()}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel="Send message"
                          style={[styles.sendBtn, (chatLoading || !draft.trim()) && { opacity: 0.4 }]}
                        >
                          <Text style={styles.sendBtnText}>➤</Text>
                        </Pressable>
                      </View>
                    ) : (
                      /* Push-to-talk, Siri-style: press-in opens the mic,
                         release-inside sends, slide-off cancels. RN fires
                         pressIn → pressOut → press(only if released inside),
                         so a short timer after pressOut with no press means
                         the finger slid off the button. */
                      <Pressable
                        onPressIn={() => {
                          // Finger jitter across the button edge re-fires
                          // pressIn while the slide-off cancel timer is armed
                          // — clear it or the hold dies 80ms later with the
                          // finger still down.
                          if (pressCommitTimerRef.current) {
                            clearTimeout(pressCommitTimerRef.current);
                            pressCommitTimerRef.current = null;
                          }
                          bumpInteraction();
                          beginHold();
                        }}
                        onPress={() => {
                          if (pressCommitTimerRef.current) {
                            clearTimeout(pressCommitTimerRef.current);
                            pressCommitTimerRef.current = null;
                          }
                          finishHold();
                        }}
                        onPressOut={() => {
                          if (pressCommitTimerRef.current) clearTimeout(pressCommitTimerRef.current);
                          pressCommitTimerRef.current = setTimeout(() => {
                            pressCommitTimerRef.current = null;
                            cancelHold();
                          }, 80);
                        }}
                        disabled={chatLoading}
                        delayLongPress={100000}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel="Hold to talk to Senpai"
                        accessibilityHint="Press and hold, speak, then release to send"
                        style={[
                          styles.micBtn,
                          listening && styles.micBtnHeld,
                          chatLoading && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={styles.micBtnText}>
                          {listening
                            ? '● release to send · slide off to cancel'
                            : chatLoading
                            ? '… thinking'
                            : ttsPlaying
                            ? '▶ hold to interrupt'
                            : '🎤 hold to talk'}
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </Animated.View>
            );
            return isTop ? [bubbleEl, panelEl] : [panelEl, bubbleEl];
          })()}
        </View>

        {/* Close button (on long press) */}
        {showClose && (
          <SoundPressable
            style={styles.closeBtn}
            onPress={() => {
              // Audit 2.0.5 P1 (hot mic): hiding the mascot with the mic
              // open left an INVISIBLE open microphone transcribing and
              // auto-sending to the AI, with TTS still playing. Kill both
              // before hiding.
              if (listeningRef.current) cancelHold(true);
              stopSenpaiAudio();
              setHidden(true);
            }}
          >
            <Text style={styles.closeBtnText}>x</Text>
          </SoundPressable>
        )}

        {/* DEV-only diagnostic: clears chat history (so the model
            doesn't mimic English replies from earlier turns) and fires
            a hardcoded message so we can verify the chat round-trip
            works WITHOUT needing real mic input. Stripped from release
            builds via __DEV__. */}
        {__DEV__ && !chatLoading && (
          <SoundPressable
            style={styles.devTestBtn}
            onPress={async () => {
              clearChatError();
              await clearChat();
              sendChat('say hi');
            }}
          >
            <Text style={styles.devTestBtnText}>test</Text>
          </SoundPressable>
        )}
      </Animated.View>
    </>
  );
}

/* ─── Speech Bubble ──────────────────────────────────────────────────────── */

function SpeechBubble({ text }: { text: string }) {
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
          // Hardcoded SOLID background — a translucent theme surface let
          // page content bleed through and killed readability against the
          // chibi + the cards behind her.
          backgroundColor: '#0F0E2C',
          borderColor: 'rgba(255,255,255,0.16)',
          opacity: fade,
          transform: [{ scale }],
        },
      ]}
    >
      {/* No numberOfLines — replies routinely run 4–6 lines; the bubble
          grows vertically as needed. */}
      <Text style={[styles.bubbleText, { color: '#FFFFFF' }]}>
        {text}
      </Text>
    </Animated.View>
  );
}

/* ─── Mascot art: flipbook-or-static with cross-faded swaps (D6) ─────────── */

// One art layer. Flipbook strip when one exists for the key; otherwise the
// static PNG (with expo-image's own crossfade for source swaps on reused
// layers). Fades itself in on mount / out when superseded — the parent prunes
// it once covered. Never rendered under Reduce Motion (MascotArt handles that
// path with a single stable Image).
function MascotArtLayer({
  artKey,
  fadeIn,
  fadeOut,
}: {
  artKey: string;
  fadeIn: boolean;
  fadeOut: boolean;
}) {
  const layerOpacity = useRef(new Animated.Value(fadeIn ? 0 : 1)).current;
  useEffect(() => {
    if (fadeIn) {
      Animated.timing(layerOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — fadeIn is fixed for a layer's lifetime
  useEffect(() => {
    if (fadeOut) {
      Animated.timing(layerOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
  }, [fadeOut, layerOpacity]);

  const entry = FLIPBOOK_ASSETS[artKey];
  const fallback = ANIM_ASSETS[artKey] ?? ANIM_ASSETS.idle;
  // Ghost-free swaps: the OUTGOING layer freezes to its static mood PNG
  // (ANIM_ASSETS first-frame) for the fade — two flipbook loops running
  // unsynced during the crossfade double-exposed into a ghost. Only the
  // incoming layer's strip ever plays.
  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: layerOpacity }]}>
      {entry && !fadeOut ? (
        <SenpaiFlipbook entry={entry} size={MASCOT_SIZE} fallback={fallback} />
      ) : (
        <Image
          source={fallback}
          style={styles.mascotImage}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
        />
      )}
    </Animated.View>
  );
}

/**
 * MascotArt — renders the current art key in a fixed MASCOT_SIZE box (zero
 * re-layout on swap). On a key change with `crossfade`, an ~80ms anticipation
 * micro-squash plays on the CURRENT pose first (a mini version of the
 * milestone script's squash — cartoon anticipation, not just a dissolve),
 * THEN the outgoing layer stays mounted ~240ms fading out (frozen as its
 * static PNG — see MascotArtLayer) while the incoming one fades in and the
 * squash springs back. Milestone scripts and Reduce Motion pass
 * crossfade=false and swap instantly (the milestone's own hard pose-pop on
 * the squash release IS the intended comedy beat — D2/D5 untouched). At most
 * 2 layers ever exist, and only for the fade window.
 */
const MascotArt = React.memo(function MascotArt({
  artKey,
  crossfade,
  reduceMotion,
}: {
  artKey: string;
  crossfade: boolean;
  reduceMotion: boolean;
}) {
  const idRef = useRef(0);
  const [layers, setLayers] = useState<{ id: number; artKey: string }[]>(
    () => [{ id: 0, artKey }],
  );
  // Anticipation micro-squash (0 = rest). Native-driven; only ever runs on
  // the crossfade path, which the parent already gates off under Reduce
  // Motion and mid-milestone (crossfade=false both times).
  const microSquash = useRef(new Animated.Value(0)).current;
  const pendingSwapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the top layer's key so a re-run that changes only `crossfade`
  // (e.g. bubbleHold flipping) never replays the squash on the same pose.
  const topKeyRef = useRef(artKey);

  useEffect(() => {
    if (topKeyRef.current === artKey) return;
    const commit = () => {
      topKeyRef.current = artKey;
      setLayers((prev) => {
        const top = prev[prev.length - 1];
        if (top.artKey === artKey) return prev;
        const next = { id: ++idRef.current, artKey };
        return crossfade ? [top, next] : [next];
      });
    };
    if (!crossfade) {
      // Milestone / Reduce Motion: instant swap, and park the squash at rest
      // in case an anticipation was interrupted mid-play.
      microSquash.stopAnimation();
      microSquash.setValue(0);
      commit();
      return;
    }
    // Non-milestone swap: squash down for 80ms on the outgoing pose, then
    // crossfade + spring back (slight overshoot past 0 reads as the release
    // stretch, same trick as the milestone script's interpolation).
    Animated.timing(microSquash, { toValue: 1, duration: 80, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    pendingSwapRef.current = setTimeout(() => {
      pendingSwapRef.current = null;
      commit();
      Animated.spring(microSquash, { toValue: 0, friction: 5, tension: 220, useNativeDriver: true }).start();
    }, 80);
    return () => {
      // A newer key (or unmount) arrived mid-anticipation — drop the stale
      // commit; the next effect run schedules its own.
      if (pendingSwapRef.current) {
        clearTimeout(pendingSwapRef.current);
        pendingSwapRef.current = null;
      }
    };
  }, [artKey, crossfade, microSquash]);

  // Prune the outgoing layer once the incoming one has fully faded in.
  useEffect(() => {
    if (layers.length <= 1) return;
    const t = setTimeout(() => setLayers((ls) => ls.slice(-1)), 240);
    return () => clearTimeout(t);
  }, [layers]);

  // Reduce Motion: ONE stable Image whose source swaps in place — no strip,
  // no remounts, no fades. Bit-identical to the pre-flipbook behavior.
  // (Placed after the hooks so the hook order never varies with the setting.)
  if (reduceMotion) {
    return (
      <View style={styles.mascotImage}>
        <Image
          source={ANIM_ASSETS[artKey] ?? ANIM_ASSETS.idle}
          style={styles.mascotImage}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.mascotImage,
        {
          // scaleX up / scaleY down — the anticipation squash. The spring
          // back to 0 may overshoot negative, which extrapolates into a
          // brief stretch: intended, it sells the release.
          transform: [
            { scaleX: microSquash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
            { scaleY: microSquash.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] }) },
          ],
        },
      ]}
    >
      {layers.map((l, i) => (
        <MascotArtLayer
          key={l.id}
          artKey={l.artKey}
          fadeIn={crossfade && layers.length > 1 && i === layers.length - 1}
          fadeOut={layers.length > 1 && i < layers.length - 1}
        />
      ))}
    </Animated.View>
  );
});

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

  // Charge / discharge ring — same geometry, four consumers (two color
  // skins per ring). Sits behind the mascot, flashed 1 → 0 on tap-to-start /
  // tap-to-stop. Border props live HERE as constants so the flash animates
  // only opacity + scale and stays on the native driver — animating
  // borderWidth/borderColor forces useNativeDriver:false (JS-thread jank).
  chargeRing: {
    position: 'absolute',
    width: MASCOT_SIZE + 24,
    height: MASCOT_SIZE + 24,
    left: -12,
    bottom: -12,
    borderRadius: (MASCOT_SIZE + 24) / 2,
    zIndex: 1,
  },
  // Pre-styled ring skins — the "pass" color is what shows mid-decay, the
  // "peak" color dominates at full flash (opacity cross-fade in the JSX).
  chargeRingPink: { borderWidth: 5, borderColor: 'rgba(255, 46, 81, 0.85)' },
  chargeRingGold: { borderWidth: 6, borderColor: '#FFD700' },
  dischargeRingOrange: { borderWidth: 5, borderColor: 'rgba(255, 140, 0, 0.85)' },
  dischargeRingRed: { borderWidth: 6, borderColor: 'rgb(220, 38, 38)' },

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

  // Sleeping "z" glyph — intentionally typographic (Animated.Text, not an
  // art asset). Spawns near her head; per-glyph size/offset set inline.
  sleepZ: {
    position: 'absolute',
    top: 8,
    color: 'rgba(255, 255, 255, 0.92)',
    fontWeight: '800',
    zIndex: 7,
  },

  // Speech bubble — her reply / live-transcript surface. Lives INSIDE the
  // chat dock now (no longer absolutely positioned over the mascot), so it
  // flows above/below her depending on which corner she's docked to.
  bubble: {
    maxWidth: DOCK_W,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // ─── In-place chat dock + Type/Talk panel ───────────────────────────────
  // Positioned (top/bottom/left/right + alignItems) inline per corner so it
  // always opens inward from whichever corner she's snapped to.
  dock: {
    position: 'absolute',
    width: DOCK_W,
    zIndex: 40,
    gap: 6,
  },
  dockPanel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(15,14,44,0.96)',
    borderColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 6,
    gap: 6,
  },
  segWrap: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 9,
    padding: 2,
  },
  segBtn: { flex: 1, paddingVertical: 5, borderRadius: 7, alignItems: 'center' },
  segBtnActive: { backgroundColor: '#FF2E51' },
  segText: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.2 },
  segTextActive: { color: '#FFFFFF' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sendBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FF2E51',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  micBtn: {
    alignSelf: 'stretch',
    // Taller than the old tap button — a hold target needs more meat.
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
  },
  micBtnHeld: {
    backgroundColor: 'rgba(220,38,38,0.92)',
    transform: [{ scale: 1.02 }],
  },
  micBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clearBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  clearBtnText: { fontSize: 13 },
  disclaimerBox: { gap: 8 },
  disclaimerText: { color: 'rgba(255,255,255,0.92)', fontSize: 11.5, fontWeight: '600', lineHeight: 16 },
  disclaimerBtn: {
    alignSelf: 'stretch', paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#FF2E51', alignItems: 'center',
  },
  disclaimerBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  // Chibi-only hit box that owns the drag PanResponder (siblings: the dock).
  mascotHit: {
    width: MASCOT_SIZE,
    height: MASCOT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Close button
  closeBtn: {
    position: 'absolute', top: -8, right: -8,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', zIndex: 20,
  },
  closeBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900' },

  // DEV-only test button — sits below the chibi, fires a hardcoded chat
  // message so we can validate the senpaiChat round-trip without needing
  // real mic input. Stripped via __DEV__ guard at the call site.
  devTestBtn: {
    position: 'absolute',
    bottom: -28,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 215, 0, 0.85)',
    borderWidth: 1,
    borderColor: '#FFD700',
    zIndex: 30,
  },
  devTestBtnText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
