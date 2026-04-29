import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Dimensions} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, borderRadius } from '../theme';
import { ScreenContainer } from '../components';
import {
  TRAINING_MODULES,
  TrainingAccentToken,
} from '../content/trainingModules';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const COLS = SCREEN_WIDTH >= 600 ? 3 : 2;

/**
 * Training — a library of how-to guides, one per module. Reachable from
 * Settings → Learn → Training Guides.
 */
export function TrainingHomeScreen({ navigation }: any) {
  const { colors } = useTheme();

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={1.3}
        >
          Training
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text
          style={[styles.intro, { color: colors.textSecondary }]}
          maxFontSizeMultiplier={1.3}
        >
          Short guides for every module. Tap any card to see what it is and how to use it.
        </Text>

        <View style={styles.grid}>
          {TRAINING_MODULES.map((mod) => {
            const accent = resolveAccent(mod.accentToken);
            return (
              <SoundPressable
                key={mod.id}
                style={[
                  styles.tile,
                  {
                    backgroundColor: colors.surface,
                    borderColor: accent + '55',
                    width: `${100 / COLS - 2}%`,
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TrainingModule', { moduleId: mod.id })}
                accessibilityRole="button"
                accessibilityLabel={`${mod.title} guide`}
              >
                <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
                  <Ionicons name={mod.icon} size={24} color={accent} />
                </View>
                <Text
                  style={[styles.tileTitle, { color: colors.textPrimary }]}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={1}
                >
                  {mod.title}
                </Text>
                <Text
                  style={[styles.tileSub, { color: colors.textMuted }]}
                  maxFontSizeMultiplier={1.3}
                  numberOfLines={2}
                >
                  {mod.subtitle}
                </Text>
              </SoundPressable>
            );
          })}
        </View>
      </ScrollView>
      </ScreenContainer>
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
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.lg },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
  },
  tile: {
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: 8,
    marginBottom: 6,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  tileSub: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
});
