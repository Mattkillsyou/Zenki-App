import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Image,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductContext';
import { CATEGORIES, ProductCategory } from '../data/products';
import { spacing } from '../theme';

const CATEGORY_OPTIONS = CATEGORIES.filter((c) => c !== 'All') as Exclude<ProductCategory, 'All'>[];

interface FormState {
  name: string;
  category: Exclude<ProductCategory, 'All'>;
  price: string;
  memberPrice: string;
  imageUrl: string;
  galleryRaw: string;
  badge: string;
  description: string;
  sizesRaw: string;
  inStock: boolean;
}

const emptyForm: FormState = {
  name: '',
  category: 'Apparel',
  price: '',
  memberPrice: '',
  imageUrl: '',
  galleryRaw: '',
  badge: '',
  description: '',
  sizesRaw: '',
  inStock: true,
};

export function AdminProductsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { products, customProducts, addProduct, updateProduct, deleteProduct, cloudSyncEnabled, isSyncing } = useProducts();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  if (!user?.isAdmin) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.centerBox, { flex: 1 }]}>
          <Ionicons name="lock-closed" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: spacing.md, fontSize: 16, fontWeight: '600' }}>
            Admins only
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
            <Text style={{ color: colors.gold, fontWeight: '600' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const openAddModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (customId: string) => {
    const p = customProducts.find((c) => c.id === customId);
    if (!p) return;
    setEditingId(customId);
    setForm({
      name: p.name,
      category: p.category === 'All' ? 'Apparel' : p.category,
      price: p.price.toString(),
      memberPrice: p.memberPrice.toString(),
      imageUrl: p.imageUrl,
      galleryRaw: (p.gallery || []).join('\n'),
      badge: p.badge || '',
      description: p.description,
      sizesRaw: (p.sizes || []).join(', '),
      inStock: p.inStock,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return Alert.alert('Missing', 'Product name is required.');
    if (!form.imageUrl.trim()) return Alert.alert('Missing', 'Primary image URL is required.');
    const price = parseFloat(form.price);
    const memberPrice = parseFloat(form.memberPrice || form.price);
    if (isNaN(price) || price < 0) return Alert.alert('Invalid', 'Enter a valid price.');

    const input = {
      name: form.name.trim(),
      category: form.category,
      price,
      memberPrice: isNaN(memberPrice) ? price : memberPrice,
      imageUrl: form.imageUrl.trim(),
      gallery: form.galleryRaw
        .split(/[\n,]/)
        .map((u) => u.trim())
        .filter(Boolean),
      badge: form.badge.trim() || null,
      description: form.description.trim(),
      sizes: form.sizesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      inStock: form.inStock,
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateProduct(editingId, input);
      } else {
        await addProduct(input);
      }
      setModalOpen(false);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (customId: string, name: string) => {
    Alert.alert(
      'Delete product?',
      `Remove "${name}" permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try { await deleteProduct(customId); }
            catch (e: any) { Alert.alert('Delete failed', e?.message || 'Please try again.'); }
          }
        },
      ],
    );
  };

  const builtInCount = products.length - customProducts.length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Manage Products</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={[styles.syncRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons
          name={cloudSyncEnabled ? 'cloud-done-outline' : 'cloud-offline-outline'}
          size={16}
          color={cloudSyncEnabled ? ((colors as any).green || '#22C55E') : colors.textMuted}
        />
        <Text style={[styles.syncText, { color: colors.textSecondary }]}>
          {cloudSyncEnabled
            ? (isSyncing ? 'Syncing…' : 'Synced to all phones via Firebase')
            : 'Local-only — Firebase not configured'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
          BUILT-IN · {builtInCount} products (read-only)
        </Text>
        <View style={[styles.builtInCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="archive-outline" size={18} color={colors.gold} />
          <Text style={[styles.builtInText, { color: colors.textSecondary }]}>
            The {builtInCount} original store products are bundled with the app and can't be edited from here — only newly added products appear below.
          </Text>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            YOUR PRODUCTS · {customProducts.length}
          </Text>
          <TouchableOpacity onPress={openAddModal} style={[styles.addBtn, { backgroundColor: colors.gold }]}>
            <Ionicons name="add" size={16} color="#000" />
            <Text style={styles.addBtnText}>Add Product</Text>
          </TouchableOpacity>
        </View>

        {customProducts.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="bag-outline" size={36} color={colors.textMuted} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No custom products yet</Text>
            <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
              Tap "Add Product" to create one. It'll sync to every admin's phone instantly.
            </Text>
          </View>
        ) : (
          customProducts.map((p) => (
            <View key={p.id} style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Image source={{ uri: p.imageUrl }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.textMuted }]}>
                  {p.category} · ${p.memberPrice.toFixed(2)} · {p.inStock ? 'In stock' : 'Out of stock'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => openEditModal(p.id)} style={[styles.iconBtn, { backgroundColor: colors.backgroundElevated }]}>
                <Ionicons name="create-outline" size={18} color={colors.gold} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(p.id, p.name)} style={[styles.iconBtn, { backgroundColor: colors.backgroundElevated }]}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <SafeAreaView style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {editingId ? 'Edit Product' : 'Add Product'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <Input label="Name *" value={form.name} onChangeText={(v: string) => setForm({ ...form, name: v })} placeholder="e.g. Black Belt Rashguard" />

              <Text style={[styles.label, { color: colors.textMuted }]}>Category *</Text>
              <View style={styles.catRow}>
                {CATEGORY_OPTIONS.map((c) => {
                  const active = form.category === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setForm({ ...form, category: c })}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: active ? colors.gold : colors.surface,
                          borderColor: active ? colors.gold : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#000' : colors.textSecondary, fontSize: 12, fontWeight: '700' }}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.row2}>
                <View style={{ flex: 1 }}>
                  <Input label="Price $ *" value={form.price} onChangeText={(v: string) => setForm({ ...form, price: v })} placeholder="29.99" keyboardType="decimal-pad" />
                </View>
                <View style={{ flex: 1 }}>
                  <Input label="Member $" value={form.memberPrice} onChangeText={(v: string) => setForm({ ...form, memberPrice: v })} placeholder="24.99" keyboardType="decimal-pad" />
                </View>
              </View>

              <Input
                label="Primary Image URL *"
                value={form.imageUrl}
                onChangeText={(v: string) => setForm({ ...form, imageUrl: v })}
                placeholder="https://..."
                autoCapitalize="none"
              />
              <Input
                label="Gallery URLs (one per line)"
                value={form.galleryRaw}
                onChangeText={(v: string) => setForm({ ...form, galleryRaw: v })}
                placeholder={'https://...image2.jpg\nhttps://...image3.jpg'}
                autoCapitalize="none"
                multiline
                numberOfLines={3}
              />
              <Input
                label="Description"
                value={form.description}
                onChangeText={(v: string) => setForm({ ...form, description: v })}
                placeholder="Describe the product..."
                multiline
                numberOfLines={3}
              />
              <Input
                label="Sizes (comma-separated)"
                value={form.sizesRaw}
                onChangeText={(v: string) => setForm({ ...form, sizesRaw: v })}
                placeholder="S, M, L, XL"
                autoCapitalize="characters"
              />
              <Input
                label="Badge (optional)"
                value={form.badge}
                onChangeText={(v: string) => setForm({ ...form, badge: v })}
                placeholder="New, Best Seller, Limited, etc."
              />

              <View style={styles.inStockRow}>
                <Text style={[styles.label, { color: colors.textMuted, marginBottom: 0 }]}>In Stock</Text>
                <Switch
                  value={form.inStock}
                  onValueChange={(v) => setForm({ ...form, inStock: v })}
                  trackColor={{ false: colors.surfaceSecondary, true: colors.gold }}
                  thumbColor={colors.background}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: colors.gold, opacity: saving ? 0.6 : 1 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving ? 'Saving…' : (editingId ? 'Update Product' : 'Add Product')}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Input({ label, ...rest }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border, textAlignVertical: rest.multiline ? 'top' : 'center' }]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },

  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  syncText: { fontSize: 12, fontWeight: '500' },

  scroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: { color: '#000', fontSize: 12, fontWeight: '800' },

  builtInCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  builtInText: { flex: 1, fontSize: 12, fontWeight: '400', lineHeight: 17 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#222' },
  rowName: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12, marginTop: 3 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyState: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },

  centerBox: { alignItems: 'center', justifyContent: 'center' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: '92%',
    borderWidth: 1.5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  label: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
    textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    borderRadius: 10, borderWidth: 1.5,
    paddingHorizontal: 12, paddingVertical: 12,
    fontSize: 15, minHeight: 44,
  },
  catRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md, flexWrap: 'wrap' },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 18, borderWidth: 1.5,
  },
  row2: { flexDirection: 'row', gap: 10 },
  inStockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: spacing.md,
  },
  saveBtn: {
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
});
