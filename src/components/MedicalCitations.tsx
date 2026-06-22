import React from 'react';
import { View, Text, StyleSheet, Linking, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { SoundPressable } from './SoundPressable';

/**
 * Easy-to-find "Sources & references" block for any screen that surfaces
 * health/medical information or calculations (Body Lab Info, DEXA detail,
 * bloodwork detail, nutrition/TDEE). Each row is a tappable link to a reputable
 * primary source (NIH/NIDDK, MedlinePlus, PubMed, ADA, ATA, ACE, FAO/WHO, NHLBI).
 *
 * Required by Apple App Review Guideline 1.4.1 (Safety — Physical Harm): apps
 * presenting medical/health information must cite the sources, and the citations
 * must be EASY for the user to find. So this is an always-visible list — not a
 * collapsed accordion — and is wired onto every medical surface in Body Lab.
 *
 * Dependency-free beyond useTheme + SoundPressable, and renders on every
 * platform (unlike AppleHealthFootnote, the citations must show for the reviewer
 * everywhere, not just iOS).
 */

export type CitationTopic = 'bodylab' | 'dexa' | 'bloodwork' | 'nutrition';

type Source = { label: string; url: string };

// One canonical source map so a URL/label is defined exactly once and can never
// drift between topics — each topic below just references these entries.
const SRC = {
  mifflin:     { label: 'Resting energy expenditure equation — Mifflin–St Jeor (Am J Clin Nutr, 1990)', url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/' },
  pal:         { label: 'Activity factors (PAL) — FAO/WHO/UNU Human Energy Requirements (2001)', url: 'https://www.fao.org/3/y5686e/y5686e00.htm' },
  protein:     { label: 'Protein intake for athletes — Int’l Society of Sports Nutrition position stand (2017)', url: 'https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8' },
  energyBal:   { label: 'Energy balance (~7700 kcal per kg) — Hall KD, et al. (Lancet, 2011)', url: 'https://pubmed.ncbi.nlm.nih.gov/21872751/' },
  dxa:         { label: 'DXA body composition overview — review article (PubMed, U.S. National Library of Medicine)', url: 'https://pubmed.ncbi.nlm.nih.gov/32742961/' },
  bodyFat:     { label: 'Body-fat percentage ranges — American Council on Exercise (ACE)', url: 'https://www.acefitness.org/resources/everyone/blog/112/what-are-the-guidelines-for-percentage-of-body-fat-loss/' },
  ffmi:        { label: 'Fat-Free Mass Index (FFMI) — Kouri EM, et al. (Clin J Sport Med, 1995)', url: 'https://pubmed.ncbi.nlm.nih.gov/7496846/' },
  vat:         { label: 'Visceral fat & cardiometabolic risk — Neeland IJ, et al. (Lancet Diabetes Endocrinol, 2019)', url: 'https://pubmed.ncbi.nlm.nih.gov/31345776/' },
  labRanges:   { label: 'Lab test reference ranges — MedlinePlus (U.S. National Library of Medicine)', url: 'https://medlineplus.gov/lab-tests/' },
  cholesterol: { label: 'Blood cholesterol — NHLBI / 2018 ACC-AHA cholesterol guideline', url: 'https://www.nhlbi.nih.gov/health/blood-cholesterol' },
  hba1c:       { label: 'HbA1c & glucose diagnostic cut-points — American Diabetes Association', url: 'https://diabetes.org/about-diabetes/diagnosis' },
  vitD:        { label: 'Vitamin D status — NIH Office of Dietary Supplements', url: 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/' },
  thyroid:     { label: 'Thyroid tests (TSH/T3/T4) — American Thyroid Association', url: 'https://www.thyroid.org/thyroid-function-tests/' },
} as const;

const CITATIONS: Record<CitationTopic, Source[]> = {
  nutrition: [SRC.mifflin, SRC.pal, SRC.protein, SRC.energyBal],
  dexa:      [SRC.dxa, SRC.bodyFat, SRC.ffmi, SRC.vat],
  bloodwork: [SRC.labRanges, SRC.cholesterol, SRC.hba1c, SRC.vitD, SRC.thyroid],
  // Umbrella subset for the Body Lab Info tab — spans DEXA + labs + nutrition,
  // reusing the same Source objects so nothing diverges.
  bodylab:   [SRC.dxa, SRC.labRanges, SRC.bodyFat, SRC.mifflin],
};

export function MedicalCitations({ topic, style }: { topic: CitationTopic; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const sources = CITATIONS[topic];

  const open = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      <View style={styles.header}>
        <Ionicons name="information-circle-outline" size={16} color={colors.gold} />
        <Text style={[styles.headerText, { color: colors.textMuted }]}>Sources &amp; references</Text>
      </View>

      {sources.map((s) => (
        <SoundPressable
          key={s.url}
          style={styles.row}
          onPress={() => open(s.url)}
          accessibilityRole="link"
          accessibilityLabel={`${s.label} (opens in browser)`}
        >
          <Text style={[styles.rowText, { color: colors.textSecondary }]}>{s.label}</Text>
          <Ionicons name="open-outline" size={14} color={colors.gold} style={styles.rowIcon} />
        </SoundPressable>
      ))}

      <Text style={[styles.disclaimer, { color: colors.textMuted }]}>
        Reference ranges and calculations are general guidance, not medical advice. Always consult the values on your own lab/scan report and a licensed clinician.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 8,
  },
  rowText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  rowIcon: {
    marginTop: 1,
  },
  disclaimer: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 6,
  },
});
