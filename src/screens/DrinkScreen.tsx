import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { useDrinkTracker } from '../context/DrinkTrackerContext';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { DrinkType } from '../types/drinks';
import { typography, spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';

// Interpolate color from white → gold → red as total approaches $100
function getTabColor(total: number): string {
  const ratio = Math.min(total / 100, 1);
  if (ratio < 0.5) {
    // white (255,255,255) → gold (212,160,23)
    const t = ratio * 2;
    const r = Math.round(255 - (255 - 212) * t);
    const g = Math.round(255 - (255 - 160) * t);
    const b = Math.round(255 - (255 - 23) * t);
    return `rgb(${r},${g},${b})`;
  }
  // gold (212,160,23) → red (196,30,42)
  const t = (ratio - 0.5) * 2;
  const r = Math.round(212 - (212 - 196) * t);
  const g = Math.round(160 - (160 - 30) * t);
  const b = Math.round(23 + (42 - 23) * t);
  return `rgb(${r},${g},${b})`;
}

function AnimatedDrinkButton({ type, label, icon, color, price, onAdd }: {
  type: DrinkType; label: string; icon: string; color: string; price: number;
  onAdd: (type: DrinkType) => void;
}) {
  const { colors } = useTheme();
  const { reduceMotion } = useMotion();
  const bounceAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    onAdd(type);
    if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 1.12, duration: 100, useNativeDriver: true }),
        Animated.spring(bounceAnim, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
      ]).start();
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.drinkButtonWrapper}>
      <Animated.View style={[styles.drinkButton, { backgroundColor: color + '12', borderColor: color, transform: [{ scale: bounceAnim }] }]}>
        <Ionicons name={icon as any} size={28} color={color} />
        <Text style={[styles.drinkLabel, { color: colors.textPrimary }]}>{label}</Text>
        <Text style={[styles.drinkPrice, { color }]}>${price.toFixed(2)}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function DrinkScreen() {
  const { colors } = useTheme();
  const { todayCounts, todayTotal, addDrink, todayEntries, getAllMonths } = useDrinkTracker();
  const [showMonthly, setShowMonthly] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Drinks</Text>
            <TouchableOpacity
              style={[styles.toggleButton, { backgroundColor: showMonthly ? colors.gold : colors.surface, borderColor: showMonthly ? colors.gold : colors.borderSubtle }]}
              onPress={() => setShowMonthly(!showMonthly)}
            >
              <Ionicons name={showMonthly ? 'today-outline' : 'calendar-outline'} size={16} color={showMonthly ? '#000' : colors.gold} />
              <Text style={[styles.toggleText, { color: showMonthly ? '#000' : colors.gold }]}>
                {showMonthly ? 'Today' : 'Monthly'}
              </Text>
            </TouchableOpacity>
          </View>
        </FadeInView>

        {!showMonthly ? (
          <>
            {/* Today's Tab */}
            <FadeInView delay={60} slideUp={14}>
              <View style={[styles.totalCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                <Text style={[styles.totalLabel, { color: colors.textMuted }]}>BALANCE DUE</Text>
                <Text style={[styles.totalNumber, { color: getTabColor(todayTotal) }]}>${todayTotal.toFixed(2)}</Text>
                <Text style={[styles.totalDrinks, { color: colors.textMuted }]}>{todayEntries.length} item{todayEntries.length !== 1 ? 's' : ''}</Text>
              </View>
            </FadeInView>

            {/* Pay Button */}
            {todayTotal > 0 && (
              <FadeInView delay={80} slideUp={10}>
                <View style={styles.section}>
                  <TouchableOpacity
                    style={[styles.payButton, { backgroundColor: colors.textPrimary }]}
                    onPress={() => {
                      Alert.alert(
                        'Confirm Payment',
                        `Balance due: $${todayTotal.toFixed(2)}\n\nProceed with Apple Pay?`,
                      );
                    }}
                  >
                    <Ionicons name="logo-apple" size={22} color="#000" />
                    <Text style={styles.payButtonText}>Pay ${todayTotal.toFixed(2)}</Text>
                  </TouchableOpacity>
                </View>
              </FadeInView>
            )}

            {/* Drink Buttons */}
            <FadeInView delay={120} slideUp={14}>
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SELECT BEVERAGE</Text>
                <View style={styles.drinkGrid}>
                  {DRINK_DEFINITIONS.map((d) => (
                    <AnimatedDrinkButton key={d.type} {...d} onAdd={addDrink} />
                  ))}
                </View>
              </View>
            </FadeInView>

            {/* Today's Breakdown */}
            {todayEntries.length > 0 && (
              <FadeInView delay={180} slideUp={14}>
                <View style={styles.section}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>CURRENT CHARGES</Text>
                  <View style={[styles.breakdownCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    {DRINK_DEFINITIONS.filter((d) => todayCounts[d.type] > 0).map((d) => (
                      <View key={d.type} style={[styles.breakdownRow, { borderBottomColor: colors.divider }]}>
                        <View style={styles.breakdownLeft}>
                          <Ionicons name={d.icon as any} size={20} color={d.color} />
                          <Text style={[styles.breakdownName, { color: colors.textPrimary }]}>{d.label}</Text>
                          <View style={[styles.countBadge, { backgroundColor: d.color + '30' }]}>
                            <Text style={[styles.countText, { color: d.color }]}>×{todayCounts[d.type]}</Text>
                          </View>
                        </View>
                        <Text style={[styles.breakdownAmount, { color: colors.gold }]}>
                          ${(todayCounts[d.type] * d.price).toFixed(2)}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalRowLabel, { color: colors.textMuted }]}>Total</Text>
                      <Text style={[styles.totalRowAmount, { color: colors.gold }]}>${todayTotal.toFixed(2)}</Text>
                    </View>
                  </View>
                </View>
              </FadeInView>
            )}
          </>
        ) : (
          /* Monthly View */
          <FadeInView delay={60} slideUp={14}>
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MONTHLY CHARGES</Text>
              {getAllMonths().map((m) => (
                <View key={m.month} style={[styles.monthCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                  <View style={styles.monthHeader}>
                    <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>{m.label}</Text>
                    <Text style={[styles.monthTotal, { color: colors.gold }]}>${m.totalCharge.toFixed(2)}</Text>
                  </View>
                  <Text style={[styles.monthDays, { color: colors.textMuted }]}>
                    {m.totalCount} drinks · {m.dailyEntries} days
                  </Text>
                  {m.totalCount > 0 && (
                    <View style={styles.monthBreakdown}>
                      {DRINK_DEFINITIONS.filter((d) => m.counts[d.type] > 0).map((d) => (
                        <View key={d.type} style={[styles.monthBreakdownRow, { borderBottomColor: colors.divider }]}>
                          <View style={styles.breakdownLeft}>
                            <Ionicons name={d.icon as any} size={16} color={d.color} />
                            <Text style={[styles.monthBreakdownName, { color: colors.textSecondary }]}>{d.label}</Text>
                            <Text style={[styles.monthBreakdownQty, { color: colors.textMuted }]}>×{m.counts[d.type]}</Text>
                          </View>
                          <Text style={[styles.monthBreakdownCharge, { color: colors.textPrimary }]}>${m.charges[d.type].toFixed(2)}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))}
              {getAllMonths().every((m) => m.totalCount === 0) && (
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No drinks logged yet
                </Text>
              )}
            </View>
          </FadeInView>
        )}

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  toggleText: { ...typography.label, fontSize: 11 },
  totalCard: {
    marginHorizontal: spacing.lg,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
  },
  totalLabel: { fontSize: 12, fontWeight: '600' },
  totalNumber: { fontSize: 48, fontWeight: '800' },
  totalDrinks: { fontSize: 16, fontWeight: '500' },
  tabBarBg: { height: 6, borderRadius: 3, width: '100%', marginTop: spacing.sm, overflow: 'hidden' },
  tabBarFill: { height: '100%', borderRadius: 3 },
  tabBarLabel: { ...typography.label, fontSize: 9, marginTop: 4 },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  payButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#000',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: 32,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: spacing.md },
  drinkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.smd,
  },
  drinkButtonWrapper: {
    width: '31.5%',
    aspectRatio: 1,
    minHeight: 120,
  },
  drinkButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  drinkLabel: { fontSize: 13, fontWeight: '600' },
  drinkPrice: { fontSize: 16, fontWeight: '800' },
  breakdownCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1.5 },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
  },
  breakdownLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  breakdownName: { ...typography.body, fontWeight: '500' },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: borderRadius.full },
  countText: { fontSize: 12, fontWeight: '700' },
  breakdownAmount: { fontSize: 16, fontWeight: '800' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  totalRowLabel: { ...typography.label },
  totalRowAmount: { fontSize: 20, fontWeight: '900' },
  // Monthly
  monthCard: {
    borderRadius: 16,
    padding: spacing.md + 4,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
  },
  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthLabel: { ...typography.cardTitle, fontSize: 16 },
  monthTotal: { fontSize: 22, fontWeight: '900' },
  monthDays: { ...typography.bodySmall, fontSize: 11, marginTop: 2 },
  monthBreakdown: { marginTop: spacing.sm },
  monthBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
  },
  monthBreakdownName: { ...typography.bodySmall },
  monthBreakdownQty: { ...typography.bodySmall, fontSize: 11 },
  monthBreakdownCharge: { ...typography.body, fontWeight: '600' },
  emptyText: { ...typography.body, textAlign: 'center', paddingVertical: spacing.lg },
});
