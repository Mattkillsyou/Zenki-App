import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import { DexaScan } from '../types/dexa';

// Clamp chart width to MAX_CONTENT_WIDTH so charts don't overflow the
// ScreenContainer cap on iPad (~700pt).
const { width: WINDOW_WIDTH } = Dimensions.get('window');
const SCREEN_WIDTH = Math.min(WINDOW_WIDTH, 700);

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TrendRow {
  key: keyof Pick<DexaScan, 'totalBodyFatPct' | 'leanMassKg' | 'fatMassKg' | 'vatCm2' | 'ffmi' | 'fmi' | 'androidGynoidRatio'>;
  label: string;
  unit: string;
  lowerIsBetter: boolean;
  decimals: number;
}

const TRENDS: TrendRow[] = [
  { key: 'totalBodyFatPct', label: 'Body Fat',      unit: '%',    lowerIsBetter: true,  decimals: 1 },
  { key: 'leanMassKg',      label: 'Lean Mass',     unit: 'kg',   lowerIsBetter: false, decimals: 1 },
  { key: 'vatCm2',          label: 'VAT',           unit: 'cm²',  lowerIsBetter: true,  decimals: 0 },
  { key: 'ffmi',            label: 'FFMI',          unit: '',     lowerIsBetter: false, decimals: 1 },
  { key: 'fatMassKg',       label: 'Fat Mass',      unit: 'kg',   lowerIsBetter: true,  decimals: 1 },
  { key: 'androidGynoidRatio', label: 'Android/Gynoid', unit: '', lowerIsBetter: true,  decimals: 2 },
];

export function DexaScansScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { myDexaScans } = useNutrition();

  const scans = user ? myDexaScans(user.id) : [];
  const chronological = useMemo(() => [...scans].reverse(), [scans]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>DEXA</Text>
        <SoundPressable
          onPress={() => navigation.navigate('DexaUpload')}
          style={[styles.backBtn, { backgroundColor: colors.gold }]}
        >
          <Ionicons name="add" size={22} color="#000" />
        </SoundPressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {scans.length === 0 ? (
          <FadeInView>
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="body-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No scans yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Upload a DEXA report (PDF or photo) and the AI will extract all your metrics automatically.
              </Text>
              <SoundPressable
                activeOpacity={0.85}
                onPress={() => navigation.navigate('DexaUpload')}
                style={[styles.emptyCta, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="cloud-upload" size={18} color="#000" />
                <Text style={styles.emptyCtaText}>Upload first scan</Text>
              </SoundPressable>
            </View>
          </FadeInView>
        ) : (
          <>
            {/* Trend charts — one per metric */}
            <FadeInView>
              {TRENDS.map((t) => {
                const points = chronological
                  .map((s, i) => ({ x: i, y: s[t.key] as number | undefined, label: formatDate(s.scanDate) }))
                  .filter((p) => typeof p.y === 'number') as { x: number; y: number; label?: string }[];
                if (points.length < 2) return null;
                const latest = points[points.length - 1].y;
                const first = points[0].y;
                const delta = latest - first;
                return (
                  <View key={t.key} style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.trendHeader}>
                      <Text style={[styles.trendLabel, { color: colors.textMuted }]}>{t.label.toUpperCase()}</Text>
                      <View style={styles.trendVals}>
                        <Text style={[styles.trendLatest, { color: colors.textPrimary }]}>
                          {latest.toFixed(t.decimals)}{t.unit}
                        </Text>
                        <Text style={[styles.trendDelta, {
                          color:
                            delta === 0
                              ? colors.textMuted
                              : (delta < 0) === t.lowerIsBetter
                                ? colors.gold
                                : colors.textSecondary,
                        }]}>
                          {delta > 0 ? '+' : ''}{delta.toFixed(t.decimals)}
                        </Text>
                      </View>
                    </View>
                    <LineChart
                      data={points}
                      width={SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2}
                      height={110}
                      color={colors.gold}
                      lowerIsBetter={t.lowerIsBetter}
                      formatY={(v) => v.toFixed(t.decimals)}
                    />
                  </View>
                );
              })}
            </FadeInView>

            {/* Scan list */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>SCANS</Text>
            {scans.map((scan) => (
              <SoundPressable
                key={scan.id}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('DexaScanDetail', { id: scan.id })}
                style={[styles.scanRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.scanDate, { color: colors.textPrimary }]}>{formatDate(scan.scanDate)}</Text>
                  <Text style={[styles.scanSummary, { color: colors.textSecondary }]}>
                    {scan.totalBodyFatPct != null ? `${scan.totalBodyFatPct.toFixed(1)}% BF` : '—'}
                    {scan.leanMassKg != null ? ` · ${scan.leanMassKg.toFixed(1)}kg lean` : ''}
                    {scan.vatCm2 != null ? ` · VAT ${Math.round(scan.vatCm2)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SoundPressable>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  empty: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginTop: spacing.sm },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 19 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  emptyCtaText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 0.3 },

  trendCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  trendLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  trendVals: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  trendLatest: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  trendDelta: { fontSize: 13, fontWeight: '700' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  scanDate: { fontSize: 15, fontWeight: '800' },
  scanSummary: { fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
});
