import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';
import { useHeartRate } from '../context/HeartRateContext';
import { spacing, borderRadius, MAX_CONTENT_WIDTH } from '../theme';
import type { BLEDeviceInfo } from '../types/heartRate';

// ─────────────────────────────────────────────────────────────
// Signal-bars helper: map RSSI (dBm) → 1–4 bars (0 when unknown).
//   ≥ -60 → 4   ·   ≥ -70 → 3   ·   ≥ -80 → 2   ·   else → 1   ·   null → 0
// ─────────────────────────────────────────────────────────────
function rssiToBars(rssi: number | null): 0 | 1 | 2 | 3 | 4 {
  if (rssi == null) return 0;
  if (rssi >= -60) return 4;
  if (rssi >= -70) return 3;
  if (rssi >= -80) return 2;
  return 1;
}

// Relative time for "Last connected …" — keeps it honest + lightweight.
function relativeTime(ts: number | null): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function BluetoothDevicesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const {
    bleStatus,
    bleReason,
    connectedDeviceName,
    currentBpm,
    batteryLevel,
    signalRssi,
    lastConnectedAt,
    discoveredDevices,
    startScan,
    stopScan,
    connectToDevice,
    savedDevice,
    reconnectSaved,
    forgetDevice,
    disconnect,
  } = useHeartRate();

  // Stop any in-flight scan when leaving the screen — don't keep the radio
  // scanning for up to SCAN_TIMEOUT_MS after the user navigates back.
  useFocusEffect(
    React.useCallback(() => {
      return () => { stopScan(); };
    }, [stopScan]),
  );

  const isConnected = bleStatus === 'connected';
  const isScanning = bleStatus === 'scanning';
  const isConnecting = bleStatus === 'connecting';

  // ── Shared status copy (matches BLE_CONTRACT.md status table) ──
  const statusLine = ((): string => {
    if (bleStatus === 'connected') {
      return `Connected — ${connectedDeviceName ?? 'Monitor'} · ${currentBpm > 0 ? `${currentBpm} bpm` : '— bpm'}`;
    }
    if (bleStatus === 'scanning') return 'Scanning…';
    if (bleStatus === 'connecting') return 'Connecting…';
    if (bleReason === 'poweredOff') return 'Bluetooth is off';
    if (bleReason === 'unauthorized') return 'Permission needed';
    if (bleReason === 'unsupported' || bleStatus === 'unavailable') return 'Not available on this device';
    if (bleReason === 'noDeviceFound') return 'No monitor found';
    if (bleReason === 'dropped') return 'Monitor disconnected';
    return 'Not connected';
  })();

  // ── Signal-bars renderer ──
  const SignalBars = ({ rssi }: { rssi: number | null }) => {
    const bars = rssiToBars(rssi);
    return (
      <View style={styles.signalBars}>
        {[1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[
              styles.signalBar,
              { height: 5 + i * 3 },
              {
                backgroundColor:
                  bars >= i
                    ? bars >= 3
                      ? colors.success
                      : colors.gold
                    : colors.surfaceSecondary,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  const handleForget = () => {
    if (!savedDevice) return;
    const name = savedDevice.name ?? 'this monitor';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`Forget ${name}?\n\nZenki will stop reconnecting automatically.`)) {
        forgetDevice();
      }
      return;
    }
    Alert.alert(
      `Forget ${name}?`,
      'Zenki will stop reconnecting to it automatically. You can pair it again any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Forget', style: 'destructive', onPress: () => forgetDevice() },
      ],
    );
  };

  const lastSeen = relativeTime(lastConnectedAt);

  // Error/empty states keyed off bleReason (only when not actively busy/connected).
  const showErrorBlock =
    !isConnected &&
    !isScanning &&
    !isConnecting &&
    (bleReason === 'poweredOff' ||
      bleReason === 'unauthorized' ||
      bleReason === 'noDeviceFound' ||
      bleReason === 'unsupported');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — mirrors BlockedUsersScreen */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Bluetooth Devices</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Current status card ── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.statusHeaderRow}>
            <View
              style={[
                styles.statusIconCircle,
                { backgroundColor: isConnected ? colors.successMuted : colors.goldMuted },
              ]}
            >
              <Ionicons
                name={isConnected ? 'bluetooth' : 'bluetooth-outline'}
                size={22}
                color={isConnected ? colors.success : colors.gold}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[styles.statusLabel, { color: colors.textMuted }]}>HEART-RATE MONITOR</Text>
              <Text style={[styles.statusLine, { color: colors.textPrimary }]}>{statusLine}</Text>
            </View>
            {(isScanning || isConnecting) && (
              <ActivityIndicator color={colors.gold} style={{ marginLeft: 8 }} />
            )}
          </View>

          {isConnected && (
            <View style={[styles.metricsRow, { borderTopColor: colors.divider }]}>
              <View style={styles.metric}>
                <Text style={[styles.metricValue, { color: colors.textPrimary }]}>
                  {currentBpm > 0 ? currentBpm : '—'}
                </Text>
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>BPM</Text>
              </View>
              {batteryLevel != null && (
                <View style={styles.metric}>
                  <Text style={[styles.metricValue, { color: colors.textPrimary }]}>{batteryLevel}%</Text>
                  <Text style={[styles.metricLabel, { color: colors.textMuted }]}>BATTERY</Text>
                </View>
              )}
              <View style={styles.metric}>
                <SignalBars rssi={signalRssi} />
                <Text style={[styles.metricLabel, { color: colors.textMuted }]}>SIGNAL</Text>
              </View>
            </View>
          )}

          {isConnected && lastSeen && (
            <Text style={[styles.lastConnected, { color: colors.textMuted }]}>
              Last connected {lastSeen}
            </Text>
          )}
        </View>

        {/* ── 2. Saved device (offline) — one-tap reconnect ── */}
        {savedDevice && !isConnected && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>SAVED DEVICE</Text>
            <View style={styles.savedRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.deviceName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {savedDevice.name ?? 'HR Monitor'}
                </Text>
                {relativeTime(savedDevice.lastConnectedAt) && (
                  <Text style={[styles.deviceSub, { color: colors.textMuted }]}>
                    Last connected {relativeTime(savedDevice.lastConnectedAt)}
                  </Text>
                )}
              </View>
              <SoundPressable
                style={[styles.primaryBtn, { backgroundColor: colors.gold }]}
                onPress={() => reconnectSaved()}
                disabled={isConnecting}
              >
                <Ionicons name="refresh" size={16} color={colors.textInverse} />
                <Text style={[styles.primaryBtnText, { color: colors.textInverse }]}>Reconnect</Text>
              </SoundPressable>
            </View>
          </View>
        )}

        {/* ── 5. Honest error / empty states (keyed off bleReason) ── */}
        {showErrorBlock && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {bleReason === 'poweredOff' && (
              <View style={styles.emptyBlock}>
                <Ionicons name="bluetooth-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Bluetooth is off</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Turn on Bluetooth in Control Center to scan for your monitor.
                </Text>
              </View>
            )}
            {bleReason === 'unauthorized' && (
              <View style={styles.emptyBlock}>
                <Ionicons name="lock-closed-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Permission needed</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Zenki needs Bluetooth access to find your heart-rate monitor.
                </Text>
                <SoundPressable
                  style={[styles.outlineBtn, { borderColor: colors.gold }]}
                  onPress={() => Linking.openSettings()}
                >
                  <Text style={[styles.outlineBtnText, { color: colors.gold }]}>Allow Bluetooth in Settings</Text>
                </SoundPressable>
              </View>
            )}
            {bleReason === 'noDeviceFound' && (
              <View style={styles.emptyBlock}>
                <Ionicons name="search-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No monitor found</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Bring the strap closer / wet the contacts, then scan again.
                </Text>
              </View>
            )}
            {bleReason === 'unsupported' && (
              <View style={styles.emptyBlock}>
                <Ionicons name="alert-circle-outline" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Not available</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>
                  Bluetooth isn't available on this device.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── 3. Scan + discovered devices ── */}
        {bleReason !== 'unsupported' && bleStatus !== 'unavailable' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>NEARBY MONITORS</Text>

            <SoundPressable
              style={[styles.scanBtn, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}
              onPress={() => startScan()}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <ActivityIndicator color={colors.gold} size="small" />
                  <Text style={[styles.scanBtnText, { color: colors.textPrimary }]}>Scanning…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="search" size={18} color={colors.gold} />
                  <Text style={[styles.scanBtnText, { color: colors.textPrimary }]}>Scan for devices</Text>
                </>
              )}
            </SoundPressable>

            {discoveredDevices.length > 0 && (
              <View style={styles.deviceList}>
                {discoveredDevices.map((device: BLEDeviceInfo) => (
                  <SoundPressable
                    key={device.id}
                    style={[styles.deviceRow, { borderTopColor: colors.divider }]}
                    onPress={() => connectToDevice(device.id)}
                    disabled={isConnecting}
                  >
                    <Ionicons name="heart-outline" size={18} color={colors.textSecondary} />
                    <Text style={[styles.deviceRowName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {device.name}
                    </Text>
                    <SignalBars rssi={device.rssi} />
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
                  </SoundPressable>
                ))}
              </View>
            )}

            {!isScanning && discoveredDevices.length === 0 && bleReason !== 'noDeviceFound' && (
              <Text style={[styles.helperText, { color: colors.textMuted }]}>
                Tap scan to discover heart-rate monitors nearby.
              </Text>
            )}
          </View>
        )}

        {/* ── 4. Actions: Disconnect / Forget ── */}
        {(isConnected || savedDevice) && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.gold }]}>ACTIONS</Text>
            {isConnected && (
              <SoundPressable
                style={[styles.actionRow, { borderTopColor: colors.divider }]}
                onPress={() => disconnect()}
              >
                <Ionicons name="bluetooth-outline" size={18} color={colors.textPrimary} />
                <Text style={[styles.actionText, { color: colors.textPrimary }]}>Disconnect</Text>
              </SoundPressable>
            )}
            {savedDevice && (
              <SoundPressable
                style={[styles.actionRow, { borderTopColor: colors.divider }]}
                onPress={handleForget}
              >
                <Ionicons name="trash-outline" size={18} color={colors.error} />
                <Text style={[styles.actionText, { color: colors.error }]}>Forget device</Text>
              </SoundPressable>
            )}
          </View>
        )}

        <View style={{ height: spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },

  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },

  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },

  // Status card
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statusLine: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 3,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  lastConnected: {
    fontSize: 12,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Section labels inside cards
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },

  // Saved device
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceName: { fontSize: 16, fontWeight: '700' },
  deviceSub: { fontSize: 12, marginTop: 2 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700' },
  outlineBtn: {
    marginTop: spacing.md,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
  },
  outlineBtnText: { fontSize: 14, fontWeight: '700' },

  // Scan
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  scanBtnText: { fontSize: 15, fontWeight: '700' },
  deviceList: {
    marginTop: spacing.sm,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  deviceRowName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    marginTop: spacing.sm,
    textAlign: 'center',
  },

  // Signal bars
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 17,
  },
  signalBar: {
    width: 3,
    borderRadius: 1,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionText: { fontSize: 15, fontWeight: '600' },

  // Empty / error blocks
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: spacing.xs },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 18, paddingHorizontal: spacing.sm },
});
