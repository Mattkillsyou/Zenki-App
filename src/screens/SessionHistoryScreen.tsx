import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHeartRate } from '../context/HeartRateContext';
import { ACTIVITY_LABELS } from '../types/heartRate';
import { zoneColor, strainColor, strainLabel, formatDuration } from '../utils/heartRate';
import { spacing } from '../theme';

export function SessionHistoryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { memberSessions } = useHeartRate();
  const sessions = user ? memberSessions(user.id) : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Session History</Text>
        <View style={{ width: 36 }} />
      </View>

      {sessions.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="heart-outline" size={44} color={colors.textMuted} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No sessions yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textMuted }]}>
            Start a workout session to see your heart rate data, strain, and calories here.
          </Text>
          <SoundPressable
            style={[styles.startBtn, { backgroundColor: colors.gold }]}
            onPress={() => navigation.navigate('WorkoutSession')}
          >
            <Ionicons name="play" size={18} color="#000" />
            <Text style={styles.startBtnText}>Start Session</Text>
          </SoundPressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {sessions.map((s) => {
            const date = new Date(s.startedAt);
            const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const sc = strainColor(s.strain);
            const sl = strainLabel(s.strain);

            // Zone breakdown as proportional bar
            const totalZone = s.zones.zone1 + s.zones.zone2 + s.zones.zone3 + s.zones.zone4 + s.zones.zone5;
            const zonePcts = totalZone > 0 ? [
              s.zones.zone1 / totalZone,
              s.zones.zone2 / totalZone,
              s.zones.zone3 / totalZone,
              s.zones.zone4 / totalZone,
              s.zones.zone5 / totalZone,
            ] : [0.2, 0.2, 0.2, 0.2, 0.2];

            return (
              <View key={s.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {/* Top row: activity + date */}
                <View style={styles.cardTop}>
                  <View>
                    <Text style={[styles.cardActivity, { color: colors.textPrimary }]}>
                      {ACTIVITY_LABELS[s.activityType]}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.textMuted }]}>
                      {dateStr} · {timeStr} · {formatDuration(s.durationMinutes * 60)}
                    </Text>
                  </View>
                  <View style={[styles.strainPill, { backgroundColor: sc + '20', borderColor: sc }]}>
                    <Text style={[styles.strainValue, { color: sc }]}>{s.strain.toFixed(1)}</Text>
                    <Text style={[styles.strainLabelText, { color: sc }]}>{sl}</Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.cardStats}>
                  <View style={styles.cardStat}>
                    <Ionicons name="heart" size={14} color={colors.red} />
                    <Text style={[styles.cardStatVal, { color: colors.textPrimary }]}>
                      {s.avgBpm}
                    </Text>
                    <Text style={[styles.cardStatUnit, { color: colors.textMuted }]}>avg</Text>
                  </View>
                  <View style={styles.cardStat}>
                    <Ionicons name="arrow-up" size={14} color="#EF4444" />
                    <Text style={[styles.cardStatVal, { color: colors.textPrimary }]}>
                      {s.maxBpm}
                    </Text>
                    <Text style={[styles.cardStatUnit, { color: colors.textMuted }]}>max</Text>
                  </View>
                  <View style={styles.cardStat}>
                    <Ionicons name="flash" size={14} color="#F97316" />
                    <Text style={[styles.cardStatVal, { color: colors.textPrimary }]}>
                      {s.calories}
                    </Text>
                    <Text style={[styles.cardStatUnit, { color: colors.textMuted }]}>kcal</Text>
                  </View>
                </View>

                {/* Zone breakdown bar */}
                <View style={styles.zoneBar}>
                  {zonePcts.map((pct, i) => (
                    <View
                      key={i}
                      style={{
                        flex: Math.max(pct, 0.02),
                        height: 8,
                        backgroundColor: zoneColor(i + 1),
                        borderTopLeftRadius: i === 0 ? 4 : 0,
                        borderBottomLeftRadius: i === 0 ? 4 : 0,
                        borderTopRightRadius: i === 4 ? 4 : 0,
                        borderBottomRightRadius: i === 4 ? 4 : 0,
                      }}
                    />
                  ))}
                </View>

                {/* Device */}
                {s.deviceName && (
                  <View style={styles.deviceRow}>
                    <Ionicons name="bluetooth" size={11} color={colors.textMuted} />
                    <Text style={[styles.deviceText, { color: colors.textMuted }]}>{s.deviceName}</Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
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
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  card: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardActivity: { fontSize: 16, fontWeight: '800' },
  cardDate: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  strainPill: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  strainValue: { fontSize: 18, fontWeight: '900' },
  strainLabelText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },

  cardStats: { flexDirection: 'row', gap: 16 },
  cardStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardStatVal: { fontSize: 15, fontWeight: '800' },
  cardStatUnit: { fontSize: 11, fontWeight: '500' },

  zoneBar: { flexDirection: 'row', gap: 1 },

  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deviceText: { fontSize: 10, fontWeight: '600' },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: 12,
  },
  emptyIcon: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 8,
  },
  startBtnText: { color: '#000', fontSize: 14, fontWeight: '800' },
});
