/**
 * Senpai haptic feedback — tiny fire-and-forget wrapper around expo-haptics.
 *
 * Two intents only:
 *   bigBeat()   — a milestone thump (notification/Success). Celebrations,
 *                 level-ups, streak saves. Rare by design.
 *   smallTick() — a light impact tick. Bubble pops, dock snaps, subtle
 *                 acknowledgements.
 *
 * Gating mirrors how SoundContext gates its synth effects, because haptics
 * are "sound you feel" and must obey the same user intent:
 *   1. The `@zenki_sound_prefs` enabled flag (same AsyncStorage key + same
 *      `{ enabled: true }` default SoundContext persists). This is a plain
 *      module — no hooks — so the flag is cached and re-read on a short TTL
 *      instead of subscribing through React; a Settings toggle takes effect
 *      within a few seconds, and never mid-celebration crashes anything.
 *   2. System Reduce Motion (same AccessibilityInfo source MotionContext
 *      uses), lazily subscribed on first call and cached synchronously.
 *   3. A per-intent min-gap debounce, mirroring SoundContext's rapid-fire
 *      guard (no machine-gun buzzing when reactions stack).
 *
 * Everything is best-effort: web and unsupported platforms no-op, a missing
 * native module (pod not installed) no-ops, and all expo-haptics calls are
 * wrapped so a failure can never surface to the mascot runtime. This module
 * performs NO wiring itself — the mascot runtime imports and calls it.
 */

import { AccessibilityInfo, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeParseJSON } from '../utils/safeStorage';

// Same storage key + default SoundContext uses (src/context/SoundContext.tsx).
// If that key or shape ever changes, change it here too.
const SOUND_PREFS_KEY = '@zenki_sound_prefs';
const PREFS_TTL_MS = 5_000;

type HapticsModule = typeof import('expo-haptics');

// undefined = not yet resolved; null = unavailable (web / pod missing).
let hapticsModule: HapticsModule | null | undefined;

function getHaptics(): HapticsModule | null {
  if (hapticsModule === undefined) {
    try {
      // Lazy require so a missing/unlinked native module degrades to a
      // permanent no-op instead of throwing at bundle-eval time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      hapticsModule = require('expo-haptics') as HapticsModule;
    } catch {
      hapticsModule = null;
    }
  }
  return hapticsModule ?? null;
}

// ── Sound-pref mirror (SoundContext gate #1: prefs.enabled) ─────────────
let soundEnabled = true; // mirrors SoundContext defaultPrefs.enabled
let lastPrefsReadAt = 0;

function refreshSoundPref(): void {
  const now = Date.now();
  if (now - lastPrefsReadAt < PREFS_TTL_MS) return;
  lastPrefsReadAt = now;
  AsyncStorage.getItem(SOUND_PREFS_KEY)
    .then((raw) => {
      const prefs = safeParseJSON<{ enabled?: boolean }>(
        raw,
        { enabled: true },
        (v) => typeof v === 'object' && v !== null && !Array.isArray(v),
      );
      soundEnabled = prefs.enabled !== false;
    })
    .catch(() => { /* keep last known value — haptics are non-critical */ });
}

// ── Reduce Motion mirror (same source as MotionContext) ─────────────────
let reduceMotion = false;
let motionInitStarted = false;

function ensureMotionSubscription(): void {
  if (motionInitStarted) return;
  motionInitStarted = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => { reduceMotion = v; })
      .catch(() => { /* default false */ });
    // App-lifetime subscription, deliberately never removed — this module
    // lives as long as the app does (same lifetime as MotionProvider).
    AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      reduceMotion = v;
    });
  } catch {
    /* platforms without the API — keep default false */
  }
}

// ── Debounce (SoundContext gate #2: rapid-fire min-gap) ─────────────────
const lastFiredAt: Record<string, number> = {};

function fire(
  kind: 'bigBeat' | 'smallTick',
  minGapMs: number,
  invoke: (haptics: HapticsModule) => Promise<void>,
): void {
  // Haptics only exist on real iOS/Android hardware; expo-haptics' web
  // shim just rejects, so skip the whole pipeline off-device.
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  ensureMotionSubscription();
  refreshSoundPref();
  if (!soundEnabled || reduceMotion) return;

  const now = Date.now();
  if (now - (lastFiredAt[kind] || 0) < minGapMs) return;
  lastFiredAt[kind] = now;

  const haptics = getHaptics();
  if (!haptics) return;
  try {
    invoke(haptics).catch(() => { /* ignore — haptics are non-critical */ });
  } catch {
    /* ignore — haptics are non-critical */
  }
}

/**
 * Milestone thump — notification(Success). Use for earned moments only
 * (celebration, level-up, streak save), not routine ticks.
 */
export function bigBeat(): void {
  fire('bigBeat', 250, (h) => h.notificationAsync(h.NotificationFeedbackType.Success));
}

/**
 * Light tick — impact(Light). Use for subtle acknowledgements (bubble pop,
 * dock snap). Debounced so rapid repeats collapse to one.
 */
export function smallTick(): void {
  fire('smallTick', 80, (h) => h.impactAsync(h.ImpactFeedbackStyle.Light));
}
