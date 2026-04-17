import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TextInput,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { CATEGORIES, Product } from '../data/products';
import { useProducts } from '../context/ProductContext';
import { useGamification } from '../context/GamificationContext';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';

const WISHLIST_KEY = '@zenki_wishlist';
const CART_KEY = '@zenki_cart';

const PROMO_CODES: Record<string, { discountPercent: number; label: string }> = {
  ZENKI20: { discountPercent: 20, label: '20% off' },
  DOJO10: { discountPercent: 10, label: '10% off' },
  MEMBER: { discountPercent: 15, label: '15% Member Discount' },
};

// Conversion rate: $1 = 10 Dojo Points
const POINTS_PER_DOLLAR = 10;

interface CartItem {
  product: Product;
  quantity: number;
}

export function StoreScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { state: gamState, redeemPoints, recordGearPurchase } = useGamification();
  const { products: PRODUCTS } = useProducts();
  const { play } = useSound();
  useScreenSoundTheme('store');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [usePoints, setUsePoints] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);

  // Wishlist
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [showWishlist, setShowWishlist] = useState(false);

  // Promo code
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPercent: number; label: string } | null>(null);

  // Persist cart and wishlist
  useEffect(() => {
    AsyncStorage.getItem(WISHLIST_KEY).then((raw) => { if (raw) try { setWishlist(JSON.parse(raw)); } catch {} });
    AsyncStorage.getItem(CART_KEY).then((raw) => { if (raw) try { setCart(JSON.parse(raw)); } catch {} });
  }, []);

  useEffect(() => {
    if (cart.length > 0) AsyncStorage.setItem(CART_KEY, JSON.stringify(cart));
    else AsyncStorage.removeItem(CART_KEY);
  }, [cart]);

  useEffect(() => {
    AsyncStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist]);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  const isWishlisted = (productId: string) => wishlist.includes(productId);

  const applyPromo = () => {
    const code = promoCode.trim().toUpperCase();
    const promo = PROMO_CODES[code];
    if (promo) {
      setAppliedPromo({ code, ...promo });
      setPromoCode('');
      Alert.alert('Promo Applied!', promo.label);
    } else {
      Alert.alert('Invalid Code', 'This promo code is not valid.');
    }
  };

  const dojoPoints = gamState.dojoPoints || 0;

  const filtered = selectedCategory === 'All'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === selectedCategory);

  // Paginate into chunks of 4 products (2 rows × 2 cols)
  const PRODUCTS_PER_PAGE = 4;
  const pages: Product[][] = [];
  for (let i = 0; i < filtered.length; i += PRODUCTS_PER_PAGE) {
    pages.push(filtered.slice(i, i + PRODUCTS_PER_PAGE));
  }
  if (pages.length === 0) pages.push([]);
  const currentPage = Math.min(pageIdx, pages.length - 1);

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const addToCart = (product: Product) => {
    play('tap');
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
      style={[styles.productCard, { backgroundColor: colors.surface }]}
      onPress={() => handleProductPress(item)}
      activeOpacity={0.85}
    >
      <View style={[styles.productImageContainer, { backgroundColor: '#000', aspectRatio: 1 }]}>
        <Image source={item.image} style={styles.productImage} resizeMode="cover" />
        {item.badge && (
          <View style={[styles.productBadge, { backgroundColor: colors.red }]}>
            <Text style={styles.productBadgeText}>{item.badge.toUpperCase()}</Text>
          </View>
        )}
        {!item.inStock && (
          <View style={[styles.soldOut, { backgroundColor: 'rgba(0,0,0,0.75)' }]}>
            <Text style={styles.soldOutText}>SOLD OUT</Text>
          </View>
        )}
        {/* Wishlist heart */}
        <TouchableOpacity
          style={styles.wishlistBtn}
          onPress={(e) => { e.stopPropagation(); toggleWishlist(item.id); play('navigate'); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons
            name={isWishlisted(item.id) ? 'heart' : 'heart-outline'}
            size={18}
            color={isWishlisted(item.id) ? colors.red : 'rgba(255,255,255,0.7)'}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.productInfo}>
        <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.name.toUpperCase()}
        </Text>
        <View style={styles.priceRow}>
          <View style={styles.priceLeft}>
            <Text style={[styles.productPrice, { color: colors.textPrimary }]}>
              ${item.memberPrice.toFixed(0)}
            </Text>
            {item.memberPrice !== item.price && (
              <Text style={[styles.originalPrice, { color: colors.textMuted }]}>
                ${item.price.toFixed(0)}
              </Text>
            )}
          </View>
          {item.inStock && (
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.red }]}
              onPress={(e) => { e.stopPropagation(); addToCart(item); }}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={18} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — Cobra Kai block type */}
      <View style={styles.header}>
        <View style={styles.heroCol}>
          <View style={[styles.redStripe, { backgroundColor: colors.red }]} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>ZENKI GEAR</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>FORGED FOR THE MAT · WORN WITH PRIDE</Text>
        </View>
        <TouchableOpacity
          style={[styles.cartButton, { backgroundColor: '#000', borderColor: colors.red }]}
          onPress={() => setShowCart(!showCart)}
          activeOpacity={0.75}
        >
          <Ionicons name={showCart ? 'close' : 'bag-outline'} size={22} color="#FFF" />
          {cartCount > 0 && (
            <View style={[styles.cartBadge, { backgroundColor: colors.red }]}>
              <Text style={styles.cartBadgeText}>{cartCount}</Text>
            </View>
          )}
        </TouchableOpacity>
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
              style={[styles.categoryChip, isActive && { borderBottomColor: colors.red }]}
              onPress={() => setSelectedCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '900',
                fontStyle: 'italic',
                color: isActive ? colors.textPrimary : colors.textSecondary,
                opacity: isActive ? 1 : 0.75,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}>
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
                      Pay with Diamonds
                    </Text>
                    <Text style={[styles.pointsToggleSub, { color: colors.textSecondary }]}>
                      Balance: {dojoPoints.toLocaleString()} 💎 · {POINTS_PER_DOLLAR} 💎 = $1
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

              {/* Promo code */}
              <View style={styles.promoRow}>
                <TextInput
                  style={[styles.promoInput, { backgroundColor: colors.backgroundElevated, color: colors.textPrimary, borderColor: colors.border }]}
                  placeholder="Promo code"
                  placeholderTextColor={colors.textMuted}
                  value={promoCode}
                  onChangeText={setPromoCode}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.promoBtn, { backgroundColor: colors.gold }]}
                  onPress={applyPromo}
                >
                  <Text style={styles.promoBtnText}>APPLY</Text>
                </TouchableOpacity>
              </View>
              {appliedPromo && (
                <View style={[styles.promoApplied, { backgroundColor: colors.successMuted }]}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  <Text style={[styles.promoAppliedText, { color: colors.success }]}>
                    {appliedPromo.label} ({appliedPromo.code})
                  </Text>
                  <TouchableOpacity onPress={() => setAppliedPromo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close" size={14} color={colors.success} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Total */}
              <View style={[styles.cartTotal, { borderTopColor: colors.divider }]}>
                <Text style={[styles.cartTotalLabel, { color: colors.textMuted }]}>Total</Text>
                {(() => {
                  const pointsDiscount = usePoints ? Math.min(dojoPoints / POINTS_PER_DOLLAR, cartTotal) : 0;
                  const promoDiscount = appliedPromo ? cartTotal * (appliedPromo.discountPercent / 100) : 0;
                  const finalTotal = Math.max(0, cartTotal - pointsDiscount - promoDiscount);
                  return (
                    <View style={{ alignItems: 'flex-end' }}>
                      {promoDiscount > 0 && (
                        <Text style={[styles.promoDiscountText, { color: colors.success }]}>-${promoDiscount.toFixed(2)} promo</Text>
                      )}
                      <Text style={[styles.cartTotalAmount, { color: colors.gold }]}>${finalTotal.toFixed(2)}</Text>
                    </View>
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
                    for (let i = 0; i < cartCount; i++) recordGearPurchase();
                    Alert.alert(
                      'Order Placed',
                      `Your order was paid in full with ${Math.floor(pointsDiscount * POINTS_PER_DOLLAR).toLocaleString()} Dojo Points.`,
                    );
                    setCart([]);
                    setShowCart(false);
                    setUsePoints(false);
                    return;
                  }
                  for (let i = 0; i < cartCount; i++) recordGearPurchase();
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
        /* Products — paginated: 4 products per page, horizontal swipe */
        <View
          style={{ flex: 1 }}
          onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
        >
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              if (!pageWidth) return;
              setPageIdx(Math.round(e.nativeEvent.contentOffset.x / pageWidth));
            }}
          >
            {pages.map((pageProducts, pIdx) => (
              <View key={pIdx} style={{ width: pageWidth || undefined, paddingHorizontal: 20, paddingTop: spacing.md }}>
                <View style={styles.pageGrid}>
                  {pageProducts.map((item) => renderProduct({ item }))}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Swipe-only — page dots indicator */}
          {pages.length > 1 && (
            <View style={styles.pageDotsRow}>
              {pages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.pageDot,
                    {
                      backgroundColor: i === currentPage ? colors.red : colors.textMuted,
                      width: i === currentPage ? 20 : 6,
                    },
                  ]}
                />
              ))}
            </View>
          )}
        </View>
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
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  heroCol: {
    flex: 1,
  },
  redStripe: {
    width: 32,
    height: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 6,
    textTransform: 'uppercase',
  },
  cartButton: {
    width: 48,
    height: 48,
    borderRadius: 0,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  categoryRow: {
    maxHeight: 52,
    marginTop: 18,
    marginBottom: 12,
  },
  categoryContent: {
    paddingHorizontal: 20,
    gap: 6,
    alignItems: 'flex-end',
  },
  categoryChip: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  productList: {
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  pageDotsRow: {
    position: 'absolute',
    bottom: 24,
    left: 0, right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  pageDot: {
    height: 6,
    borderRadius: 0, // cobra kai — sharp
  },
  productCard: {
    width: '48.5%',
    borderRadius: 0,         // sharp corners — 80s raw
    overflow: 'hidden',
  },
  productImageContainer: {
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productBadge: {
    position: 'absolute',
    top: 10,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 5,
    // slight rotation for that rebellious sticker vibe
    transform: [{ rotate: '-3deg' }],
  },
  productBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    fontStyle: 'italic',
    color: '#FFF',
    letterSpacing: 1,
  },
  soldOut: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutText: {
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 3,
    color: '#FFF',
  },
  productInfo: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
  },
  productName: {
    fontSize: 13,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    lineHeight: 19,
    minHeight: 38,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  productPrice: {
    fontSize: 22,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: -0.5,
  },
  originalPrice: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'line-through',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 0,         // sharp
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 0,         // sharp square badge
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    fontStyle: 'italic',
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

  // ── Wishlist ──
  wishlistBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Promo code ──
  promoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  promoInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  promoBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 0.5,
  },
  promoApplied: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
  },
  promoAppliedText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  promoDiscountText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
