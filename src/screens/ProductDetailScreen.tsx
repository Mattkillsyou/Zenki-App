import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import { PRODUCTS } from '../data/products';

export function ProductDetailScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { productId } = route.params;
  const product = PRODUCTS.find((p) => p.id === productId);

  const [selectedSize, setSelectedSize] = useState<string | null>(
    product?.sizes?.[0] || null,
  );
  const [quantity, setQuantity] = useState(1);

  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: spacing.md, fontSize: 16, fontWeight: '600' }}>
            Product not found
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.gold, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const savings = product.price - product.memberPrice;
  const hasSizes = product.sizes && product.sizes.length > 0;

  const handleAddToCart = () => {
    if (hasSizes && !selectedSize) {
      Alert.alert('Select Size', 'Please choose a size before adding to cart.');
      return;
    }
    // TODO: integrate real cart state management
    Alert.alert(
      'Added to Cart',
      `${product.name}${selectedSize ? ` (${selectedSize})` : ''} × ${quantity}\n\nMember price: $${(product.memberPrice * quantity).toFixed(2)}`,
    );
  };

  const handleBuyNow = () => {
    if (hasSizes && !selectedSize) {
      Alert.alert('Select Size', 'Please choose a size before purchasing.');
      return;
    }
    navigation.navigate('BookingPayment', {
      isProduct: true,
      sessionType: product.name,
      time: selectedSize ? `Size: ${selectedSize}` : 'One size',
      price: product.memberPrice * quantity,
    });
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
        </View>

        {/* Product Image */}
        <View style={[styles.imageContainer, { backgroundColor: colors.surfaceSecondary, width: '100%', aspectRatio: 1 }]}>
          <Image source={product.image} style={styles.productImage} resizeMode="cover" />
          {product.badge && (
            <View style={[styles.badge, { backgroundColor: colors.red }]}>
              <Text style={[styles.badgeText, { color: colors.textInverse }]}>{product.badge}</Text>
            </View>
          )}
          {!product.inStock && (
            <View style={[styles.outOfStock, { backgroundColor: colors.overlay }]}>
              <Text style={[styles.outOfStockText, { color: colors.textInverse }]}>Out of Stock</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          {/* Name & Category */}
          <Text style={[styles.category, { color: colors.textMuted }]}>
            {product.category.toUpperCase()}
          </Text>
          <Text style={[styles.name, { color: colors.textPrimary, fontSize: 28, fontWeight: '800' }]}>{product.name}</Text>

          {/* Pricing */}
          <View style={styles.priceRow}>
            <Text style={[styles.memberPrice, { color: colors.gold, fontSize: 24, fontWeight: '800' }]}>
              ${product.memberPrice.toFixed(2)}
            </Text>
            {savings > 0 && (
              <>
                <Text style={[styles.originalPrice, { color: colors.textMuted }]}>
                  ${product.price.toFixed(2)}
                </Text>
                <View style={[styles.savingsBadge, { backgroundColor: colors.goldMuted }]}>
                  <Text style={[styles.savingsText, { color: colors.gold }]}>
                    Save ${savings.toFixed(2)}
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Member price note */}
          <View style={[styles.memberNote, { backgroundColor: colors.redMuted, borderColor: colors.red + '20' }]}>

            <Ionicons name="diamond-outline" size={14} color={colors.red} />
            <Text style={[styles.memberNoteText, { color: colors.red }]}>
              Member pricing applied
            </Text>
          </View>

          {/* Description */}
          <Text style={[styles.descTitle, { color: colors.textPrimary }]}>Description</Text>
          <Text style={[styles.description, { color: colors.textSecondary, fontSize: 15, lineHeight: 24 }]}>
            {product.description}
          </Text>

          {/* Size Selection */}
          {hasSizes && (
            <View style={styles.sizeSection}>
              <Text style={[styles.sizeLabel, { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }]}>SIZE</Text>
              <View style={styles.sizeGrid}>
                {product.sizes!.map((size) => {
                  const isSelected = size === selectedSize;
                  return (
                    <TouchableOpacity
                      key={size}
                      style={[
                        styles.sizeChip,
                        { width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderColor: isSelected ? colors.gold : colors.border, backgroundColor: isSelected ? colors.gold : colors.surface },
                      ]}
                      onPress={() => setSelectedSize(size)}
                    >

                      <Text style={[
                        styles.sizeText,
                        { color: isSelected ? colors.background : colors.textSecondary, fontSize: 14, fontWeight: '700' },
                      ]}>
                        {size}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Quantity */}
          <View style={styles.quantitySection}>
            <Text style={[styles.sizeLabel, { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }]}>QUANTITY</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={[styles.qtyButton, { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >

                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={[styles.qtyText, { color: colors.textPrimary }]}>{quantity}</Text>
              <TouchableOpacity
                style={[styles.qtyButton, { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setQuantity(Math.min(10, quantity + 1))}
              >

                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              title={`Buy Now — $${(product.memberPrice * quantity).toFixed(2)}`}
              onPress={handleBuyNow}
              fullWidth
              size="lg"
              disabled={!product.inStock}
            />
            <Button
              title="Add to Cart"
              onPress={handleAddToCart}
              variant="outline"
              fullWidth
              size="lg"
              disabled={!product.inStock}
              style={{ marginTop: spacing.sm }}
            />
          </View>
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  badgeText: {
    ...typography.label,
    fontSize: 10,
  },
  outOfStock: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outOfStockText: {
    ...typography.sectionTitle,
    fontSize: 18,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  category: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.sectionTitle,
    letterSpacing: -0.3,
    textTransform: 'none',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  memberPrice: {
  },
  originalPrice: {
    fontSize: 18,
    textDecorationLine: 'line-through',
  },
  savingsBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  savingsText: {
    ...typography.label,
    fontSize: 11,
  },
  memberNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  memberNoteText: {
    ...typography.label,
    fontSize: 10,
  },
  descTitle: {
    ...typography.cardTitle,
    fontSize: 16,
    marginTop: 24,
    marginBottom: spacing.sm,
  },
  description: {
    ...typography.body,
  },
  sizeSection: {
    marginTop: 24,
  },
  sizeLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
  },
  sizeGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  sizeChip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeText: {
    ...typography.label,
  },
  quantitySection: {
    marginTop: 24,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  qtyButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },
  actions: {
    marginTop: 24,
    gap: spacing.sm,
  },
});
