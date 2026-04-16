import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { CATEGORIES, PRODUCTS, Product } from '../data/products';
import { useGamification } from '../context/GamificationContext';

// Conversion rate: $1 = 10 Dojo Points
const POINTS_PER_DOLLAR = 10;

interface CartItem {
  product: Product;
  quantity: number;
}

export function StoreScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { state: gamState, redeemPoints } = useGamification();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [usePoints, setUsePoints] = useState(false);

  const dojoPoints = gamState.dojoPoints || 0;

  const filtered = selectedCategory === 'All'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === selectedCategory);

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.memberPrice * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={[{ borderRadius: 20, overflow: 'hidden', borderWidth: 1.5, backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={() => handleProductPress(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.productImageContainer, { backgroundColor: colors.surfaceSecondary, aspectRatio: 1 }]}>
        <Image source={item.image} style={styles.productImage} resizeMode="cover" />
        {item.badge && (
          <View style={[styles.productBadge, { backgroundColor: colors.red }]}>
            <Text style={[styles.productBadgeText, { color: colors.textInverse }]}>{item.badge}</Text>
          </View>
        )}
        {!item.inStock && (
          <View style={[styles.soldOut, { backgroundColor: colors.overlay }]}>
            <Text style={[styles.soldOutText, { color: colors.textInverse }]}>Sold Out</Text>
          </View>
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={[{ fontSize: 16, fontWeight: '700', color: colors.textPrimary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[{ fontSize: 18, fontWeight: '800', color: colors.gold }]}>
            ${item.memberPrice.toFixed(2)}
          </Text>
          {item.memberPrice !== item.price && (
            <Text style={[styles.originalPrice, { color: colors.textMuted }]}>
              ${item.price.toFixed(2)}
            </Text>
          )}
        </View>
      </View>
      {item.inStock && (
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.red }]}
          onPress={(e) => { e.stopPropagation(); addToCart(item); }}
        >
          <Ionicons name="add" size={18} color="#FFF" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Zenki Gear</Text>
        <TouchableOpacity
          style={[styles.cartButton, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
          onPress={() => setShowCart(!showCart)}
        >
          <Ionicons name={showCart ? 'close-outline' : 'bag-outline'} size={24} color={colors.textPrimary} />
          {cartCount > 0 && (
            <View style={[styles.cartBadge, { backgroundColor: colors.red }]}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Member Discount Banner */}
      <View style={[{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 24, padding: 20, borderRadius: 20, gap: 12, borderWidth: 1.5, backgroundColor: colors.redMuted, borderColor: colors.red + '40' }]}>
        <Ionicons name="diamond-outline" size={18} color={colors.red} />
        <Text style={[styles.discountText, { color: colors.red }]}>
          Members save up to 15% on all items
        </Text>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryRow}
        contentContainerStyle={styles.categoryContent}
      >
        {CATEGORIES.map((cat) => {
          const isActive = cat === selectedCategory;
          return (
            <TouchableOpacity
              key={cat}
              style={[
                {
                  paddingVertical: 10,
                  paddingHorizontal: 20,
                  borderRadius: 24,
                  borderWidth: isActive ? 0 : 1.5,
                  backgroundColor: isActive ? colors.gold : colors.surface,
                  borderColor: isActive ? colors.gold : colors.border,
                }
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[
                { fontSize: 14, fontWeight: '600', color: isActive ? colors.textInverse : colors.textMuted },
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {showCart ? (
        /* Cart View */
        <ScrollView contentContainerStyle={styles.productList} showsVerticalScrollIndicator={false}>
          {cart.length === 0 ? (
            <View style={styles.emptyCart}>
              <Ionicons name="bag-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyCartText, { color: colors.textMuted }]}>No items in cart</Text>
            </View>
          ) : (
            <>
              {cart.map((item) => (
                <View key={item.product.id} style={[{ flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, marginBottom: 12, gap: 16, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5 }]}>
                  <Image source={item.product.image} style={styles.cartItemImage} resizeMode="cover" />
                  <View style={styles.cartItemInfo}>
                    <Text style={[styles.cartItemName, { color: colors.textPrimary }]} numberOfLines={2}>{item.product.name}</Text>
                    <Text style={[styles.cartItemPrice, { color: colors.gold }]}>${item.product.memberPrice.toFixed(2)} × {item.quantity}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFromCart(item.product.id)}>
                    <Ionicons name="trash-outline" size={20} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ))}
              {/* Pay with Points toggle */}
              {dojoPoints > 0 && (
                <TouchableOpacity
                  onPress={() => setUsePoints(!usePoints)}
                  activeOpacity={0.7}
                  style={[styles.pointsToggleRow, { backgroundColor: usePoints ? colors.goldMuted : colors.surface }]}
                >
                  <Ionicons name={usePoints ? 'checkmark-circle' : 'diamond-outline'} size={20} color={colors.gold} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pointsToggleTitle, { color: colors.textPrimary }]}>
                      Pay with Dojo Points
                    </Text>
                    <Text style={[styles.pointsToggleSub, { color: colors.textSecondary }]}>
                      Balance: {dojoPoints.toLocaleString()} pts · {POINTS_PER_DOLLAR} pts = $1
                    </Text>
                  </View>
                  {usePoints && (
                    <View style={[styles.pointsAppliedBadge, { backgroundColor: colors.gold }]}>
                      <Text style={styles.pointsAppliedText}>
                        −${Math.min(dojoPoints / POINTS_PER_DOLLAR, cartTotal).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}

              {/* Total */}
              <View style={[styles.cartTotal, { borderTopColor: colors.divider }]}>
                <Text style={[styles.cartTotalLabel, { color: colors.textMuted }]}>Total</Text>
                {(() => {
                  const pointsDiscount = usePoints ? Math.min(dojoPoints / POINTS_PER_DOLLAR, cartTotal) : 0;
                  const finalTotal = Math.max(0, cartTotal - pointsDiscount);
                  return (
                    <Text style={[styles.cartTotalAmount, { color: colors.gold }]}>${finalTotal.toFixed(2)}</Text>
                  );
                })()}
              </View>

              <TouchableOpacity
                style={[styles.checkoutButton, { backgroundColor: colors.red }]}
                onPress={() => {
                  const pointsDiscount = usePoints ? Math.min(dojoPoints / POINTS_PER_DOLLAR, cartTotal) : 0;
                  const finalTotal = Math.max(0, cartTotal - pointsDiscount);
                  if (usePoints && pointsDiscount > 0) {
                    redeemPoints(Math.floor(pointsDiscount * POINTS_PER_DOLLAR));
                  }
                  if (finalTotal === 0) {
                    // Fully covered by points — confirm directly
                    Alert.alert(
                      'Order Placed',
                      `Your order was paid in full with ${Math.floor(pointsDiscount * POINTS_PER_DOLLAR).toLocaleString()} Dojo Points.`,
                    );
                    setCart([]);
                    setShowCart(false);
                    setUsePoints(false);
                    return;
                  }
                  navigation.navigate('BookingPayment', {
                    isProduct: true,
                    sessionType: `${cartCount} item${cartCount !== 1 ? 's' : ''}`,
                    price: finalTotal,
                  });
                }}
              >
                <Text style={styles.checkoutText}>
                  {(() => {
                    const pointsDiscount = usePoints ? Math.min(dojoPoints / POINTS_PER_DOLLAR, cartTotal) : 0;
                    const finalTotal = Math.max(0, cartTotal - pointsDiscount);
                    return finalTotal === 0 ? 'CONFIRM — FREE WITH POINTS' : `CHECKOUT — $${finalTotal.toFixed(2)}`;
                  })()}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      ) : (
        /* Products Grid */
        <FlatList
          data={filtered}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          contentContainerStyle={styles.productList}
          showsVerticalScrollIndicator={false}
        />
      )}
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
    paddingHorizontal: 24,
    paddingVertical: spacing.md + 4,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  discountText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  categoryRow: {
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  categoryContent: {
    paddingHorizontal: 24,
    gap: 12,
    alignItems: 'center',
  },
  productList: {
    paddingHorizontal: 24,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  productRow: {
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 14,
  },
  productImageContainer: {
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  productBadgeText: {
    ...typography.label,
    fontSize: 9,
  },
  soldOut: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutText: {
    ...typography.label,
    fontSize: 12,
  },
  productInfo: {
    padding: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  originalPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
  addButton: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.md,
  },
  emptyCartText: {
    ...typography.body,
  },
  cartItemImage: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.sm,
  },
  cartItemInfo: {
    flex: 1,
  },
  cartItemName: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
  },
  cartItemPrice: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  pointsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginTop: 8,
  },
  pointsToggleTitle: { fontSize: 14, fontWeight: '600' },
  pointsToggleSub: { fontSize: 12, fontWeight: '400', marginTop: 2 },
  pointsAppliedBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  pointsAppliedText: { fontSize: 13, fontWeight: '800', color: '#000' },
  cartTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  cartTotalLabel: {
    ...typography.label,
    fontSize: 14,
  },
  cartTotalAmount: {
    fontSize: 24,
    fontWeight: '900',
  },
  checkoutButton: {
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  checkoutText: {
    ...typography.button,
    color: '#FFF',
    fontWeight: '900',
  },
});
