import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useMotion } from '../context/MotionContext';
import { useDrinkTracker } from '../context/DrinkTrackerContext';
import { DRINK_DEFINITIONS } from '../data/drinks';
import { DrinkType } from '../types/drinks';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';
import { useGamification } from '../context/GamificationContext';
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

  const { play } = useSound();
  const handlePress = () => {
    play('tap');
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
  const { play } = useSound();
  const { recordDrinkLogged } = useGamification();
  useScreenSoundTheme('drinks');
  const {
    pending, pendingCounts, pendingTotal,
    addToPending, removeFromPending, clearPending, commitPending,
    unpaidTotal, payAllUnpaid,
    getAllMonths,
  } = useDrinkTracker();
  const [showMonthly, setShowMonthly] = useState(false);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Toggle — always at top */}
      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleButton, { backgroundColor: showMonthly ? colors.gold : colors.surface, borderColor: showMonthly ? colors.gold : colors.borderSubtle }]}
          onPress={() => setShowMonthly(!showMonthly)}
        >
          <Ionicons name={showMonthly ? 'today-outline' : 'calendar-outline'} size={14} color={showMonthly ? '#000' : colors.gold} />
          <Text style={[styles.toggleText, { color: showMonthly ? '#000' : colors.gold }]}>
            {showMonthly ? 'Today' : 'Monthly'}
          </Text>
        </TouchableOpacity>
      </View>

      {!showMonthly ? (
        /* ═════ Today view — single screen, flex layout ═════ */
        <View style={styles.todayBody}>
          {/* Menu header */}
          <View style={styles.menuHeaderRow}>
            <Text style={styles.menuEmoji}>🍴</Text>
            <View style={[styles.menuUnderline, { borderBottomColor: colors.gold }]}>
              <Text style={[styles.menuTitle, { color: colors.textPrimary }]}>
                MENU
              </Text>
            </View>
            <Text style={styles.menuEmoji}>🍴</Text>
          </View>

          {/* Drink grid */}
          <View style={styles.section}>
            <View style={styles.drinkGrid}>
              {DRINK_DEFINITIONS.map((d) => (
                <AnimatedDrinkButton key={d.type} {...d} onAdd={addToPending} />
              ))}
            </View>
          </View>

          {/* Cart area — always rendered so layout never shifts when items are added. */}
          <View style={[styles.section, styles.cartFlex]}>
            <View style={styles.cartHeader}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR ORDER</Text>
              {pending.length > 0 && (
                <TouchableOpacity onPress={clearPending}>
                  <Text style={[styles.clearText, { color: colors.error }]}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[styles.breakdownCard, styles.cartListWrap, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
              {pending.length === 0 ? (
                <View style={styles.cartEmptyState}>
                  <Ionicons name="cafe-outline" size={22} color={colors.textMuted} />
                  <Text style={[styles.cartEmptyText, { color: colors.textMuted }]}>
                    Tap a drink above to start an order
                  </Text>
                </View>
              ) : (
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ flexGrow: 1 }}
                >
                  {DRINK_DEFINITIONS.filter((d) => pendingCounts[d.type] > 0).map((d) => (
                    <View key={d.type} style={[styles.cartItemRow, { borderBottomColor: colors.divider }]}>
                      <Ionicons name={d.icon as any} size={20} color={d.color} />
                      <Text style={[styles.cartItemName, { color: colors.textPrimary }]}>{d.label}</Text>
                      <View style={styles.qtyControls}>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: colors.backgroundElevated }]}
                          onPress={() => removeFromPending(d.type)}
                        >
                          <Ionicons name="remove" size={16} color={colors.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[styles.qtyText, { color: colors.textPrimary }]}>{pendingCounts[d.type]}</Text>
                        <TouchableOpacity
                          style={[styles.qtyBtn, { backgroundColor: colors.backgroundElevated }]}
                          onPress={() => addToPending(d.type)}
                        >
                          <Ionicons name="add" size={16} color={colors.textPrimary} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.cartItemPrice, { color: colors.gold }]}>
                        ${(pendingCounts[d.type] * d.price).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Commit button — always rendered; disabled when cart is empty */}
            <TouchableOpacity
              style={[
                styles.commitBtn,
                { backgroundColor: pending.length > 0 ? colors.gold : colors.surfaceSecondary, opacity: pending.length > 0 ? 1 : 0.6 },
              ]}
              onPress={() => {
                play('success');
                const totalDrinksCommitted = pending.reduce((n, p) => n + p.count, 0);
                commitPending();
                for (let i = 0; i < totalDrinksCommitted; i++) recordDrinkLogged();
              }}
              disabled={pending.length === 0}
            >
              <Ionicons name="checkmark-circle" size={20} color={pending.length > 0 ? '#000' : colors.textMuted} />
              <Text style={[styles.commitBtnText, { color: pending.length > 0 ? '#000' : colors.textMuted }]}>
                {pending.length > 0 ? `Commit Order · $${pendingTotal.toFixed(2)}` : 'Commit Order'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      ) : (
        /* ═════ Monthly view — scrollable history ═════ */
        <ScrollView showsVerticalScrollIndicator={false}>
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

          <View style={{ height: spacing.xxl * 2 }} />
        </ScrollView>
      )}

      {/* Fixed bottom: unpaid balance + pay */}
      {!showMonthly && (
        <View style={[styles.bottomBar, { backgroundColor: colors.surface, borderTopColor: colors.borderSubtle }]}>
          <View style={styles.bottomBalance}>
            <Text style={[styles.bottomLabel, { color: colors.textMuted }]}>BALANCE DUE</Text>
            <Text style={[styles.bottomAmount, { color: getTabColor(unpaidTotal) }]}>
              ${unpaidTotal.toFixed(2)}
            </Text>
            <Text style={[styles.bottomCount, { color: colors.textMuted }]}>
              {unpaidTotal > 0 ? 'Unpaid charges' : 'Nothing due'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.bottomPayBtn, { backgroundColor: unpaidTotal > 0 ? colors.textPrimary : colors.surfaceSecondary }]}
            disabled={unpaidTotal === 0}
            onPress={async () => {
              await payAllUnpaid();
            }}
          >
            <Ionicons name="logo-apple" size={20} color={unpaidTotal > 0 ? colors.background : colors.textMuted} />
            <Text style={[styles.bottomPayText, { color: unpaidTotal > 0 ? colors.background : colors.textMuted }]}>
              Pay
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    position: 'relative',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: 0,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  toggleText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  totalCard: {
    marginHorizontal: spacing.lg,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 4,
    borderWidth: 0,
  },
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  totalNumber: { fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  totalDrinks: { fontSize: 13, fontWeight: '500', marginTop: 2 },
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
    marginTop: 12,
  },
  todayBody: {
    flex: 1,
    paddingBottom: 140,   // reserve room for the fixed BALANCE DUE bar so Commit Order is never hidden
  },
  cartFlex: {
    flex: 1,                // fills remaining vertical space
    minHeight: 180,
    paddingBottom: 0,
  },
  cartListWrap: {
    flex: 1,                // cart items scroll within this box
    minHeight: 60,
  },
  cartEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  cartEmptyText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  sectionLabel: { fontSize: 11, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5 },
  drinkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  drinkButtonWrapper: {
    width: '32%',
    aspectRatio: 1.15,
    minHeight: 88,
  },
  drinkButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
    paddingHorizontal: 4,
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  clearText: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  cartItemName: { fontSize: 14, fontWeight: '600', flex: 1 },
  qtyControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 14, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  cartItemPrice: { fontSize: 14, fontWeight: '700', minWidth: 60, textAlign: 'right' },
  commitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginTop: spacing.md,
    borderRadius: 14,
  },
  commitBtnText: { fontSize: 15, fontWeight: '800', color: '#000', letterSpacing: 0.3 },
  bottomBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 24,
    gap: 16,
    borderTopWidth: 1,
  },
  bottomBalance: { flex: 1 },
  bottomLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bottomAmount: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  bottomCount: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  bottomPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 14,
  },
  bottomPayText: { fontSize: 15, fontWeight: '700' },
  drinkLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  drinkPrice: { fontSize: 14, fontWeight: '800' },

  menuHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingHorizontal: spacing.lg,
    marginTop: 8,
    marginBottom: 2,
  },
  menuEmoji: {
    fontSize: 30,
  },
  menuUnderline: {
    paddingBottom: 3,
    borderBottomWidth: 3,
  },
  menuTitle: {
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'transparent',
    letterSpacing: 4,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
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
