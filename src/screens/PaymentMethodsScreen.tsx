import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
}

const MOCK_CARDS: SavedCard[] = [
  { id: '1', brand: 'Visa', last4: '4242', expiry: '12/27', isDefault: true },
];

const BRAND_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Visa: 'card-outline',
  Mastercard: 'card-outline',
  Amex: 'card-outline',
};

export function PaymentMethodsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [cards, setCards] = useState<SavedCard[]>(MOCK_CARDS);

  const handleSetDefault = (id: string) => {
    setCards((prev) =>
      prev.map((c) => ({ ...c, isDefault: c.id === id })),
    );
  };

  const handleRemoveCard = (id: string) => {
    const card = cards.find((c) => c.id === id);
    Alert.alert(
      'Remove Card',
      `Remove ${card?.brand} ending in ${card?.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setCards((prev) => prev.filter((c) => c.id !== id)),
        },
      ],
    );
  };

  const handleAddCard = () => {
    // In production, this would open Stripe's card input sheet
    Alert.alert(
      'Add Card',
      'Stripe card input will open here. This is a placeholder for @stripe/stripe-react-native CardField integration.',
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Payment Methods</Text>
          <View style={styles.backButton} />
        </View>

        {/* Saved Cards */}
        {cards.length > 0 ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SAVED CARDS</Text>
            {cards.map((card) => (
              <View
                key={card.id}
                style={[
                  styles.cardItem,
                  { backgroundColor: colors.surface },
                  card.isDefault && { borderColor: colors.gold },
                ]}
              >
                <View style={styles.cardMain}>
                  <Ionicons name={BRAND_ICONS[card.brand] || 'card-outline'} size={28} color={colors.gold} />
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardBrand, { color: colors.textPrimary }]}>
                      {card.brand} ····  {card.last4}
                    </Text>
                    <Text style={[styles.cardExpiry, { color: colors.textMuted }]}>
                      Expires {card.expiry}
                    </Text>
                  </View>
                  {card.isDefault && (
                    <View style={[styles.defaultBadge, { backgroundColor: colors.goldMuted }]}>
                      <Text style={[styles.defaultText, { color: colors.gold }]}>DEFAULT</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.cardActions, { borderTopColor: colors.divider }]}>
                  {!card.isDefault && (
                    <TouchableOpacity
                      style={styles.cardAction}
                      onPress={() => handleSetDefault(card.id)}
                    >
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.gold} />
                      <Text style={[styles.cardActionText, { color: colors.gold }]}>Set Default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.cardAction}
                    onPress={() => handleRemoveCard(card.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.error} />
                    <Text style={[styles.cardActionText, { color: colors.error }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="card-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Cards Saved</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Add a payment method to book sessions and purchase gear.
            </Text>
          </View>
        )}

        {/* Add Card */}
        <View style={styles.section}>
          <Button
            title="Add New Card"
            onPress={handleAddCard}
            variant="outline"
            fullWidth
            size="lg"
          />
        </View>

        {/* Apple Pay */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>OTHER</Text>
          <View style={[styles.otherMethod, { backgroundColor: colors.surface }]}>
            <Ionicons name="logo-apple" size={24} color={colors.textPrimary} />
            <Text style={[styles.otherLabel, { color: colors.textPrimary }]}>Apple Pay</Text>
            <View style={[styles.connectedBadge, { backgroundColor: colors.goldMuted }]}>
              <Text style={[styles.connectedText, { color: colors.gold }]}>Connected</Text>
            </View>
          </View>
        </View>

        {/* Security */}
        <View style={styles.securityRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.securityText, { color: colors.textMuted }]}>
            Card data is encrypted and stored securely by Stripe. Zenki Dojo never stores your full card number.
          </Text>
        </View>

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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.sectionTitle,
    fontSize: 20,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.md,
  },
  cardItem: {
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  cardInfo: {
    flex: 1,
  },
  cardBrand: {
    ...typography.body,
    fontWeight: '600',
  },
  cardExpiry: {
    ...typography.bodySmall,
    marginTop: 2,
  },
  defaultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  defaultText: {
    ...typography.label,
    fontSize: 9,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.lg,
  },
  cardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardActionText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    ...typography.cardTitle,
    marginTop: spacing.md,
  },
  emptyDesc: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  otherMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  otherLabel: {
    ...typography.body,
    fontWeight: '500',
    flex: 1,
  },
  connectedBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  connectedText: {
    ...typography.label,
    fontSize: 10,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  securityText: {
    ...typography.bodySmall,
    flex: 1,
    lineHeight: 18,
  },
});
