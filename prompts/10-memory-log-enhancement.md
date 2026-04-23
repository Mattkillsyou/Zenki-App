# Prompt 10: Memory Log Screen Enhancement

## Task
Enhance the existing SenpaiMemoryScreen with Sailor Moon-themed styling, day grouping, and animated mood indicators.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. The screen already exists at `src/screens/SenpaiMemoryScreen.tsx` (~224 lines). It's a functional FlatList-based screen showing `MemoryEntry` items (mood emoji, dialogue text, relative timestamp). Already registered in RootNavigator at line 344 as `'SenpaiMemory'`. Already linked from Settings at line 692.

Current features: reverse-chronological list, clear all button with confirmation, empty state, mood emoji mapping, relative time formatting.

## File to Modify: `src/screens/SenpaiMemoryScreen.tsx`

### 1. Group By Day
Instead of a flat list, group entries by day. Use `SectionList` instead of `FlatList`:

```typescript
interface DaySection {
  title: string;  // "Today", "Yesterday", "April 20", etc.
  data: MemoryEntry[];
}
```

Create a `useMemo` that groups `memories` by calendar day:
```typescript
const sections = useMemo(() => {
  const groups: Record<string, MemoryEntry[]> = {};
  for (const entry of memories) {
    const dayKey = new Date(entry.timestamp).toDateString();
    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(entry);
  }
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  return Object.entries(groups).map(([dayKey, data]) => ({
    title: dayKey === today ? 'Today' : dayKey === yesterday ? 'Yesterday' : formatDate(dayKey),
    data,
  }));
}, [memories]);
```

Add a `formatDate` helper that returns short date like "Apr 20" or "Mar 15".

Render section headers with the day title:
```typescript
renderSectionHeader={({ section }) => (
  <View style={styles.sectionHeader}>
    <Text style={[styles.sectionHeaderText, { color: colors.textMuted }]}>
      {section.title}
    </Text>
  </View>
)}
```

### 2. Senpai-Themed Card Styling
When the senpai theme is active (check `useTheme().theme.id === 'senpai'`), apply enhanced card styles:

- Card background: `rgba(40, 30, 120, 0.3)` (translucent blue-violet)
- Border: `rgba(255, 46, 81, 0.15)` (pink tint)
- Mood emoji container: add a faint circular background behind the emoji (`rgba(255, 46, 81, 0.08)`, 36px circle)
- Dialogue text: if theme has textGlow, apply it (web only — use Platform.OS check)

For non-senpai themes, keep the current neutral styling.

### 3. Animated Entry Appearance
When the list renders, each row should fade in with a slight slide-up:
- Use `Animated.FlatList` or wrap each `renderItem` in an `Animated.View`
- On mount: opacity 0→1, translateY 10→0 over 200ms
- Stagger: each item delays 30ms more than the previous (cap at 10 items, then instant)

### 4. Enhanced Empty State
Update the empty state to be more thematic:
```tsx
<View style={styles.empty}>
  <Text style={styles.emptyEmoji}>☽</Text>
  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
    No memories yet...
  </Text>
  <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
    Train with Senpai to create memories!
  </Text>
</View>
```

### 5. Stats Header
Add a small stats row at the top of the list (above the first section):
```tsx
<View style={styles.statsRow}>
  <StatBadge label="Total" value={memories.length} icon="♡" />
  <StatBadge label="Celebrating" value={countByMood('celebrating')} icon="🎊" />
  <StatBadge label="Impressed" value={countByMood('impressed')} icon="⭐" />
</View>
```

`countByMood` counts entries matching a specific mood. Render these as small pill-shaped badges.

### 6. Update Mood Emoji Map
Expand with the Sailor Moon motif:
```typescript
const MOOD_EMOJI: Record<MascotMood, string> = {
  cheering: '🎉',
  impressed: '✦',     // sparkle glint
  encouraging: '💪',
  celebrating: '🎊',
  sleeping: '☽',      // crescent moon for sleeping
  disappointed: '😢',
  idle: '★',          // star for idle
};
```

### 7. Header Enhancement
When senpai theme is active, update the title:
```typescript
<Text style={[styles.title, { color: colors.textPrimary }]}>
  {isSenpaiTheme ? "Senpai's Diary ☽" : "Senpai's Memory"}
</Text>
```

## Verification
- Entries grouped by day with section headers (Today, Yesterday, dates)
- Cards use senpai-themed styling when senpai theme active
- Entries animate in with fade+slide on first render
- Empty state shows crescent moon and thematic text
- Stats row shows total count and mood breakdown
- Clear button still works with confirmation
- SectionList scrolls smoothly with 100 entries
- `npx tsc --noEmit` passes
