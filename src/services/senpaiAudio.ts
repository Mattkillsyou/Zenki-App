/**
 * Playback helper for Senpai TTS audio.
 *
 * The senpaiSpeak cloud function returns base64-encoded MP3. expo-audio's
 * createAudioPlayer wants a URI (asset module id, http URL, or file://),
 * so we decode the base64 to a tempfile in the cache directory and feed
 * that URI to the player. After the clip finishes (or fails), the file
 * is unlinked and the player released.
 *
 * One in-flight clip at a time — calling playSenpaiAudio while another
 * is still playing aborts the previous one. Each call returns a stop()
 * function so the caller can interrupt mid-playback (e.g., on modal close).
 */

// expo-file-system v55 split the API: the default import is the new
// File/Directory class API, and the legacy methods (cacheDirectory,
// writeAsStringAsync, deleteAsync) live at expo-file-system/legacy. The
// re-exports from the main module are deprecated stubs that THROW at
// runtime, so we MUST use the /legacy entry here.
import * as FileSystem from 'expo-file-system/legacy';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let currentStop: (() => void) | null = null;

async function ensureAudioMode(): Promise<void> {
  // Re-set the audio mode on EVERY play, AND explicitly disable
  // recording mode + earpiece routing.
  //
  // Backstory: STT (expo-speech-recognition) puts the iOS audio session
  // into PlayAndRecord category with allowsRecording=true. That category
  // routes audio through the EARPIECE by default (quiet). After STT
  // ends, the session doesn't auto-reset to Playback, so subsequent TTS
  // plays "succeed" (the player thinks it's playing) but route to the
  // earpiece — which on the iOS Simulator means total silence.
  //
  // Force the session back to Playback (allowsRecording: false) and
  // route through the speaker (shouldRouteThroughEarpiece: false). The
  // user reported "heard it once" — that was before STT had run; after
  // a hold-to-talk session, the routing got corrupted and stayed quiet.
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
      allowsRecording: false,
      shouldRouteThroughEarpiece: false,
      shouldPlayInBackground: false,
    });
  } catch {
    /* non-fatal — audio is best-effort */
  }
}

/**
 * Flip the iOS audio session back to Playback EARLY, rather than at playback
 * time. STT leaves the session in PlayAndRecord, so ensureAudioMode is a real
 * category + route transition (~30-150ms), and playSenpaiAudio awaits it as
 * the very first thing it does — squarely on the critical path between "reply
 * arrived" and "audio starts". The mic is already closed by then (finishHold
 * stopped the recognizer a whole chat round trip earlier), so nothing races:
 * call this when the TTS fetch STARTS and the transition overlaps the ~1s
 * network wait instead of adding to it. playSenpaiAudio still calls
 * ensureAudioMode for correctness — the second call is a cheap no-op once the
 * session is already in Playback.
 */
export function prewarmAudioSession(): void {
  ensureAudioMode().catch(() => { /* best effort */ });
}

/**
 * Stop whatever Senpai clip is currently playing, if any. No-op otherwise.
 * Safe to call from cleanup / modal-close hooks.
 */
export function stopSenpaiAudio(): void {
  if (currentStop) {
    try {
      currentStop();
    } catch {
      /* ignore */
    }
    currentStop = null;
  }
}

/**
 * Decode the base64 mp3 payload, write it to a tempfile, and play it.
 * Returns a stop() function and resolves once `play()` has been called —
 * NOT when audio finishes. Pass `onEnded` to be notified when the audio
 * actually completes (or is stopped). The mascot uses this to defer the
 * after-reply mic re-arm until senpai stops talking, so STT doesn't
 * pick up her own voice through the speaker.
 */
export async function playSenpaiAudio(
  audioBase64: string,
  onEnded?: () => void,
): Promise<{ stop: () => void }> {
  // Interrupt any prior clip — the prior clip's onEnded will fire too,
  // which is what we want (consumer's "TTS done" state goes false).
  // This also aborts any previous call that is still in its async setup
  // window (see the early `currentStop` registration below): that call's
  // `cancelled` flag flips true so it neither plays nor leaks its tempfile.
  stopSenpaiAudio();

  // Register an abortable stop handle BEFORE the awaits below so that a
  // stopSenpaiAudio() during this setup window (e.g. from a cleanup /
  // modal-close hook, or from a second playSenpaiAudio() above) is not a
  // silent no-op. It flips `cancelled`, which we check before creating /
  // starting the player so the clip never plays and the tempfile (if
  // written) is removed. The real stop() replaces this handle once the
  // player exists.
  let cancelled = false;
  let fileUri: string | null = null;
  currentStop = () => {
    cancelled = true;
    if (fileUri) {
      FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    }
  };

  await ensureAudioMode();

  if (!FileSystem.cacheDirectory) {
    throw new Error('expo-file-system cacheDirectory unavailable');
  }
  const filename = `senpai_${Date.now()}.mp3`;
  fileUri = FileSystem.cacheDirectory + filename;

  try {
    await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
      encoding: 'base64' as any, // expo-file-system v55 accepts the string
    });
  } catch (err) {
    throw new Error(`failed to write audio tempfile: ${(err as Error)?.message}`);
  }

  // If this call was cancelled during the awaits above (by stopSenpaiAudio
  // or by a newer playSenpaiAudio), bail out now: don't create/start a
  // player, and remove the tempfile we just wrote so it doesn't leak.
  if (cancelled) {
    FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    // This resolution never reaches cleanup(), so fire onEnded here or the
    // consumer's "TTS done" state (ttsPlaying in useSenpaiChat) stays true
    // forever and silently blocks the walkie-talkie mic re-arm. Fired ONLY
    // in this branch — not in the early currentStop handle above — because
    // a newer playSenpaiAudio() also routes its predecessor through here,
    // and firing from both places would double-invoke onEnded.
    try {
      onEnded?.();
    } catch {
      /* consumer error must not break the cancel path */
    }
    return { stop: () => {} };
  }
  // Past the cancellation guard `fileUri` is a written tempfile; capture a
  // non-null local for the player/cleanup path below.
  const uri = fileUri;

  // Some expo-audio versions on iOS Simulator report `playing: true`
  // and a valid duration immediately after createAudioPlayer({uri}),
  // but currentTime never advances and no audio is actually emitted.
  // Calling .replace() with the same source forces a real load + reset
  // of the playhead, which fixes the no-audio bug on the sim.
  let player: ReturnType<typeof createAudioPlayer>;
  try {
    player = createAudioPlayer({ uri });
  } catch (e) {
    // createAudioPlayer threw before cleanup() existed — delete the
    // just-written tempfile so it doesn't leak, then rethrow.
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw e;
  }
  try {
    player.replace({ uri });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[senpaiAudio] player.replace threw:', e);
  }

  // Cleanup runs once — either when playback finishes, on stop(), or on
  // error. Fires onEnded after release so the consumer (useSenpaiChat)
  // can flip its ttsPlaying flag false and let the mascot's mic re-arm.
  // Also clears the status poll if it's still running (set below) — a
  // missing clear here was leaving phantom intervals running against
  // released players, which corrupted the next play attempt.
  let cleaned = false;
  let statusPoll: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (statusPoll) {
      clearTimeout(statusPoll);
      statusPoll = null;
    }
    try {
      player.release();
    } catch {
      /* ignore */
    }
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    try {
      onEnded?.();
    } catch {
      /* consumer error must not break cleanup */
    }
  };

  // expo-audio's player exposes a `playbackStatusUpdate` event we can
  // listen to via addListener — but the simpler portable path is just to
  // schedule cleanup against the metadata-derived duration once playback
  // starts. For our short replies (<10s) this is fine.
  const stop = () => {
    try {
      player.pause();
    } catch {
      /* ignore */
    }
    cleanup();
  };

  // Two-phase listener: first wait for `isLoaded` before calling play(),
  // then watch for `didJustFinish` to clean up. createAudioPlayer returns
  // synchronously but the underlying file decode is async — calling
  // play() before isLoaded silently no-ops with duration=0 and playing
  // stays false. (Confirmed via diagnostic.)
  // expo-audio's `addListener('playbackStatusUpdate', ...)` doesn't
  // fire reliably on iOS Simulator, so poll `player.currentStatus`
  // synchronously instead. Two phases: (1) call play() once the
  // engine reports a positive duration (file loaded), (2) clean up
  // when playback naturally finishes.
  let started = false;
  // RAMPED poll, not a fixed interval. Two conflicting needs:
  //   - Before play(): a small local MP3 loads in ~20-60ms, and every ms
  //     past that is dead air the user hears as lag. A flat 250ms interval
  //     doesn't even take its FIRST sample until t+250ms.
  //   - During playback: `currentStatus` is a SYNCHRONOUS JSI read against a
  //     live AVPlayer on the JS thread. Hammering it 10x/sec while a volume
  //     press or route change transitions the audio session is what risked
  //     blocking on a session lock (the freeze this file's 250ms was for).
  // So: poll fast (40ms) until the clip is loaded and playing, then back off
  // to 250ms for the rest of playback. The freeze guard is preserved exactly
  // where it matters, and the dead air before audio is gone.
  const FAST_MS = 40;
  const SLOW_MS = 250;
  const tick = () => {
    if (cleaned) return;
    const status: any = (player as any).currentStatus ?? {};
    const ready = status?.isLoaded === true || (typeof status?.duration === 'number' && status.duration > 0);
    if (!started && ready) {
      started = true;
      try {
        try { (player as any).seekTo?.(0); } catch { /* ignore */ }
        player.play();
      } catch {
        cleanup();
        return;
      }
    }
    if (status?.didJustFinish || (status?.duration > 0 && status?.currentTime >= status?.duration && started)) {
      cleanup();
      return;
    }
    statusPoll = setTimeout(tick, started ? SLOW_MS : FAST_MS);
  };
  statusPoll = setTimeout(tick, FAST_MS);
  // Fallback if `currentStatus` never reports ready (rare but seen).
  setTimeout(() => {
    if (!started && !cleaned) {
      started = true;
      try { player.play(); } catch { /* ignore */ }
    }
  }, 1500);
  // Hard timeout — never let the poll run forever.
  setTimeout(() => {
    cleanup();
  }, 30_000);

  currentStop = stop;
  return { stop };
}
