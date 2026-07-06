import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ScrollView,
  Alert,
  Animated,
  Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSenpai, MascotMood, MemoryEntry } from '../context/SenpaiContext';
import {
  daysSinceMet,
  deriveBondTier,
  formatBondDate,
  type BondMilestoneType,
  type SenpaiBond,
} from '../services/senpaiBond';
import { typography, spacing } from '../theme';

const MOOD_EMOJI: Record<MascotMood, string> = {
  cheering: '\uD83C\uDF89',      // 🎉
  impressed: '\u2726',           // ✦ sparkle glint
  encouraging: '\uD83D\uDCAA',   // 💪
  celebrating: '\uD83C\uDF8A',   // 🎊
  sleeping: '\u263D',            // ☽ crescent
  disappointed: '\uD83D\uDE22',  // 😢
  idle: '\u2605',                // ★ star
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} min ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h} hr${h === 1 ? '' : 's'} ago`;
  }
  if (diff < 172_800_000) return 'yesterday';
  const d = Math.floor(diff / 86_400_000);
  if (d < 7) return `${d} days ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} wk${w === 1 ? '' : 's'} ago`;
  const mo = Math.floor(d / 30);
  return `${mo} mo${mo === 1 ? '' : 's'} ago`;
}

function formatDateShort(dayKey: string): string {
  const d = new Date(dayKey);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface DaySection {
  title: string;
  data: MemoryEntry[];
}

// H2: milestone emoji by type for the "Our Story" trophy list.
const MILESTONE_EMOJI: Record<BondMilestoneType, string> = {
  first_met: '💘',     // 💘
  first_workout: '🥋', // 🥋
  first_pr: '🥇',      // 🥇
  best_streak: '🔥',   // 🔥
  anniversary: '🎂',   // 🎂
  bond_level: '⬆️',    // ⬆️
  comeback: '🌅',      // 🌅
  level: '✨',               // ✨
};

function StatBadge({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={[statStyles.badge, { borderColor: color + '33' }]}>
      <Text style={[statStyles.icon, { color }]}>{icon}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={[statStyles.label, { color: color + 'AA' }]}>{label}</Text>
    </View>
  );
}

/**
 * H2/H3 — "Our Story": the relationship's trophy case. Day counter, bond
 * tier + progress, the newest milestones, the facts she knows (each
 * removable), and a quiet "Reset our story" at the foot. Rendered above the
 * diary; hidden entirely when no bond exists (Senpai never initialized).
 */
function OurStoryCard({
  bond,
  colors,
  cardBg,
  cardBorder,
  onRemoveFact,
  onReset,
}: {
  bond: SenpaiBond;
  colors: any;
  cardBg: string;
  cardBorder: string;
  onRemoveFact: (id: string) => void;
  onReset: () => void;
}) {
  const tier = deriveBondTier(bond);
  const dayNumber = daysSinceMet(bond) + 1;
  const milestones = [...bond.milestones].slice(-5).reverse(); // newest 5, newest first
  const accent = '#FF2E51';

  const confirmForget = (id: string, text: string) => {
    Alert.alert('Forget this?', `"${text}"\n\nShe'll forget this forever.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => onRemoveFact(id) },
    ]);
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset our story?',
      'The day you met, milestones, and everything she knows about you — gone. The diary below is untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert('Really start over?', 'Day 1, stranger. This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Reset', style: 'destructive', onPress: onReset },
            ]),
        },
      ],
    );
  };

  return (
    <View style={[storyStyles.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
      <Text style={[storyStyles.kicker, { color: accent }]}>OUR STORY</Text>
      <Text style={[storyStyles.dayCount, { color: colors.textPrimary }]}>
        Day {dayNumber} together
      </Text>
      <Text style={[storyStyles.subtitle, { color: colors.textMuted }]}>
        met {formatBondDate(bond.firstEnabledAt)} · showed up {bond.activeDays}{' '}
        {bond.activeDays === 1 ? 'day' : 'days'}
      </Text>

      {/* Tier chip + progress toward the next tier (hidden at max). */}
      <View style={storyStyles.tierRow}>
        <View style={[storyStyles.tierChip, { borderColor: accent + '55', backgroundColor: accent + '14' }]}>
          <Text style={[storyStyles.tierChipText, { color: accent }]}>
            Bond Lv.{tier.tier} — {tier.name}
          </Text>
        </View>
      </View>
      {tier.tier < 5 ? (
        <View style={[storyStyles.progressTrack, { backgroundColor: colors.border }]}>
          <View
            style={[
              storyStyles.progressFill,
              { backgroundColor: accent, width: `${Math.round(tier.progress * 100)}%` },
            ]}
          />
        </View>
      ) : (
        <Text style={[storyStyles.maxTier, { color: colors.textMuted }]}>max. obviously 💕</Text>
      )}

      {/* Milestones — newest 5. */}
      {milestones.length > 0 && (
        <View style={storyStyles.section}>
          <Text style={[storyStyles.sectionLabel, { color: colors.textMuted }]}>MILESTONES</Text>
          {milestones.map((m) => (
            <View key={m.id} style={storyStyles.milestoneRow}>
              <Text style={storyStyles.milestoneEmoji}>{MILESTONE_EMOJI[m.type] ?? '✨'}</Text>
              <Text style={[storyStyles.milestoneLabel, { color: colors.textPrimary }]} numberOfLines={1}>
                {m.label}
              </Text>
              <Text style={[storyStyles.milestoneDate, { color: colors.textMuted }]}>
                {formatBondDate(m.date)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Facts — what she knows about you, each forgettable. */}
      <View style={storyStyles.section}>
        <Text style={[storyStyles.sectionLabel, { color: colors.textMuted }]}>
          WHAT I KNOW ABOUT YOU
        </Text>
        {bond.facts.length === 0 ? (
          <Text style={[storyStyles.emptyFacts, { color: colors.textMuted }]}>
            nothing yet — tell her something worth remembering 💕
          </Text>
        ) : (
          bond.facts.map((f) => (
            <View key={f.id} style={storyStyles.factRow}>
              <Text style={[storyStyles.factText, { color: colors.textPrimary }]}>{f.text}</Text>
              <SoundPressable
                onPress={() => confirmForget(f.id, f.text)}
                style={storyStyles.factRemove}
                accessibilityRole="button"
                accessibilityLabel={`Forget "${f.text}"`}
              >
                <Ionicons name="close" size={16} color={colors.textMuted} />
              </SoundPressable>
            </View>
          ))
        )}
      </View>

      <SoundPressable onPress={confirmReset} style={storyStyles.resetRow} accessibilityRole="button">
        <Text style={[storyStyles.resetText, { color: colors.textMuted }]}>Reset our story</Text>
      </SoundPressable>
    </View>
  );
}

export function SenpaiMemoryScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const { state, clearMemoryLog, removeBondFact, resetBond } = useSenpai();
  const isSenpaiTheme = theme.id === 'senpai';
  const bond = state.bond;

  const memories = useMemo(
    () => [...state.memoryLog].reverse(),
    [state.memoryLog],
  );

  const sections = useMemo<DaySection[]>(() => {
    const groups: Record<string, MemoryEntry[]> = {};
    for (const entry of memories) {
      const dayKey = new Date(entry.timestamp).toDateString();
      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(entry);
    }
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    return Object.entries(groups).map(([dayKey, data]) => ({
      title: dayKey === today ? 'Today' : dayKey === yesterday ? 'Yesterday' : formatDateShort(dayKey),
      data,
    }));
  }, [memories]);

  const countByMood = (m: MascotMood) => memories.filter((e) => e.mood === m).length;

  const handleClear = () => {
    // Honest scope (H2): this only ever cleared the reaction diary — now
    // that a real memory (the bond) exists, the old "forget everything"
    // copy would be a lie in the other direction.
    Alert.alert(
      'Clear all memories?',
      "Clears Senpai's diary of reactions. Your story and her facts about you are kept.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearMemoryLog() },
      ],
    );
  };

  const cardBg = isSenpaiTheme ? 'rgba(40, 30, 120, 0.30)' : colors.surface;
  const cardBorder = isSenpaiTheme ? 'rgba(255, 46, 81, 0.15)' : colors.border;
  const emojiBg = isSenpaiTheme ? 'rgba(255, 46, 81, 0.08)' : 'transparent';

  const renderItem = ({ item, index }: { item: MemoryEntry; index: number }) => (
    <AnimatedRow index={index}>
      <View style={[styles.row, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <View style={[styles.moodWrap, { backgroundColor: emojiBg }]}>
          <Text style={styles.moodEmoji}>{MOOD_EMOJI[item.mood] ?? '\u2728'}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text
            style={[
              styles.dialogue,
              { color: colors.textPrimary },
              isSenpaiTheme && Platform.OS === 'web' && colors.textGlow
                ? ({ /* @ts-ignore web-only */ textShadow: colors.textGlowSubtle } as any)
                : null,
            ]}
            numberOfLines={3}
          >
            {item.dialogue}
          </Text>
          <Text style={[styles.timestamp, { color: colors.textMuted }]}>
            {relativeTime(item.timestamp)}
          </Text>
        </View>
      </View>
    </AnimatedRow>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <SoundPressable
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </SoundPressable>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          {isSenpaiTheme ? "Senpai's Diary \u263D" : "Senpai's Memory"}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {memories.length === 0 ? (
        // Null-bond renders exactly as before; with a bond the Our Story
        // card still shows above the empty diary state.
        bond ? (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          >
            <OurStoryCard
              bond={bond}
              colors={colors}
              cardBg={cardBg}
              cardBorder={cardBorder}
              onRemoveFact={removeBondFact}
              onReset={resetBond}
            />
            <View style={styles.emptyInline}>
              <Text style={styles.emptyEmoji}>{'\u263D'}</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                No memories yet...
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                Train with Senpai to create memories!
              </Text>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{'\u263D'}</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No memories yet...
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
              Train with Senpai to create memories!
            </Text>
          </View>
        )
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatBadge label="Total" value={memories.length} icon={'\u2661'} color="#FF2E51" />
            <StatBadge label="Celebrating" value={countByMood('celebrating')} icon={'\uD83C\uDF8A'} color="#D260FF" />
            <StatBadge label="Impressed" value={countByMood('impressed')} icon={'\u2726'} color="#5158FF" />
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(item, idx) => `${item.timestamp}-${idx}`}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
                  {section.title}
                </Text>
              </View>
            )}
            ListHeaderComponent={
              bond ? (
                <OurStoryCard
                  bond={bond}
                  colors={colors}
                  cardBg={cardBg}
                  cardBorder={cardBorder}
                  onRemoveFact={removeBondFact}
                  onReset={resetBond}
                />
              ) : undefined
            }
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />
          <SoundPressable
            style={[styles.clearBtn, { backgroundColor: colors.surface, borderColor: colors.error }]}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={[styles.clearBtnText, { color: colors.error }]}>Clear All Memories</Text>
          </SoundPressable>
        </>
      )}
    </SafeAreaView>
  );
}

function AnimatedRow({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    const delay = index < 10 ? index * 30 : 0;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, delay, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

const statStyles = StyleSheet.create({
  badge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  icon: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  value: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: 0.3, textTransform: 'uppercase' },
});

// H2: "Our Story" card — same card treatment as the diary rows.
const storyStyles = StyleSheet.create({
  card: {
    padding: 16,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  dayCount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  subtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  tierRow: { flexDirection: 'row', marginTop: 12 },
  tierChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  tierChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 2 },
  maxTier: { fontSize: 11, fontWeight: '600', fontStyle: 'italic', marginTop: 8 },
  section: { marginTop: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  milestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  milestoneEmoji: { fontSize: 14, width: 22, textAlign: 'center' },
  milestoneLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  milestoneDate: { fontSize: 11, fontWeight: '500' },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  factText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  factRemove: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFacts: { fontSize: 12, fontWeight: '500', fontStyle: 'italic' },
  resetRow: { marginTop: 14, alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  resetText: { fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.heading,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: 4,
    paddingBottom: spacing.sm,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  moodWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  rowContent: {
    flex: 1,
  },
  dialogue: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  timestamp: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  // Empty-diary state when the Our Story card is above it (inside a
  // ScrollView, so no flex:1 centering).
  emptyInline: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: spacing.md,
    color: '#FFB3DF',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
