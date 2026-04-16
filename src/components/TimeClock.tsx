import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useTimeClock } from '../context/TimeClockContext';
import { typography, spacing, borderRadius } from '../theme';
import {
  formatDuration,
  formatCurrency,
  formatPeriodLabel,
  getRequiredRestBreaks,
  getRequiredMealBreaks,
  getAutoMealDeductionMinutes,
} from '../utils/timeclock';
import { getHolidayInfo } from '../data/holidays';
import { PressableScale } from './PressableScale';

export function TimeClock() {
  const { colors } = useTheme();
  const {
    isClockedIn,
    elapsedMinutes,
    clockIn,
    clockOut,
    state,
    periodSummary,
  } = useTimeClock();

  const entry = state.currentEntry;
  const todayHoliday = getHolidayInfo(new Date());

  // Live break requirements based on elapsed time
  const requiredMealBreaks = getRequiredMealBreaks(elapsedMinutes);
  const requiredRestBreaks = getRequiredRestBreaks(elapsedMinutes);
  const autoMealDeduction = getAutoMealDeductionMinutes(elapsedMinutes);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
      {/* Holiday Banner */}
      {todayHoliday.isHoliday && (
        <View style={[styles.holidayBanner, { backgroundColor: colors.gold + '20', borderColor: colors.gold }]}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={[styles.holidayText, { color: colors.gold }]}>
            {todayHoliday.name} · Double pay (2×)
          </Text>
        </View>
      )}

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

      {/* Live Break Requirements — auto-calculated per CA law */}
      {isClockedIn && (
        <View style={[styles.breakInfoBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
          <View style={styles.breakInfoHeader}>
            <Ionicons name="cafe-outline" size={14} color={colors.gold} />
            <Text style={[styles.breakInfoTitle, { color: colors.textSecondary }]}>CA Labor Breaks</Text>
          </View>
          <View style={styles.breakInfoRow}>
            <Text style={[styles.breakInfoLabel, { color: colors.textMuted }]}>Rest breaks (paid)</Text>
            <Text style={[styles.breakInfoValue, { color: colors.textPrimary }]}>
              {requiredRestBreaks} × 10 min
            </Text>
          </View>
          <View style={styles.breakInfoRow}>
            <Text style={[styles.breakInfoLabel, { color: colors.textMuted }]}>Meal breaks (unpaid)</Text>
            <Text style={[styles.breakInfoValue, { color: colors.textPrimary }]}>
              {requiredMealBreaks} × 30 min
            </Text>
          </View>
          {autoMealDeduction > 0 && (
            <View style={styles.breakInfoRow}>
              <Text style={[styles.breakInfoLabel, { color: colors.textMuted }]}>Auto-deducted</Text>
              <Text style={[styles.breakInfoValue, { color: colors.warning }]}>
                −{autoMealDeduction} min
              </Text>
            </View>
          )}
        </View>
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

        {/* Breakdown: regular / OT / DT / holiday */}
        {periodSummary.totalPaidHours > 0 && (
          <View style={styles.breakdownRow}>
            <BreakdownChip label="Reg" value={periodSummary.regularHours} color={colors.textSecondary} />
            {periodSummary.overtimeHours > 0 && (
              <BreakdownChip label="OT 1.5×" value={periodSummary.overtimeHours} color={colors.warning} />
            )}
            {periodSummary.doubletimeHours > 0 && (
              <BreakdownChip label="DT 2×" value={periodSummary.doubletimeHours} color={colors.error} />
            )}
            {periodSummary.holidayHours > 0 && (
              <BreakdownChip label="Holiday 2×" value={periodSummary.holidayHours} color={colors.gold} />
            )}
          </View>
        )}

        <Text style={[styles.periodDates, { color: colors.textMuted }]}>
          {formatPeriodLabel(state.currentPeriod.startDate, state.currentPeriod.endDate)}
        </Text>
      </View>
    </View>
  );
}

function BreakdownChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.chip, { borderColor: color }]}>
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
      <Text style={[styles.chipValue, { color }]}>{value.toFixed(1)}h</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg + 4,
    borderWidth: 1,
  },
  holidayBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  holidayText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { ...typography.label, fontSize: 12, flex: 1 },
  timerText: { fontSize: 24, fontWeight: '900' },
  buttonSection: { alignItems: 'center', marginBottom: spacing.lg },
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
  breakInfoBox: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    padding: spacing.sm + 4,
    gap: 6,
    marginBottom: spacing.sm,
  },
  breakInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  breakInfoTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  breakInfoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakInfoLabel: { fontSize: 12 },
  breakInfoValue: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, marginVertical: spacing.md },
  summarySection: { alignItems: 'center' },
  summaryLabel: { ...typography.label, fontSize: 10, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summaryUnit: { ...typography.label, fontSize: 9, marginTop: 2 },
  summaryDivider: { width: 1, height: 30 },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm + 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  chipValue: { fontSize: 11, fontWeight: '800' },
  periodDates: {
    ...typography.bodySmall,
    fontSize: 11,
    marginTop: spacing.smd,
  },
});
