import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import { BiomarkerStatus, StoredBiomarker, BiomarkerCategory } from '../types/bloodwork';
import { CATEGORY_ORDER, lookupBiomarkerRef } from '../data/biomarkers';

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function statusColor(s: BiomarkerStatus): string {
  switch (s) {
    case 'optimal':      return '#4CAF50';
    case 'sufficient':   return '#7ECEF4';
    case 'out_of_range': return '#E35B5B';
    default:             return '#888';
  }
}

function statusLabel(s: BiomarkerStatus): string {
  switch (s) {
    case 'optimal':      return 'Optimal';
    case 'sufficient':   return 'Sufficient';
    case 'out_of_range': return 'Out of range';
    default:             return 'Unknown';
  }
}

export function BloodworkReportDetailScreen({ route, navigation }: any) {
  const { colors } = useTheme();
  const { getBloodworkReport, removeBloodworkReport } = useNutrition();
  const id: string = route.params?.id;
  const report = getBloodworkReport(id);

  // Group by category in the canonical order
  const grouped = useMemo(() => {
    if (!report) return {} as Record<BiomarkerCategory, StoredBiomarker[]>;
    const out = {} as Record<BiomarkerCategory, StoredBiomarker[]>;
    for (const b of report.biomarkers) {
      const cat = b.category ?? 'Other';
      if (!out[cat]) out[cat] = [];
      out[cat].push(b);
    }
    return out;
  }, [report]);

  if (!report) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Report not found</Text>
          <View style={styles.backBtn} />
        </View>
      </SafeAreaView>
    );
  }

  function confirmDelete() {
    Alert.alert('Delete report?', 'This will remove this lab report from your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          removeBloodworkReport(id);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Report</Text>
        <TouchableOpacity
          onPress={confirmDelete}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <FadeInView>
          <View style={[styles.dateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.dateLabel, { color: colors.textMuted }]}>TEST DATE</Text>
            <Text style={[styles.dateVal, { color: colors.textPrimary }]}>{formatDate(report.testDate)}</Text>
            {report.labName && (
              <Text style={[styles.labName, { color: colors.textSecondary }]}>{report.labName}</Text>
            )}
          </View>

          {CATEGORY_ORDER.map((cat) => {
            const group = grouped[cat];
            if (!group || group.length === 0) return null;
            return (
              <View key={cat}>
                <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{cat.toUpperCase()}</Text>
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  {group.map((b, i) => {
                    const ref = lookupBiomarkerRef(b.name);
                    return (
                      <View key={i} style={[styles.bioRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.bioNameRow}>
                            <Text style={[styles.bioName, { color: colors.textPrimary }]}>
                              {b.displayName || b.name}
                            </Text>
                            <View style={[styles.statusPill, { backgroundColor: statusColor(b.status) + '22' }]}>
                              <View style={[styles.statusDot, { backgroundColor: statusColor(b.status) }]} />
                              <Text style={[styles.statusText, { color: statusColor(b.status) }]}>
                                {statusLabel(b.status)}
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.bioVal, { color: colors.textPrimary }]}>
                            <Text style={{ fontWeight: '900', fontSize: 17 }}>{b.value}</Text>
                            <Text style={{ color: colors.textSecondary }}> {b.unit}</Text>
                          </Text>
                          {b.referenceLow != null && b.referenceHigh != null && (
                            <Text style={[styles.bioRef, { color: colors.textMuted }]}>
                              Ref: {b.referenceLow}–{b.referenceHigh} {b.unit}
                            </Text>
                          )}
                          {ref?.description && (
                            <Text style={[styles.bioDesc, { color: colors.textMuted }]}>{ref.description}</Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </FadeInView>
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

  dateCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dateLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  dateVal: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  labName: { fontSize: 12, fontWeight: '600', marginTop: 4 },

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

  bioRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bioNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 4,
  },
  bioName: { fontSize: 14, fontWeight: '800', flex: 1 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  bioVal: { fontSize: 14 },
  bioRef: { fontSize: 11, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
  bioDesc: { fontSize: 11, fontWeight: '500', marginTop: 4, lineHeight: 16 },
});
