import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { SoundPressable } from '../components/SoundPressable';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { getLocalOrders } from '../services/orderSync';
import { Order } from '../types/orders';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function OrderHistoryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [orders, setOrders] = useState<Order[] | null>(null);

  // Reload from local storage every time the screen focuses (orders are the
  // receipt source of truth — getLocalOrders, newest first).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      getLocalOrders().then((o) => { if (active) setOrders(o); });
      return () => { active = false; };
    }, []),
  );

  const renderStatus = (o: Order) => {
    const paid = o.status === 'paid';
    const color = paid ? colors.success : colors.gold;
    const label = o.paymentMethod === 'apple_pay'
      ? 'Paid · Apple Pay'
      : paid
        ? 'Paid · Points'
        : 'Reserved';
    return (
      <View style={[styles.statusPill, { backgroundColor: color + '22', borderColor: color }]}>
        <Text style={[styles.statusText, { color }]}>{label}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>My orders</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {orders === null ? null : orders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No orders yet</Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              Orders you place in the store will show up here as receipts.
            </Text>
          </View>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.orderId, { color: colors.textPrimary }]}>#{o.id.slice(-6).toUpperCase()}</Text>
                {renderStatus(o)}
              </View>
              <Text style={[styles.date, { color: colors.textMuted }]}>{formatDate(o.createdAt)}</Text>

              <View style={styles.items}>
                {o.items.map((it, i) => (
                  <View key={`${o.id}_${i}`} style={styles.itemRow}>
                    <Text style={[styles.itemName, { color: colors.textSecondary }]} numberOfLines={1}>
                      {it.quantity}× {it.productName}{it.selectedSize ? ` (${it.selectedSize})` : ''}
                    </Text>
                    <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
                      ${(it.unitPrice * it.quantity).toFixed(2)}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
                {o.pointsUsed > 0 && (
                  <Text style={[styles.discount, { color: colors.gold }]}>−{o.pointsUsed.toLocaleString()} pts</Text>
                )}
                {o.promoDiscountUsd > 0 && (
                  <Text style={[styles.discount, { color: colors.success }]}>−${o.promoDiscountUsd.toFixed(2)} {o.promoLabel ?? 'promo'}</Text>
                )}
                <Text style={[styles.total, { color: colors.textPrimary }]}>
                  {o.paymentMethod === 'apple_pay'
                    ? `Paid $${(o.subtotal - o.pointsValueUsd - o.promoDiscountUsd).toFixed(2)}`
                    : o.balanceDueUsd === 0
                      ? 'Paid in full'
                      : `Due at dojo: $${o.balanceDueUsd.toFixed(2)}`}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub: { fontSize: 13, textAlign: 'center', maxWidth: 280, lineHeight: 19 },
  card: { borderRadius: borderRadius.lg, borderWidth: 1, padding: spacing.md, marginBottom: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderId: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusText: { fontSize: 11, fontWeight: '700' },
  date: { fontSize: 12, marginTop: 2, marginBottom: spacing.sm },
  items: { gap: 4 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  itemName: { fontSize: 13, flex: 1 },
  itemPrice: { fontSize: 13, fontWeight: '600' },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, alignItems: 'flex-end', gap: 2 },
  discount: { fontSize: 12, fontWeight: '600' },
  total: { fontSize: 15, fontWeight: '800' },
});
