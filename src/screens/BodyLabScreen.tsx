import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';

type Tab = 'dashboard' | 'dexa' | 'bloodwork' | 'info';

export function BodyLabScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { myDexaScans, myBloodworkReports, biomarkerSeries, latestWeight } = useNutrition();
  const [tab, setTab] = useState<Tab>('dashboard');

  const dexaScans = user ? myDexaScans(user.id) : [];
  const bloodwork = user ? myBloodworkReports(user.id) : [];

  // Health score computation
  const healthScore = useMemo(() => {
    if (!user) return null;
    let score = 50; // baseline
    let factors = 0;

    // Body fat contribution (if DEXA available)
    if (dexaScans.length > 0) {
      const latest = dexaScans[0];
      const bf = latest.totalBodyFatPct;
      if (bf != null) {
        // Optimal male: 10-20%, female: 18-28%
        const optimal = bf >= 10 && bf <= 25;
        score += optimal ? 15 : bf < 10 || bf > 35 ? -5 : 5;
        factors++;
      }
    }

    // Bloodwork contribution
    if (bloodwork.length > 0) {
      const latest = bloodwork[0];
      const total = latest.biomarkers?.length || 0;
      const flagged = latest.biomarkers?.filter((b: any) => b.status === 'out_of_range').length || 0;
      const optimalPct = total > 0 ? ((total - flagged) / total) * 100 : 50;
      score += Math.round((optimalPct / 100) * 20);
      factors++;
    }

    // Weight logging consistency
    const weight = latestWeight(user.id);
    if (weight) {
      score += 5; // has logged weight
      factors++;
    }

    // Normalize to 0-100
    return Math.max(0, Math.min(100, score + (factors === 0 ? 0 : factors * 3)));
  }, [user, dexaScans, bloodwork, latestWeight]);

  // Insights
  const bodyInsights = useMemo(() => {
    const insights: string[] = [];
    if (dexaScans.length >= 2) {
      const latest = dexaScans[0];
      const prev = dexaScans[1];
      if (latest.totalBodyFatPct != null && prev.totalBodyFatPct != null) {
        const delta = latest.totalBodyFatPct - prev.totalBodyFatPct;
        if (Math.abs(delta) >= 0.5) {
          insights.push(`Body fat ${delta < 0 ? 'decreased' : 'increased'} ${Math.abs(delta).toFixed(1)}% since your last scan.`);
        }
      }
      if (latest.leanMassKg != null && prev.leanMassKg != null) {
        const delta = latest.leanMassKg - prev.leanMassKg;
        if (Math.abs(delta) >= 0.3) {
          insights.push(`Lean mass ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta).toFixed(1)} kg since last scan.`);
        }
      }
    }
    if (dexaScans.length > 0) {
      const daysSince = Math.floor((Date.now() - new Date(dexaScans[0].scanDate).getTime()) / 86400000);
      if (daysSince > 90) insights.push(`Last DEXA scan was ${daysSince} days ago. Consider scheduling a follow-up.`);
    }
    if (bloodwork.length > 0) {
      const daysSince = Math.floor((Date.now() - new Date(bloodwork[0].testDate).getTime()) / 86400000);
      if (daysSince > 180) insights.push(`Last blood panel was ${daysSince} days ago. Recommended every 6 months.`);
    }
    if (dexaScans.length === 0) insights.push('Upload your first DEXA scan to start tracking body composition.');
    if (bloodwork.length === 0) insights.push('Upload your first blood panel to track biomarkers over time.');
    return insights;
  }, [dexaScans, bloodwork]);

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dash', icon: 'pulse-outline' },
    { key: 'dexa', label: 'DEXA', icon: 'body-outline' },
    { key: 'bloodwork', label: 'Blood', icon: 'flask-outline' },
    { key: 'info', label: 'Info', icon: 'information-circle-outline' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Body Lab</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <SoundPressable
              key={t.key}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={16} color={active ? '#000' : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textMuted }]}>{t.label}</Text>
            </SoundPressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── DASHBOARD TAB ── */}
        {tab === 'dashboard' && (
          <>
            {/* Health Score */}
            <FadeInView>
              <View style={[styles.scoreCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.scoreLabel, { color: colors.textMuted }]}>HEALTH SCORE</Text>
                <View style={styles.scoreCircle}>
                  <View style={[styles.scoreRing, {
                    borderColor: healthScore != null && healthScore >= 70 ? colors.success
                      : healthScore != null && healthScore >= 40 ? colors.warning : colors.error,
                  }]}>
                    <Text style={[styles.scoreValue, { color: colors.textPrimary }]}>
                      {healthScore ?? '--'}
                    </Text>
                    <Text style={[styles.scoreUnit, { color: colors.textMuted }]}>/100</Text>
                  </View>
                </View>
                <Text style={[styles.scoreDesc, { color: colors.textSecondary }]}>
                  {healthScore != null && healthScore >= 70 ? 'Looking great! Keep it up.'
                    : healthScore != null && healthScore >= 40 ? 'Room for improvement. Check insights below.'
                    : 'Upload scans and blood panels to improve your score.'}
                </Text>
              </View>
            </FadeInView>

            {/* Quick stats */}
            <FadeInView delay={40}>
              <View style={styles.dashGrid}>
                <View style={[styles.dashTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.dashTileValue, { color: colors.gold }]}>
                    {dexaScans.length > 0 ? `${dexaScans[0].totalBodyFatPct?.toFixed(1) || '--'}%` : '--'}
                  </Text>
                  <Text style={[styles.dashTileLabel, { color: colors.textMuted }]}>Body Fat</Text>
                </View>
                <View style={[styles.dashTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.dashTileValue, { color: colors.textPrimary }]}>
                    {dexaScans.length > 0 ? `${dexaScans[0].leanMassKg?.toFixed(1) || '--'} kg` : '--'}
                  </Text>
                  <Text style={[styles.dashTileLabel, { color: colors.textMuted }]}>Lean Mass</Text>
                </View>
                <View style={[styles.dashTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.dashTileValue, { color: colors.textPrimary }]}>{dexaScans.length}</Text>
                  <Text style={[styles.dashTileLabel, { color: colors.textMuted }]}>DEXA Scans</Text>
                </View>
                <View style={[styles.dashTile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.dashTileValue, { color: colors.textPrimary }]}>{bloodwork.length}</Text>
                  <Text style={[styles.dashTileLabel, { color: colors.textMuted }]}>Blood Panels</Text>
                </View>
              </View>
            </FadeInView>

            {/* Medications & Peptides shortcut */}
            <FadeInView delay={50}>
              <SoundPressable
                style={[styles.uploadCard, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 12 }]}
                onPress={() => navigation.navigate('MedicationTracker')}
              >
                <Ionicons name="bandage-outline" size={24} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Medications & Peptides</Text>
                  <Text style={[styles.uploadSub, { color: colors.textMuted }]}>Track doses, set reminders, log adherence</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </SoundPressable>
            </FadeInView>

            {/* Flagged biomarkers summary */}
            {bloodwork.length > 0 && (() => {
              const latest = bloodwork[0];
              const flagged = latest.biomarkers?.filter((b: any) => b.status === 'out_of_range') || [];
              const optimal = latest.biomarkers?.filter((b: any) => b.status === 'optimal' || b.status === 'normal') || [];
              return (
                <FadeInView delay={60}>
                  <View style={[styles.bioSummary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LATEST BLOOD PANEL</Text>
                    <View style={styles.bioRow}>
                      <View style={[styles.bioBadge, { backgroundColor: colors.successMuted }]}>
                        <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                        <Text style={[styles.bioBadgeText, { color: colors.success }]}>{optimal.length} Optimal</Text>
                      </View>
                      {flagged.length > 0 && (
                        <View style={[styles.bioBadge, { backgroundColor: colors.errorMuted }]}>
                          <Ionicons name="alert-circle" size={14} color={colors.error} />
                          <Text style={[styles.bioBadgeText, { color: colors.error }]}>{flagged.length} Flagged</Text>
                        </View>
                      )}
                    </View>
                    {flagged.length > 0 && flagged.slice(0, 3).map((b: any, i: number) => (
                      <View key={i} style={styles.flaggedRow}>
                        <Ionicons name="warning-outline" size={14} color={colors.warning} />
                        <Text style={[styles.flaggedName, { color: colors.textPrimary }]}>{b.name}</Text>
                        <Text style={[styles.flaggedValue, { color: colors.error }]}>{b.value} {b.unit}</Text>
                      </View>
                    ))}
                  </View>
                </FadeInView>
              );
            })()}

            {/* Insights */}
            {bodyInsights.length > 0 && (
              <FadeInView delay={80}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted, marginTop: 8 }]}>INSIGHTS</Text>
                {bodyInsights.map((ins, i) => (
                  <View key={i} style={[styles.insightCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="bulb-outline" size={16} color={colors.gold} />
                    <Text style={[styles.insightText, { color: colors.textSecondary }]}>{ins}</Text>
                  </View>
                ))}
              </FadeInView>
            )}
          </>
        )}

        {tab === 'dexa' && (
          <>
            {/* Upload CTA */}
            <SoundPressable
              style={[styles.uploadCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
              onPress={() => navigation.navigate('DexaUpload')}
            >
              <Ionicons name="cloud-upload-outline" size={24} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Upload DEXA Scan</Text>
                <Text style={[styles.uploadSub, { color: colors.textMuted }]}>Photo or PDF of your body composition report</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </SoundPressable>

            {/* Existing scans */}
            {dexaScans.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR SCANS · {dexaScans.length}</Text>
                {dexaScans.map((scan: any) => (
                  <SoundPressable
                    key={scan.id}
                    style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    onPress={() => navigation.navigate('DexaScanDetail', { scanId: scan.id })}
                  >
                    <View style={[styles.listIcon, { backgroundColor: colors.goldMuted }]}>
                      <Ionicons name="body" size={18} color={colors.gold} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                        {new Date(scan.date || scan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                      {scan.bodyFatPct != null && (
                        <Text style={[styles.listSub, { color: colors.textMuted }]}>
                          {scan.bodyFatPct.toFixed(1)}% body fat · {scan.leanMassKg?.toFixed(1) || '—'} kg lean
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </SoundPressable>
                ))}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="body-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No DEXA scans yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Upload your first scan to start tracking body composition over time.</Text>
              </View>
            )}
          </>
        )}

        {tab === 'bloodwork' && (
          <>
            <SoundPressable
              style={[styles.uploadCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
              onPress={() => navigation.navigate('BloodworkUpload')}
            >
              <Ionicons name="cloud-upload-outline" size={24} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Upload Blood Panel</Text>
                <Text style={[styles.uploadSub, { color: colors.textMuted }]}>Photo or PDF of your lab results</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </SoundPressable>

            {bloodwork.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR REPORTS · {bloodwork.length}</Text>
                {bloodwork.map((report: any) => {
                  const flagged = report.biomarkers?.filter((b: any) => b.status === 'out_of_range').length || 0;
                  return (
                    <SoundPressable
                      key={report.id}
                      style={[styles.listCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => navigation.navigate('BloodworkReportDetail', { reportId: report.id })}
                    >
                      <View style={[styles.listIcon, { backgroundColor: flagged > 0 ? colors.redMuted : colors.goldMuted }]}>
                        <Ionicons name="flask" size={18} color={flagged > 0 ? colors.red : colors.gold} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.listTitle, { color: colors.textPrimary }]}>
                          {new Date(report.date || report.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                        <Text style={[styles.listSub, { color: colors.textMuted }]}>
                          {report.biomarkers?.length || 0} biomarkers{flagged > 0 ? ` · ${flagged} flagged` : ' · all normal'}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </SoundPressable>
                  );
                })}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="flask-outline" size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No blood panels yet</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>Upload your first lab report to track biomarkers over time.</Text>
              </View>
            )}
          </>
        )}

        {tab === 'info' && (
          <>
            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="medkit" size={24} color={colors.gold} />
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Where to Get Labs Done</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Provider information coming soon. Your instructor will share recommended DEXA and bloodwork locations in the LA area.
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="body" size={24} color={colors.gold} />
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>What is a DEXA Scan?</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                DEXA (Dual-Energy X-ray Absorptiometry) is the gold standard for measuring body fat percentage, lean muscle mass, bone density, and visceral fat. Scans take ~10 minutes and cost $40–100.
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="flask" size={24} color={colors.gold} />
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Why Track Bloodwork?</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                Regular blood panels track hormone levels, cholesterol, inflammation markers, vitamin levels, and metabolic health. Recommended every 6 months for active athletes.
              </Text>
            </View>

            <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="calendar" size={24} color={colors.gold} />
              <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>Recommended Schedule</Text>
              <Text style={[styles.infoBody, { color: colors.textSecondary }]}>
                • DEXA: Every 3–6 months{'\n'}
                • Bloodwork: Every 6 months{'\n'}
                • Weight: Daily (the app smooths it for you){'\n'}
                • Macros: Daily during active cut/bulk phases
              </Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  title: { fontSize: 20, fontWeight: '800' },

  tabBar: {
    flexDirection: 'row', marginHorizontal: spacing.lg, borderRadius: 14,
    borderWidth: 1, padding: 3, gap: 3, marginBottom: spacing.md,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, borderRadius: 11, gap: 4,
  },
  tabLabel: { fontSize: 12, fontWeight: '700' },

  scroll: { paddingHorizontal: spacing.lg },

  uploadCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: 16,
  },
  uploadTitle: { fontSize: 15, fontWeight: '800' },
  uploadSub: { fontSize: 11, marginTop: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 8 },

  listCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8,
  },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700' },
  listSub: { fontSize: 11, marginTop: 2 },

  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptySub: { fontSize: 12, textAlign: 'center', lineHeight: 16, paddingHorizontal: 20 },

  infoCard: {
    padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 12, gap: 8,
  },
  infoTitle: { fontSize: 15, fontWeight: '800' },
  infoBody: { fontSize: 13, lineHeight: 19 },

  // ── Dashboard ──
  scoreCard: {
    alignItems: 'center', padding: 20, borderRadius: 18, borderWidth: 1, marginBottom: 16, gap: 8,
  },
  scoreLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  scoreCircle: { marginVertical: 8 },
  scoreRing: {
    width: 100, height: 100, borderRadius: 50, borderWidth: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  scoreValue: { fontSize: 36, fontWeight: '900' },
  scoreUnit: { fontSize: 12, fontWeight: '600' },
  scoreDesc: { fontSize: 12, textAlign: 'center', lineHeight: 17 },

  dashGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  dashTile: {
    width: '48%', alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1,
  },
  dashTileValue: { fontSize: 22, fontWeight: '900' },
  dashTileLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },

  bioSummary: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  bioRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 8 },
  bioBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  bioBadgeText: { fontSize: 11, fontWeight: '700' },
  flaggedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  flaggedName: { flex: 1, fontSize: 13, fontWeight: '600' },
  flaggedValue: { fontSize: 13, fontWeight: '800' },

  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  insightText: { flex: 1, fontSize: 12, lineHeight: 17 },
});
