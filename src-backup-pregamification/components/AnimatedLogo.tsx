import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

interface AnimatedLogoProps {
  size?: number;
}

export function AnimatedLogo({ size = 200 }: AnimatedLogoProps) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('../../assets/brand/zenki-3d-logo-3.png')}
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
  image: {
    borderRadius: 8,
  },
});
