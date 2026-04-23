# Prompt 9: Settings UI Enhancement — Senpai Section

## Task
Enhance the existing Senpai settings section in SettingsScreen with ambient effects toggle, outfit picker placeholder, and Sailor Moon-themed styling.

## Context
Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. The Senpai settings already exist in `src/screens/SettingsScreen.tsx` at lines 592-720 inside the "SECRET LAB" section. Current controls: enable toggle (line 600-616), volume picker (line 622-653), sparkle intensity (line 656-687), memory log link (line 690-702), and tutorial reset (line 706-720).

SenpaiContext now has additional state from prompt 3: `ambientEffects`, `outfitId`, and their setters `setAmbientEffects()`, `setOutfit()`.

## File to Modify: `src/screens/SettingsScreen.tsx`

### 1. Add Ambient Effects Toggle
Insert after the Sparkle Intensity section (after line 687), before the Memory Log link:

```tsx
{/* Ambient effects */}
<View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
  <View style={styles.settingInfo}>
    <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Background Effects</Text>
    <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
      {senpaiState.ambientEffects ? 'Stars & moons drifting ☽' : 'Ambient effects off'}
    </Text>
  </View>
  <Switch
    value={senpaiState.ambientEffects}
    onValueChange={(val) => setSenpaiAmbientEffects(val)}
    trackColor={{ false: colors.surfaceSecondary, true: '#FF2E51' }}
    thumbColor={colors.background}
  />
</View>
```

Destructure `setAmbientEffects` from `useSenpai()`. It may be aliased — check existing destructuring at the top of the component (search for `useSenpai`). Add it there:
```typescript
const { state: senpaiState, ..., setAmbientEffects: setSenpaiAmbientEffects } = useSenpai();
```

### 2. Add Outfit Picker Placeholder
Insert after the Ambient Effects toggle:

```tsx
{/* Outfit picker — placeholder for future */}
<View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
  <View style={styles.settingInfo}>
    <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Senpai Outfit</Text>
    <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
      Default uniform · more coming soon
    </Text>
  </View>
  <View style={{
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  }}>
    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600' }}>1/1</Text>
  </View>
</View>
```

### 3. Add Clear Memory Button
Insert after the Memory Log link (after line 702):

```tsx
{/* Clear memory */}
<TouchableOpacity
  style={[styles.settingRow, { borderBottomColor: colors.border }]}
  onPress={() => {
    Alert.alert(
      'Clear Senpai Memory?',
      'All reaction history will be erased. Senpai will forget everything.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearSenpaiMemory() },
      ],
    );
  }}
  activeOpacity={0.7}
>
  <View style={styles.settingInfo}>
    <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>Clear Memory</Text>
    <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
      Erase all {senpaiState.memoryLog.length} memories
    </Text>
  </View>
  <Ionicons name="trash-outline" size={18} color={colors.error} />
</TouchableOpacity>
```

Destructure `clearMemoryLog` from `useSenpai()` (aliased as `clearSenpaiMemory`).

### 4. Style the Section with Senpai Colors
When Senpai Mode is enabled, tint the SECRET LAB section card:
- Change the section card `backgroundColor` to use a subtle pink tint: `senpaiState.enabled ? 'rgba(255, 46, 81, 0.04)' : colors.surface`
- Change the switch track color to `#FF2E51` (already done for the main toggle, verify the others match)
- The segmented controls already use `#FF69B4` — change to `#FF2E51` to match the canonical Sailor Moon pink

### 5. Update Section Header
Change the section header from `'SECRET LAB 🧪'` to show differently when Senpai is active:
```typescript
renderSectionHeader(senpaiState.enabled ? 'SENPAI HEADQUARTERS ☽' : 'SECRET LAB 🧪')
```

### 6. Disable Theme Picker When Senpai Active
Find the theme picker section in SettingsScreen (search for `ALL_THEMES` or theme selection buttons — it's likely in an "APPEARANCE" or "THEME" section above SECRET LAB). When `senpaiState.enabled` is true:
- Add a note below the section header: "Senpai Mode controls the theme. Disable Senpai to change."
- Either grey out the theme options (reduce opacity to 0.4) or wrap them in a conditional
- The user should not be able to select a different theme while Senpai is active

## Verification
- All new controls appear in the correct order within the Senpai section
- Ambient Effects toggle works — turning off hides background stars/moons
- Outfit picker shows placeholder with "1/1"
- Clear Memory shows confirmation alert, clears on confirm
- Section header changes to "SENPAI HEADQUARTERS ☽" when active
- Theme picker disabled when Senpai is on
- Switch/segment colors use `#FF2E51`
- `npx tsc --noEmit` passes
