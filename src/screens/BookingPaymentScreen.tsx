import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import { useAuth } from '../context/AuthContext';
import { useAppointments } from '../context/AppointmentContext';

export function BookingPaymentScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { requestAppointment } = useAppointments();
  const { instructor, sessionType, time, price, calendarUrl, isProduct, startsAt, durationMinutes } = route.params || {};
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple'>('card');
  const [confirmed, setConfirmed] = useState(false);

  const handlePayment = async () => {
    setLoading(true);
    setTimeout(async () => {
      // For appointment bookings (not product orders), create a pending appointment
      if (!isProduct && user) {
        await requestAppointment({
          memberId: user.id,
          memberName: `${user.firstName} ${user.lastName}`.trim() || 'Member',
          instructor,
          sessionType,
          startsAt: startsAt || new Date().toISOString(),
          durationMinutes: durationMinutes || 60,
          price: price || 0,
        });
      }
      setLoading(false);
      setConfirmed(true);
    }, 1500);
  };

  const handleDone = () => navigation.popToTop();
  const handleAddToCalendar = () => {
    if (calendarUrl) Linking.openURL(calendarUrl);
    navigation.popToTop();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: 34, fontWeight: '800' }]}>Payment</Text>
          <View style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]} />
        </View>

        {/* Confirmation view */}
        {confirmed && (
          <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 32, alignItems: 'center' as const }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.gold} />
            <Text style={{ fontSize: 22, fontWeight: '700', color: colors.textPrimary, marginTop: 16, textAlign: 'center' }}>
              {isProduct ? 'Order Confirmed' : 'Booking Submitted'}
            </Text>
            <Text style={{ fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
              {isProduct
                ? `Your order for ${sessionType} has been placed.`
                : `${sessionType} with ${instructor} at ${time} is awaiting confirmation. You'll be reminded 1 hour before the session once approved.`}
            </Text>
            {!isProduct && calendarUrl && (
              <TouchableOpacity onPress={handleAddToCalendar} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
                <Ionicons name="calendar-outline" size={18} color={colors.gold} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.gold }}>Add to Calendar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleDone} style={{ backgroundColor: colors.red, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 48, marginTop: 24 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF' }}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Order Summary */}
        {!confirmed && <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderRadius: 20, padding: 24 }]}>

          <Text style={[styles.summaryTitle, { color: colors.textMuted }]}>
            {isProduct ? 'ORDER SUMMARY' : 'BOOKING SUMMARY'}
          </Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
              {isProduct ? 'Item' : 'Session'}
            </Text>
            <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{sessionType}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />

          {!isProduct && instructor ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Instructor</Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{instructor}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            </>
          ) : null}

          {time ? (
            <>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>
                  {isProduct ? 'Details' : 'Time'}
                </Text>
                <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>{time}</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.divider }]} />
            </>
          ) : null}

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Total</Text>
            <Text style={[styles.summaryValue, { color: colors.gold, fontWeight: '800', fontSize: 20 }]}>
              ${price}
            </Text>
          </View>
        </View>}

        {!confirmed && <>{/* Payment Method */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }]}>PAYMENT METHOD</Text>

          <TouchableOpacity
            style={[
              styles.methodCard,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1.5, padding: 18 },
              paymentMethod === 'apple' && { borderColor: colors.gold, backgroundColor: colors.gold + '08' },
            ]}
            onPress={() => setPaymentMethod('apple')}
          >

            <Ionicons name="logo-apple" size={24} color={colors.textPrimary} />
            <Text style={[styles.methodLabel, { color: colors.textPrimary }]}>Apple Pay</Text>
            {paymentMethod === 'apple' && (
              <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.methodCard,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1.5, padding: 18 },
              paymentMethod === 'card' && { borderColor: colors.gold, backgroundColor: colors.gold + '08' },
            ]}
            onPress={() => setPaymentMethod('card')}
          >

            <Ionicons name="card-outline" size={24} color={colors.textPrimary} />
            <Text style={[styles.methodLabel, { color: colors.textPrimary }]}>Credit / Debit Card</Text>
            {paymentMethod === 'card' && (
              <Ionicons name="checkmark-circle" size={22} color={colors.gold} />
            )}
          </TouchableOpacity>

          {paymentMethod === 'card' && (
            <View style={[styles.cardPreview, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 16, borderWidth: 1.5 }]}>

              <Ionicons name="card" size={20} color={colors.gold} />
              <Text style={[styles.cardText, { color: colors.textSecondary }]}>
                Visa ending in 4242
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('PaymentMethods')}>
                <Text style={[styles.changeText, { color: colors.gold }]}>Change</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Cancellation Policy */}
        <View style={styles.section}>
          <View style={[styles.policyCard, { backgroundColor: colors.goldMuted, borderColor: colors.gold }]}>
            <Ionicons name="information-circle-outline" size={18} color={colors.gold} />
            <Text style={[styles.policyText, { color: colors.gold }]}>
              Free cancellation up to 24 hours before your session. Late cancellations are charged in full.
            </Text>
          </View>
        </View>

        {/* Pay Button */}
        <View style={styles.section}>
          <Button
            title={`Pay $${price}`}
            onPress={handlePayment}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>
        </>}

        {/* Security note */}
        {!confirmed && <View style={styles.securityRow}>
          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
          <Text style={[styles.securityText, { color: colors.textMuted }]}>
            Payments processed securely via Stripe
          </Text>
        </View>}

        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  title: {
    ...typography.sectionTitle,
  },
  summaryCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  summaryTitle: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  summaryLabel: {
    ...typography.bodySmall,
  },
  summaryValue: {
    ...typography.body,
    fontWeight: '600',
  },
  divider: {
    height: 1,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: spacing.md,
  },
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  methodLabel: {
    ...typography.body,
    fontWeight: '500',
    flex: 1,
  },
  cardPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cardText: {
    ...typography.bodySmall,
    flex: 1,
  },
  changeText: {
    ...typography.bodySmall,
    fontWeight: '700',
  },
  policyCard: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  policyText: {
    ...typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  securityText: {
    ...typography.bodySmall,
    fontSize: 12,
  },
});
