// Metro config — extends defaults to bundle .apng (animated PNG) assets
// alongside .png. We use APNG for the senpai mascot animations because
// expo-image's iOS animated-WebP decoder produced black-box / pixelated
// rendering on Apple-silicon simulators, and naming animated files .png
// causes Xcode's bundle-time pngcrush pass to strip the APNG chunks
// (acTL / fcTL / fdAT). Keeping the .apng extension bypasses pngcrush so
// the animation survives the build.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('apng')) {
  config.resolver.assetExts.push('apng');
}

module.exports = config;
