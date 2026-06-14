// Single source of truth for the mascot mood→PNG map.
//
// STATIC PNG strategy: one first-frame PNG per mood + a JS bounce for liveness.
// Animated WebP/APNG via expo-image produced black-box / pixelated rendering on
// Apple-silicon iOS simulators, so animated formats were deliberately dropped.
//
// Lives in its own module (rather than SenpaiMascot) so both SenpaiMascot and
// SenpaiVoiceModal can import it without a circular dependency.
export const ANIM_ASSETS: Record<string, any> = {
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
