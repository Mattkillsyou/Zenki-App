import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

/**
 * Subtle banner pinned to the top of the app when the device is offline.
 * Reads from `useNetworkStatus`; renders nothing when connected.
 *
 * Mounted once at App root. We use the global palette directly (not
 * `useTheme`) so the banner renders identically across themes — an offline
 * indicator should look like a system warning, not part of the surface.
 *
 * NOTE: Pending changes still queue locally (Firestore SDK has its own
 * write buffer; AsyncStorage caches our optimistic writes). The banner
 * communicates that to the user — it doesn't gate any action.
 */
export function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetworkStatus();

  // `isInternetReachable` can be null briefly during cold boot or when the
  // OS hasn't probed yet. Only show offline when we're confident:
  //   - device says not connected, OR
  //   - device says connected but reachability probe explicitly returned false
  const offline =
    isConnected === false || isInternetReachable === false;

  if (!offline) return null;

  return (
    <View style={styles.banner} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={14} color={palette.grey50} />
      <Text style={styles.text}>
        You're offline. Changes will sync when you're back.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 16,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.smd,
    backgroundColor: 'rgba(31, 31, 35, 0.92)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 9999,
  },
  text: {
    ...typography.caption,
    color: palette.grey50,
    fontWeight: '600',
  },
});
