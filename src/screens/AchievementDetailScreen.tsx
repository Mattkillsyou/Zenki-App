import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useGamification } from '../context/GamificationContext';
import { Achievement, difficultyColor, getCurrentValue, getAchievementProgress } from '../types/gamification';
import { spacing } from '../theme';

export function AchievementDetailScreen({ navigation, route }: any) {
  const { colors } = useTheme();
  const { state } = useGamification();
  const { achievementId } = route.params || {};

  const achievement: Achievement | undefined = state.achievements.find((a) => a.id === achievementId);

  if (!achievement) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <SoundPressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </SoundPressable>
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="trophy-outline" size={48} color={colors.textMuted} />
          <Text style={{ color: colors.textPrimary, marginTop: 12, fontSize: 16, fontWeight: '600' }}>
            Achievement not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const current = getCurrentValue(achievement.requirement.type, state);
  const target = achievement.requirement.value;
  const progress = getAchievementProgress(achievement, state);
  const diff = difficultyColor(achievement.difficulty);
  const howTo = howToEarn(achievement);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Top difficulty stripe */}
      <View style={[styles.diffStripe, { backgroundColor: diff }]} />

      {/* Header */}
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </SoundPressable>
        <View style={[styles.diffPill, { backgroundColor: diff + '22', borderColor: diff }]}>
          <Text style={[styles.diffText, { color: diff }]}>
            {achievement.difficulty.toUpperCase()}
          </Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Giant icon */}
        <View
          style={[
            styles.heroCircle,
            {
              backgroundColor: achievement.unlocked ? colors.goldMuted : colors.surfaceSecondary,
              borderColor: achievement.unlocked ? diff : colors.border,
            },
          ]}
        >
          <Ionicons
            name={achievement.icon as any}
            size={80}
            color={achievement.unlocked ? colors.gold : colors.textMuted}
            style={achievement.unlocked ? undefined : { opacity: 0.35 }}
          />
          {achievement.unlocked && (
            <View style={[styles.lockedChip, { backgroundColor: diff }]}>
              <Ionicons name="checkmark" size={14} color="#000" />
              <Text style={styles.lockedChipText}>UNLOCKED</Text>
            </View>
          )}
        </View>

        <Text style={[styles.title, { color: colors.textPrimary }]}>{achievement.title}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>{achievement.description}</Text>

        {/* Progress */}
        <View style={styles.progressBlock}>
          <View style={styles.progressLabels}>
            <Text style={[styles.progressLabel, { color: colors.textMuted }]}>PROGRESS</Text>
            <Text style={[styles.progressValue, { color: colors.textPrimary }]}>
              {Math.min(current, target).toLocaleString()} / {target.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.progressBarBg, { backgroundColor: colors.surface }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.max(4, progress * 100)}%`,
                  backgroundColor: achievement.unlocked ? colors.gold : diff,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressPct, { color: colors.textMuted }]}>
            {Math.round(progress * 100)}%
          </Text>
        </View>

        {/* Rewards */}
        <View style={[styles.rewardsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.rewardCell}>
            <Ionicons name="flame" size={26} color={colors.flames} />
            <Text style={[styles.rewardValue, { color: colors.textPrimary }]}>
              +{achievement.flameReward}
            </Text>
            <Text style={[styles.rewardLabel, { color: colors.textMuted }]}>Flames</Text>
          </View>
          <View style={[styles.rewardDivider, { backgroundColor: colors.border }]} />
          <View style={styles.rewardCell}>
            <Ionicons name="sparkles" size={26} color={colors.gold} />
            <Text style={[styles.rewardValue, { color: colors.textPrimary }]}>
              +{achievement.xpReward}
            </Text>
            <Text style={[styles.rewardLabel, { color: colors.textMuted }]}>XP</Text>
          </View>
        </View>

        {/* How to earn */}
        <View style={[styles.howCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.howLabel, { color: colors.gold }]}>HOW TO EARN</Text>
          <Text style={[styles.howBody, { color: colors.textPrimary }]}>{howTo}</Text>
        </View>

        {achievement.unlocked && achievement.unlockedAt && (
          <Text style={[styles.unlockedAt, { color: colors.textMuted }]}>
            Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
          </Text>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function howToEarn(a: Achievement): string {
  const v = a.requirement.value;
  switch (a.requirement.type) {
    case 'sessions_total':   return `Check into ${v} training session${v === 1 ? '' : 's'}.`;
    case 'streak_days':      return `Train ${v} day${v === 1 ? '' : 's'} in a row without missing a day.`;
    case 'classes_booked':   return `Book ${v} class${v === 1 ? '' : 'es'} through the app.`;
    case 'private_sessions': return `Complete ${v} private one-on-one session${v === 1 ? '' : 's'}.`;
    case 'belt_promotion':   return `Earn your ${['white','blue','purple','brown','black'][v - 1] || ''} belt.`.trim();
    case 'stripes_earned':   return `Earn ${v} stripe${v === 1 ? '' : 's'} on your current belt.`;
    case 'early_bird':       return `Train before 7 AM ${v} time${v === 1 ? '' : 's'}.`;
    case 'night_owl':        return `Train after 8 PM ${v} time${v === 1 ? '' : 's'}.`;
    case 'weekend_warrior':  return `Train ${v} time${v === 1 ? '' : 's'} on a weekend.`;
    case 'week_warrior':     return `Complete ${v}+ sessions in a single calendar week.`;
    case 'month_warrior':    return `Complete ${v}+ sessions in a single calendar month.`;
    case 'dojo_anniversary': return `Stay an active member for ${v} day${v === 1 ? '' : 's'}.`;
    case 'posts_created':    return `Share ${v} post${v === 1 ? '' : 's'} to the community feed.`;
    case 'followers':        return `Reach ${v} follower${v === 1 ? '' : 's'} on your profile.`;
    case 'likes_received':   return `Receive ${v} total like${v === 1 ? '' : 's'} across your posts.`;
    case 'drinks_logged':    return `Log ${v} drink${v === 1 ? '' : 's'} in the hydration tab.`;
    case 'store_purchase':
    case 'gear_purchase':    return `Purchase ${v} item${v === 1 ? '' : 's'} from the store.`;
    case 'login_streak':     return `Open the app ${v} day${v === 1 ? '' : 's'} in a row.`;
    case 'quote_reader':     return `View the home screen daily quote ${v} day${v === 1 ? '' : 's'} in a row.`;
    case 'referral':         return `Refer ${v} friend${v === 1 ? '' : 's'} who sign up and join.`;
    case 'community_member': return `Join the Zenki community feed for the first time.`;
    case 'completionist':    return `Unlock ${v} other achievements.`;
    default:                 return 'Keep training!';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  diffStripe: { height: 4, width: '100%' },
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
  diffPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: 8,
    alignItems: 'center',
  },
  heroCircle: {
    width: 180, height: 180, borderRadius: 90,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4,
    marginTop: 12,
    marginBottom: 20,
  },
  lockedChip: {
    position: 'absolute',
    bottom: -14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  lockedChipText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 8,
  },

  progressBlock: {
    width: '100%',
    marginBottom: 20,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  progressValue: { fontSize: 13, fontWeight: '800' },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 4,
  },

  rewardsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 14,
  },
  rewardCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  rewardValue: { fontSize: 24, fontWeight: '900', marginTop: 6 },
  rewardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  rewardDivider: { width: 1, height: 40 },

  howCard: {
    width: '100%',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  howLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  howBody: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },

  unlockedAt: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 12,
  },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
