import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform} from 'react-native';
import { SoundPressable } from '../components/SoundPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useNutrition } from '../context/NutritionContext';
import { spacing, borderRadius } from '../theme';
import { FadeInView } from '../components';
import {
  Sex,
  ActivityLevel,
  ACTIVITY_LABELS,
  ACTIVITY_DESCRIPTIONS,
  Goal,
  GOAL_LABELS,
  GOAL_ADJUSTMENT,
  calculateBMR,
  calculateTDEE,
  calculateMacros,
  lbsToKg,
  feetInchesToCm,
  cmToInches,
} from '../utils/nutrition';

type Step = 'sex' | 'age' | 'height' | 'weight' | 'activity' | 'goal' | 'review';
const STEPS: Step[] = ['sex', 'age', 'height', 'weight', 'activity', 'goal', 'review'];

type HeightUnit = 'imperial' | 'metric';
type WeightUnit = 'lb' | 'kg';

export function MacroSetupScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { profileFor, saveProfile, addWeight, latestWeight } = useNutrition();

  const existing = user ? profileFor(user.id) : null;
  const latest = user ? latestWeight(user.id) : null;

  // ── Wizard state ──
  const [stepIdx, setStepIdx] = useState(0);
  const step = STEPS[stepIdx];

  const [sex, setSex] = useState<Sex>(existing?.sex ?? 'male');
  const [age, setAge] = useState<string>(existing?.ageYears ? String(existing.ageYears) : '');

  const [heightUnit, setHeightUnit] = useState<HeightUnit>('imperial');
  const initialFeet = existing ? Math.floor(cmToInches(existing.heightCm) / 12) : 5;
  const initialInches = existing ? Math.round(cmToInches(existing.heightCm) % 12) : 9;
  const [heightFt, setHeightFt] = useState(String(initialFeet));
  const [heightIn, setHeightIn] = useState(String(initialInches));
  const [heightCmInput, setHeightCmInput] = useState(existing ? String(Math.round(existing.heightCm)) : '');

  const [weightUnit, setWeightUnit] = useState<WeightUnit>(latest?.unit ?? 'lb');
  const [weight, setWeight] = useState<string>(latest ? String(latest.weight) : '');

  const [activity, setActivity] = useState<ActivityLevel>(existing?.activity ?? 'moderate');
  const [goal, setGoal] = useState<Goal>(existing?.goal ?? 'maintain');

  // ── Derived values for the review step ──
  const heightCm = useMemo(() => {
    if (heightUnit === 'metric') {
      const cm = parseFloat(heightCmInput);
      return Number.isFinite(cm) ? cm : 0;
    }
    const ft = parseInt(heightFt, 10) || 0;
    const inches = parseInt(heightIn, 10) || 0;
    return feetInchesToCm(ft, inches);
  }, [heightUnit, heightCmInput, heightFt, heightIn]);

  const weightKg = useMemo(() => {
    const w = parseFloat(weight);
    if (!Number.isFinite(w)) return 0;
    return weightUnit === 'kg' ? w : lbsToKg(w);
  }, [weight, weightUnit]);

  const ageNum = parseInt(age, 10);

  const computed = useMemo(() => {
    if (!Number.isFinite(ageNum) || ageNum <= 0 || heightCm <= 0 || weightKg <= 0) return null;
    const bmr = calculateBMR({ sex, weightKg, heightCm, ageYears: ageNum });
    const tdee = calculateTDEE(bmr, activity);
    const macros = calculateMacros({ tdee, goal, weightKg });
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), macros };
  }, [sex, ageNum, heightCm, weightKg, activity, goal]);

  // ── Navigation ──
  function next() {
    // Validate per-step
    if (step === 'age') {
      const a = parseInt(age, 10);
      if (!Number.isFinite(a) || a < 13 || a > 100) {
        Alert.alert('Enter your age', 'Please enter an age between 13 and 100.');
        return;
      }
    }
    if (step === 'height') {
      if (heightCm < 120 || heightCm > 230) {
        Alert.alert('Check your height', 'That height looks off. Please double-check.');
        return;
      }
    }
    if (step === 'weight') {
      if (weightKg < 30 || weightKg > 300) {
        Alert.alert('Check your weight', 'That weight looks off. Please double-check.');
        return;
      }
    }
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
  }
  function back() {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
    else navigation.goBack();
  }

  function finish() {
    if (!user || !computed) return;
    saveProfile(
      {
        memberId: user.id,
        sex,
        ageYears: ageNum,
        heightCm,
        activity,
        goal,
      },
      weightKg,
    );
    // Also record a fresh weigh-in if they don't have one today
    const today = new Date().toISOString().split('T')[0];
    if (!latest || latest.date !== today) {
      addWeight({
        memberId: user.id,
        date: today,
        weight: parseFloat(weight),
        unit: weightUnit,
      });
    }
    navigation.goBack();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <SoundPressable
              onPress={back}
              style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </SoundPressable>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Macro Setup</Text>
            <View style={styles.backBtn} />
          </View>

          {/* Progress pips */}
          <View style={styles.pips}>
            {STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.pip,
                  {
                    backgroundColor: i <= stepIdx ? colors.gold : colors.border,
                    width: i === stepIdx ? 28 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <FadeInView key={step}>
            {step === 'sex' && (
              <StepWrap
                title="Biological sex"
                subtitle="Used in the BMR equation. This isn't gender. It reflects metabolic baseline."
                colors={colors}
              >
                <View style={styles.choiceRow}>
                  <ChoiceCard
                    label="Male"
                    icon="male"
                    active={sex === 'male'}
                    onPress={() => setSex('male')}
                    colors={colors}
                  />
                  <ChoiceCard
                    label="Female"
                    icon="female"
                    active={sex === 'female'}
                    onPress={() => setSex('female')}
                    colors={colors}
                  />
                </View>
              </StepWrap>
            )}

            {step === 'age' && (
              <StepWrap title="Age" subtitle="BMR decreases slowly with age." colors={colors}>
                <TextInput
                  style={[
                    styles.inputXL,
                    { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                  ]}
                  keyboardType="number-pad"
                  value={age}
                  onChangeText={setAge}
                  placeholder="30"
                  placeholderTextColor={colors.textMuted}
                  maxLength={3}
                />
                <Text style={[styles.unit, { color: colors.textMuted }]}>years</Text>
              </StepWrap>
            )}

            {step === 'height' && (
              <StepWrap title="Height" subtitle="Switch to metric if you prefer." colors={colors}>
                <UnitToggle
                  options={[{ key: 'imperial', label: 'ft / in' }, { key: 'metric', label: 'cm' }]}
                  value={heightUnit}
                  onChange={(v) => setHeightUnit(v as HeightUnit)}
                  colors={colors}
                />
                {heightUnit === 'imperial' ? (
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[
                          styles.inputXL,
                          { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                        ]}
                        keyboardType="number-pad"
                        value={heightFt}
                        onChangeText={setHeightFt}
                        placeholder="5"
                        placeholderTextColor={colors.textMuted}
                        maxLength={1}
                      />
                      <Text style={[styles.unit, { color: colors.textMuted }]}>ft</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <TextInput
                        style={[
                          styles.inputXL,
                          { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                        ]}
                        keyboardType="number-pad"
                        value={heightIn}
                        onChangeText={setHeightIn}
                        placeholder="9"
                        placeholderTextColor={colors.textMuted}
                        maxLength={2}
                      />
                      <Text style={[styles.unit, { color: colors.textMuted }]}>in</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={[
                        styles.inputXL,
                        { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                      ]}
                      keyboardType="number-pad"
                      value={heightCmInput}
                      onChangeText={setHeightCmInput}
                      placeholder="175"
                      placeholderTextColor={colors.textMuted}
                      maxLength={3}
                    />
                    <Text style={[styles.unit, { color: colors.textMuted }]}>cm</Text>
                  </>
                )}
              </StepWrap>
            )}

            {step === 'weight' && (
              <StepWrap title="Current weight" subtitle="We'll log this as today's weigh-in." colors={colors}>
                <UnitToggle
                  options={[{ key: 'lb', label: 'lb' }, { key: 'kg', label: 'kg' }]}
                  value={weightUnit}
                  onChange={(v) => setWeightUnit(v as WeightUnit)}
                  colors={colors}
                />
                <TextInput
                  style={[
                    styles.inputXL,
                    { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border },
                  ]}
                  keyboardType="decimal-pad"
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="180"
                  placeholderTextColor={colors.textMuted}
                  maxLength={6}
                />
                <Text style={[styles.unit, { color: colors.textMuted }]}>{weightUnit}</Text>
              </StepWrap>
            )}

            {step === 'activity' && (
              <StepWrap title="Activity level" subtitle="Not counting planned workouts. This is your baseline." colors={colors}>
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((lvl) => {
                  const active = activity === lvl;
                  return (
                    <SoundPressable
                      key={lvl}
                      activeOpacity={0.85}
                      onPress={() => setActivity(lvl)}
                      style={[
                        styles.optionRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: active ? colors.gold : colors.border,
                          borderWidth: active ? 2 : 1,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                          {ACTIVITY_LABELS[lvl]}
                        </Text>
                        <Text style={[styles.optionSub, { color: colors.textSecondary }]}>
                          {ACTIVITY_DESCRIPTIONS[lvl]}
                        </Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={22} color={colors.gold} />}
                    </SoundPressable>
                  );
                })}
              </StepWrap>
            )}

            {step === 'goal' && (
              <StepWrap title="Goal" subtitle="We'll adjust calories from your maintenance baseline." colors={colors}>
                {(Object.keys(GOAL_LABELS) as Goal[]).map((g) => {
                  const active = goal === g;
                  const adj = GOAL_ADJUSTMENT[g];
                  const adjLabel = adj === 0 ? '±0%' : `${adj > 0 ? '+' : ''}${Math.round(adj * 100)}%`;
                  return (
                    <SoundPressable
                      key={g}
                      activeOpacity={0.85}
                      onPress={() => setGoal(g)}
                      style={[
                        styles.optionRow,
                        {
                          backgroundColor: colors.surface,
                          borderColor: active ? colors.gold : colors.border,
                          borderWidth: active ? 2 : 1,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>
                          {GOAL_LABELS[g]}
                        </Text>
                        <Text style={[styles.optionSub, { color: colors.textSecondary }]}>
                          {adjLabel} of maintenance
                        </Text>
                      </View>
                      {active && <Ionicons name="checkmark-circle" size={22} color={colors.gold} />}
                    </SoundPressable>
                  );
                })}
              </StepWrap>
            )}

            {step === 'review' && computed && (
              <StepWrap title="Your targets" subtitle="Adjust anytime from the Macros screen." colors={colors}>
                <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.reviewRow}>
                    <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>BMR</Text>
                    <Text style={[styles.reviewVal, { color: colors.textPrimary }]}>{computed.bmr} kcal</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.reviewRow}>
                    <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>MAINTENANCE (TDEE)</Text>
                    <Text style={[styles.reviewVal, { color: colors.textPrimary }]}>{computed.tdee} kcal</Text>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <View style={styles.reviewRow}>
                    <Text style={[styles.reviewLabel, { color: colors.textMuted }]}>DAILY TARGET</Text>
                    <Text style={[styles.reviewVal, { color: colors.gold, fontSize: 22 }]}>
                      {computed.macros.calories} kcal
                    </Text>
                  </View>
                </View>

                <View style={[styles.reviewCard, { backgroundColor: colors.surface, borderColor: colors.border, marginTop: spacing.md }]}>
                  <Text style={[styles.sectionLabel, { color: colors.textMuted, marginBottom: spacing.sm }]}>
                    MACRO TARGETS
                  </Text>
                  <MacroPill label="Protein" value={`${computed.macros.protein}g`} color="#FF6B6B" colors={colors} />
                  <MacroPill label="Carbs" value={`${computed.macros.carbs}g`} color="#4ECDC4" colors={colors} />
                  <MacroPill label="Fat" value={`${computed.macros.fat}g`} color="#FFD166" colors={colors} />
                </View>
              </StepWrap>
            )}
          </FadeInView>
        </ScrollView>

        {/* Bottom CTA */}
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          {step === 'review' ? (
            <SoundPressable
              activeOpacity={0.85}
              style={[styles.cta, { backgroundColor: colors.gold }]}
              onPress={finish}
              disabled={!computed}
            >
              <Text style={styles.ctaText}>Save & continue</Text>
              <Ionicons name="checkmark" size={20} color="#000" />
            </SoundPressable>
          ) : (
            <SoundPressable
              activeOpacity={0.85}
              style={[styles.cta, { backgroundColor: colors.gold }]}
              onPress={next}
            >
              <Text style={styles.ctaText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#000" />
            </SoundPressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function StepWrap({
  title,
  subtitle,
  children,
  colors,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  colors: any;
}) {
  return (
    <View style={styles.stepWrap}>
      <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.stepSub, { color: colors.textSecondary }]}>{subtitle}</Text>
      <View style={{ marginTop: spacing.lg }}>{children}</View>
    </View>
  );
}

function ChoiceCard({
  label,
  icon,
  active,
  onPress,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  colors: any;
}) {
  return (
    <SoundPressable
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.choiceCard,
        {
          backgroundColor: colors.surface,
          borderColor: active ? colors.gold : colors.border,
          borderWidth: active ? 2 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={32} color={active ? colors.gold : colors.textSecondary} />
      <Text style={[styles.choiceLabel, { color: active ? colors.gold : colors.textPrimary }]}>
        {label}
      </Text>
    </SoundPressable>
  );
}

function UnitToggle({
  options,
  value,
  onChange,
  colors,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  colors: any;
}) {
  return (
    <View style={[styles.toggleWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <SoundPressable
            key={opt.key}
            activeOpacity={0.85}
            onPress={() => onChange(opt.key)}
            style={[
              styles.toggleBtn,
              active && { backgroundColor: colors.gold },
            ]}
          >
            <Text style={{
              color: active ? '#000' : colors.textPrimary,
              fontWeight: '800',
              fontSize: 13,
            }}>{opt.label}</Text>
          </SoundPressable>
        );
      })}
    </View>
  );
}

function MacroPill({ label, value, color, colors }: { label: string; value: string; color: string; colors: any }) {
  return (
    <View style={[styles.macroPillRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={[styles.macroPillLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Text style={[styles.macroPillVal, { color: colors.textPrimary }]}>{value}</Text>
    </View>
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
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },

  pips: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.xl,
    marginTop: spacing.sm,
  },
  pip: { height: 8, borderRadius: 4 },

  stepWrap: {
    paddingHorizontal: spacing.lg,
  },
  stepTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.4, marginBottom: 6 },
  stepSub: { fontSize: 14, fontWeight: '500', lineHeight: 20 },

  row: { flexDirection: 'row', gap: spacing.md },
  unit: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: spacing.sm,
  },

  inputXL: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: 18,
    paddingHorizontal: 12,
    fontSize: 40,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -1,
    marginTop: spacing.md,
  },

  toggleWrap: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: 3,
    gap: 2,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  toggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    minWidth: 72,
    alignItems: 'center',
  },

  choiceRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  choiceCard: {
    flex: 1,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  choiceLabel: { fontSize: 16, fontWeight: '800' },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  optionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  optionSub: { fontSize: 12, fontWeight: '500' },

  reviewCard: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  reviewLabel: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700' },
  reviewVal: { fontSize: 16, fontWeight: '800' },
  divider: { height: 1 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.2, fontWeight: '700' },

  macroPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  macroDot: { width: 10, height: 10, borderRadius: 5 },
  macroPillLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  macroPillVal: { fontSize: 15, fontWeight: '800' },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: borderRadius.md,
  },
  ctaText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 0.3 },
});
