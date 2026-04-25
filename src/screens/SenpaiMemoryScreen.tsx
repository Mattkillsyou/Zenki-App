import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Alert,
  Animated,
  Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSenpai, MascotMood, MemoryEntry } from '../context/SenpaiContext';
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

function StatBadge({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={[statStyles.badge, { borderColor: color + '33' }]}>
      <Text style={[statStyles.icon, { color }]}>{icon}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={[statStyles.label, { color: color + 'AA' }]}>{label}</Text>
    </View>
  );
}

export function SenpaiMemoryScreen({ navigation }: any) {
  const { colors, theme } = useTheme();
  const { state, clearMemoryLog } = useSenpai();
  const isSenpaiTheme = theme.id === 'senpai';

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
    Alert.alert(
      'Clear all memories?',
      "Senpai will forget everything. This cannot be undone.",
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
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{'\u263D'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            No memories yet...
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Train with Senpai to create memories!
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatBadge label="Total" value={memories.length} icon="\u2661" color="#FF2E51" />
            <StatBadge label="Celebrating" value={countByMood('celebrating')} icon="\uD83C\uDF8A" color="#D260FF" />
            <StatBadge label="Impressed" value={countByMood('impressed')} icon="\u2726" color="#5158FF" />
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
