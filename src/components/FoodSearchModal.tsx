import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Modal,
  Platform,
  KeyboardAvoidingView} from 'react-native';
import { SoundPressable } from './SoundPressable';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { searchFoods } from '../services/foodSearch';
import { FoodSearchResult, FoodMacros } from '../types/food';

interface FoodSearchModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * Called when the user picks a food and confirms macros.
   * The caller decides what to do (log entry, add to favorites, etc).
   */
  onSelect: (food: FoodSearchResult, macros: FoodMacros, servings: number) => void;
  recentFoods?: FoodSearchResult[];
  /** Prefill the search bar (used when opening from a barcode scan result, etc) */
  initialQuery?: string;
}

export function FoodSearchModal({ visible, onClose, onSelect, recentFoods = [], initialQuery }: FoodSearchModalProps) {
  const { colors } = useTheme();

  const [query, setQuery] = useState(initialQuery ?? '');
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<FoodSearchResult | null>(null);
  const [servings, setServings] = useState('1');

  const debounceRef = useRef<any>(null);

  // Debounced search
  useEffect(() => {
    if (!visible) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await searchFoods(q, 30);
      setResults(r);
      setLoading(false);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, visible]);

  // Reset on open/close
  useEffect(() => {
    if (visible) {
      setQuery(initialQuery ?? '');
      setPicked(null);
      setServings('1');
    }
  }, [visible, initialQuery]);

  function handlePick(food: FoodSearchResult) {
    setPicked(food);
    setServings('1');
  }

  function handleConfirm() {
    if (!picked) return;
    const n = parseFloat(servings) || 1;
    const baseMacros = picked.macros;
    const scaled: FoodMacros = {
      calories: Math.round(baseMacros.calories * n),
      protein: Math.round(baseMacros.protein * n * 10) / 10,
      carbs: Math.round(baseMacros.carbs * n * 10) / 10,
      fat: Math.round(baseMacros.fat * n * 10) / 10,
    };
    onSelect(picked, scaled, n);
    onClose();
  }

  const showResults = query.trim().length >= 2;
  const dataToShow = showResults ? results : recentFoods;
  const emptyLabel = showResults
    ? loading ? 'Searching…' : 'No matches. Try a different term.'
    : recentFoods.length === 0
      ? 'Search for a food to log.'
      : 'RECENT';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaProvider>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={onClose}
              style={[styles.headerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="close" size={22} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Search foods</Text>
            <View style={styles.headerBtn} />
          </View>

          {/* Search input */}
          <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder="e.g. chicken breast, oatmeal, protein bar"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading && <ActivityIndicator color={colors.gold} size="small" />}
            {!loading && query.length > 0 && (
              <SoundPressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </SoundPressable>
            )}
          </View>

          {/* Section label (Recent when empty query) */}
          {!showResults && recentFoods.length > 0 && (
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>RECENT</Text>
          )}

          {/* Result list */}
          <FlatList
            data={dataToShow}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 240 }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textMuted }]}>{emptyLabel}</Text>
            }
            renderItem={({ item }) => (
              <SoundPressable
                activeOpacity={0.85}
                onPress={() => handlePick(item)}
                style={[styles.resultRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.resultMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[item.brand, item.serving.label].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={[styles.resultMacros, { color: colors.textSecondary }]}>
                    {item.macros.calories} cal · {item.macros.protein}p · {item.macros.carbs}c · {item.macros.fat}f
                  </Text>
                </View>
                <View style={[styles.sourceBadge, { backgroundColor: item.source === 'usda' ? 'rgba(76,175,80,0.15)' : 'rgba(33,150,243,0.15)' }]}>
                  <Text style={[styles.sourceBadgeText, { color: item.source === 'usda' ? '#4CAF50' : '#2196F3' }]}>
                    {item.source === 'usda' ? 'USDA' : 'OFF'}
                  </Text>
                </View>
              </SoundPressable>
            )}
          />

          {/* Pick panel — servings selector + confirm */}
          {picked && (
            <View style={[styles.pickPanel, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={[styles.pickName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {picked.name}
                </Text>
                <Text style={[styles.pickMeta, { color: colors.textMuted }]}>{picked.serving.label}</Text>
              </View>
              <View style={[styles.servingsBox, { borderColor: colors.border, backgroundColor: colors.background }]}>
                <SoundPressable
                  onPress={() => {
                    const n = parseFloat(servings) || 1;
                    const next = Math.max(0.25, Math.round((n - 0.5) * 4) / 4);
                    setServings(String(next));
                  }}
                  hitSlop={8}
                  style={styles.servingsBtn}
                >
                  <Ionicons name="remove" size={18} color={colors.textPrimary} />
                </SoundPressable>
                <TextInput
                  style={[styles.servingsInput, { color: colors.textPrimary }]}
                  keyboardType="decimal-pad"
                  value={servings}
                  onChangeText={setServings}
                />
                <SoundPressable
                  onPress={() => {
                    const n = parseFloat(servings) || 1;
                    const next = Math.round((n + 0.5) * 4) / 4;
                    setServings(String(next));
                  }}
                  hitSlop={8}
                  style={styles.servingsBtn}
                >
                  <Ionicons name="add" size={18} color={colors.textPrimary} />
                </SoundPressable>
              </View>
              <SoundPressable
                onPress={handleConfirm}
                style={[styles.confirmBtn, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="checkmark" size={22} color="#000" />
              </SoundPressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: 10,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '600' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  resultName: { fontSize: 15, fontWeight: '700' },
  resultMeta: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  resultMacros: { fontSize: 12, fontWeight: '600', marginTop: 4, letterSpacing: 0.2 },

  sourceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  empty: {
    textAlign: 'center',
    marginTop: spacing.xl,
    fontSize: 13,
  },

  pickPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  pickName: { fontSize: 14, fontWeight: '800' },
  pickMeta: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  servingsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: 4,
  },
  servingsBtn: { padding: 6 },
  servingsInput: {
    width: 44,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    paddingVertical: 8,
  },

  confirmBtn: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
});
