import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from '../components';
import { PRODUCTS, Product, ProductCategory, CATEGORIES } from '../data/products';

export function AdminProductsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [products, setProducts] = useState<Product[]>(PRODUCTS);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [memberPrice, setMemberPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Apparel');
  const [sizes, setSizes] = useState('');
  const [badge, setBadge] = useState('');
  const [inStock, setInStock] = useState(true);

  const resetForm = () => {
    setName(''); setPrice(''); setMemberPrice(''); setDescription('');
    setCategory('Apparel'); setSizes(''); setBadge(''); setInStock(true);
  };

  const openAddModal = () => {
    setEditingProduct(null);
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setName(product.name);
    setPrice(product.price.toString());
    setMemberPrice(product.memberPrice.toString());
    setDescription(product.description);
    setCategory(product.category === 'All' ? 'Apparel' : product.category);
    setSizes(product.sizes?.join(', ') || '');
    setBadge(product.badge || '');
    setInStock(product.inStock);
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!name || !price || !memberPrice) {
      Alert.alert('Missing Info', 'Please fill in name, price, and member price.');
      return;
    }
    const parsedSizes = sizes.split(',').map((s) => s.trim()).filter(Boolean);
    if (editingProduct) {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? { ...p, name, price: parseFloat(price), memberPrice: parseFloat(memberPrice), description, category, sizes: parsedSizes.length > 0 ? parsedSizes : undefined, badge: badge || null, inStock }
            : p,
        ),
      );
    } else {
      const newProduct: Product = {
        id: Date.now().toString(),
        name,
        price: parseFloat(price),
        memberPrice: parseFloat(memberPrice),
        description,
        category,
        image: PRODUCTS[0].image, // Placeholder — in production, use image picker
        sizes: parsedSizes.length > 0 ? parsedSizes : undefined,
        badge: badge || null,
        inStock,
      };
      setProducts((prev) => [...prev, newProduct]);
    }
    setModalVisible(false);
  };

  const toggleStock = (id: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, inStock: !p.inStock } : p)),
    );
  };

  const handleDelete = (product: Product) => {
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
  };

  const renderField = (label: string, value: string, setter: (v: string) => void, opts?: { keyboard?: any; multiline?: boolean }) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: colors.surfaceSecondary, color: colors.textPrimary, borderColor: colors.border },
          opts?.multiline && styles.textArea,
        ]}
        value={value}
        onChangeText={setter}
        placeholderTextColor={colors.textMuted}
        keyboardType={opts?.keyboard}
        multiline={opts?.multiline}
        textAlignVertical={opts?.multiline ? 'top' : undefined}
      />
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Store Products</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.backButton}>
          <Ionicons name="add-circle-outline" size={26} color={colors.gold} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
        {products.map((product) => (
          <TouchableOpacity
            key={product.id}
            style={[styles.productCard, { backgroundColor: colors.surface }]}
            onPress={() => openEditModal(product)}
            activeOpacity={0.7}
          >
            <Image source={product.image} style={styles.productImage} resizeMode="cover" />
            <View style={styles.productInfo}>
              <Text style={[styles.productName, { color: colors.textPrimary }]} numberOfLines={2}>
                {product.name}
              </Text>
              <Text style={[styles.productCategory, { color: colors.textMuted }]}>
                {product.category}
              </Text>
              <View style={styles.priceRow}>
                <Text style={[styles.productPrice, { color: colors.gold }]}>
                  ${product.memberPrice.toFixed(2)}
                </Text>
                <Text style={[styles.productRetail, { color: colors.textMuted }]}>
                  Retail ${product.price.toFixed(2)}
                </Text>
              </View>
              <View style={styles.statusRow}>
                <View style={[styles.stockDot, { backgroundColor: product.inStock ? colors.success : colors.error }]} />
                <Text style={[styles.stockText, { color: product.inStock ? colors.success : colors.error }]}>
                  {product.inStock ? 'In Stock' : 'Out of Stock'}
                </Text>
              </View>
            </View>
            <View style={styles.productActions}>
              <TouchableOpacity onPress={() => toggleStock(product.id)} style={styles.iconBtn}>
                <Ionicons
                  name={product.inStock ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(product)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{ height: spacing.xxl * 2 }} />
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={[styles.modalCancel, { color: colors.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </Text>
            <View style={{ width: 60 }} />
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalContent}>
            {renderField('PRODUCT NAME', name, setName)}
            {renderField('RETAIL PRICE', price, setPrice, { keyboard: 'decimal-pad' })}
            {renderField('MEMBER PRICE', memberPrice, setMemberPrice, { keyboard: 'decimal-pad' })}
            {renderField('DESCRIPTION', description, setDescription, { multiline: true })}
            {renderField('SIZES (comma separated)', sizes, setSizes)}
            {renderField('BADGE (e.g. "Best Seller", "New")', badge, setBadge)}

            {/* Category */}
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CATEGORY</Text>
              <View style={styles.categoryRow}>
                {CATEGORIES.filter((c) => c !== 'All').map((cat) => {
                  const isActive = cat === category;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.categoryChip,
                        { backgroundColor: isActive ? colors.gold : colors.surfaceSecondary },
                      ]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[styles.categoryChipText, { color: isActive ? colors.textInverse : colors.textMuted }]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* In Stock Toggle */}
            <View style={[styles.toggleRow, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>In Stock</Text>
              <Switch
                value={inStock}
                onValueChange={setInStock}
                trackColor={{ false: colors.surfaceSecondary, true: colors.gold }}
                thumbColor={colors.background}
              />
            </View>

            <Button title={editingProduct ? 'Save Changes' : 'Add Product'} onPress={handleSave} fullWidth size="lg" style={{ marginTop: spacing.lg }} />
            <View style={{ height: spacing.xxl * 2 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, fontSize: 20 },
  list: { paddingHorizontal: spacing.lg },
  productCard: { flexDirection: 'row', borderRadius: borderRadius.md, marginBottom: spacing.md, overflow: 'hidden' },
  productImage: { width: 80, height: 100 },
  productInfo: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  productName: { ...typography.body, fontWeight: '600', fontSize: 14 },
  productCategory: { ...typography.label, fontSize: 10, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xs },
  productPrice: { fontSize: 16, fontWeight: '800' },
  productRetail: { ...typography.bodySmall, fontSize: 12, textDecorationLine: 'line-through' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { ...typography.label, fontSize: 9 },
  productActions: { justifyContent: 'center', paddingRight: spacing.md, gap: spacing.md },
  iconBtn: { padding: spacing.xs },
  // Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  modalCancel: { ...typography.body, fontWeight: '500' },
  modalTitle: { ...typography.cardTitle, fontSize: 18 },
  modalContent: { paddingHorizontal: spacing.lg },
  fieldGroup: { marginBottom: spacing.md },
  fieldLabel: { ...typography.label, fontSize: 11, marginBottom: spacing.xs },
  input: { borderRadius: borderRadius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4, fontSize: 16, borderWidth: 1 },
  textArea: { minHeight: 80, paddingTop: spacing.sm + 4 },
  categoryRow: { flexDirection: 'row', gap: spacing.sm },
  categoryChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm },
  categoryChipText: { ...typography.label, fontSize: 11 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderRadius: borderRadius.md, marginTop: spacing.sm },
  toggleLabel: { ...typography.body, fontWeight: '500' },
});
