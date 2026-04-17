import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView, LineChart } from '../components';
import { BloodworkReport, BiomarkerStatus } from '../types/bloodwork';
import { BIOMARKER_REFS, lookupBiomarkerRef } from '../data/biomarkers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function statusColor(s: BiomarkerStatus, colors: any): string {
  switch (s) {
    case 'optimal':      return '#4CAF50';
    case 'sufficient':   return '#7ECEF4';
    case 'out_of_range': return '#E35B5B';
    default:             return colors.textMuted;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BloodworkScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { myBloodworkReports, biomarkerSeries } = useNutrition();

  const reports = user ? myBloodworkReports(user.id) : [];
  const latest: BloodworkReport | undefined = reports[0];

  // Flagged biomarkers across the latest report
  const outOfRange = useMemo(
    () => (latest ? latest.biomarkers.filter((b) => b.status === 'out_of_range') : []),
    [latest],
  );

  // Trend-worthy keys — biomarkers we have ≥ 2 data points for
  const trendableBiomarkers = useMemo(() => {
    if (!user) return [];
    const allNames = new Set<string>();
    reports.forEach((r) => r.biomarkers.forEach((b) => allNames.add(b.name)));
    return Array.from(allNames)
      .map((name) => ({ name, series: biomarkerSeries(user.id, name) }))
      .filter((x) => x.series.length >= 2)
      .slice(0, 8); // cap — too many charts = visual clutter
  }, [reports, user, biomarkerSeries]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Blood work</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('BloodworkUpload')}
          style={[styles.backBtn, { backgroundColor: colors.gold }]}
        >
          <Ionicons name="add" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {reports.length === 0 ? (
          <FadeInView>
            <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flask-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No lab results yet</Text>
              <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
                Upload a lab report (PDF or photo) and the AI will categorize each biomarker with reference ranges and status.
              </Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('BloodworkUpload')}
                style={[styles.emptyCta, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="cloud-upload" size={18} color="#000" />
                <Text style={styles.emptyCtaText}>Upload first report</Text>
              </TouchableOpacity>
            </View>
          </FadeInView>
        ) : (
          <>
            {/* Latest summary */}
            <FadeInView>
              <View style={[styles.latestCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.latestLabel, { color: colors.textMuted }]}>LATEST REPORT</Text>
                <Text style={[styles.latestDate, { color: colors.textPrimary }]}>
                  {latest ? formatDate(latest.testDate) : '—'}
                </Text>
                {latest?.labName && (
                  <Text style={[styles.latestLab, { color: colors.textSecondary }]}>{latest.labName}</Text>
                )}
                <View style={styles.latestStats}>
                  <View style={styles.latestStat}>
                    <Text style={[styles.latestStatVal, { color: colors.textPrimary }]}>
                      {latest?.biomarkers.length ?? 0}
                    </Text>
                    <Text style={[styles.latestStatLabel, { color: colors.textMuted }]}>BIOMARKERS</Text>
                  </View>
                  <View style={styles.latestStat}>
                    <Text style={[styles.latestStatVal, { color: outOfRange.length > 0 ? '#E35B5B' : '#4CAF50' }]}>
                      {outOfRange.length}
                    </Text>
                    <Text style={[styles.latestStatLabel, { color: colors.textMuted }]}>FLAGGED</Text>
                  </View>
                </View>
              </View>
            </FadeInView>

            {/* Flagged preview */}
            {outOfRange.length > 0 && (
              <FadeInView delay={80}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>OUT OF RANGE</Text>
                {outOfRange.map((b, i) => (
                  <View key={i} style={[styles.flagRow, { backgroundColor: colors.surface, borderColor: '#E35B5B33' }]}>
                    <View style={[styles.statusDot, { backgroundColor: statusColor('out_of_range', colors) }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.flagName, { color: colors.textPrimary }]}>
                        {b.displayName || b.name}
                      </Text>
                      <Text style={[styles.flagRef, { color: colors.textSecondary }]}>
                        {b.value} {b.unit}
                        {b.referenceLow != null && b.referenceHigh != null && (
                          <>  ·  ref {b.referenceLow}–{b.referenceHigh}</>
                        )}
                      </Text>
                    </View>
                  </View>
                ))}
              </FadeInView>
            )}

            {/* Trend charts */}
            {trendableBiomarkers.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>TRENDS</Text>
                {trendableBiomarkers.map(({ name, series }) => {
                  const ref = lookupBiomarkerRef(name);
                  const points = series.map((p, i) => ({ x: i, y: p.value, label: undefined }));
                  const latest = points[points.length - 1].y;
                  const first = points[0].y;
                  const delta = latest - first;
                  return (
                    <View key={name} style={[styles.trendCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={styles.trendHeader}>
                        <Text style={[styles.trendLabel, { color: colors.textMuted }]}>
                          {(ref?.displayName ?? name).toUpperCase()}
                        </Text>
                        <View style={styles.trendVals}>
                          <Text style={[styles.trendLatest, { color: colors.textPrimary }]}>
                            {latest.toFixed(1)} {ref?.unit}
                          </Text>
                          <Text style={[styles.trendDelta, { color: colors.textSecondary }]}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                          </Text>
                        </View>
                      </View>
                      <LineChart
                        data={points}
                        width={SCREEN_WIDTH - spacing.lg * 2 - spacing.md * 2}
                        height={100}
                        color={colors.gold}
                        formatY={(v) => v.toFixed(1)}
                      />
                    </View>
                  );
                })}
              </>
            )}

            {/* Report history */}
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>HISTORY</Text>
            {reports.map((r) => {
              const flagged = r.biomarkers.filter((b) => b.status === 'out_of_range').length;
              return (
                <TouchableOpacity
                  key={r.id}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('BloodworkReportDetail', { id: r.id })}
                  style={[styles.historyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.historyDate, { color: colors.textPrimary }]}>{formatDate(r.testDate)}</Text>
                    <Text style={[styles.historySub, { color: colors.textSecondary }]}>
                      {r.biomarkers.length} markers{flagged > 0 ? ` · ${flagged} flagged` : ''}
                      {r.labName ? ` · ${r.labName}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              );
            })}
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
    paddingVertical: spacing.md,
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

  latestCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  latestLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  latestDate: { fontSize: 22, fontWeight: '900', marginTop: 4, letterSpacing: -0.3 },
  latestLab: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  latestStats: { flexDirection: 'row', gap: spacing.xl, marginTop: spacing.md },
  latestStat: { alignItems: 'flex-start' },
  latestStatVal: { fontSize: 24, fontWeight: '900' },
  latestStatLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginTop: 2 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },

  flagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  flagName: { fontSize: 14, fontWeight: '800' },
  flagRef: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  trendCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
  trendLatest: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  trendDelta: { fontSize: 12, fontWeight: '700' },

  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  historyDate: { fontSize: 15, fontWeight: '800' },
  historySub: { fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
});
