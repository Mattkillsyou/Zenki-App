import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { AppleMaps } from 'expo-maps';
import { ActivityMapProps } from './ActivityMap.types';
import { useTheme } from '../context/ThemeContext';

/**
 * Native Activity map — Apple Maps via `expo-maps` on iOS.
 *
 * Renders the user's current location, follows the live polyline as the
 * session records new coords, and tints both the marker + the polyline with
 * the current theme's `accentColor` so Matrix / Sheikah / etc. carry through.
 *
 * Android falls back to a stub for now (we'd need a Google Maps API key + a
 * privacy review pass before shipping the Android variant).
 */
export function ActivityMap({ routeCoords, userLat, userLng, accentColor }: ActivityMapProps) {
  const { colors } = useTheme();

  if (Platform.OS !== 'ios') {
    return (
      <View style={[styles.placeholder, { backgroundColor: colors.backgroundElevated }]}>
        <Text style={[styles.title, { color: accentColor }]}>GPS Track</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          Map unavailable on this platform — pace + distance still record below.
        </Text>
      </View>
    );
  }

  // Convert {lat, lng} → AppleMaps Coordinates {latitude, longitude}.
  const polylineCoords = routeCoords.map((c) => ({ latitude: c.lat, longitude: c.lng }));

  return (
    <AppleMaps.View
      style={StyleSheet.absoluteFillObject}
      cameraPosition={{
        coordinates: { latitude: userLat, longitude: userLng },
        zoom: 16,
      }}
      markers={[
        {
          id: 'user',
          coordinates: { latitude: userLat, longitude: userLng },
          tintColor: accentColor,
          systemImage: 'location.circle.fill',
        },
      ]}
      polylines={
        polylineCoords.length > 1
          ? [
              {
                id: 'route',
                coordinates: polylineCoords,
                color: accentColor,
                width: 5,
              },
            ]
          : []
      }
      properties={{
        isMyLocationEnabled: true,
        selectionEnabled: false,
      }}
      uiSettings={{
        myLocationButtonEnabled: false,
        scaleBarEnabled: false,
        compassEnabled: true,
      }}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});
