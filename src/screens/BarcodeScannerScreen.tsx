import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { lookupBarcode } from '../services/foodSearch';
import { FoodSearchResult, FoodMacros } from '../types/food';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Barcode formats Open Food Facts supports — limit to these to avoid random codes
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type ScanState =
  | { kind: 'scanning' }
  | { kind: 'looking_up'; code: string }
  | { kind: 'found'; code: string; food: FoodSearchResult }
  | { kind: 'not_found'; code: string };

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function BarcodeScannerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { addMacroEntry, rememberFood } = useNutrition();

  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ kind: 'scanning' });
  const [servings, setServings] = useState('1');
  const scannedOnce = useRef(false);

  // Auto-request permission once
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  async function handleBarcode({ data, type }: { data: string; type: string }) {
    if (scannedOnce.current) return;
    scannedOnce.current = true;

    setState({ kind: 'looking_up', code: data });
    const food = await lookupBarcode(data);
    if (food) {
      setState({ kind: 'found', code: data, food });
      setServings('1');
    } else {
      setState({ kind: 'not_found', code: data });
    }
  }

  function rescan() {
    scannedOnce.current = false;
    setState({ kind: 'scanning' });
  }

  function confirm() {
    if (state.kind !== 'found' || !user) return;
    const n = parseFloat(servings) || 1;
    const macros = state.food.macros;
    const scaled: FoodMacros = {
      calories: Math.round(macros.calories * n),
      protein: Math.round(macros.protein * n * 10) / 10,
      carbs: Math.round(macros.carbs * n * 10) / 10,
      fat: Math.round(macros.fat * n * 10) / 10,
    };
    addMacroEntry({
      memberId: user.id,
      date: todayISO(),
      name: state.food.brand ? `${state.food.brand} · ${state.food.name}` : state.food.name,
      ...scaled,
    });
    rememberFood(user.id, state.food);
    navigation.goBack();
  }

  // ── Permission states ──
  if (!permission) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.gold} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
        <Text style={[styles.permTitle, { color: colors.textPrimary }]}>Camera access needed</Text>
        <Text style={[styles.permBody, { color: colors.textSecondary }]}>
          We use the camera only to scan barcodes on food packaging. Images are not stored or uploaded.
        </Text>
        <TouchableOpacity
          onPress={requestPermission}
          style={[styles.permBtn, { backgroundColor: colors.gold }]}
        >
          <Text style={styles.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: spacing.md }}>
          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Camera — only live when scanning */}
      {state.kind === 'scanning' && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={handleBarcode}
        />
      )}

      {/* Dark overlay when not scanning, for the result card */}
      {state.kind !== 'scanning' && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
      )}

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.topBtn, { backgroundColor: 'rgba(0,0,0,0.55)' }]}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topLabel}>Scan barcode</Text>
        <View style={styles.topBtn} />
      </SafeAreaView>

      {/* Aim reticle */}
      {state.kind === 'scanning' && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <View style={styles.reticleWrap}>
            <View style={styles.reticle}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
            </View>
            <Text style={styles.reticleHint}>Center the barcode in the box</Text>
          </View>
        </View>
      )}

      {/* Looking up */}
      {state.kind === 'looking_up' && (
        <View style={styles.resultWrap}>
          <ActivityIndicator size="small" color="#E8B828" />
          <Text style={styles.resultTitle}>Looking up…</Text>
          <Text style={styles.resultSub}>{state.code}</Text>
        </View>
      )}

      {/* Not found */}
      {state.kind === 'not_found' && (
        <View style={styles.resultWrap}>
          <Ionicons name="help-circle-outline" size={40} color="#E8B828" />
          <Text style={styles.resultTitle}>Product not in database</Text>
          <Text style={styles.resultSub}>{state.code}</Text>
          <Text style={[styles.resultSub, { marginTop: spacing.sm, textAlign: 'center', opacity: 0.8 }]}>
            Try scanning again or add it manually.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <TouchableOpacity
              onPress={rescan}
              style={[styles.resultBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
            >
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.resultBtnText}>Scan again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.resultBtn, { backgroundColor: '#E8B828' }]}
            >
              <Text style={[styles.resultBtnText, { color: '#000' }]}>Add manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Found — full product card with servings + confirm */}
      {state.kind === 'found' && (
        <View style={styles.resultWrap}>
          <View style={styles.foundCard}>
            <Text style={styles.foundName} numberOfLines={2}>{state.food.name}</Text>
            {state.food.brand && (
              <Text style={styles.foundBrand}>{state.food.brand}</Text>
            )}
            <View style={styles.foundMacroRow}>
              <View style={styles.foundMacroCell}>
                <Text style={styles.foundMacroLabel}>CAL</Text>
                <Text style={styles.foundMacroValue}>{state.food.macros.calories}</Text>
              </View>
              <View style={styles.foundMacroCell}>
                <Text style={styles.foundMacroLabel}>PROTEIN</Text>
                <Text style={styles.foundMacroValue}>{state.food.macros.protein}g</Text>
              </View>
              <View style={styles.foundMacroCell}>
                <Text style={styles.foundMacroLabel}>CARBS</Text>
                <Text style={styles.foundMacroValue}>{state.food.macros.carbs}g</Text>
              </View>
              <View style={styles.foundMacroCell}>
                <Text style={styles.foundMacroLabel}>FAT</Text>
                <Text style={styles.foundMacroValue}>{state.food.macros.fat}g</Text>
              </View>
            </View>
            <Text style={styles.foundServingLabel}>Per {state.food.serving.label}</Text>

            <View style={styles.servingsRow}>
              <Text style={styles.servingsText}>Servings</Text>
              <View style={styles.servingsBox}>
                <TouchableOpacity
                  onPress={() => setServings(String(Math.max(0.25, (parseFloat(servings) || 1) - 0.5)))}
                  style={styles.servingsBtn}
                >
                  <Ionicons name="remove" size={18} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.servingsVal}>{servings}</Text>
                <TouchableOpacity
                  onPress={() => setServings(String((parseFloat(servings) || 1) + 0.5))}
                  style={styles.servingsBtn}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity
              onPress={rescan}
              style={[styles.resultBtn, { backgroundColor: 'rgba(255,255,255,0.12)' }]}
            >
              <Ionicons name="scan-outline" size={18} color="#fff" />
              <Text style={styles.resultBtnText}>Scan again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              style={[styles.resultBtn, { backgroundColor: '#E8B828', flex: 1 }]}
            >
              <Ionicons name="checkmark" size={18} color="#000" />
              <Text style={[styles.resultBtnText, { color: '#000' }]}>Log entry</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const RETICLE_W = Math.min(SCREEN_WIDTH * 0.75, 280);
const RETICLE_H = RETICLE_W * 0.6;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  permTitle: { fontSize: 20, fontWeight: '800', marginTop: spacing.sm },
  permBody: { fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.md },
  permBtn: {
    marginTop: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  permBtnText: { color: '#000', fontWeight: '900', fontSize: 15, letterSpacing: 0.3 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  topLabel: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  reticleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticle: {
    width: RETICLE_W,
    height: RETICLE_H,
  },
  corner: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderColor: '#E8B828',
  },
  tl: { top: 0, left: 0, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 0, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 0, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 0, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 4 },
  reticleHint: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: spacing.lg,
    textAlign: 'center',
    opacity: 0.85,
  },

  resultWrap: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  resultTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
  resultSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4, fontWeight: '600' },
  resultBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    flex: 1,
  },
  resultBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  foundCard: {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: spacing.lg,
  },
  foundName: { color: '#fff', fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  foundBrand: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 2 },
  foundMacroRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  foundMacroCell: { flex: 1, alignItems: 'center' },
  foundMacroLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 9, letterSpacing: 1, fontWeight: '800' },
  foundMacroValue: { color: '#fff', fontSize: 18, fontWeight: '900', marginTop: 2 },
  foundServingLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  servingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  servingsText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  servingsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.md,
    paddingHorizontal: 4,
  },
  servingsBtn: { padding: 8 },
  servingsVal: { color: '#fff', fontSize: 16, fontWeight: '800', minWidth: 44, textAlign: 'center' },
});
