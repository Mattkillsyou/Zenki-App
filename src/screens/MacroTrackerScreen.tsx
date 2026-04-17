import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import { FoodSearchModal } from '../components/FoodSearchModal';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function pct(value: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.max(0, Math.min(1, value / goal));
}

interface BarProps {
  label: string;
  value: number;
  goal: number;
  color: string;
  unit?: string;
  bgColor: string;
  trackColor: string;
  textColor: string;
  mutedColor: string;
}

function MacroBar({ label, value, goal, color, unit = 'g', bgColor, trackColor, textColor, mutedColor }: BarProps) {
  const filled = pct(value, goal);
  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: textColor, fontSize: 13, fontWeight: '700', letterSpacing: 0.3 }}>{label}</Text>
        <Text style={{ color: mutedColor, fontSize: 12, fontWeight: '600' }}>
          <Text style={{ color: textColor, fontWeight: '800' }}>{Math.round(value)}</Text>
          {' / '}{Math.round(goal)}{unit}
        </Text>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: trackColor, overflow: 'hidden' }}>
        <View style={{
          width: `${filled * 100}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: 4,
        }} />
      </View>
    </View>
  );
}

export function MacroTrackerScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    macrosForDate,
    totalsForDate,
    addMacroEntry,
    removeMacroEntry,
    goalsFor,
    updateGoals,
    hasCompletedSetup,
    recentFoodsFor,
    rememberFood,
    runAdaptiveUpdate,
    effectiveTdee,
    profileFor,
  } = useNutrition();

  // Run adaptive expenditure update on mount (internally rate-limited to 7 days)
  useEffect(() => {
    if (user) runAdaptiveUpdate(user.id);
  }, [user, runAdaptiveUpdate]);

  const hasSetup = user ? hasCompletedSetup(user.id) : false;
  const recentFoods = user ? recentFoodsFor(user.id) : [];
  const [searchOpen, setSearchOpen] = useState(false);

  const today = todayISO();

  // Log-entry form
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  // Goals modal
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [goalCal, setGoalCal] = useState('');
  const [goalPro, setGoalPro] = useState('');
  const [goalCarb, setGoalCarb] = useState('');
  const [goalFat, setGoalFat] = useState('');

  const goals = user ? goalsFor(user.id) : null;
  const todayEntries = user ? macrosForDate(user.id, today) : [];
  const totals = user ? totalsForDate(user.id, today) : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  function openGoals() {
    if (!goals) return;
    setGoalCal(String(goals.calories));
    setGoalPro(String(goals.protein));
    setGoalCarb(String(goals.carbs));
    setGoalFat(String(goals.fat));
    setGoalsOpen(true);
  }

  function saveGoals() {
    if (!user) return;
    const cal = parseInt(goalCal, 10);
    const pro = parseInt(goalPro, 10);
    const carb = parseInt(goalCarb, 10);
    const ft = parseInt(goalFat, 10);
    if ([cal, pro, carb, ft].some((n) => !Number.isFinite(n) || n < 0)) {
      Alert.alert('Check goals', 'All goals must be positive numbers.');
      return;
    }
    updateGoals(user.id, { calories: cal, protein: pro, carbs: carb, fat: ft });
    setGoalsOpen(false);
  }

  function handleAdd() {
    if (!user) return;
    if (!name.trim()) {
      Alert.alert('Name this food', 'Give your entry a short label.');
      return;
    }
    const cal = parseInt(calories || '0', 10) || 0;
    const pro = parseInt(protein || '0', 10) || 0;
    const carb = parseInt(carbs || '0', 10) || 0;
    const ft = parseInt(fat || '0', 10) || 0;
    if (cal === 0 && pro === 0 && carb === 0 && ft === 0) {
      Alert.alert('Enter macros', 'Add at least one macro or calorie amount.');
      return;
    }
    addMacroEntry({
      memberId: user.id,
      date: today,
      name: name.trim(),
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: ft,
    });
    setName('');
    setCalories('');
    setProtein('');
    setCarbs('');
    setFat('');
  }

  function handleDelete(id: string) {
    Alert.alert('Delete entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeMacroEntry(id) },
    ]);
  }

  if (!goals) {
    return <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} />;
  }

  const calPct = pct(totals.calories, goals.calories);
  const caloriesRemaining = Math.max(0, goals.calories - totals.calories);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Macros</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('MacroSetup')}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Setup CTA — shown until user completes the BMR wizard */}
          {!hasSetup && (
            <FadeInView>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('MacroSetup')}
                style={[styles.setupBanner, { backgroundColor: colors.gold }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.setupBannerTitle}>Set personalized targets</Text>
                  <Text style={styles.setupBannerSub}>
                    Quick guided setup · BMR + macros in 30 seconds
                  </Text>
                </View>
                <Ionicons name="arrow-forward-circle" size={28} color="#000" />
              </TouchableOpacity>
            </FadeInView>
          )}

          {/* Calorie hero */}
          <FadeInView>
            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.heroLabel, { color: colors.textMuted }]}>TODAY · CALORIES</Text>
              <View style={styles.heroRow}>
                <Text style={[styles.heroNum, { color: colors.gold }]}>{Math.round(totals.calories)}</Text>
                <Text style={[styles.heroGoal, { color: colors.textSecondary }]}>
                  / {goals.calories}
                </Text>
              </View>
              <View style={[styles.heroTrack, { backgroundColor: colors.background }]}>
                <View style={{
                  width: `${Math.min(100, calPct * 100)}%`,
                  height: '100%',
                  backgroundColor: colors.gold,
                  borderRadius: 6,
                }} />
              </View>
              <Text style={[styles.heroSub, { color: colors.textMuted }]}>
                {totals.calories >= goals.calories
                  ? `${Math.round(totals.calories - goals.calories)} over goal`
                  : `${caloriesRemaining} remaining`}
              </Text>
            </View>
          </FadeInView>

          {/* Macro bars */}
          <FadeInView delay={60}>
            <View style={[styles.macrosCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <MacroBar
                label="Protein"
                value={totals.protein}
                goal={goals.protein}
                color="#FF6B6B"
                bgColor={colors.surface}
                trackColor={colors.background}
                textColor={colors.textPrimary}
                mutedColor={colors.textMuted}
              />
              <MacroBar
                label="Carbs"
                value={totals.carbs}
                goal={goals.carbs}
                color="#4ECDC4"
                bgColor={colors.surface}
                trackColor={colors.background}
                textColor={colors.textPrimary}
                mutedColor={colors.textMuted}
              />
              <MacroBar
                label="Fat"
                value={totals.fat}
                goal={goals.fat}
                color="#FFD166"
                bgColor={colors.surface}
                trackColor={colors.background}
                textColor={colors.textPrimary}
                mutedColor={colors.textMuted}
              />
            </View>
          </FadeInView>

          {/* Expenditure card — adaptive TDEE */}
          {hasSetup && user && (() => {
            const profile = profileFor(user.id);
            const currentTdee = effectiveTdee(user.id);
            const isAdapted = !!profile?.adaptedTdee;
            return (
              <FadeInView delay={80}>
                <View style={[styles.tdeeCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tdeeLabel, { color: colors.textMuted }]}>EXPENDITURE (TDEE)</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={[styles.tdeeVal, { color: colors.textPrimary }]}>{currentTdee}</Text>
                      <Text style={[styles.tdeeUnit, { color: colors.textSecondary }]}>kcal/day</Text>
                    </View>
                    <Text style={[styles.tdeeSub, { color: colors.textMuted }]}>
                      {isAdapted ? 'Adapted from your data · updates weekly' : 'Estimated · adapts once you have ~10 days of logs'}
                    </Text>
                  </View>
                  <View style={[styles.tdeeBadge, { backgroundColor: isAdapted ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons
                      name={isAdapted ? 'pulse' : 'calculator-outline'}
                      size={16}
                      color={isAdapted ? '#4CAF50' : colors.textMuted}
                    />
                  </View>
                </View>
              </FadeInView>
            );
          })()}

          {/* Search + scan CTAs */}
          <FadeInView delay={100}>
            <View style={styles.ctaRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSearchOpen(true)}
                style={[styles.searchCta, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="search" size={22} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.searchCtaTitle, { color: colors.textPrimary }]}>Search</Text>
                  <Text style={[styles.searchCtaSub, { color: colors.textMuted }]}>
                    USDA + OFF
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('BarcodeScanner')}
                style={[styles.searchCta, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="barcode-outline" size={22} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.searchCtaTitle, { color: colors.textPrimary }]}>Scan</Text>
                  <Text style={[styles.searchCtaSub, { color: colors.textMuted }]}>
                    Barcode
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => navigation.navigate('PhotoFood')}
                style={[styles.searchCta, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <Ionicons name="sparkles-outline" size={22} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.searchCtaTitle, { color: colors.textPrimary }]}>Photo</Text>
                  <Text style={[styles.searchCtaSub, { color: colors.textMuted }]}>
                    AI recognize
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </FadeInView>

          {/* Add-entry form */}
          <FadeInView delay={120}>
            <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>LOG FOOD</Text>

              <TextInput
                style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                placeholder="What did you eat?"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
              />

              <View style={[styles.gridRow, { marginTop: spacing.sm }]}>
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textMuted }]}>CAL</Text>
                  <TextInput
                    style={[styles.inputSmall, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={calories}
                    onChangeText={setCalories}
                  />
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textMuted }]}>PROTEIN</Text>
                  <TextInput
                    style={[styles.inputSmall, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={protein}
                    onChangeText={setProtein}
                  />
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textMuted }]}>CARBS</Text>
                  <TextInput
                    style={[styles.inputSmall, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={carbs}
                    onChangeText={setCarbs}
                  />
                </View>
                <View style={styles.gridCell}>
                  <Text style={[styles.cellLabel, { color: colors.textMuted }]}>FAT</Text>
                  <TextInput
                    style={[styles.inputSmall, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={fat}
                    onChangeText={setFat}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={handleAdd}
                activeOpacity={0.85}
                style={[styles.saveBtn, { backgroundColor: colors.gold }]}
              >
                <Ionicons name="add-circle" size={18} color="#000" />
                <Text style={styles.saveBtnText}>Add entry</Text>
              </TouchableOpacity>
            </View>
          </FadeInView>

          {/* Today's entries */}
          <FadeInView delay={180}>
            <Text style={[styles.sectionLabel, styles.historyLabel, { color: colors.textMuted }]}>TODAY</Text>

            {todayEntries.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Ionicons name="restaurant-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No entries yet today. Log your first meal above.</Text>
              </View>
            ) : (
              todayEntries.map((m) => (
                <View key={m.id} style={[styles.entryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.entryName, { color: colors.textPrimary }]}>{m.name}</Text>
                    <Text style={[styles.entryMacros, { color: colors.textSecondary }]}>
                      {m.calories} cal · {m.protein}p · {m.carbs}c · {m.fat}f
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleDelete(m.id)} hitSlop={10} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Food search modal */}
      <FoodSearchModal
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        recentFoods={recentFoods}
        onSelect={(food, scaledMacros) => {
          if (!user) return;
          addMacroEntry({
            memberId: user.id,
            date: today,
            name: food.brand ? `${food.brand} · ${food.name}` : food.name,
            calories: scaledMacros.calories,
            protein: scaledMacros.protein,
            carbs: scaledMacros.carbs,
            fat: scaledMacros.fat,
          });
          rememberFood(user.id, food);
        }}
      />

      {/* Goals modal */}
      <Modal
        visible={goalsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setGoalsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalsOpen(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => {}}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Daily goals</Text>

            <View style={styles.goalRow}>
              <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>Calories</Text>
              <TextInput
                style={[styles.goalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                keyboardType="number-pad"
                value={goalCal}
                onChangeText={setGoalCal}
              />
            </View>
            <View style={styles.goalRow}>
              <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>Protein (g)</Text>
              <TextInput
                style={[styles.goalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                keyboardType="number-pad"
                value={goalPro}
                onChangeText={setGoalPro}
              />
            </View>
            <View style={styles.goalRow}>
              <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>Carbs (g)</Text>
              <TextInput
                style={[styles.goalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                keyboardType="number-pad"
                value={goalCarb}
                onChangeText={setGoalCarb}
              />
            </View>
            <View style={styles.goalRow}>
              <Text style={[styles.goalLabel, { color: colors.textSecondary }]}>Fat (g)</Text>
              <TextInput
                style={[styles.goalInput, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: colors.border }]}
                keyboardType="number-pad"
                value={goalFat}
                onChangeText={setGoalFat}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <TouchableOpacity
                onPress={() => setGoalsOpen(false)}
                style={[styles.modalBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
              >
                <Text style={[styles.modalBtnText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveGoals}
                style={[styles.modalBtn, { backgroundColor: colors.gold, borderColor: colors.gold }]}
              >
                <Text style={[styles.modalBtnText, { color: '#000' }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingVertical: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  tdeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  tdeeLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 2 },
  tdeeVal: { fontSize: 28, fontWeight: '900', letterSpacing: -0.6 },
  tdeeUnit: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  tdeeSub: { fontSize: 11, fontWeight: '600', marginTop: 4, letterSpacing: 0.1 },
  tdeeBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },

  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  searchCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchCtaTitle: { fontSize: 15, fontWeight: '800' },
  searchCtaSub: { fontSize: 11, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },

  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  setupBannerTitle: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.2 },
  setupBannerSub: { color: '#000', opacity: 0.75, fontSize: 12, fontWeight: '600', marginTop: 2 },

  hero: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  heroLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', marginBottom: 4 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: { fontSize: 44, fontWeight: '900' },
  heroGoal: { fontSize: 16, fontWeight: '700' },
  heroTrack: { height: 12, borderRadius: 6, marginTop: spacing.sm, overflow: 'hidden' },
  heroSub: { fontSize: 12, fontWeight: '600', marginTop: 6, letterSpacing: 0.3 },

  macrosCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },

  form: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  input: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    fontSize: 15,
  },
  gridRow: { flexDirection: 'row', gap: spacing.sm },
  gridCell: { flex: 1 },
  cellLabel: { fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  inputSmall: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  saveBtnText: { color: '#000', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },

  historyLabel: { marginLeft: spacing.lg, marginTop: spacing.lg },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  entryName: { fontSize: 15, fontWeight: '700' },
  entryMacros: { fontSize: 12, fontWeight: '600', marginTop: 2, letterSpacing: 0.2 },
  deleteBtn: { padding: 6 },

  empty: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  emptyText: { fontSize: 13, textAlign: 'center' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  goalLabel: { fontSize: 14, fontWeight: '600' },
  goalInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    width: 100,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 14, fontWeight: '800' },
});
