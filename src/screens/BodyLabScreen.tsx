import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing } from '../theme';

type Tab = 'dexa' | 'bloodwork' | 'info';

export function BodyLabScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { myDexaScans, myBloodworkReports } = useNutrition();
  const [tab, setTab] = useState<Tab>('dexa');

  const dexaScans = user ? myDexaScans(user.id) : [];
  const bloodwork = user ? myBloodworkReports(user.id) : [];

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'dexa', label: 'DEXA', icon: 'body-outline' },
    { key: 'bloodwork', label: 'Blood', icon: 'flask-outline' },
    { key: 'info', label: 'Info', icon: 'information-circle-outline' },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Body Lab</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && { backgroundColor: colors.gold }]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon as any} size={16} color={active ? '#000' : colors.textMuted} />
              <Text style={[styles.tabLabel, { color: active ? '#000' : colors.textMuted }]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'dexa' && (
          <>
            {/* Upload CTA */}
            <TouchableOpacity
              style={[styles.uploadCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
              onPress={() => navigation.navigate('DexaUpload')}
            >
              <Ionicons name="cloud-upload-outline" size={24} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Upload DEXA Scan</Text>
                <Text style={[styles.uploadSub, { color: colors.textMuted }]}>Photo or PDF of your body composition report</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {/* Existing scans */}
            {dexaScans.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR SCANS · {dexaScans.length}</Text>
                {dexaScans.map((scan: any) => (
                  <TouchableOpacity
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
                  </TouchableOpacity>
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
            <TouchableOpacity
              style={[styles.uploadCard, { backgroundColor: colors.surface, borderColor: colors.gold }]}
              onPress={() => navigation.navigate('BloodworkUpload')}
            >
              <Ionicons name="cloud-upload-outline" size={24} color={colors.gold} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.uploadTitle, { color: colors.textPrimary }]}>Upload Blood Panel</Text>
                <Text style={[styles.uploadSub, { color: colors.textMuted }]}>Photo or PDF of your lab results</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {bloodwork.length > 0 ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>YOUR REPORTS · {bloodwork.length}</Text>
                {bloodwork.map((report: any) => {
                  const flagged = report.biomarkers?.filter((b: any) => b.status === 'out_of_range').length || 0;
                  return (
                    <TouchableOpacity
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
                    </TouchableOpacity>
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
});
