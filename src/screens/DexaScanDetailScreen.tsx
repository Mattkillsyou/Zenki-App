import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function risk(v: number | undefined, thresholds: { good: number; warn: number }, higherIsBad = true): 'good' | 'warn' | 'bad' | 'unknown' {
  if (v == null) return 'unknown';
  if (higherIsBad) {
    if (v < thresholds.good) return 'good';
    if (v < thresholds.warn) return 'warn';
    return 'bad';
  }
  if (v > thresholds.good) return 'good';
  if (v > thresholds.warn) return 'warn';
  return 'bad';
}

export function DexaScanDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { getDexaScan, removeDexaScan } = useNutrition();
  const id: string = route.params?.id;
  const scan = getDexaScan(id);

  if (!scan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </SoundPressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Scan not found</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
    );
  }

  function confirmDelete() {
    Alert.alert('Delete scan?', 'This will remove this DEXA scan from your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeDexaScan(id);
          navigation.goBack();
        },
      },
    ]);
  }

  const vatRisk = risk(scan.vatCm2, { good: 100, warn: 160 });
  const bfPctRisk = risk(scan.totalBodyFatPct, { good: 25, warn: 35 });

  const riskColor = (level: ReturnType<typeof risk>) => {
    switch (level) {
      case 'good': return '#4CAF50';
      case 'warn': return '#FFB020';
      case 'bad':  return '#E35B5B';
      default:     return colors.textMuted;
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Scan detail</Text>
        <SoundPressable
          onPress={confirmDelete}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textPrimary} />
        </SoundPressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <FadeInView>
          <View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.dateLabel, { color: colors.textMuted }]}>SCAN DATE</Text>
            <Text style={[styles.dateVal, { color: colors.textPrimary }]}>{formatDate(scan.scanDate)}</Text>
          </View>

          {/* Hero — body fat percent */}
          {scan.totalBodyFatPct != null && (
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>BODY FAT</Text>
              <Text style={[styles.heroNum, { color: colors.gold }]}>{scan.totalBodyFatPct.toFixed(1)}</Text>
              <Text style={[styles.heroUnit, { color: colors.textSecondary }]}>%</Text>
              <View style={[styles.riskPill, { backgroundColor: riskColor(bfPctRisk) + '22' }]}>
                <View style={[styles.riskDot, { backgroundColor: riskColor(bfPctRisk) }]} />
                <Text style={[styles.riskLabel, { color: riskColor(bfPctRisk) }]}>
                  {bfPctRisk === 'good' ? 'Healthy' : bfPctRisk === 'warn' ? 'Above average' : bfPctRisk === 'bad' ? 'Elevated' : '—'}
                </Text>
              </View>
            </View>
          )}

          {/* Mass breakdown */}
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>MASS</Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row label="Fat mass"   value={fmt(scan.fatMassKg, 'kg', 1)}  colors={colors} />
            <Row label="Lean mass"  value={fmt(scan.leanMassKg, 'kg', 1)} colors={colors} />
            <Row label="Bone"       value={fmt(scan.bmc, 'kg', 2)}         colors={colors} />
            <Row label="FMI"        value={fmt(scan.fmi, '', 1)}           colors={colors} />
            <Row label="FFMI"       value={fmt(scan.ffmi, '', 1)}          colors={colors} />
          </View>

          {/* Visceral fat */}
          {scan.vatCm2 != null && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>VISCERAL FAT (VAT)</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row label="VAT" value={`${Math.round(scan.vatCm2)} cm²`} colors={colors} />
                <View style={[styles.riskPill, { backgroundColor: riskColor(vatRisk) + '22', alignSelf: 'flex-start', marginTop: 8 }]}>
                  <View style={[styles.riskDot, { backgroundColor: riskColor(vatRisk) }]} />
                  <Text style={[styles.riskLabel, { color: riskColor(vatRisk) }]}>
                    {vatRisk === 'good' ? 'Low risk' : vatRisk === 'warn' ? 'Elevated risk' : 'High risk'}
                  </Text>
                </View>
                <Text style={[styles.helpText, { color: colors.textMuted }]}>
                  &lt; 100 cm² low · 100–160 elevated · &gt; 160 high
                </Text>
              </View>
            </>
          )}

          {/* Fat distribution */}
          {scan.androidGynoidRatio != null && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>FAT DISTRIBUTION</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Row label="Android/Gynoid ratio" value={scan.androidGynoidRatio.toFixed(2)} colors={colors} />
              </View>
            </>
          )}

          {/* Regional */}
          {(scan.arms || scan.legs || scan.trunk) && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>REGIONAL</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {scan.arms && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[styles.regionLabel, { color: colors.textPrimary }]}>Arms</Text>
                    <Text style={[styles.regionVals, { color: colors.textSecondary }]}>
                      {fmt(scan.arms.leanKg, 'kg lean', 1)}  ·  {fmt(scan.arms.fatKg, 'kg fat', 1)}
                    </Text>
                  </View>
                )}
                {scan.legs && (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[styles.regionLabel, { color: colors.textPrimary }]}>Legs</Text>
                    <Text style={[styles.regionVals, { color: colors.textSecondary }]}>
                      {fmt(scan.legs.leanKg, 'kg lean', 1)}  ·  {fmt(scan.legs.fatKg, 'kg fat', 1)}
                    </Text>
                  </View>
                )}
                {scan.trunk && (
                  <View>
                    <Text style={[styles.regionLabel, { color: colors.textPrimary }]}>Trunk</Text>
                    <Text style={[styles.regionVals, { color: colors.textSecondary }]}>
                      {fmt(scan.trunk.leanKg, 'kg lean', 1)}  ·  {fmt(scan.trunk.fatKg, 'kg fat', 1)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}

          {!!scan.notes && (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>NOTES</Text>
              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.noteText, { color: colors.textSecondary }]}>{scan.notes}</Text>
              </View>
            </>
          )}
        </FadeInView>
      </ScrollView>
    </SafeAreaView>
  );
}

function fmt(v: number | undefined, unit: string, decimals: number): string {
  if (v == null) return '—';
  return `${v.toFixed(decimals)}${unit ? ' ' + unit : ''}`;
}

function Row({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.rowVal, { color: colors.textPrimary }]}>{value}</Text>
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
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  dateCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dateLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  dateVal: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  hero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  heroLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  heroNum: { fontSize: 54, fontWeight: '900', letterSpacing: -1, marginTop: 4 },
  heroUnit: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5, marginTop: -4 },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginTop: spacing.sm,
  },
  riskDot: { width: 7, height: 7, borderRadius: 4 },
  riskLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 13, fontWeight: '600' },
  rowVal: { fontSize: 14, fontWeight: '800' },

  helpText: { fontSize: 11, fontWeight: '600', marginTop: 8, letterSpacing: 0.2 },

  regionLabel: { fontSize: 14, fontWeight: '800' },
  regionVals: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  noteText: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
});
