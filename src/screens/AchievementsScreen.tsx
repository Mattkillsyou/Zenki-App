import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useGamification } from '../context/GamificationContext';
import { AchievementGrid } from '../components';
import { spacing } from '../theme';

export function AchievementsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { state } = useGamification();
  const unlocked = state.achievements.filter((a) => a.unlocked).length;

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
        <Text style={[styles.title, { color: colors.textPrimary }]}>Achievements</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Summary row — unlocked + flames */}
      <View style={[styles.summaryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.summaryCell}>
          <Ionicons name="trophy" size={20} color={colors.gold} />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {unlocked} / {state.achievements.length}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Unlocked</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryCell}>
          <Ionicons name="flame" size={20} color={colors.flames} />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {state.flames || 0}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Flames</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={styles.summaryCell}>
          <Ionicons name="sparkles" size={20} color={colors.gold} />
          <Text style={[styles.summaryValue, { color: colors.textPrimary }]}>
            {state.xp}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>XP</Text>
        </View>
      </View>

      {/* Full grid — tap any badge to see detail + progress */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <AchievementGrid achievements={state.achievements} />
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
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },

  summaryRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 14,
    marginBottom: 4,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  summaryDivider: {
    width: 1,
    marginVertical: 6,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
});
