#!/usr/bin/env node
// Placeholder UI sounds for native iOS/Android until real assets ship.
// Outputs 7 short pure-tone WAVs to src/assets/sounds/, one per SoundEvent.
// Re-run after editing the PROFILES table to regenerate.

const fs = require('fs');
const path = require('path');

const SR = 22050;

function writeWav(filePath, samples) {
  const length = samples.length;
  const buf = Buffer.alloc(44 + length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(length * 2, 40);
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.writeFileSync(filePath, buf);
}

function envelope(t, dur, attack = 0.005, release = 0.05) {
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

function wave(type, phase) {
  switch (type) {
    case 'sine':     return Math.sin(phase);
    case 'square':   return Math.sin(phase) >= 0 ? 1 : -1;
    case 'sawtooth': return ((phase / Math.PI) % 2) - 1;
    case 'triangle': {
      const x = ((phase / (2 * Math.PI)) % 1 + 1) % 1;
      return x < 0.5 ? 4 * x - 1 : 3 - 4 * x;
    }
    default: return Math.sin(phase);
  }
}

function renderTone(out, startSample, spec) {
  const { freq, type = 'sine', duration, gain = 0.4, sweep } = spec;
  const total = Math.floor(duration * SR);
  const target = sweep || freq;
  let phase = 0;
  for (let i = 0; i < total; i++) {
    const t = i / SR;
    const f = freq * Math.pow(target / freq, t / duration);
    phase += (2 * Math.PI * f) / SR;
    const env = envelope(t, duration);
    const sample = wave(type, phase) * gain * env;
    const idx = startSample + i;
    if (idx < out.length) out[idx] += sample;
  }
}

function buildChord(tones, totalDur) {
  const len = Math.floor(totalDur * SR);
  const out = new Float32Array(len);
  for (const tone of tones) {
    const offset = Math.floor((tone.delay || 0) * SR);
    renderTone(out, offset, tone);
  }
  // Soft clip
  for (let i = 0; i < len; i++) {
    const x = out[i];
    out[i] = x > 1 ? 1 - 1 / (1 + (x - 1) * 4)
           : x < -1 ? -1 + 1 / (1 + (-x - 1) * 4)
           : x;
  }
  return out;
}

const PROFILES = {
  tap: {
    totalDur: 0.10,
    tones: [{ freq: 800, type: 'sine', duration: 0.05, gain: 0.5 }],
  },
  success: {
    totalDur: 0.40,
    tones: [
      { freq: 523, type: 'sine', duration: 0.18, gain: 0.45 },
      { freq: 784, type: 'sine', duration: 0.22, gain: 0.45, delay: 0.10 },
    ],
  },
  error: {
    totalDur: 0.35,
    tones: [
      { freq: 300, type: 'sawtooth', duration: 0.30, gain: 0.40, sweep: 130 },
      { freq: 305, type: 'sawtooth', duration: 0.30, gain: 0.30, sweep: 132 },
    ],
  },
  navigate: {
    totalDur: 0.10,
    tones: [{ freq: 660, type: 'sine', duration: 0.06, gain: 0.40 }],
  },
  open: {
    totalDur: 0.30,
    tones: [{ freq: 220, type: 'sine', duration: 0.20, gain: 0.40, sweep: 660 }],
  },
  close: {
    totalDur: 0.30,
    tones: [{ freq: 660, type: 'sine', duration: 0.20, gain: 0.40, sweep: 220 }],
  },
  transform: {
    totalDur: 0.80,
    tones: [
      { freq: 523,  type: 'triangle', duration: 0.18, gain: 0.40 },
      { freq: 659,  type: 'triangle', duration: 0.18, gain: 0.40, delay: 0.10 },
      { freq: 784,  type: 'triangle', duration: 0.18, gain: 0.40, delay: 0.20 },
      { freq: 1047, type: 'triangle', duration: 0.30, gain: 0.45, delay: 0.30 },
      { freq: 2094, type: 'sine',     duration: 0.20, gain: 0.15, delay: 0.35 },
    ],
  },
};

const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'sounds');
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [name, profile] of Object.entries(PROFILES)) {
  const samples = buildChord(profile.tones, profile.totalDur);
  const out = path.join(OUT_DIR, `${name}.wav`);
  writeWav(out, samples);
  console.log(`✓ ${name}.wav  ${fs.statSync(out).size} bytes`);
}
