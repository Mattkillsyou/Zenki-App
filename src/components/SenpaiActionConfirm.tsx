/**
 * SenpaiActionConfirm — the confirm-before-write sheet for Senpai's
 * client-executed actions (item 4: "add a ham sandwich to my macros").
 *
 * When the model requests log_food / remove_food / set_goal, the chat provider
 * resolves it into a `pendingAction` (real macros from the food DB — never the
 * model's numbers). This sheet shows exactly what will be written and only
 * mutates NutritionContext when the user taps confirm. Rendered once, globally,
 * inside SenpaiChatProvider (App.tsx), so it works regardless of whether the
 * request came from the floating mascot or the full chat modal.
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useSenpaiChat } from '../hooks/useSenpaiChat';
import { MEAL_TYPE_LABELS, type MealType } from '../types/nutrition';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'];
const round0 = (n: number) => Math.round(n);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function SenpaiActionConfirm() {
  const { colors } = useTheme();
  const { pendingAction, confirmAction, cancelAction, updatePendingFood } = useSenpaiChat();

  if (!pendingAction) return null;
  const a = pendingAction;
  const gold = colors.gold || '#D4A017';

  // Whether the primary button can fire (e.g. a food was actually found).
  const canConfirm =
    (a.kind === 'log_food' && a.status === 'ready' && a.candidates.length > 0) ||
    (a.kind === 'remove_food' && a.status === 'ready' && !!a.targetId) ||
    a.kind === 'set_goal';

  const primaryLabel =
    a.kind === 'remove_food' ? 'Remove' : a.kind === 'set_goal' ? 'Save goals' : 'Log it';

  const title =
    a.kind === 'log_food'
      ? 'Log this food?'
      : a.kind === 'remove_food'
      ? 'Remove this entry?'
      : 'Update your goals?';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={cancelAction} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={cancelAction}>
        {/* Inner Pressable swallows taps so tapping the card doesn't dismiss. */}
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.backgroundElevated, borderColor: gold }]}
          onPress={() => {}}
        >
          <Text style={[styles.kicker, { color: gold }]}>SENPAI</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>

          {/* ── log_food ── */}
          {a.kind === 'log_food' && (
            <>
              {a.status === 'resolving' && (
                <View style={styles.center}>
                  <ActivityIndicator color={gold} />
                  <Text style={[styles.muted, { color: colors.textMuted }]}>looking up "{a.query}"…</Text>
                </View>
              )}

              {a.status === 'not_found' && (
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  couldn't find "{a.query}" in the food database 💔 try a simpler name, or search it
                  yourself in the Food Log.
                </Text>
              )}

              {a.status === 'ready' && a.candidates.length > 0 && (
                <FoodPicker
                  pending={a}
                  colors={colors}
                  gold={gold}
                  onPick={(i) => updatePendingFood({ selectedIndex: i })}
                  onServings={(s) => updatePendingFood({ servings: s })}
                  onMeal={(m) => updatePendingFood({ meal: m })}
                />
              )}
            </>
          )}

          {/* ── remove_food ── */}
          {a.kind === 'remove_food' && (
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              {a.status === 'ready' && a.targetId
                ? `Remove ${a.label} from today's log?`
                : `couldn't find ${a.label} in today's log to remove 💔`}
            </Text>
          )}

          {/* ── set_goal ── */}
          {a.kind === 'set_goal' && (
            <View style={styles.goalRows}>
              {Object.keys(a.changes).length === 0 ? (
                <Text style={[styles.body, { color: colors.textSecondary }]}>
                  nothing to change — tell me a number, like "set protein to 180" 💕
                </Text>
              ) : (
                Object.entries(a.changes).map(([k, v]) => (
                  <View key={k} style={styles.goalRow}>
                    <Text style={[styles.goalKey, { color: colors.textSecondary }]}>{k}</Text>
                    <Text style={[styles.goalVal, { color: colors.textPrimary }]}>
                      {v}
                      {k === 'calories' ? ' cal' : ' g'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ── actions ── */}
          <View style={styles.btnRow}>
            <Pressable
              onPress={cancelAction}
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.textMuted }]}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
            {canConfirm && (
              <Pressable
                onPress={confirmAction}
                style={[styles.btn, { backgroundColor: gold }]}
                accessibilityRole="button"
                accessibilityLabel={primaryLabel}
              >
                <Text style={styles.confirmText}>{primaryLabel}</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** The interactive part of a log_food confirm: candidate list + servings + meal + macro readout. */
function FoodPicker({
  pending,
  colors,
  gold,
  onPick,
  onServings,
  onMeal,
}: {
  pending: Extract<ReturnType<typeof useSenpaiChat>['pendingAction'], { kind: 'log_food' }>;
  colors: any;
  gold: string;
  onPick: (index: number) => void;
  onServings: (servings: number) => void;
  onMeal: (meal: MealType) => void;
}) {
  const food = pending.candidates[pending.selectedIndex];
  const s = pending.servings;
  const macros = food
    ? {
        calories: round0(food.macros.calories * s),
        protein: round1(food.macros.protein * s),
        carbs: round1(food.macros.carbs * s),
        fat: round1(food.macros.fat * s),
      }
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <View>
      {/* Candidate list (only when there's more than one match) */}
      {pending.candidates.length > 1 && (
        <ScrollView style={styles.candidates} keyboardShouldPersistTaps="handled">
          {pending.candidates.slice(0, 6).map((c, i) => {
            const selected = i === pending.selectedIndex;
            return (
              <Pressable
                key={c.id}
                onPress={() => onPick(i)}
                style={[
                  styles.candidate,
                  { borderColor: selected ? gold : 'transparent', backgroundColor: colors.background },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.candidateName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {c.name}
                  {c.brand ? ` · ${c.brand}` : ''}
                </Text>
                <Text style={[styles.candidateMeta, { color: colors.textMuted }]} numberOfLines={1}>
                  {c.serving.label} · {round0(c.macros.calories)} cal
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Selected food name + serving */}
      <Text style={[styles.foodName, { color: colors.textPrimary }]}>{food?.name}</Text>
      <Text style={[styles.muted, { color: colors.textMuted }]}>per serving: {food?.serving.label}</Text>

      {/* Servings stepper */}
      <View style={styles.stepperRow}>
        <Text style={[styles.stepperLabel, { color: colors.textSecondary }]}>Servings</Text>
        <View style={styles.stepper}>
          <Pressable
            onPress={() => onServings(Math.max(0.5, round1(s - 0.5)))}
            style={[styles.stepBtn, { borderColor: colors.textMuted }]}
            accessibilityRole="button"
            accessibilityLabel="Fewer servings"
          >
            <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>−</Text>
          </Pressable>
          <Text style={[styles.stepVal, { color: colors.textPrimary }]}>{s}</Text>
          <Pressable
            onPress={() => onServings(round1(s + 0.5))}
            style={[styles.stepBtn, { borderColor: colors.textMuted }]}
            accessibilityRole="button"
            accessibilityLabel="More servings"
          >
            <Text style={[styles.stepBtnText, { color: colors.textPrimary }]}>+</Text>
          </Pressable>
        </View>
      </View>

      {/* Meal selector */}
      <View style={styles.mealRow}>
        {MEALS.map((m) => {
          const selected = m === pending.meal;
          return (
            <Pressable
              key={m}
              onPress={() => onMeal(m)}
              style={[
                styles.mealChip,
                { borderColor: selected ? gold : colors.textMuted, backgroundColor: selected ? gold : 'transparent' },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.mealChipText, { color: selected ? '#000' : colors.textSecondary }]}>
                {MEAL_TYPE_LABELS[m]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Macro readout */}
      <View style={[styles.macroBox, { borderColor: gold }]}>
        <Text style={[styles.macroText, { color: colors.textPrimary }]}>
          {macros.calories} cal · {macros.protein}g P · {macros.carbs}g C · {macros.fat}g F
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 16,
  },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  muted: { fontSize: 12, marginTop: 4 },
  center: { alignItems: 'center', paddingVertical: 16, gap: 8 },

  candidates: { maxHeight: 150, marginBottom: 10 },
  candidate: { borderWidth: 1.5, borderRadius: 10, padding: 8, marginBottom: 6 },
  candidateName: { fontSize: 13, fontWeight: '700' },
  candidateMeta: { fontSize: 11, marginTop: 1 },

  foodName: { fontSize: 16, fontWeight: '800', marginTop: 2 },

  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  stepperLabel: { fontSize: 14, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, fontWeight: '700', lineHeight: 22 },
  stepVal: { fontSize: 16, fontWeight: '800', minWidth: 32, textAlign: 'center' },

  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  mealChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  mealChipText: { fontSize: 12, fontWeight: '700' },

  macroBox: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 16, alignItems: 'center' },
  macroText: { fontSize: 14, fontWeight: '800' },

  goalRows: { gap: 8, marginVertical: 4 },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  goalKey: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  goalVal: { fontSize: 14, fontWeight: '800' },

  btnRow: { flexDirection: 'row', gap: 12, marginTop: 22 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  cancelBtn: { borderWidth: 1.5 },
  cancelText: { fontSize: 15, fontWeight: '700' },
  confirmText: { fontSize: 15, fontWeight: '800', color: '#000' },
});
