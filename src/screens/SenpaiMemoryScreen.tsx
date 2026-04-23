import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useSenpai, MascotMood, MemoryEntry } from '../context/SenpaiContext';
import { typography, spacing } from '../theme';

const MOOD_EMOJI: Record<MascotMood, string> = {
  cheering: '\uD83C\uDF89',      // 🎉
  impressed: '\u2B50',           // ⭐
  encouraging: '\uD83D\uDCAA',   // 💪
  celebrating: '\uD83C\uDFC6',   // 🏆
  sleeping: '\uD83D\uDE34',      // 😴
  disappointed: '\uD83D\uDE22',  // 😢
  idle: '\uD83D\uDE0A',          // 😊
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

export function SenpaiMemoryScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { state, clearMemoryLog } = useSenpai();

  // Newest first
  const memories = React.useMemo(
    () => [...state.memoryLog].reverse(),
    [state.memoryLog],
  );

  const handleClear = () => {
    Alert.alert(
      'Clear all memories?',
      "Senpai will forget everything. This cannot be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => clearMemoryLog(),
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: MemoryEntry }) => (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={styles.moodEmoji}>{MOOD_EMOJI[item.mood] ?? '\u2728'}</Text>
      <View style={styles.rowContent}>
        <Text style={[styles.dialogue, { color: colors.textPrimary }]} numberOfLines={3}>
          {item.dialogue}
        </Text>
        <Text style={[styles.timestamp, { color: colors.textMuted }]}>
          {relativeTime(item.timestamp)}
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Senpai&apos;s Memory</Text>
        <View style={styles.backBtn} />
      </View>

      {memories.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>{'\uD83D\uDCAD'}</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
            Senpai has no memories yet...
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            *existential crisis*
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={memories}
            keyExtractor={(item, idx) => `${item.timestamp}-${idx}`}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: colors.surface, borderColor: colors.error }]}
            onPress={handleClear}
            activeOpacity={0.7}
          >
            <Ionicons name="trash-outline" size={16} color={colors.error} />
            <Text style={[styles.clearBtnText, { color: colors.error }]}>Clear All Memories</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

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
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
  moodEmoji: {
    fontSize: 26,
    lineHeight: 30,
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
