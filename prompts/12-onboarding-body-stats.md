# Prompt 12: Expanded Onboarding — Body Stats, Goals, Lifestyle & Calorie Setup

## Research Summary

Analysis of onboarding flows from MyFitnessPal (18 steps), Noom (113 screens), MacroFactor (10 min setup), BetterMe (26 questions), Fitbod, and Freeletics reveals consistent patterns across high-end fitness apps:

**Universal questions (every app asks these):** height, weight, age, sex, primary fitness goal, activity level.

**High-value differentiators:**
- **Target weight / goal weight** — gives the user a projected timeline and makes calorie targets feel purposeful (MyFitnessPal, Noom, BetterMe)
- **Training experience level** — beginner/intermediate/advanced changes how the app communicates and what it recommends (Fitbod, Freeletics, BetterMe)
- **Training frequency / preferred days** — how many days per week the user intends to train (Fitbod, Freeletics, MacroFactor)
- **Diet type / dietary restrictions** — MacroFactor asks balanced/low-fat/low-carb/keto; BetterMe asks about diet preferences
- **Injuries / limitations** — what body parts to avoid or modify exercises for (BetterMe, some personal training apps)
- **Motivation / "why"** — Noom's psychological approach asks WHY the user wants to change, creating emotional commitment
- **Motivational screens between questions** — Noom inserts progress projections and encouraging messages every few screens to prevent dropout during long onboarding

**What NOT to copy:** Noom's 113-screen flow is too long. BetterMe's 26 questions push it. The sweet spot from research is 15-20 total onboarding steps max, with body stats sections being skippable.

## Task

Expand the onboarding wizard from 11 steps to 18 steps by adding 7 new steps covering body stats, fitness goals, training preferences, and lifestyle. Auto-compute calorie/macro targets using the existing nutrition pipeline. When complete, the user's `NutritionProfile`, `MacroGoals`, initial weight entry, and weight goal are all populated.

## Context

Zenki Dojo (`D:\Zenki\App`), React Native / Expo SDK 52. Onboarding at `src/screens/auth/OnboardingScreen.tsx` (~970 lines), 11-step wizard. Nutrition calculations at `src/utils/nutrition.ts` (Mifflin-St Jeor BMR, TDEE multipliers, macro split). `NutritionContext` has `saveProfile()` which computes and stores everything. `WeightGoal` interface exists in `src/types/activity.ts`.

## What Already Exists (reuse, do NOT rebuild)
- `calculateBMR()`, `calculateTDEE()`, `calculateMacros()` in `src/utils/nutrition.ts`
- `saveProfile(profile, weightKg)` in NutritionContext — handles BMR→TDEE→macros→storage
- `addWeight(entry)` in NutritionContext
- `WeightGoal` type in `src/types/activity.ts` with `targetWeight`, `targetDate`, `startWeight`, `startDate`, `unit`
- `@zenki_weight_goal` AsyncStorage key used by `WeightTrackerScreen`
- `biologicalSex` already collected at current step 3
- `ActivityLevel`: `'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'`
- `Goal`: `'cut' | 'maintain' | 'bulk'`

## New Step Map

Current 11 steps + 7 new = 18 total:

```
 0: Account (email/pw)              — existing
 1: Name                            — existing
 2: Phone                           — existing
 3: Biological sex                  — existing
 ──── NEW BODY STATS SECTION ────
 4: Height + Weight                 — NEW
 5: Age + Date of Birth             — NEW
 6: Activity Level                  — NEW
 7: Fitness Goal + Target Weight    — NEW
 8: Training Experience + Frequency — NEW
 9: Dietary Preference              — NEW
10: Calorie & Macro Summary         — NEW (motivational + preview)
 ──── EXISTING STEPS (renumbered) ────
11: Photo                           — was 4
12: Fun fact + nickname             — was 5
13: Socials                         — was 6
14: Belt + stripes                  — was 7
15: Waiver                          — was 8
16: Permissions                     — was 9
17: Welcome                         — was 10
```

## File to Modify: `src/screens/auth/OnboardingScreen.tsx`

### Update constants and imports
```typescript
const TOTAL_STEPS = 18;
```
```typescript
import { useNutrition } from '../../context/NutritionContext';
import { calculateBMR, calculateTDEE, calculateMacros, lbsToKg, kgToLbs, feetInchesToCm } from '../../utils/nutrition';
import type { ActivityLevel, Goal, Sex } from '../../types/nutrition';
import type { WeightGoal } from '../../types/activity';
import AsyncStorage from '@react-native-async-storage/async-storage';
```

### Expand OnboardingData interface
```typescript
interface OnboardingData {
  // ... all existing fields ...

  // Body stats (new)
  heightFt: string;
  heightIn: string;
  heightCm: string;
  heightUnit: 'imperial' | 'metric';
  weight: string;
  weightUnit: 'lb' | 'kg';
  age: string;
  dateOfBirth: string;           // YYYY-MM-DD (optional, computed from age if blank)
  activityLevel: ActivityLevel | '';
  fitnessGoal: Goal | '';
  targetWeight: string;          // in same unit as weight
  trainingExperience: 'beginner' | 'intermediate' | 'advanced' | '';
  trainingDaysPerWeek: number;   // 1-7, default 3
  dietType: 'balanced' | 'high_protein' | 'low_carb' | 'keto' | '';
  injuries: string[];            // body part tags: 'shoulder', 'knee', 'back', 'wrist', 'neck', 'ankle', 'hip'
  metabolicSex: 'male' | 'female' | '';  // only used when biologicalSex === 'other'
}
```

Defaults:
```typescript
heightFt: '', heightIn: '', heightCm: '', heightUnit: 'imperial',
weight: '', weightUnit: 'lb', age: '', dateOfBirth: '',
activityLevel: '', fitnessGoal: '', targetWeight: '',
trainingExperience: '', trainingDaysPerWeek: 3,
dietType: '', injuries: [], metabolicSex: '',
```

### Step 4 — Height & Weight

Title: "Your body stats"
Subtitle: "We'll use this to calculate your daily targets"

- **Height:** Unit toggle (Imperial / Metric). Imperial = ft + in side-by-side inputs. Metric = single cm input. Large numeric inputs (28px font), centered.
- **Weight:** Unit toggle (lb / kg). Single large numeric input.
- Both sections with clean labels and unit suffixes.

Validation: height 120-230cm equivalent, weight 30-200kg equivalent.

### Step 5 — Age

Title: "How old are you?"

- Single large numeric input for age (years).
- Optional: "Date of birth" text input below in small font (YYYY-MM-DD). If provided, auto-compute age. If not, just use the age number.
- Motivational micro-copy below: "Your metabolism is unique. We'll tailor everything to you."

Validation: age 13-100.

### Step 6 — Activity Level

Title: "How active are you?"
Subtitle: "Outside of Zenki Dojo training"

5 selectable cards, vertical list. Each card: icon/emoji + label + one-line description. Selected = `colors.gold` border + `goldMuted` background fill.

```
sedentary:    🪑  "Mostly sitting"         "Desk job, minimal movement"
light:        🚶  "Lightly active"         "Walking, light activity 1-3x/week"
moderate:     🏋️  "Moderately active"      "Exercise 3-5x/week"
active:       💪  "Very active"            "Hard training 6-7x/week"
very_active:  🔥  "Extremely active"       "Athlete level / physical labor job"
```

Validation: one must be selected.

### Step 7 — Fitness Goal + Target Weight

Title: "What's your goal?"

**Goal:** 3 large cards (same style as activity):
```
cut:       📉  "Lose fat"         "Caloric deficit (~20% below maintenance)"
maintain:  ⚖️  "Maintain"         "Stay at current weight and recompose"
bulk:      📈  "Build muscle"     "Caloric surplus (~10% above maintenance)"
```

**Target weight** (conditional — only show if goal is `cut` or `bulk`):
- "What's your target weight?" + numeric input + unit label (same unit as step 4)
- Below it: a computed projection line:
  - For cut: "At a healthy rate (~0.5-1 lb/week), you'd reach this in ~X weeks"
  - For bulk: "At a lean bulk rate (~0.25-0.5 lb/week), you'd reach this in ~X weeks"
  - Calculate: `weeksToGoal = Math.abs(currentWeight - targetWeight) / ratePerWeek`
  - Rate: cut = 0.75 lb/week (0.34 kg/week), bulk = 0.375 lb/week (0.17 kg/week)

Validation: goal selected. Target weight optional but if entered must be a valid number and make directional sense (target < current for cut, target > current for bulk).

### Step 8 — Training Experience + Frequency

Title: "Your training background"

**Experience level:** 3 horizontal cards:
```
beginner:      🌱  "Beginner"        "New to martial arts or strength training"
intermediate:  🥋  "Intermediate"    "1-3 years consistent training"
advanced:      ⚡  "Advanced"        "3+ years, comfortable with complex movements"
```

**Training frequency:** Horizontal selector (1-7), pill-shaped buttons in a row. Label: "How many days per week do you plan to train?" Default: 3 (pre-selected). Selected = gold fill.

**Injuries / limitations (optional):** 
Label: "Any areas to be careful with?" 
Toggleable body-part chips in a flex-wrap row:
```
Shoulder | Knee | Back | Wrist | Neck | Ankle | Hip | None
```
Multi-select (except "None" which clears others). Unselected = surface background. Selected = `redMuted` background + `red` border. These are stored for future exercise filtering — the app doesn't use them yet but having the data is valuable.

Validation: experience must be selected. Frequency and injuries are optional (frequency defaults to 3).

### Step 9 — Dietary Preference

Title: "Any dietary preference?"
Subtitle: "This adjusts your macro split"

4 selectable cards:
```
balanced:      🍽️  "Balanced"          "Standard protein/carb/fat split (default)"
high_protein:  🥩  "High Protein"      "Extra protein for muscle recovery"
low_carb:      🥗  "Low Carb"          "Reduced carbs, higher fat"
keto:          🥑  "Keto"              "Very low carb, high fat (<50g carbs)"
```

This step is ENTIRELY SKIPPABLE — show "Skip (use balanced)" link at bottom. If skipped, default to `'balanced'`.

**How diet type modifies macros (implement in handleFinish, NOT in nutrition.ts):**
After `calculateMacros()` returns the default split, apply adjustments:
- `balanced`: no change (default from calculateMacros)
- `high_protein`: protein = weightKg * 2.6 (instead of 2.2), reduce carbs to compensate
- `low_carb`: fat = 35% of calories (instead of 25%), carbs = remainder
- `keto`: carbs capped at 50g, fat = remainder after protein

Store `dietType` on the `NutritionProfile` — you'll need to add `dietType?: string` to the `NutritionProfile` interface in `src/types/nutrition.ts`.

### Step 10 — Calorie & Macro Summary (Motivational Screen)

Title: "You're all set!" or "Here's your plan"

This is NOT a question — it's a results/motivation screen (inspired by Noom's mid-flow projection screens). It shows:

**Top section — daily targets in a clean card:**
```
🔥 Daily Calories: 2,150 kcal

Protein: 176g  |  Carbs: 210g  |  Fat: 60g
```

**Middle — key stat highlights:**
```
BMR: 1,750 kcal    TDEE: 2,713 kcal
Goal: Lose fat (-20%)
```

**Bottom — if target weight was entered, show timeline:**
```
Current: 185 lb → Target: 170 lb
Estimated time: ~20 weeks at a healthy pace
```

**Call to action:** "These targets are personalized to you and will adapt as you log. You can adjust everything in Settings anytime."

**Continue button:** "Let's go!" (proceeds to photo step)

This step has NO validation — it's always continuable.

### Update canContinue()

```typescript
if (step === 4) {
  const heightCm = data.heightUnit === 'metric'
    ? parseFloat(data.heightCm)
    : feetInchesToCm(parseInt(data.heightFt, 10) || 0, parseInt(data.heightIn, 10) || 0);
  const heightValid = heightCm >= 120 && heightCm <= 230;
  const w = parseFloat(data.weight);
  const weightValid = data.weightUnit === 'kg' ? (w >= 30 && w <= 200) : (w >= 66 && w <= 440);
  return heightValid && weightValid;
}
if (step === 5) return parseInt(data.age, 10) >= 13 && parseInt(data.age, 10) <= 100;
if (step === 6) return data.activityLevel !== '';
if (step === 7) return data.fitnessGoal !== '';
if (step === 8) return data.trainingExperience !== '';
if (step === 9) return true; // skippable
if (step === 10) return true; // summary screen
```

Renumber ALL existing step references: old 4→11, 5→12, 6→13, 7→14, 8→15, 9→16, 10→17.

### Update handleFinish

After creating the Member and before `navigation.replace('Main')`:

```typescript
const { saveProfile, addWeight } = useNutrition();

// Save nutrition profile + macro goals
if (data.activityLevel && data.fitnessGoal && data.age && data.weight) {
  const sex: Sex = data.biologicalSex === 'other'
    ? (data.metabolicSex as Sex || 'male')
    : (data.biologicalSex as Sex);
  const heightCm = data.heightUnit === 'metric'
    ? parseFloat(data.heightCm)
    : feetInchesToCm(parseInt(data.heightFt, 10), parseInt(data.heightIn, 10));
  const weightKg = data.weightUnit === 'kg'
    ? parseFloat(data.weight)
    : lbsToKg(parseFloat(data.weight));

  saveProfile({
    memberId: id,
    sex,
    ageYears: parseInt(data.age, 10),
    heightCm,
    activity: data.activityLevel as ActivityLevel,
    goal: data.fitnessGoal as Goal,
    dietType: data.dietType || 'balanced',
  }, weightKg);

  // Initial weigh-in
  const today = new Date().toISOString().split('T')[0];
  addWeight({ memberId: id, date: today, weight: parseFloat(data.weight), unit: data.weightUnit as 'lb' | 'kg' });

  // Weight goal (if target entered)
  const tw = parseFloat(data.targetWeight);
  if (Number.isFinite(tw) && tw > 0) {
    const ratePerWeek = data.fitnessGoal === 'cut' ? 0.75 : 0.375; // lb/week
    const currentLb = data.weightUnit === 'kg' ? kgToLbs(parseFloat(data.weight)) : parseFloat(data.weight);
    const targetLb = data.weightUnit === 'kg' ? kgToLbs(tw) : tw;
    const weeks = Math.ceil(Math.abs(currentLb - targetLb) / ratePerWeek);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + weeks * 7);

    const goal: WeightGoal = {
      targetWeight: tw,
      targetDate: targetDate.toISOString().split('T')[0],
      startWeight: parseFloat(data.weight),
      startDate: today,
      unit: data.weightUnit as 'lb' | 'kg',
    };
    AsyncStorage.setItem('@zenki_weight_goal', JSON.stringify(goal)).catch(() => {});
  }
}
```

### Add training fields to Member

In `src/data/members.ts`, add optional fields to the `Member` interface:
```typescript
trainingExperience?: 'beginner' | 'intermediate' | 'advanced';
trainingDaysPerWeek?: number;
injuries?: string[];
```

Include these in the Member object construction in `handleFinish`:
```typescript
trainingExperience: data.trainingExperience || undefined,
trainingDaysPerWeek: data.trainingDaysPerWeek,
injuries: data.injuries.length > 0 ? data.injuries : undefined,
```

### Add dietType to NutritionProfile

In `src/types/nutrition.ts`, add to `NutritionProfile` interface:
```typescript
dietType?: 'balanced' | 'high_protein' | 'low_carb' | 'keto';
```

### Handle biologicalSex === 'other'

On step 4 (height/weight), if `data.biologicalSex === 'other'`, show a small section at the top:
"For metabolic calculations, which baseline fits better?"
Two pill buttons: Male / Female. Stores to `data.metabolicSex`. This does NOT change their profile's `biologicalSex` — it's only used for BMR math.

### Skip functionality

Steps 4-9 should each have a "Skip for now" text button below the continue button. Tapping skip:
- For steps 4-6: jump directly to step 11 (photo) — skip ALL body stats since partial data is useless for calculations
- For steps 7-9: jump to step 10 (summary) or step 11 if no stats were entered
- If ALL body stats are skipped, no NutritionProfile is created. MacroSetupScreen remains the setup path.

### Section progress indicator

Between steps 4-10, show a section label above the progress bar: "Body Stats · 1 of 7" through "Body Stats · 7 of 7". This gives users context that this is a discrete section that will end.

### Style

Match existing onboarding exactly:
- `colors` from `useTheme()` for all theming
- `typography.heading` for titles
- Input fields: 48px height, borderRadius 14, border 1.5px
- Option cards: `colors.surface` background, `colors.gold` border when selected, `colors.goldMuted` fill when selected
- Segmented controls: rounded pill, active = `colors.gold`
- Use existing `slideAnim`/`fadeAnim` transition system
- "Skip for now" text: `colors.textMuted`, 13px, underlined

## Verification
- Full path: complete all body stats → NutritionProfile saved, MacroGoals computed, weight entry created, weight goal set
- Open MacroTracker → targets already populated
- Open WeightTracker → initial weigh-in and goal both present
- Skip all body stats → no NutritionProfile, MacroSetupScreen works independently
- biologicalSex 'other' → metabolic baseline toggle appears on step 4
- Unit toggles work (imperial ↔ metric)
- Target weight projection calculates correctly
- Diet type modifies macro split appropriately
- Training experience + injuries stored on Member
- All renumbered steps still work (waiver validation, permissions, welcome)
- Live calorie preview on step 10 matches what MacroSetupScreen would compute
- `npx tsc --noEmit` passes
