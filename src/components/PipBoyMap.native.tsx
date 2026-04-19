import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { PipBoyMapProps } from './PipBoyMap.types';
import { pipboy } from '../theme/colors';

/**
 * Native fallback placeholder — the native build ships without Leaflet so we
 * render a text stub in the map area. When we add react-native-maps in a
 * later bundle, this is where the live map goes.
 */
export function PipBoyMap({ routeCoords }: PipBoyMapProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>GPS TRACK</Text>
      <Text style={styles.body}>
        {routeCoords.length === 0
          ? 'Waiting for signal…'
          : `${routeCoords.length} points captured`}
      </Text>
      <Text style={styles.hint}>Live map view available on web.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: pipboy.bg,
    gap: 8,
  },
  title: {
    color: pipboy.primary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 4,
  },
  body: {
    color: pipboy.primary,
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.85,
  },
  hint: {
    color: pipboy.primary,
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.55,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
