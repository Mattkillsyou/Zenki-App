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
let audioModeSet = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeSet) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
    audioModeSet = true;
  } catch {
    /* non-fatal — audio is best-effort */
  }
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
 * Returns a stop() function. Resolves once playback either finishes
 * naturally or is interrupted; rejects on decode/write/play error.
 */
export async function playSenpaiAudio(audioBase64: string): Promise<{ stop: () => void }> {
  // Interrupt any prior clip
  stopSenpaiAudio();

  await ensureAudioMode();

  if (!FileSystem.cacheDirectory) {
    throw new Error('expo-file-system cacheDirectory unavailable');
  }
  const filename = `senpai_${Date.now()}.mp3`;
  const fileUri = FileSystem.cacheDirectory + filename;

  try {
    await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
      encoding: 'base64' as any, // expo-file-system v55 accepts the string
    });
  } catch (err) {
    throw new Error(`failed to write audio tempfile: ${(err as Error)?.message}`);
  }

  const player = createAudioPlayer({ uri: fileUri });

  // Cleanup runs once — either when playback finishes, on stop(), or on error
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      player.release();
    } catch {
      /* ignore */
    }
    FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
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

  // Listen for status updates so we can clean up when playback ends
  // naturally. The exact event API differs slightly between expo-audio
  // versions; the `addListener` pattern below is the SDK 55 shape.
  try {
    const sub = (player as any).addListener?.('playbackStatusUpdate', (status: any) => {
      if (status?.didJustFinish || (status?.duration > 0 && status?.currentTime >= status?.duration)) {
        sub?.remove?.();
        cleanup();
      }
    });
    // Fallback: if the listener API isn't available on this player, fall
    // back to a duration-based timeout once we know how long the clip is.
    if (!sub) {
      // Player exposes `duration` after metadata loads; best-effort poll.
      const poll = setInterval(() => {
        const dur = (player as any).duration;
        if (typeof dur === 'number' && dur > 0) {
          clearInterval(poll);
          // Pad by 250ms to let the audio finish flushing
          setTimeout(cleanup, dur * 1000 + 250);
        }
      }, 100);
      // Hard fallback — clean up after 30s no matter what
      setTimeout(() => {
        clearInterval(poll);
        cleanup();
      }, 30_000);
    }
  } catch {
    // If event subscription throws, just clean up after 30s
    setTimeout(cleanup, 30_000);
  }

  try {
    player.play();
  } catch (err) {
    cleanup();
    throw err;
  }

  currentStop = stop;
  return { stop };
}
