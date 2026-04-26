import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import { getProductImages } from '../data/products';
import { useProducts } from '../context/ProductContext';

export function ProductDetailScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { products } = useProducts();
  const { productId } = route.params;
  const product = products.find((p) => p.id === productId);

  const [selectedSize, setSelectedSize] = useState<string | null>(
    product?.sizes?.[0] || null,
  );
  const [quantity, setQuantity] = useState(1);
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  if (!product) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: spacing.md, fontSize: 16, fontWeight: '600' }}>
            Product not found
          </Text>
          <SoundPressable onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.gold, fontWeight: '600' }}>Go Back</Text>
          </SoundPressable>
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
    Alert.alert(
      'Reserve Item',
      `${product.name}${selectedSize ? ` (${selectedSize})` : ''} × ${quantity}\n` +
      `Total: $${(product.memberPrice * quantity).toFixed(2)}\n\n` +
      `Tap Reserve to let the dojo know you'd like to pick this up. Payment is handled in person.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reserve',
          onPress: () => {
            Alert.alert(
              'Reserved',
              `We'll set aside ${product.name}${selectedSize ? ` (${selectedSize})` : ''} for you. Come by the dojo to complete your purchase.`,
            );
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backButton, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}
          >
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </SoundPressable>
        </View>

        {/* Product Image Carousel */}
        <View
          style={[styles.imageContainer, { backgroundColor: colors.surfaceSecondary, width: '100%', aspectRatio: 1 }]}
          onLayout={(e) => setCarouselWidth(e.nativeEvent.layout.width)}
        >
          {(() => {
            const gallery = getProductImages(product);
            return (
              <>
                <ScrollView
                  ref={carouselRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                    if (!carouselWidth) return;
                    const idx = Math.round(e.nativeEvent.contentOffset.x / carouselWidth);
                    setActiveImageIdx(idx);
                  }}
                  style={StyleSheet.absoluteFill}
                >
                  {gallery.map((src, i) => (
                    <View key={i} style={{ width: carouselWidth || undefined, aspectRatio: 1 }}>
                      <Image source={src} style={styles.productImage} resizeMode="cover" />
                    </View>
                  ))}
                </ScrollView>

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

                {/* Image counter chip (top-left) */}
                {gallery.length > 1 && (
                  <View style={styles.imageCounter}>
                    <Text style={styles.imageCounterText}>
                      {activeImageIdx + 1} / {gallery.length}
                    </Text>
                  </View>
                )}

                {/* Previous arrow */}
                {gallery.length > 1 && activeImageIdx > 0 && (
                  <SoundPressable
                    style={[styles.arrowBtn, styles.arrowLeft]}
                    activeOpacity={0.8}
                    onPress={() => {
                      const next = activeImageIdx - 1;
                      setActiveImageIdx(next);
                      carouselRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
                    }}
                  >
                    <Ionicons name="chevron-back" size={22} color="#FFF" />
                  </SoundPressable>
                )}

                {/* Next arrow */}
                {gallery.length > 1 && activeImageIdx < gallery.length - 1 && (
                  <SoundPressable
                    style={[styles.arrowBtn, styles.arrowRight]}
                    activeOpacity={0.8}
                    onPress={() => {
                      const next = activeImageIdx + 1;
                      setActiveImageIdx(next);
                      carouselRef.current?.scrollTo({ x: next * carouselWidth, animated: true });
                    }}
                  >
                    <Ionicons name="chevron-forward" size={22} color="#FFF" />
                  </SoundPressable>
                )}

                {/* Pagination dots (bottom-center) — tap to jump */}
                {gallery.length > 1 && (
                  <View style={styles.dotsRow}>
                    {gallery.map((_, i) => (
                      <SoundPressable
                        key={i}
                        onPress={() => {
                          setActiveImageIdx(i);
                          carouselRef.current?.scrollTo({ x: i * carouselWidth, animated: true });
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      >
                        <View
                          style={[
                            styles.dot,
                            {
                              backgroundColor: i === activeImageIdx ? colors.gold : 'rgba(255,255,255,0.5)',
                              width: i === activeImageIdx ? 22 : 6,
                            },
                          ]}
                        />
                      </SoundPressable>
                    ))}
                  </View>
                )}
              </>
            );
          })()}
        </View>

        <View style={styles.content}>
          {/* Name & Category */}
          <Text style={[styles.category, { color: colors.textMuted }]}>
            {product.category.toUpperCase()}
          </Text>
          <Text style={[styles.name, { color: colors.textPrimary, fontSize: 28, fontWeight: '800' }]}>{product.name}</Text>

          {/* Member pricing pill — ABOVE price */}
          <View style={[styles.memberNote, { backgroundColor: colors.redMuted, borderColor: colors.red + '20' }]}>
            <Ionicons name="diamond-outline" size={14} color={colors.red} />
            <Text style={[styles.memberNoteText, { color: colors.red }]}>
              Member pricing applied
            </Text>
          </View>

          {/* Pricing — member price + original only, no mixed shapes */}
          <View style={styles.priceRow}>
            <Text style={[styles.memberPrice, { color: colors.gold, fontSize: 24, fontWeight: '800' }]}>
              ${product.memberPrice.toFixed(2)}
            </Text>
            {savings > 0 && (
              <Text style={[styles.originalPrice, { color: colors.textMuted }]}>
                ${product.price.toFixed(2)}
              </Text>
            )}
          </View>

          {/* Savings badge — BELOW price, standalone pill */}
          {savings > 0 && (
            <View style={[styles.savingsBadge, { backgroundColor: colors.goldMuted }]}>
              <Text style={[styles.savingsText, { color: colors.gold }]}>
                Save ${savings.toFixed(2)}
              </Text>
            </View>
          )}

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
                    <SoundPressable
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
                    </SoundPressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Quantity */}
          <View style={styles.quantitySection}>
            <Text style={[styles.sizeLabel, { color: colors.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }]}>QUANTITY</Text>
            <View style={styles.quantityRow}>
              <SoundPressable
                style={[styles.qtyButton, { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setQuantity(Math.max(1, quantity - 1))}
              >

                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </SoundPressable>
              <Text style={[styles.qtyText, { color: colors.textPrimary }]}>{quantity}</Text>
              <SoundPressable
                style={[styles.qtyButton, { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setQuantity(Math.min(10, quantity + 1))}
              >

                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </SoundPressable>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              title={`Reserve · $${(product.memberPrice * quantity).toFixed(2)}`}
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
    zIndex: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageContainer: {
    position: 'relative',
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  dotsRow: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  imageCounter: {
    position: 'absolute',
    top: 14,
    left: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  imageCounterText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  arrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
  },
  arrowLeft: {
    left: 10,
  },
  arrowRight: {
    right: 10,
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
    alignItems: 'center',
  },
  category: {
    ...typography.label,
    fontSize: 11,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  name: {
    ...typography.sectionTitle,
    letterSpacing: -0.3,
    textTransform: 'none',
    textAlign: 'center',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  memberPrice: {
  },
  originalPrice: {
    fontSize: 18,
    textDecorationLine: 'line-through',
  },
  savingsBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  savingsText: {
    ...typography.label,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  memberNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    alignSelf: 'center',
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
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  description: {
    ...typography.body,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
  sizeSection: {
    marginTop: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  sizeLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  sizeGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
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
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    alignSelf: 'stretch',
  },
});
