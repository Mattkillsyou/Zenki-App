module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // Strip console.* calls from production bundles only — development
      // keeps them for debugging. Trims bundle size and removes log
      // statements from the App Store binary.
      production: {
        plugins: ['transform-remove-console'],
      },
    },
  };
};
