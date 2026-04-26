import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAppointments, Appointment, AppointmentStatus } from '../context/AppointmentContext';
import { spacing } from '../theme';

const TABS: { key: AppointmentStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'all', label: 'All' },
];

export function AdminAppointmentsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { appointments, confirmAppointment, cancelAppointment, completeAppointment } = useAppointments();
  const [tab, setTab] = useState<AppointmentStatus | 'all'>('pending');

  const filtered = tab === 'all' ? appointments : appointments.filter((a) => a.status === tab);

  const handleConfirm = async (a: Appointment) => {
    await confirmAppointment(a.id);
    Alert.alert('Confirmed', `${a.memberName} will be reminded 1 hour before the session.`);
  };

  const handleCancel = (a: Appointment) => {
    Alert.alert(
      'Cancel appointment',
      `Cancel ${a.sessionType} with ${a.memberName}?`,
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Cancel it', style: 'destructive', onPress: () => cancelAppointment(a.id) },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable onPress={() => navigation.goBack()} style={[styles.iconBtn, { backgroundColor: colors.surface }]}>
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Appointments</Text>
        <View style={styles.iconBtn} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <SoundPressable
              key={t.key}
              style={[styles.tab, { backgroundColor: active ? colors.gold : colors.surface }]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, { color: active ? '#000' : colors.textSecondary }]}>{t.label}</Text>
            </SoundPressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>No {tab === 'all' ? '' : tab} appointments</Text>
          </View>
        )}

        {filtered.map((a) => (
          <View key={a.id} style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sessionType, { color: colors.textPrimary }]}>{a.sessionType}</Text>
                <Text style={[styles.memberName, { color: colors.textSecondary }]}>{a.memberName}</Text>
              </View>
              <StatusBadge status={a.status} colors={colors} />
            </View>
            <View style={styles.metaRow}>
              <Ionicons name="person-outline" size={13} color={colors.textTertiary} />
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>{a.instructor}</Text>
              <Text style={[styles.metaDot, { color: colors.textMuted }]}>·</Text>
              <Ionicons name="time-outline" size={13} color={colors.textTertiary} />
              <Text style={[styles.metaText, { color: colors.textTertiary }]}>
                {new Date(a.startsAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </Text>
            </View>

            {a.status === 'pending' && (
              <View style={styles.actions}>
                <SoundPressable style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => handleCancel(a)}>
                  <Text style={[styles.btnText, { color: colors.textSecondary }]}>Decline</Text>
                </SoundPressable>
                <SoundPressable style={[styles.btn, { backgroundColor: colors.gold }]} onPress={() => handleConfirm(a)}>
                  <Ionicons name="checkmark" size={16} color="#000" />
                  <Text style={[styles.btnText, { color: '#000' }]}>Confirm</Text>
                </SoundPressable>
              </View>
            )}
            {a.status === 'confirmed' && (
              <View style={styles.actions}>
                <SoundPressable style={[styles.btn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]} onPress={() => handleCancel(a)}>
                  <Text style={[styles.btnText, { color: colors.error }]}>Cancel</Text>
                </SoundPressable>
                <SoundPressable style={[styles.btn, { backgroundColor: colors.success }]} onPress={() => completeAppointment(a.id)}>
                  <Text style={[styles.btnText, { color: '#FFF' }]}>Mark Complete</Text>
                </SoundPressable>
              </View>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusBadge({ status, colors }: { status: AppointmentStatus; colors: any }) {
  const map: Record<AppointmentStatus, { bg: string; fg: string; label: string }> = {
    pending: { bg: colors.warningMuted || '#33291A', fg: colors.warning, label: 'Pending' },
    confirmed: { bg: colors.successMuted || '#1A2D1F', fg: colors.success, label: 'Confirmed' },
    cancelled: { bg: colors.errorMuted || '#2D1A1A', fg: colors.error, label: 'Cancelled' },
    completed: { bg: colors.surfaceSecondary, fg: colors.textSecondary, label: 'Completed' },
  };
  const s = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 0, paddingBottom: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '500' },
  card: { borderRadius: 14, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  sessionType: { fontSize: 15, fontWeight: '700' },
  memberName: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 12, fontWeight: '500' },
  metaDot: { fontSize: 12, marginHorizontal: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  btnText: { fontSize: 13, fontWeight: '700' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
