import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface AnimatedLogoProps {
  size?: number;
}

/**
 * Theme-aware app logo.
 *
 * - Light themes (clean-light): black circle with white "Z"
 * - Dark themes (clean-dark, matrix, alien, sheikah, senpai): white circle with black "Z"
 *
 * Both PNG variants live in assets/ — `icon-light.png` and `icon-dark.png`.
 * We pick the one that contrasts against the active background.
 */
export function AnimatedLogo({ size = 200 }: AnimatedLogoProps) {
  const { isDark } = useTheme();
  const source = isDark
    ? require('../../assets/icon-dark.png')
    : require('../../assets/icon-light.png');

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={source}
        style={[styles.image, { width: size, height: size }]}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {},
});
