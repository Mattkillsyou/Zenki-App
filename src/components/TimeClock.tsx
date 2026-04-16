import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTimeClock } from '../context/TimeClockContext';
import { typography, spacing, borderRadius } from '../theme';
import { formatDuration, formatCurrency, formatPeriodLabel } from '../utils/timeclock';
import { PressableScale } from './PressableScale';

export function TimeClock() {
  const { colors } = useTheme();
  const {
    isClockedIn,
    elapsedMinutes,
    clockIn,
    clockOut,
    markLunchTaken,
    markBreakTaken,
    state,
    periodSummary,
  } = useTimeClock();

  const entry = state.currentEntry;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      {/* Status */}
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: isClockedIn ? colors.success : colors.textMuted }]} />
        <Text style={[styles.statusText, { color: isClockedIn ? colors.success : colors.textMuted }]}>
          {isClockedIn ? 'CLOCKED IN' : 'CLOCKED OUT'}
        </Text>
        {isClockedIn && (
          <Text style={[styles.timerText, { color: colors.textPrimary }]}>
            {formatDuration(elapsedMinutes)}
          </Text>
        )}
      </View>

      {/* Big Clock Button */}
      <View style={styles.buttonSection}>
        <PressableScale onPress={isClockedIn ? clockOut : clockIn}>
          <View style={[styles.clockButton, { backgroundColor: colors.red, borderColor: colors.red + '30' }]}>
            <Ionicons
              name={isClockedIn ? 'stop' : 'play'}
              size={80}
              color="#FFFFFF"
            />
          </View>
        </PressableScale>
        <Text style={[styles.clockLabel, { color: colors.textSecondary }]}>
          {isClockedIn ? 'CLOCK OUT' : 'CLOCK IN'}
        </Text>
      </View>

      {/* Break Buttons — only when clocked in */}
      {isClockedIn && (
        <View style={styles.breakSection}>
          <TouchableOpacity
            style={[
              styles.breakButton,
              { borderColor: entry?.lunchTaken ? colors.gold : colors.border },
              entry?.lunchTaken && { backgroundColor: colors.goldMuted },
            ]}
            onPress={markLunchTaken}
            disabled={entry?.lunchTaken}
          >
            {entry?.lunchTaken && (
              <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
            )}
            <Text style={[styles.breakLabel, { color: entry?.lunchTaken ? colors.gold : colors.textSecondary }]}>
              Lunch (1hr)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.breakButton,
              { borderColor: entry?.breakTaken ? colors.gold : colors.border },
              entry?.breakTaken && { backgroundColor: colors.goldMuted },
            ]}
            onPress={markBreakTaken}
            disabled={entry?.breakTaken}
          >
            {entry?.breakTaken && (
              <Ionicons name="checkmark-circle" size={16} color={colors.gold} />
            )}
            <Text style={[styles.breakLabel, { color: entry?.breakTaken ? colors.gold : colors.textSecondary }]}>
              Break (15m)
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Break note */}
      {isClockedIn && (
        <Text style={[styles.deductionNote, { color: colors.textMuted }]}>
          Log your breaks above
        </Text>
      )}

      {/* Divider */}
      <View style={[styles.divider, { backgroundColor: colors.divider }]} />

      {/* Period Summary */}
      <View style={styles.summarySection}>
        <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>THIS PERIOD</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.gold }]}>
              {periodSummary.totalPaidHours.toFixed(1)}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>hours</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.gold }]}>
              {formatCurrency(periodSummary.totalPay)}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>pay</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.divider }]} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
              {periodSummary.daysWorked}
            </Text>
            <Text style={[styles.summaryUnit, { color: colors.textMuted }]}>days</Text>
          </View>
        </View>
        <Text style={[styles.periodDates, { color: colors.textMuted }]}>
          {formatPeriodLabel(state.currentPeriod.startDate, state.currentPeriod.endDate)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    ...typography.label,
    fontSize: 12,
    flex: 1,
  },
  timerText: {
    fontSize: 24,
    fontWeight: '900',
  },
  buttonSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  clockButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  clockLabel: {
    ...typography.label,
    fontSize: 12,
    marginTop: spacing.sm,
    letterSpacing: 2,
  },
  breakSection: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  breakButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  breakLabel: {
    ...typography.label,
    fontSize: 11,
  },
  deductionNote: {
    ...typography.bodySmall,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  divider: {
    height: 1,
    marginVertical: spacing.md,
  },
  summarySection: {
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.label,
    fontSize: 10,
    marginBottom: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '900',
  },
  summaryUnit: {
    ...typography.label,
    fontSize: 9,
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 30,
  },
  periodDates: {
    ...typography.bodySmall,
    fontSize: 11,
    marginTop: spacing.smd,
  },
});
