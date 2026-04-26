import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ActivityMapProps } from './ActivityMap.types';
import { useTheme } from '../context/ThemeContext';

/**
 * Native fallback placeholder — the native build ships without Leaflet so we
 * render a text stub in the map area. When react-native-maps is added in a
 * later bundle, this is where the live map goes.
 */
export function ActivityMap({ routeCoords, accentColor }: ActivityMapProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundElevated }]}>
      <Text style={[styles.title, { color: accentColor }]}>GPS Track</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {routeCoords.length === 0
          ? 'Waiting for signal…'
          : `${routeCoords.length} points captured`}
      </Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        Live map view available on web.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 14,
    fontWeight: '600',
  },
  hint: {
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});
