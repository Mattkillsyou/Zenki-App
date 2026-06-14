// Metro config — Expo defaults.
//
// The senpai mascot uses ONE static PNG per mood (see src/components/SenpaiMascot.tsx)
// plus a JS-side bounce for liveness. Animated formats were deliberately dropped:
// expo-image's iOS animated-WebP decoder produced black-box / pixelated rendering on
// Apple-silicon simulators, and animated-PNG (.apng) chunks (acTL/fcTL/fdAT) get
// stripped by Xcode's bundle-time pngcrush pass. Static PNG-per-mood avoids both, so
// no custom assetExts are needed here.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
