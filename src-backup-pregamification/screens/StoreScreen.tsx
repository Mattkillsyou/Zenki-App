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

export function StoreScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filtered = selectedCategory === 'All'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === selectedCategory);

  const handleProductPress = (product: Product) => {
    navigation.navigate('ProductDetail', { productId: product.id });
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={[styles.productCard, { backgroundColor: colors.surface }]}
      onPress={() => handleProductPress(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.productImageContainer, { backgroundColor: colors.surfaceSecondary }]}>
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
        <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.memberPrice, { color: colors.gold }]}>
            ${item.memberPrice.toFixed(2)}
          </Text>
          {item.memberPrice !== item.price && (
            <Text style={[styles.originalPrice, { color: colors.textMuted }]}>
              ${item.price.toFixed(2)}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Store</Text>
        <TouchableOpacity
          style={[styles.cartButton, { backgroundColor: colors.surface }]}
          onPress={() => Alert.alert('Cart', 'Your cart is empty.\n\nBrowse and add items to get started.')}
        >
          <Ionicons name="bag-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Member Discount Banner */}
      <View style={[styles.discountBanner, { backgroundColor: colors.redMuted }]}>
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
                styles.categoryChip,
                { borderColor: isActive ? colors.gold : colors.border },
                isActive && { backgroundColor: colors.gold },
              ]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[
                styles.categoryText,
                { color: isActive ? colors.textInverse : colors.textMuted },
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Products Grid */}
      <FlatList
        data={filtered}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        contentContainerStyle={styles.productList}
        showsVerticalScrollIndicator={false}
      />
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
  title: {
    ...typography.sectionTitle,
  },
  cartButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  discountText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  categoryRow: {
    maxHeight: 50,
    marginTop: spacing.md,
  },
  categoryContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  categoryText: {
    ...typography.label,
    fontSize: 12,
  },
  productList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl * 2,
  },
  productRow: {
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  productCard: {
    width: '48%',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  productImageContainer: {
    height: 180,
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
    padding: spacing.sm,
  },
  productName: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  memberPrice: {
    fontSize: 16,
    fontWeight: '800',
  },
  originalPrice: {
    fontSize: 13,
    textDecorationLine: 'line-through',
  },
});
