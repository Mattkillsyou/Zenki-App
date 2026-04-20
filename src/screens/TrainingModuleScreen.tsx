import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import {
  TRAINING_MODULES,
  TrainingAccentToken,
  TrainingModuleId,
} from '../content/trainingModules';

interface Props {
  navigation: any;
  route: { params?: { moduleId?: TrainingModuleId } };
}

/**
 * Detail page for a single Training module. Renders its What It Is +
 * How To Use sections from `trainingModules.ts`. No copy lives in this
 * file — text comes from content.
 */
export function TrainingModuleScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const moduleId = route.params?.moduleId;
  const mod = TRAINING_MODULES.find((m) => m.id === moduleId);

  const resolveAccent = (token: TrainingAccentToken): string => {
    const map: Record<TrainingAccentToken, string> = {
      red: colors.red,
      gold: colors.gold,
      success: colors.success,
      info: colors.info,
      warning: colors.warning,
      flames: colors.flames,
    };
    return map[token] || colors.gold;
  };

  if (!mod) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text
            style={[styles.title, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.3}
          >
            Training
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.missing}>
          <Ionicons name="help-circle-outline" size={40} color={colors.textMuted} />
          <Text
            style={[styles.missingText, { color: colors.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            Module not found.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const accent = resolveAccent(mod.accentToken);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={1.3}
          numberOfLines={1}
        >
          {mod.title}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={[styles.hero, { backgroundColor: accent + '1A', borderColor: accent + '55' }]}>
          <View style={[styles.heroIcon, { backgroundColor: accent + '33' }]}>
            <Ionicons name={mod.icon} size={42} color={accent} />
          </View>
          <Text
            style={[styles.heroTitle, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.3}
          >
            {mod.title}
          </Text>
          <Text
            style={[styles.heroSub, { color: colors.textSecondary }]}
            maxFontSizeMultiplier={1.3}
          >
            {mod.subtitle}
          </Text>
        </View>

        {/* What it is */}
        <Text
          style={[styles.sectionLabel, { color: colors.textMuted }]}
          maxFontSizeMultiplier={1.3}
        >
          WHAT IT IS
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text
            style={[styles.bodyText, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.3}
          >
            {mod.sections.whatItIs}
          </Text>
        </View>

        {/* How to use */}
        <Text
          style={[styles.sectionLabel, { color: colors.textMuted }]}
          maxFontSizeMultiplier={1.3}
        >
          HOW TO USE
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {mod.sections.howToUse.map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: accent }]}>
                <Text style={styles.stepNumText} maxFontSizeMultiplier={1.3}>
                  {i + 1}
                </Text>
              </View>
              <Text
                style={[styles.stepText, { color: colors.textPrimary }]}
                maxFontSizeMultiplier={1.3}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xl }} />
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
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, flex: 1, textAlign: 'center', marginHorizontal: 4 },

  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },

  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    gap: 6,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 24, fontWeight: '800', letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: '88%',
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 1.4,
    marginTop: spacing.lg, marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
  },
  bodyText: {
    fontSize: 15, lineHeight: 22, fontWeight: '500',
  },

  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  stepNumText: {
    color: '#000', fontSize: 13, fontWeight: '900',
  },
  stepText: {
    flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '500',
  },

  missing: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  missingText: { fontSize: 14 },
});
