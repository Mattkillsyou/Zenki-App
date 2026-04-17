# SENPAI MODE — Claude Code Prompt

Copy everything below the line into Claude Code.

---

## CONTEXT

This is a React Native / Expo app (Zenki) — a martial arts gym management app. It has a theming system (`src/theme/themes.ts`, `src/context/ThemeContext.tsx`, `src/components/ThemeOverlay.tsx`), a sound system (`src/sounds/synth.ts`, `src/context/SoundContext.tsx`), gamification (`src/context/GamificationContext.tsx`), workout logging (`src/context/WorkoutContext.tsx`, `src/screens/WorkoutScreen.tsx`), HR session tracking (`src/screens/WorkoutSessionScreen.tsx`), and settings (`src/screens/SettingsScreen.tsx`).

## WHAT IS SENPAI MODE

Senpai Mode is a joke/easter-egg toggle in Settings. When enabled, a persistent anime mascot character ("Zenki-chan") appears on screen — a chibi-style anime girl who reacts to user actions, cheers them on during workouts, and turns the entire UI into a loud, colorful, over-the-top anime-inspired experience.

This is a NOVELTY FEATURE meant to make members laugh. It should be absurd, maximalist, and fun. Think: every anime trope cranked to 11. Sparkles, hearts, exclamation marks, bright pink/cyan/yellow, screaming enthusiasm.

## ARCHITECTURE OVERVIEW

Senpai Mode is implemented as:
1. A global toggle stored in AsyncStorage + a React Context (`SenpaiContext`)
2. A persistent floating mascot component (`SenpaiMascot`) rendered in App.tsx
3. A set of mascot "states" with different expressions and dialogue
4. Sound effects (Web Audio synth — existing pattern)
5. Visual overlay effects (particle hearts, sparkles, screen flash on events)
6. A color palette override that layers on top of the current theme (does NOT replace the theme system — it tints it)

## TASK 1: Create SenpaiContext

**Create `src/context/SenpaiContext.tsx`**

```ts
interface SenpaiState {
  enabled: boolean;
  mascotMood: MascotMood;
  lastReaction: string | null;     // dialogue text currently displayed
  reactionExpiry: number;          // timestamp when current reaction should hide
  sparkleActive: boolean;          // whether sparkle overlay is showing
}

type MascotMood =
  | 'idle'           // default — happy, waiting
  | 'cheering'       // during/after workout — jumping, fists up
  | 'impressed'      // new PR, high strain — starry eyes
  | 'encouraging'    // when user opens the app, starts a workout
  | 'celebrating'    // level up, achievement, streak milestone
  | 'sleeping'       // idle for >60 seconds — zzz
  | 'disappointed'   // broke streak (use sparingly, should still be cute/funny)
  ;

interface SenpaiContextValue {
  state: SenpaiState;
  setEnabled: (on: boolean) => void;
  triggerReaction: (mood: MascotMood, dialogue: string, durationMs?: number) => void;
  clearReaction: () => void;
}
```

Provider logic:
- Load/save `enabled` to AsyncStorage key `@zenki_senpai_mode`
- `triggerReaction()` sets the mascotMood, lastReaction text, and reactionExpiry. After durationMs (default 3000), auto-clear back to 'idle' with null dialogue.
- Export `useSenpai()` hook.

## TASK 2: Create SenpaiMascot Component

**Create `src/components/SenpaiMascot.tsx`**

This is the persistent floating mascot. It renders as an absolutely-positioned element on top of all content (but below modals). It should be placed in App.tsx AFTER the main NavigationContainer, BEFORE the ThemeOverlay.

**Mascot visual: CSS/RN-drawn chibi character (NOT an image file)**

Since we can't bundle anime artwork, the mascot is drawn using React Native Views, styled to look like a simplified chibi character. Think: a round face, big eyes (circles), small mouth, colored hair, simple body. This is achievable with nested Views + borderRadius + absolute positioning.

**Chibi construction (all View-based):**

```
Head: 60x60 circle, backgroundColor: #FFE0D0 (skin tone)
Hair: positioned above/around head, backgroundColor: #FF69B4 (hot pink)
  - Bangs: three overlapping rounded rectangles above forehead
  - Side hair: two long rounded rectangles hanging down sides
Eyes: two 12x12 circles, backgroundColor: #2D1B69 (dark purple)
  - Eye shine: two 4x4 white circles positioned upper-right of each eye
  - When 'impressed': eyes become stars (replace circles with star shapes using rotated squares)
  - When 'sleeping': eyes become horizontal lines (height: 2, width: 12)
Mouth: varies by mood
  - idle/encouraging: small upward curve (half-circle, 8px wide)
  - cheering: open circle (10x10 circle, backgroundColor matching skin, border)
  - impressed: small 'o' shape
  - celebrating: wide smile (larger half-circle)
  - sleeping: small 'z' shapes floating up
  - disappointed: slight downward curve
Blush: two small pink circles on cheeks, rgba(255,105,180,0.3)
Body: simplified — small trapezoid shape below head, wearing a gi (white with colored belt)
  - Gi: white rectangle with rounded bottom, small V-neck notch at top
  - Belt: thin colored rectangle across middle (uses colors.gold from current theme)
Arms: two small rounded rectangles
  - idle: at sides
  - cheering: raised up (rotated 30deg outward, positioned above head)
  - encouraging: one arm waving (animated rotation)
```

**Size and position:**
- Total mascot size: approximately 80x120 points
- Position: bottom-right corner, above the tab bar. Use absolute positioning: `bottom: 100, right: 16`
- The mascot should be draggable — let users reposition it by dragging. Use PanResponder or Animated.event for drag gesture. Save last position to AsyncStorage so it persists.
- Add a small "×" button that appears on long-press to temporarily hide the mascot (reappears on next app launch or can be toggled back in settings)

**Animations (per mood):**
- `idle`: Gentle floating bounce — translateY oscillates ±4px over 2 seconds. Subtle breathing: scale oscillates 1.0↔1.02.
- `cheering`: Rapid bouncing — translateY oscillates ±12px over 400ms. Arms raised. Sparkle particles emit from around the mascot.
- `impressed`: Eyes become stars (animated scale-in). Scale pops to 1.15 then settles to 1.05. Starry particle effect.
- `encouraging`: One arm waves (rotate oscillates ±20deg over 600ms). Head tilts slightly.
- `celebrating`: Full body jumps — translateY goes -30 then bounces back. Confetti emits. Scale pulses.
- `sleeping`: Slow drift — translateY oscillates ±2px over 4 seconds. Opacity dims to 0.7. "Z" letters float upward and fade (3 of them, staggered).
- `disappointed`: Slight shrink (scale 0.9). Head droops (translateY +5). Quick recovery after 2 seconds (bounces back to idle with encouraging dialogue).

**Speech bubble:**
- When `lastReaction` is non-null, show a speech bubble above the mascot
- Bubble: white background (or `colors.surface`), rounded corners (borderRadius 12), small triangle pointer at bottom pointing to mascot
- Text: `colors.textPrimary`, fontSize 12, fontWeight 700, max 3 lines, maxWidth 180
- Bubble animates in: scale from 0 + fade from 0, spring animation
- Bubble animates out: scale to 0.8 + fade to 0, timing 200ms

## TASK 3: Senpai Dialogue System

**Create `src/data/senpaiDialogue.ts`**

A collection of dialogue strings organized by trigger event. Each trigger has an array of options — pick randomly each time.

```ts
export const SENPAI_DIALOGUE = {
  // App open
  appOpen: [
    "Senpai! You're here! ♡",
    "Yay! Senpai came to train!",
    "I've been waiting for you, Senpai~!",
    "Welcome back, Senpai! Let's go!",
    "Senpai! I knew you'd come today!",
    "*bounces excitedly* SENPAI!!",
  ],

  // Workout started
  workoutStart: [
    "Senpai is so strong! Ganbare!!",
    "You can do it, Senpai! I believe in you!",
    "FIGHT-O, SENPAI! FIGHT-O!!",
    "Show them your power, Senpai!",
    "Senpai's training arc begins NOW!",
    "Go go go, Senpai!! ★★★",
  ],

  // Workout completed
  workoutComplete: [
    "SUGOI, SENPAI!! You did it!!",
    "Senpai is amazing! So cool!",
    "That was INCREDIBLE, Senpai!",
    "Senpai leveled up IRL! ♡♡♡",
    "You're the strongest, Senpai!",
    "KYAAA~! Senpai is so awesome!",
  ],

  // New PR
  newPR: [
    "NANI?! A NEW RECORD?! SENPAI!!",
    "S-senpai... you're too powerful!",
    "MASAKA! Senpai broke the limit!",
    "This is Senpai's ULTIMATE FORM!",
    "NEW PR?! I'm gonna cry, Senpai! T_T",
    "*faints from amazement*",
  ],

  // Streak milestone
  streakMilestone: [
    "Senpai's dedication... *tears up*",
    "NEVER GIVE UP! That's my Senpai!",
    "The streak continues!! YATTA!",
    "Senpai's willpower is OVER 9000!",
  ],

  // Level up
  levelUp: [
    "LEVEL UP!! Senpai evolved!",
    "Senpai got stronger! SUGOI!",
    "Is this... Senpai's final form?!",
    "★ CONGRATULATIONS, SENPAI! ★",
  ],

  // Achievement unlocked
  achievement: [
    "Achievement unlocked! Sasuga Senpai!",
    "Senpai collects them all!",
    "Another badge for Senpai's collection!",
  ],

  // Idle (no interaction for 30+ seconds)
  idle: [
    "Senpai...? Are you there...?",
    "*pokes screen* Senpai~?",
    "Don't leave me, Senpai!",
    "Senpai is thinking deeply...",
    "I'll wait for Senpai forever ♡",
  ],

  // Tap on mascot (user taps the character)
  mascotTap: [
    "Kya~! S-senpai noticed me!",
    "Hehe~ Senpai tapped me!",
    "What is it, Senpai? ♡",
    "I'm here for you, Senpai!",
    "Senpai! That tickles!",
    "*blushes* S-senpai...!",
  ],

  // Calorie/macro logging
  nutritionLog: [
    "Senpai is eating healthy! Good!",
    "Protein! Senpai needs protein!",
    "Balanced diet = strong Senpai!",
  ],

  // Morning (before noon)
  morning: [
    "Ohayo, Senpai~! ☀️",
    "Good morning, Senpai! Let's train!",
    "Rise and shine, Senpai! ♡",
  ],

  // Evening (after 6pm)
  evening: [
    "Late night training, Senpai? Sugoi!",
    "Senpai works so hard... ♡",
    "Even at night, Senpai trains!",
  ],

  // Streak broken
  streakBroken: [
    "Senpai... the streak... *sniff*",
    "It's okay, Senpai! Start again!",
    "Don't give up, Senpai! I believe in you!",
  ],
};

export function randomDialogue(key: keyof typeof SENPAI_DIALOGUE): string {
  const options = SENPAI_DIALOGUE[key];
  return options[Math.floor(Math.random() * options.length)];
}
```

## TASK 4: Senpai Visual Effects Overlay

**Create `src/components/SenpaiOverlay.tsx`**

A fullscreen overlay (pointer-events: none) that renders particle effects when Senpai Mode is active:

**Heart particles:** When cheering/celebrating, emit 10-15 small heart shapes (♡ text or heart-shaped Views using two rotated circles + a triangle) that float upward from the mascot position, drift randomly left/right, fade out over 2 seconds. Color: hot pink (#FF69B4) at varying opacities.

**Sparkle particles:** Small 4-pointed star shapes (two overlapping rotated squares) that appear at random positions near the mascot, scale in quickly, rotate, and fade out. Color: gold/yellow (#FFD700). Emit during 'impressed' and 'celebrating' moods.

**Screen flash:** On major events (PR, level up), briefly flash the screen edges with a pink/gold radial gradient that fades in 200ms and out 400ms. Very subtle — just a quick wash of color.

**Floating kaomoji:** Occasionally (during cheering), float small text emotes upward: "★", "♡", "✧", "!", "♪". fontSize 16, random x positions, float up and fade out over 1.5s.

These effects should use the same animation patterns as the existing ThemeOverlay.tsx (Animated.Value, useRef, useEffect loops). Keep them performant — limit particle count, use useNativeDriver: true where possible.

## TASK 5: Senpai Sound Effects

**In `src/sounds/synth.ts`:**

Add 'senpai' to the SoundTheme union type. Add a case in playSynth. Create a `senpaiSound` function.

Senpai sounds are BRIGHT, LOUD (relatively — still capped at reasonable gain), and anime-inspired. Think: magical girl transformation, dating sim menu sounds, J-RPG level-up jingles.

- **tap**: Bright sparkly ping. Two layered sines with chorus: freq=1400, wave='sine', duration=0.08, gain=0.10 + freq=1407, wave='sine', duration=0.08, gain=0.07, detune=+12. Like tapping a crystal.
- **success**: Triumphant ascending arpeggio (anime power-up sound). Five rapid notes: freq=523 (C5), delay=0; freq=659 (E5), delay=0.04; freq=784 (G5), delay=0.08; freq=1047 (C6), delay=0.12; freq=1319 (E6), delay=0.16. All sine, duration=0.12, gain decreasing from 0.11 to 0.07. Fast upward sweep.
- **error**: Comedic fail sound. freq=400, wave='triangle', duration=0.10, gain=0.10, sweep=200. Then: freq=200, wave='triangle', duration=0.20, gain=0.12, delay=0.10, sweep=100. A descending "wah wah".
- **navigate**: Quick two-note chime (dating sim menu). freq=880, wave='sine', duration=0.06, gain=0.08. Then freq=1100, wave='sine', duration=0.08, gain=0.07, delay=0.04.
- **open**: Magical reveal sound — ascending sweep with chorus. freq=400, wave='sine', duration=0.25, gain=0.09, sweep=1200. Plus freq=403, wave='sine', duration=0.25, gain=0.06, sweep=1206, detune=+5.
- **close**: Descending sparkle. freq=1000, wave='sine', duration=0.15, gain=0.07, sweep=400.

Also add a special function `senpaiJingle(ctx)` that plays the "Senpai noticed me" jingle — a short 8-note melody used when Senpai Mode is first enabled:
Notes (all sine, duration=0.10, gain=0.08): C5, E5, G5, A5, G5, E5, G5, C6. Delays: 0, 0.08, 0.16, 0.24, 0.36, 0.44, 0.52, 0.60. The last note (C6) has duration=0.25 for a held finish.

## TASK 6: Senpai Color Tinting

When Senpai Mode is enabled, apply a subtle color tint to the UI. This does NOT replace the theme system — it layers on top.

**In `src/context/SenpaiContext.tsx`**, export a helper:

```ts
export function senpaiTint(baseColor: string, enabled: boolean): string {
  if (!enabled) return baseColor;
  // Shift the hue slightly toward pink/magenta
  // For accent colors: return hot pink variant
  // For backgrounds: add a very subtle pink tint
  // Implementation: parse hex, shift hue, return
}
```

However, a simpler approach that doesn't require color parsing: when Senpai Mode is enabled, specific color overrides are applied in components that opt into it. The main places to tint:

- Tab bar active icon color: shift to hot pink (#FF69B4) instead of the theme's gold
- Accent/gold colors in key locations (streak flame, XP bar fill): shift to pink/magenta
- FAB button on CommunityScreen: pink instead of gold

This is OPTIONAL tinting — implement it if time allows. The mascot + dialogue + sounds are the core feature. Color tinting is polish.

## TASK 7: Integration Points

Wire up the SenpaiContext to trigger reactions at the right moments:

**In `App.tsx`:**
- Wrap app in `<SenpaiProvider>`
- Render `<SenpaiMascot />` and `<SenpaiOverlay />` after NavigationContainer, conditionally on `state.enabled`
- On app mount (if enabled), trigger 'encouraging' mood with a random `appOpen` dialogue. Use time-of-day to pick morning/evening variants.

**In `src/context/WorkoutContext.tsx`:**
- After `logWorkout()` succeeds: trigger 'cheering' + random `workoutComplete` dialogue
- After `addPR()` succeeds: trigger 'impressed' + random `newPR` dialogue

**In `src/context/GamificationContext.tsx`:**
- After level up: trigger 'celebrating' + random `levelUp` dialogue
- After achievement unlock: trigger 'celebrating' + random `achievement` dialogue
- After streak milestone: trigger 'cheering' + random `streakMilestone` dialogue
- After streak broken: trigger 'disappointed' + random `streakBroken` dialogue

**In `src/context/HeartRateContext.tsx` or `WorkoutSessionScreen.tsx`:**
- When session starts: trigger 'encouraging' + random `workoutStart` dialogue
- When session ends: trigger 'cheering' + random `workoutComplete` dialogue

**In `src/context/NutritionContext.tsx`:**
- After logging a meal: trigger 'encouraging' + random `nutritionLog` dialogue

**In `src/components/SenpaiMascot.tsx`:**
- On tap: trigger 'cheering' (brief) + random `mascotTap` dialogue
- Idle timer: after 45 seconds of no triggered reactions, transition to 'idle' mood + random `idle` dialogue. After another 60 seconds, transition to 'sleeping'.

**In `src/screens/SettingsScreen.tsx`:**
- Add the toggle under a "Fun" or "Easter Eggs" section
- Label: "Senpai Mode"
- Subtitle: "Adds an anime mascot that cheers you on"
- When first enabled, play the senpaiJingle and trigger 'celebrating' mood with "SENPAI NOTICED ME!!" dialogue
- Show a humorous warning/disclaimer when toggling on: "⚠️ Warning: May contain excessive enthusiasm and sparkles. Not responsible for increased motivation."

## TASK 8: Settings Screen Toggle Details

In SettingsScreen.tsx, the Senpai Mode toggle should be:
- Placed in its own section at the bottom of settings, separated from serious settings
- Section header: "Secret Lab 🧪" (or similar fun label)
- Toggle row with:
  - Icon: 'sparkles' (Ionicons)
  - Title: "Senpai Mode"
  - Subtitle: "Your personal anime cheerleader"
  - Switch component (same pattern as other toggles in SettingsScreen)
- When enabled: briefly flash the settings screen background pink, play the jingle
- Below the toggle (only visible when enabled), show secondary options:
  - "Mascot Volume" — slider or Low/Med/High selector for how often the mascot speaks
  - "Sparkle Intensity" — toggle between "Normal" and "MAXIMUM" (more particles)

## EXECUTION ORDER

1. SenpaiContext (state management, persistence, reaction system)
2. Senpai dialogue data file
3. SenpaiMascot component (the chibi character — this is the centerpiece, spend time making the View-based character look good with proper proportions)
4. Speech bubble rendering
5. Mascot mood animations
6. Mascot drag-to-reposition
7. SenpaiOverlay (heart/sparkle/kaomoji particles)
8. Senpai sound effects in synth.ts
9. Settings toggle
10. Integration with WorkoutContext, GamificationContext, HeartRateContext, NutritionContext
11. App.tsx wiring
12. Color tinting (if time allows)

The SenpaiMascot chibi construction (Task 2) is the hardest part. A View-based chibi that actually looks like an anime character requires careful sizing, positioning, and layering of ~20+ nested Views. Take your time. Get the proportions right. The face should be recognizably anime — big round eyes with shine spots, small nose (just a dot or nothing), expressive mouth that changes per mood, pink hair with bangs. The body in a white gi with belt is simpler.

Do NOT use any external image assets or URLs. Everything must be drawn with React Native Views and Animated. This is part of the joke — it's a silly RN-drawn character, which is inherently funny and charming.
