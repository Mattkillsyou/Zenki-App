import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { Achievement, difficultyColor, getCurrentValue, getAchievementProgress } from '../types/gamification';
import { useGamification } from '../context/GamificationContext';
import { typography, spacing } from '../theme';

const COLS = 5;
const GAP = 10;

interface AchievementBadgeProps {
  achievement: Achievement;
  size?: number;      // circle diameter
  onPress?: () => void;
}

export function AchievementBadge({ achievement, size = 56, onPress }: AchievementBadgeProps) {
  const { colors } = useTheme();
  const iconSize = Math.round(size * 0.46);
  const diff = difficultyColor(achievement.difficulty);

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ alignItems: 'center' }}>
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: achievement.unlocked ? colors.goldMuted : colors.surfaceSecondary,
            borderColor: achievement.unlocked ? diff : 'transparent',
            borderWidth: achievement.unlocked ? 2 : 0,
          },
        ]}
      >
        <Ionicons
          name={achievement.icon as any}
          size={iconSize}
          color={achievement.unlocked ? colors.gold : colors.textMuted}
          style={achievement.unlocked ? undefined : { opacity: 0.35 }}
        />
        {achievement.unlocked && (
          <View style={[styles.flameChip, { backgroundColor: diff }]}>
            <Text style={styles.flameChipText}>{achievement.flameReward}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

interface AchievementGridProps {
  achievements: Achievement[];
  maxShow?: number;
}

export function AchievementGrid({ achievements, maxShow }: AchievementGridProps) {
  const { colors } = useTheme();
  const { state } = useGamification();
  const [selected, setSelected] = useState<Achievement | null>(null);

  const sorted = [...achievements].sort((a, b) => {
    if (a.unlocked && !b.unlocked) return -1;
    if (!a.unlocked && b.unlocked) return 1;
    return a.requirement.value - b.requirement.value;
  });
  const displayed = maxShow ? sorted.slice(0, maxShow) : sorted;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Achievements</Text>
        <View style={styles.counterWrap}>
          <Ionicons name="flame" size={14} color={colors.gold} />
          <Text style={[styles.counter, { color: colors.gold }]}>
            {' '}{state.flames || 0}
          </Text>
          <Text style={[styles.counterDot, { color: colors.textMuted }]}>  ·  </Text>
          <Text style={[styles.counter, { color: colors.gold }]}>
            {unlockedCount}/{achievements.length}
          </Text>
        </View>
      </View>
      <View style={styles.grid}>
        {displayed.map((a) => (
          <View key={a.id} style={styles.gridCell}>
            <AchievementBadge achievement={a} onPress={() => setSelected(a)} />
          </View>
        ))}
      </View>

      <AchievementDetailModal
        achievement={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

interface DetailProps {
  achievement: Achievement | null;
  onClose: () => void;
}

function AchievementDetailModal({ achievement, onClose }: DetailProps) {
  const { colors } = useTheme();
  const { state } = useGamification();
  if (!achievement) return null;

  const current  = getCurrentValue(achievement.requirement.type, state);
  const target   = achievement.requirement.value;
  const progress = getAchievementProgress(achievement, state);
  const diffCol  = difficultyColor(achievement.difficulty);
  const howTo    = howToEarn(achievement);

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.modalCard, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}
        >
          <View style={[styles.diffBar, { backgroundColor: diffCol }]} />

          <View style={styles.modalHero}>
            <View
              style={[
                styles.modalCircle,
                {
                  backgroundColor: achievement.unlocked ? colors.goldMuted : colors.surfaceSecondary,
                  borderColor: achievement.unlocked ? diffCol : colors.border,
                },
              ]}
            >
              <Ionicons
                name={achievement.icon as any}
                size={46}
                color={achievement.unlocked ? colors.gold : colors.textMuted}
                style={achievement.unlocked ? undefined : { opacity: 0.35 }}
              />
            </View>
          </View>

          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
            {achievement.title}
          </Text>
          <Text style={[styles.modalDesc, { color: colors.textSecondary }]}>
            {achievement.description}
          </Text>

          <View style={[styles.diffPill, { backgroundColor: diffCol + '22', borderColor: diffCol }]}>
            <Text style={[styles.diffText, { color: diffCol }]}>
              {achievement.difficulty.toUpperCase()}
            </Text>
          </View>

          {/* Progress */}
          <View style={styles.progressBlock}>
            <View style={styles.progressLabels}>
              <Text style={[styles.progressLabel, { color: colors.textMuted }]}>Progress</Text>
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
                    backgroundColor: achievement.unlocked ? colors.gold : diffCol,
                  },
                ]}
              />
            </View>
          </View>

          {/* Rewards */}
          <View style={[styles.rewardsRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
            <View style={styles.rewardCell}>
              <Ionicons name="flame" size={18} color="#FF6B35" />
              <Text style={[styles.rewardValue, { color: colors.textPrimary }]}>
                +{achievement.flameReward}
              </Text>
              <Text style={[styles.rewardLabel, { color: colors.textMuted }]}>flames</Text>
            </View>
            <View style={[styles.rewardDivider, { backgroundColor: colors.border }]} />
            <View style={styles.rewardCell}>
              <Ionicons name="sparkles" size={18} color={colors.gold} />
              <Text style={[styles.rewardValue, { color: colors.textPrimary }]}>
                +{achievement.xpReward}
              </Text>
              <Text style={[styles.rewardLabel, { color: colors.textMuted }]}>XP</Text>
            </View>
          </View>

          {/* How to earn */}
          <View style={styles.howToBlock}>
            <Text style={[styles.howToLabel, { color: colors.textMuted }]}>HOW TO EARN</Text>
            <Text style={[styles.howToText, { color: colors.textPrimary }]}>{howTo}</Text>
          </View>

          {achievement.unlocked && achievement.unlockedAt && (
            <Text style={[styles.unlockedAt, { color: colors.textMuted }]}>
              Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
            </Text>
          )}

          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.gold }]}
            onPress={onClose}
          >
            <Text style={styles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameChip: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flameChipText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.cardTitle,
    fontSize: 17,
  },
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counter: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
  },
  counterDot: {
    fontSize: 13,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridCell: {
    width: `${100 / COLS}%`,
    alignItems: 'center',
    marginBottom: GAP,
  },

  // ─── Detail Modal ───
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: 'hidden',
    padding: 24,
    paddingTop: 20,
    alignItems: 'center',
  },
  diffBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  modalHero: {
    marginTop: 8,
    marginBottom: 16,
  },
  modalCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  modalDesc: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  diffPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  diffText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  progressBlock: {
    width: '100%',
    marginBottom: 18,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  rewardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    gap: 0,
  },
  rewardCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  rewardValue: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  rewardLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rewardDivider: {
    width: 1,
    height: 36,
  },
  howToBlock: {
    width: '100%',
    marginTop: 16,
    marginBottom: 8,
  },
  howToLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  howToText: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  unlockedAt: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
  },
  closeBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 36,
    borderRadius: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
