# Senpai Mode — Full Sailor Moon Transformation Prompt

## What This Is

You are implementing "Senpai Mode" for Zenki Dojo, a React Native / Expo SDK 52 martial arts gym app at `D:\Zenki\App`. Senpai Mode is NOT just a floating mascot — it is a **full app visual transformation** modeled after Sailor Moon transformation sequences and magical girl anime aesthetics. When the user toggles Senpai Mode ON, the ENTIRE app should change: colors, fonts, animations, particles, sounds, screen transitions, tab bar, headers — everything. It should be bright, loud, maximalist, and unapologetically anime.

Think of it like: the app's existing themed modes (Matrix, Ghost in the Shell, Blade Runner, Sheikah Slate) are serious cinematic themes. Senpai Mode is the opposite — it's a love letter to magical girl anime. Sparkles everywhere, pastel pinks and blues and yellows, star bursts on button taps, crescent moon motifs, ribbon-swirl animations, heart-shaped particles, bouncing text, and a chibi mascot that reacts to everything the user does.

### Sailor Moon Visual Reference (research-backed)

The Sailor Moon aesthetic is specifically characterized by:
- **Color palette:** Hot pink `#FF2E51`, electric blue `#5158FF`, purple `#D260FF`, yellow `#FFF666`, light pink `#FFB3DF`, white. The dominant transformation background is dazzling sparkling BLUE, not pink. Pink is an accent, blue is the canvas.
- **Transformation sequence (5 canonical steps):** (1) Activate item + shout phrase → (2) body becomes a shining silhouette with kaleidoscopic color marbling → (3) swirling ribbons of light wrap around body forming costume pieces → (4) camera closeup as jewelry/tiara/accessories materialize → (5) pull back to final character pose
- **Duration:** ~40 seconds in the anime. For the app: compress to 3-5 seconds but preserve the FEELING of each stage.
- **Key motifs:** Crescent moons, transformation brooch (circular jeweled compact), swirling ribbons, tiaras, bows, planetary symbols, stars (both five-pointed and sparkle/glint), hearts
- **The "shining silhouette" effect:** During transformation the character's body becomes a featureless glowing shape with shifting kaleidoscopic/prismatic colors before costume details materialize. This is the MOST iconic visual.
- **Ribbon wrapping:** Ribbons of colored light physically wrap around limbs and torso, solidifying into costume elements. Not just floating particles — they have directionality and purpose.
- **Final pose:** The character strikes a dramatic stance, often martial-arts inspired, with a dramatic background burst behind them.
- **Font/text aesthetic:** "Yume kawaii" (dreamy cute) — rounded, bubbly, soft. Think rounded sans-serif with generous letter-spacing.
- **Phrase:** "Moon Prism Power, Make Up!" is THE transformation catchphrase.

---

## Codebase Architecture You Must Understand

### Theme System (CRITICAL — use this, don't reinvent it)

The app has a fully built theme system. Every theme is a `ThemeDefinition` object with:

- **`colors: ThemeColors`** — ~60 color tokens (backgrounds, text, brand, semantic, borders, accents, glows, macro chart colors, etc.). Defined in `src/theme/colors.ts`. The `ThemeColors` interface includes `textGlow`, `boxGlow`, `frameGlow`, `fontFamily`, `fontFamilyNative`, `uppercaseHeaders`, and map-related fields.
- **`overlay: ThemeOverlayConfig`** — scanlines, flicker, vignette, particles (types: `'matrix-rain' | 'rain-drops' | 'static-noise' | 'data-streams' | 'dust' | 'dna-helix' | 'sheikah-runes'`), texture (types: `'noise' | 'grid' | 'paper' | 'hex'`).
- **`soundTheme: string`** — maps to a sound palette in `src/sounds/synth.ts`. Existing themes: `home, schedule, store, drinks, community, profile, settings, default, matrix, alien, jurassic, ghost, bladerunner, sheikah, senpai`. The `senpai` sound theme already exists but needs to be expanded.
- **`webFontUrl?: string`** — Google Fonts URL loaded at runtime.

All themes are registered in `src/theme/themes.ts` → `ALL_THEMES` array and `THEMES_BY_ID` map.

**The `ThemeContext` at `src/context/ThemeContext.tsx`** resolves the active theme and exposes `{ mode, isDark, colors, overlay, theme, setMode }` via `useTheme()`.

**Your job: Create a `senpaiTheme: ThemeDefinition` in `src/theme/themes.ts` and register it.** The theme system already propagates colors, overlays, fonts, and glows app-wide. You get most of the visual transformation for free by defining the right color tokens.

### Existing Senpai Files

| File | Status | Description |
|------|--------|-------------|
| `src/components/SenpaiMascot.tsx` | DONE | ~180-line animated chibi mascot using `expo-image` animated WebP. Draggable (PanResponder), speech bubbles, idle/sleep timers, tap/long-press. |
| `src/context/SenpaiContext.tsx` | DONE but needs expansion | State: `enabled`, `mascotMood` (7 moods), `lastReaction`, `sparkleActive`, `volume` (low/med/high), `sparkleIntensity` (normal/maximum), `memoryLog` (MemoryEntry[]). Functions: `triggerReaction()`, `clearReaction()`, `setEnabled()`, `setVolume()`, `setSparkleIntensity()`, `clearMemoryLog()`, `shouldReact()`. |
| `src/components/SenpaiOverlay.tsx` | DONE but needs expansion | Fullscreen particle layer: FloatingHearts (12/24), FloatingKaomoji (8/16), SparkleParticles (10/20). Only active when `sparkleActive=true`. |
| `src/data/senpaiDialogue.ts` | DONE | 60+ dialogue strings across 12 categories: `appOpen`, `workoutStart`, `workoutComplete`, `newPR`, `streakMilestone`, `levelUp`, `achievement`, `idle`, `mascotTap`, `nutritionLog`, `morning`, `evening`, `streakBroken`, `gpsActivity`, `meditation`, `bodyLab`. |
| `src/assets/senpai/*.webp` | DONE | 11 animated WebP files with transparency: `idle, cheering, impressed, encouraging, celebrating, sleep, cry, dance, die, think, wave`. KAWAII style chibi: teal/mint twin-tail hair, orange ribbons, purple eyes, navy blue school tracksuit, white sneakers. |
| `src/navigation/TabNavigator.tsx` | Partially wired | Tab bar tint already switches to `#FF69B4` when senpai enabled. |

### Provider Architecture Constraint

`SenpaiProvider` is nested INSIDE `ThemeProvider` and other providers. This means `SenpaiContext` CAN read theme colors via `useTheme()`, but `ThemeContext` CANNOT read senpai state via `useSenpai()`. Theme switching when Senpai Mode toggles must be triggered from `SenpaiContext` or from the screen/component level — not from inside `ThemeContext`.

### Sound System

`src/sounds/synth.ts` uses Web Audio API (AudioContext) for procedural tone synthesis. It works on web only — native no-ops. There's already a `senpai` sound theme entry. The system generates short tones for events: `tap`, `success`, `error`, `navigate`, `open`, `close`.

For the Sailor Moon aesthetic, the senpai sound theme should use high-pitched sparkly tones — think wind chimes, music box notes, magical girl transformation jingles. Triangle and sine waves, high frequencies (800-2000Hz), short staccato with shimmer.

---

## What You Must Build

### 1. Senpai Theme Definition (`src/theme/themes.ts`)

Create `senpaiTheme: ThemeDefinition` with a full `senpaiColors: ThemeColors` palette. This is the most impactful single change — it transforms the entire app through the existing theme pipeline.

**Color direction — Sailor Moon canonical palette:**
- Backgrounds: deep cosmic blue base (`#0B0D2E`, `#101540`, `#151A50`) — the transformation background is BLUE, not black or purple. Like a sparkling night sky.
- Surfaces: translucent blue-violet with glassmorphism (`rgba(40, 30, 120, 0.55)`) — blue-shifted, not purple-shifted
- Primary accent (gold slot): hot pink `#FF2E51` (Sailor Moon's signature pink/red) — this is THE accent color
- Secondary accent (red slot): `#D260FF` purple — for secondary highlights and magic effects
- Text: soft white-blue primary (`#E8E5F8`), muted lavender secondary (`#9595C0`)
- Success: seafoam/mint `#7FFFD4`
- Error: coral `#FF6B6B`
- Warning: Sailor Moon yellow `#FFF666` — bright, golden, cheerful
- Info: electric blue `#5158FF` — Sailor Mercury's blue
- Borders: `rgba(255, 46, 81, 0.12)` — pink tinted
- textGlow: pink-blue shimmer — `'0 0 4px #FF2E51, 0 0 12px rgba(255,46,81,0.3), 0 0 24px rgba(81,88,255,0.15)'`
- boxGlow: pink center with blue edge — `'0 0 12px rgba(255,46,81,0.18), 0 0 24px rgba(81,88,255,0.08), inset 0 0 8px rgba(210,96,255,0.04)'`
- frameGlow: prismatic/rainbow — `'0 0 60px rgba(255,46,81,0.10), 0 0 120px rgba(81,88,255,0.06), 0 0 2px rgba(255,183,223,0.30)'`
- fontFamily (web): `'"Quicksand", "Nunito", "Comic Neue", system-ui, sans-serif'` — rounded, bubbly, yume kawaii
- fontFamilyNative: `'System'` (no custom native fonts installed)
- uppercaseHeaders: `false`
- flames: `#FF2E51`
- Macro colors: pink `#FFB3DF` protein, electric blue `#5158FF` carbs, yellow `#FFF666` fat
- mapRouteColor: `#FF2E51`
- spinner: `#FF2E51`
- switchTrack: `#FF2E51`

**Overlay config:**
- scanlines: false (not a CRT theme)
- flicker: false
- vignette: true, with deep purple edges `'rgba(30, 0, 60, 0.4)'`
- particles: You need to add a NEW particle type. Add `'moon-sparkle'` to the `ThemeOverlayConfig.particles` union type in `src/theme/colors.ts`, then implement it in the overlay renderer (find where existing particle types like `'matrix-rain'` are rendered — likely in a `ThemeOverlay` component). The particles should be a mix of: crescent moon shapes (☽), five-pointed stars (★), four-pointed sparkle glints (✦), and hearts (♡) — drifting slowly in pinks, blues, yellows, and soft purples against the blue background. NOT raining — gently floating/twinkling.
- texture: `'none'`

**Sound theme:** `'senpai'`

**Web font:** `'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap'`

Register the theme in `ALL_THEMES` and `THEMES_BY_ID`.

### 2. Auto-Theme Switching

When Senpai Mode is toggled ON:
- Save the user's current theme to a ref/state (so it can be restored)
- Switch the app theme to `'senpai'` via `setMode('senpai')` (from ThemeContext)
- This must happen at the component level where both `useSenpai()` and `useTheme()` are accessible

When Senpai Mode is toggled OFF:
- Restore the previously saved theme

The best place for this logic is in `SenpaiMascot.tsx` or a new `SenpaiThemeBridge` component rendered at the app root level (inside both providers). Use a `useEffect` watching `state.enabled`.

### 3. Senpai Mode Activation Sequence — "Transformation"

When Senpai Mode is first toggled ON, play a condensed Sailor Moon-style transformation sequence. The anime version is ~40 seconds; compress to ~4 seconds but preserve the 5-step structure:

**Step 1 — Activation (0-500ms):**
- Screen text: "Moon Prism Power... MAKE UP!" in large, centered, glowing text (pink with blue glow) — fades in and out
- Sound: ascending arpeggio C5 → E5 → G5 → C6, triangle wave, 100ms per note
- Background: quick flash to white (opacity 0→0.8→0 over 400ms)

**Step 2 — Shining Silhouette (500-1500ms):**
- The screen fills with a dazzling sparkling BLUE background (this is the canonical Sailor Moon transformation color)
- Kaleidoscopic color marbling effect — shifting prismatic colors (pink, blue, purple, yellow) rippling across the screen
- This is the most iconic visual — a luminous, shifting, prismatic wash
- Implementation: overlay with animated gradient that shifts hue, or multiple overlapping radial gradients with staggered opacity animations

**Step 3 — Ribbon Swirl (1500-2500ms):**
- Animated ribbons of pink and blue light swirl from the center outward in a spiral pattern
- These aren't just particles — they should feel like flowing ribbons with directionality (use elongated shapes rotating along a spiral path)
- The app's UI begins to become visible underneath as the overlay starts fading

**Step 4 — Sparkle Materialization (2500-3500ms):**
- Burst of 50+ sparkle particles (stars, hearts, crescent moons) exploding outward from center
- Small glint/twinkle effects appearing at random positions across the screen
- The transformation overlay fades out, revealing the now-transformed app (new theme colors active)

**Step 5 — Final Pose (3500-4500ms):**
- Mascot enters from below with spring physics, plays the `wave` animation
- A dramatic starburst ring pulses behind the mascot (expanding circle of light)
- Speech bubble with one of the transformation catchphrases:
   - "Moon Prism Power... MAKE UP! ✧"
   - "In the name of the gains, I'll punish you!"
   - "Senpai Mode... ACTIVATED! ♡"
   - "This isn't even my final form, Senpai~!"
   - "TRANSFORMATION COMPLETE! ☆"
   - "The pretty guardian of gainz has arrived!"

Build this as `SenpaiTransformation.tsx` — a fullscreen overlay component that renders on top of everything, runs the animation, then unmounts. Only plays on toggle-on, not on app relaunch when already enabled. Track with `transformationPlayed` in SenpaiContext.

### 4. Enhanced SenpaiOverlay (`src/components/SenpaiOverlay.tsx`)

The current overlay is too subtle. Expand it:

**Always-on ambient effects (when Senpai Mode enabled, not just during reactions):**
- Slow-drifting stars in the background (small, low opacity, gentle twinkle) — mix five-pointed stars AND four-pointed sparkle/glint shapes
- Occasional shooting star across the top of the screen (every 15-30 seconds) — with a trailing ribbon effect, not just a dot
- Subtle prismatic shimmer along screen edges (blue→pink→purple gradient opacity pulse) — echoing the transformation's kaleidoscopic effect
- Tiny crescent moon shapes drifting very slowly at extremely low opacity (~0.05) — the crescent moon is Sailor Moon's PRIMARY symbol

**Reaction effects (during sparkleActive):**
- Current hearts, kaomoji, sparkles — keep but amplify
- Add: **starburst rings** that pulse outward from the mascot on cheering/celebrating
- Add: **screen shake** on impressed mood (tiny 2-3px oscillation, 200ms)
- Add: **rainbow trail** that follows the mascot when dragged
- Add: **confetti burst** on celebrating mood — multicolored rectangles tumbling down

**Maximum intensity mode:**
- Everything doubled
- Screen border pulses pink
- Stars become larger and brighter
- Add rotating moon/star icon watermarks at low opacity

### 5. Interaction Animations

Every interactive element should feel magical girl:

**Button taps:** Add a `SenpaiTapEffect` component or hook that, when Senpai Mode is on:
- Spawns a small starburst (3-5 tiny stars + a ring) at the tap location
- Plays the tap sound from the senpai sound theme
- Wrap this in a utility: `useSenpaiTapFeedback()` hook that returns an `onPress` wrapper

**Screen transitions:** The app uses custom transitions defined in `src/navigation/RootNavigator.tsx` (crossfade, push with slide+fade+scale, modal slide-up). When Senpai Mode is active:
- Replace the push transition with a star-wipe or sparkle-dissolve effect
- Add a brief pink flash between screens (50ms, low opacity)
- Play a short chime on navigate

**Tab bar:** Already tinted pink. Additionally when Senpai Mode is on:
- Add a subtle bounce animation to the active tab icon
- Show tiny sparkle particles above the active tab
- Heart icon instead of the normal active indicator dot (if one exists)

**Pull to refresh:** If the app has pull-to-refresh anywhere, replace the spinner with the mascot's `think` animation during loading.

### 6. Sound Expansion (`src/sounds/synth.ts`)

Expand the `senpai` sound theme with magical girl audio character:

```
tap:      Triangle wave, 1200Hz, short staccato (0.06s), slight pitch sweep up
success:  3-note ascending chord (C5+E5+G5 staggered 50ms), sine, 0.3s, shimmer
error:    Descending minor (E5→C5), square wave, 0.15s, comedic "boing"
navigate: Single high chime, 880Hz sine + 1760Hz harmonic, 0.1s
open:     Rising sparkle glissando, 800→1600Hz sweep, triangle, 0.2s
close:    Falling sparkle, 1600→800Hz, triangle, 0.15s
```

Add a new sound event for the transformation sequence: `transform` — ascending arpeggio C5→E5→G5→C6 with 100ms gaps, triangle wave, total ~600ms.

### 7. SenpaiContext Expansion (`src/context/SenpaiContext.tsx`)

Add to state:
- `outfitId: string` — future-proofing for mascot outfit selection (default: `'default'`)
- `transformationPlayed: boolean` — tracks whether the activation sequence has played this session
- `ambientEffects: boolean` — toggle for always-on star/shimmer effects (default: true)

Add to context value:
- `setOutfit: (id: string) => void`
- `markTransformationPlayed: () => void`
- `setAmbientEffects: (on: boolean) => void`

### 8. Workout/Feature Integration Points

Wire `triggerReaction()` calls into these app events. The `SenpaiProvider` is inside other providers, so you must wire these at the SCREEN level using `useSenpai()`:

| Event | Mood | Dialogue Category | Where to Wire |
|-------|------|--------------------|---------------|
| App opens (Senpai already on) | cheering | `appOpen` | Root navigator `onReady` or a mounted effect in `TabNavigator` |
| Workout starts | encouraging | `workoutStart` | Workout timer/tracking screen start handler |
| Workout completes | celebrating | `workoutComplete` | Workout completion screen/modal |
| New personal record | impressed | `newPR` | PR detection logic in workout summary |
| Streak milestone (7, 30, 100 days) | celebrating | `streakMilestone` | Streak display component |
| Level up / XP threshold | celebrating | `levelUp` | Gamification/XP context |
| Achievement unlocked | cheering | `achievement` | Achievement notification handler |
| Nutrition logged | cheering | `nutritionLog` | Nutrition log submit handler |
| GPS activity completed | impressed | `gpsActivity` | Activity tracker completion |
| Meditation completed | encouraging | `meditation` | Meditation timer completion |
| Body scan/measurement | cheering | `bodyLab` | Body measurement save handler |
| Streak broken | disappointed | `streakBroken` | Streak reset detection |
| Morning open (before 10am) | cheering | `morning` | Time-based check on app open |
| Evening open (after 8pm) | encouraging | `evening` | Time-based check on app open |

Use `shouldReact()` before each `triggerReaction()` call — this respects the volume setting (high=always, med=70%, low=30%).

### 9. Senpai Settings UI

Build a settings screen or section (could be a modal or a section within the existing Settings screen at `src/screens/SettingsScreen.tsx`):

- **Enable/Disable toggle** — main Senpai Mode switch
- **Volume** — Low / Med / High segmented control (controls reaction frequency)
- **Sparkle Intensity** — Normal / Maximum toggle
- **Ambient Effects** — on/off toggle for background stars/shimmer
- **Outfit** — grid of outfit options (only "Default" for now, future expansion)
- **Memory Log** — button to view the reaction history screen
- **Clear Memory** — button to wipe the memory log with confirmation

Style this screen with the senpai theme colors: pink accents, rounded corners, kawaii aesthetic. Use heart icons where appropriate.

### 10. Senpai Memory Log Screen

New screen showing the mascot's reaction history from `state.memoryLog`:

- Scrollable list of `MemoryEntry` items (mood, dialogue, timestamp)
- Each entry shows: mood icon/emoji, the dialogue text, and relative time ("2 hours ago")
- Group by day
- Mascot mood icon mapping: idle→😐, cheering→🎉, impressed→😲, encouraging→💪, celebrating→🎊, sleeping→😴, disappointed→😢
- Pink/purple themed card design
- Cap at 100 entries (already enforced in context)

### 11. Tab Bar Enhancement

In `src/navigation/TabNavigator.tsx`, when Senpai Mode is on:
- Active tab tint is already `#FF69B4` — keep
- Add a tiny animated sparkle/star next to the active tab label
- Optionally: replace tab icons with kawaii variants (hearts instead of circles, stars instead of dots). If this is too complex, skip — the color change alone is impactful.

### 12. Explosion/Impact Effects

Create a reusable `SenpaiImpactEffect` component for "big moment" animations:

- **Star explosion:** 8-12 stars burst outward from a point, then fade (used on PR, level up, achievement)
- **Heart shower:** Hearts rain from top of screen for 2 seconds (used on workout complete)
- **Screen flash:** Quick white→pink→transparent flash (used on transformation)
- **Spiral:** Rotating spiral of stars/sparkles converging to a point (used on celebration)

These should be triggered via a new function in SenpaiContext: `triggerImpact(type: 'explosion' | 'hearts' | 'flash' | 'spiral')` or compose them into the existing `triggerReaction()` based on mood.

---

## Implementation Order

1. **Senpai theme definition** in `src/theme/themes.ts` + new particle type in `src/theme/colors.ts` — this alone transforms the entire app visually
2. **Auto-theme switching** bridge component — wires Senpai enable/disable to theme changes
3. **SenpaiContext expansion** — add new state fields and functions
4. **Enhanced SenpaiOverlay** — ambient effects, reaction effects, confetti, starbursts
5. **Transformation sequence** — the activation animation
6. **Sound expansion** — senpai sound palette
7. **Interaction animations** — tap effects, transition overrides, tab enhancements
8. **Integration wiring** — triggerReaction calls at screen level for all events
9. **Settings UI** — senpai settings section
10. **Memory Log screen** — reaction history viewer
11. **Impact effects** — explosion, hearts, flash, spiral components
12. **TypeScript verify** — `npx tsc --noEmit`, fix any type errors
13. **Test on device** — verify animations don't tank performance, especially the particle systems

---

## Technical Constraints

- **Expo SDK 52** — no bare native modules. Use expo-image, expo-av (needs install for native audio), or Web Audio API.
- **expo-image** is used for animated WebP but may NOT be installed yet. Run `npx expo install expo-image` if imports fail.
- **Animated API only** — use React Native's `Animated` (not Reanimated) for consistency with existing code. The entire codebase uses `Animated` from react-native.
- **Performance** — particle systems must use `useNativeDriver: true` for all transform/opacity animations. Limit simultaneous particle count. Use `useMemo` for particle config arrays.
- **No `expo-linear-gradient`** — if gradients are needed, use SVG gradients via `react-native-svg` (check if installed) or solid color approximations.
- **AsyncStorage** — used for all persistence. Keys prefixed with `@zenki_senpai_`.
- **The workspace mount is read-only for deletion** — you cannot `rm` files. Tell the user to manually delete old `.mp4` files from `src/assets/senpai/`.

---

## Existing Mood → Animation Map (in SenpaiMascot.tsx)

```
idle         → senpai_idle.webp
cheering     → senpai_cheering.webp
impressed    → senpai_impressed.webp
encouraging  → senpai_encouraging.webp
celebrating  → senpai_celebrating.webp
sleeping     → senpai_sleep.webp
disappointed → senpai_cry.webp

// Available but not mapped to moods yet:
dance        → senpai_dance.webp
die          → senpai_die.webp
think        → senpai_think.webp
wave         → senpai_wave.webp
```

Uncomment `dance`, `die`, `think`, `wave` in the `ANIM_ASSETS` map in `SenpaiMascot.tsx`. Consider adding new moods or using them for specific events (wave for app open, think for loading states, dance for celebrations, die for comedic streak-break moments).

---

## Aesthetic Reference — What "Sailor Moon Transformation" Means

The transformation sequence follows 5 precise steps: (1) the character shouts "Moon Prism Power, Make Up!" and activates her Transformation Brooch, (2) her body becomes a featureless SHINING SILHOUETTE against a dazzling sparkling BLUE background with kaleidoscopic/prismatic color marbling, (3) swirling ribbons of colored light physically wrap around her body, solidifying into costume pieces (leotard, gloves, boots, skirt) — these ribbons have DIRECTIONALITY, they aren't random particles, (4) the camera pushes in close as tiara, earrings, and choker materialize with individual sparkle effects, (5) the camera pulls back to reveal the completed transformation in a dramatic martial-arts-inspired pose with a starburst background. Duration: ~40 seconds in the anime.

The broader Sailor Moon aesthetic is called "yume kawaii" (dreamy cute) / "mahou shoujo" (magical girl). Key visual vocabulary: crescent moons, planetary symbols, five-pointed stars alongside four-pointed sparkle glints, ribbons and bows, tiaras, circular brooches/compacts, hearts. Colors are dominated by BLUE backgrounds with pink/red, purple, and yellow accents — NOT primarily pink as commonly assumed.

Translate this to a mobile app context:
- The screen should FEEL different the moment Senpai Mode turns on — like the world shifted to a magical dimension
- Colors shift dramatically (dark/neutral → deep cosmic blue + pink/purple glow)
- The dominant background is SPARKLING BLUE (like the transformation scene), not pink — pink is the accent
- Particles are everywhere but don't block content — stars, crescent moons, hearts, sparkle glints
- Ribbon-like flowing effects should appear during reactions (not just point particles)
- Every interaction has sparkle feedback with a tiny starburst
- The mascot is ever-present and reactive
- Sound punctuates key moments — high-pitched chimes, ascending arpeggios, shimmer
- Crescent moon is the single most recognizable motif — use it as a recurring element (icons, particle shapes, decorative accents)
- It should make the user smile (or cringe) — it should NOT be subtle
- The overall mood is: joyful, excessive, kawaii, magical, over-the-top, dreamy

---

## Files to Create/Modify Summary

**Create:**
- `src/components/SenpaiTransformation.tsx` — activation animation sequence
- `src/components/SenpaiImpactEffect.tsx` — reusable explosion/hearts/flash effects
- `src/components/SenpaiThemeBridge.tsx` — auto theme switching component
- `src/screens/SenpaiMemoryScreen.tsx` — reaction history viewer

**Modify:**
- `src/theme/themes.ts` — add senpaiTheme definition
- `src/theme/colors.ts` — add `'moon-sparkle'` to particle union type
- `src/context/SenpaiContext.tsx` — expand state and functions
- `src/components/SenpaiOverlay.tsx` — ambient effects, enhanced reactions
- `src/components/SenpaiMascot.tsx` — uncomment animations, add wave on entry
- `src/data/senpaiDialogue.ts` — add transformation quotes category
- `src/sounds/synth.ts` — expand senpai sound theme
- `src/navigation/TabNavigator.tsx` — sparkle on active tab
- `src/navigation/RootNavigator.tsx` — add SenpaiMemoryScreen route, modify transitions when senpai active
- `src/screens/SettingsScreen.tsx` — add Senpai settings section
- Theme overlay renderer (wherever `'matrix-rain'` particles are implemented) — add `'moon-sparkle'` renderer
- Various feature screens — wire `triggerReaction()` calls

**Do not modify or delete `.mp4` files — tell the user to do it manually.**
