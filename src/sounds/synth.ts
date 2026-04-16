// Web Audio API sound synthesis — no external files needed.
// Generates short theme-appropriate tones procedurally.
//
// On web: uses AudioContext directly.
// On native (iOS/Android): this module no-ops. Native playback should go
// through expo-av with real sound files (see SoundContext).

import { Platform } from 'react-native';

type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ToneSpec {
  freq: number;              // base frequency in Hz
  wave?: Waveform;           // oscillator type
  duration?: number;         // seconds
  attack?: number;           // seconds
  release?: number;          // seconds
  gain?: number;             // 0..1
  sweep?: number;            // target freq for portamento
  detune?: number;           // cents
  delay?: number;            // seconds before playing (for chord stacking)
}

let _ctx: any = null;

function getCtx(): any {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  try {
    _ctx = new AC();
    return _ctx;
  } catch {
    return null;
  }
}

function playTone(ctx: any, spec: ToneSpec) {
  const {
    freq, wave = 'sine', duration = 0.12,
    attack = 0.005, release = 0.08,
    gain = 0.15, sweep, detune, delay = 0,
  } = spec;

  const startAt = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g   = ctx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, startAt);
  if (typeof detune === 'number') osc.detune.setValueAtTime(detune, startAt);
  if (typeof sweep === 'number') {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweep), startAt + duration);
  }

  // Envelope
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + attack);
  g.gain.linearRampToValueAtTime(gain * 0.6, startAt + attack + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration + release);

  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + release + 0.05);
}

function chord(ctx: any, specs: ToneSpec[]) {
  specs.forEach((s) => playTone(ctx, s));
}

export type SoundTheme =
  | 'home'       // ambient gong / bell
  | 'schedule'   // soft wood-block knock
  | 'store'      // cobra kai — aggressive 80s synth
  | 'drinks'     // bubbly water droplet
  | 'community'  // gentle chime
  | 'profile'    // subtle swoosh
  | 'settings'   // neutral UI tick
  | 'default';

export type SoundEvent = 'tap' | 'success' | 'error' | 'navigate' | 'open' | 'close';

/**
 * Play a themed sound event. Safe to call from anywhere — becomes a no-op
 * when Web Audio is unavailable (i.e. on native without configured files).
 */
export function playSynth(theme: SoundTheme, event: SoundEvent) {
  const ctx = getCtx();
  if (!ctx) return;
  // User-gesture requirement — resume on first play
  if (ctx.state === 'suspended') {
    try { ctx.resume(); } catch { /* ignore */ }
  }

  switch (theme) {
    case 'home':      return homeSound(ctx, event);
    case 'schedule':  return scheduleSound(ctx, event);
    case 'store':     return storeSound(ctx, event);
    case 'drinks':    return drinksSound(ctx, event);
    case 'community': return communitySound(ctx, event);
    case 'profile':   return profileSound(ctx, event);
    case 'settings':  return settingsSound(ctx, event);
    default:          return defaultSound(ctx, event);
  }
}

// ──────────────────────── THEMES ────────────────────────

function homeSound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 523, wave: 'sine', duration: 0.18, gain: 0.12 }]);
    case 'success':  return chord(ctx, [
      { freq: 523, wave: 'sine', duration: 0.25, gain: 0.12 },
      { freq: 659, wave: 'sine', duration: 0.25, gain: 0.10, delay: 0.06 },
      { freq: 784, wave: 'sine', duration: 0.35, gain: 0.09, delay: 0.12 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 220, wave: 'triangle', duration: 0.22, gain: 0.16, sweep: 160 }]);
    case 'navigate': return chord(ctx, [{ freq: 392, wave: 'sine', duration: 0.14, gain: 0.10 }]);
    default:         return chord(ctx, [{ freq: 440, wave: 'sine', duration: 0.12, gain: 0.10 }]);
  }
}

function scheduleSound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 880, wave: 'triangle', duration: 0.08, gain: 0.10 }]);
    case 'success':  return chord(ctx, [
      { freq: 659, wave: 'triangle', duration: 0.10, gain: 0.11 },
      { freq: 988, wave: 'triangle', duration: 0.14, gain: 0.09, delay: 0.08 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 277, wave: 'triangle', duration: 0.18, gain: 0.14, sweep: 180 }]);
    default:         return chord(ctx, [{ freq: 740, wave: 'triangle', duration: 0.08, gain: 0.09 }]);
  }
}

function storeSound(ctx: any, e: SoundEvent) {
  // 80s Cobra Kai — sawtooth synth hits, slight detune for grit
  switch (e) {
    case 'tap':      return chord(ctx, [
      { freq: 220, wave: 'sawtooth', duration: 0.06, gain: 0.10, detune: -10 },
      { freq: 440, wave: 'sawtooth', duration: 0.06, gain: 0.08, detune: +10 },
    ]);
    case 'success':  return chord(ctx, [
      { freq: 146, wave: 'sawtooth', duration: 0.22, gain: 0.12 },
      { freq: 220, wave: 'sawtooth', duration: 0.22, gain: 0.10, delay: 0.05 },
      { freq: 293, wave: 'square',   duration: 0.30, gain: 0.08, delay: 0.12 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 110, wave: 'sawtooth', duration: 0.30, gain: 0.18, sweep: 55 }]);
    case 'navigate': return chord(ctx, [{ freq: 330, wave: 'square', duration: 0.08, gain: 0.09 }]);
    default:         return chord(ctx, [{ freq: 200, wave: 'sawtooth', duration: 0.06, gain: 0.08 }]);
  }
}

function drinksSound(ctx: any, e: SoundEvent) {
  // Bubbly water droplet — high sine sweeping down
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 1200, wave: 'sine', duration: 0.12, gain: 0.14, sweep: 600 }]);
    case 'success':  return chord(ctx, [
      { freq: 900,  wave: 'sine', duration: 0.14, gain: 0.12, sweep: 600 },
      { freq: 1400, wave: 'sine', duration: 0.14, gain: 0.10, sweep: 900,  delay: 0.08 },
      { freq: 1800, wave: 'sine', duration: 0.22, gain: 0.08, sweep: 1100, delay: 0.16 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 500, wave: 'sine', duration: 0.22, gain: 0.16, sweep: 200 }]);
    default:         return chord(ctx, [{ freq: 1000, wave: 'sine', duration: 0.10, gain: 0.12, sweep: 550 }]);
  }
}

function communitySound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 660, wave: 'sine', duration: 0.16, gain: 0.10 }]);
    case 'success':  return chord(ctx, [
      { freq: 523, wave: 'sine', duration: 0.20, gain: 0.11 },
      { freq: 784, wave: 'sine', duration: 0.22, gain: 0.09, delay: 0.07 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 261, wave: 'triangle', duration: 0.20, gain: 0.14, sweep: 180 }]);
    default:         return chord(ctx, [{ freq: 523, wave: 'sine', duration: 0.10, gain: 0.09 }]);
  }
}

function profileSound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 466, wave: 'sine', duration: 0.10, gain: 0.10 }]);
    case 'success':  return chord(ctx, [
      { freq: 440, wave: 'sine', duration: 0.18, gain: 0.10 },
      { freq: 554, wave: 'sine', duration: 0.22, gain: 0.09, delay: 0.06 },
    ]);
    default:         return chord(ctx, [{ freq: 440, wave: 'sine', duration: 0.08, gain: 0.08 }]);
  }
}

function settingsSound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 1500, wave: 'square', duration: 0.02, gain: 0.07 }]);
    case 'success':  return chord(ctx, [
      { freq: 880,  wave: 'square', duration: 0.05, gain: 0.08 },
      { freq: 1760, wave: 'square', duration: 0.05, gain: 0.06, delay: 0.04 },
    ]);
    case 'error':    return chord(ctx, [{ freq: 200, wave: 'square', duration: 0.10, gain: 0.14 }]);
    default:         return chord(ctx, [{ freq: 1200, wave: 'square', duration: 0.02, gain: 0.06 }]);
  }
}

function defaultSound(ctx: any, e: SoundEvent) {
  switch (e) {
    case 'tap':      return chord(ctx, [{ freq: 600, wave: 'sine', duration: 0.08, gain: 0.10 }]);
    case 'success':  return chord(ctx, [{ freq: 700, wave: 'sine', duration: 0.14, gain: 0.10 }]);
    case 'error':    return chord(ctx, [{ freq: 200, wave: 'triangle', duration: 0.18, gain: 0.14 }]);
    default:         return chord(ctx, [{ freq: 550, wave: 'sine', duration: 0.06, gain: 0.08 }]);
  }
}
