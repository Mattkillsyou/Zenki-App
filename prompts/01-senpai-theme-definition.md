# Prompt 1: Senpai Theme Definition

## Task
Create the `senpaiTheme: ThemeDefinition` in `src/theme/themes.ts` and add the `'moon-sparkle'` particle type to the overlay system.

## Context
Zenki Dojo is a React Native / Expo SDK 52 martial arts gym app at `D:\Zenki\App`. It has a mature theme system with 8 existing themes (system, clean-light, clean-dark, matrix, alien, jurassic, ghost, bladerunner, sheikah). Each theme is a `ThemeDefinition` object containing `colors: ThemeColors` (~60 tokens), `overlay: ThemeOverlayConfig`, `soundTheme`, and optional `webFontUrl`. All themes live in `src/theme/themes.ts` and are registered in `ALL_THEMES[]` and `THEMES_BY_ID{}`.

## Files to Modify

### `src/theme/colors.ts`
Add `'moon-sparkle'` to the `ThemeOverlayConfig.particles` union type (line ~273):
```
particles: 'none' | 'matrix-rain' | 'rain-drops' | 'static-noise' | 'data-streams' | 'dust' | 'dna-helix' | 'sheikah-runes' | 'moon-sparkle';
```

### `src/theme/themes.ts`
Create `senpaiColors: ThemeColors` and `senpaiTheme: ThemeDefinition`. Add to `ALL_THEMES` and `THEMES_BY_ID`.

## Senpai Color Palette (Sailor Moon canonical)

The Sailor Moon aesthetic uses a BLUE cosmic background with pink/red, purple, and yellow accents. The dominant transformation color is sparkling blue, not pink. Pink is the accent.

```typescript
const senpaiColors: ThemeColors = {
  // Backgrounds — deep cosmic blue (night sky, NOT black, NOT purple)
  background: '#0B0D2E',
  backgroundElevated: '#101540',
  backgroundSubtle: '#0E1138',
  surface: 'rgba(40, 30, 120, 0.55)',      // blue-violet glassmorphism
  surfaceHover: 'rgba(60, 45, 150, 0.65)',
  surfaceSecondary: 'rgba(30, 22, 100, 0.45)',
  surfaceTertiary: 'rgba(50, 38, 130, 0.40)',

  // Brand — hot pink is THE Sailor Moon accent
  gold: '#FF2E51',       // hot pink replaces gold as primary accent
  goldLight: '#FF5A7A',
  goldDark: '#CC1A3A',
  goldMuted: 'rgba(255, 46, 81, 0.10)',
  red: '#D260FF',        // purple as secondary accent
  redLight: '#E08AFF',
  redDark: '#9A30CC',
  redMuted: 'rgba(210, 96, 255, 0.08)',

  // Text — soft white-blue
  textPrimary: '#E8E5F8',
  textSecondary: '#9595C0',
  textMuted: '#6060A0',
  textTertiary: '#3A3A70',
  textInverse: '#0B0D2E',

  // Semantic
  success: '#7FFFD4',  successMuted: 'rgba(127,255,212,0.10)',
  error: '#FF6B6B',    errorMuted: 'rgba(255,107,107,0.08)',
  warning: '#FFF666',  warningMuted: 'rgba(255,246,102,0.08)',
  info: '#5158FF',     infoMuted: 'rgba(81,88,255,0.08)',

  // Structure
  border: 'rgba(255, 46, 81, 0.12)',
  borderSubtle: 'rgba(255, 46, 81, 0.06)',
  divider: 'rgba(232, 229, 248, 0.05)',
  overlay: 'rgba(11, 13, 46, 0.90)',
  shadow: 'rgba(255, 46, 81, 0.06)',

  // Navigation
  tabBar: 'rgba(11, 13, 46, 0.95)',
  tabBarBorder: 'rgba(255, 46, 81, 0.10)',
  accentTint: 'rgba(255, 46, 81, 0.05)',

  // Theme metadata
  accent: '#FF2E51',
  accentDim: '#CC1A3A',
  accentDark: '#661020',
  mapTileFilter: 'grayscale(0.5) brightness(0.30) contrast(1.2) hue-rotate(220deg) saturate(2.5)',
  mapRouteColor: '#FF2E51',
  textGlow: '0 0 4px #FF2E51, 0 0 12px rgba(255,46,81,0.3), 0 0 24px rgba(81,88,255,0.15)',
  textGlowSubtle: '0 0 3px rgba(255,46,81,0.35)',
  boxGlow: '0 0 12px rgba(255,46,81,0.18), 0 0 24px rgba(81,88,255,0.08), inset 0 0 8px rgba(210,96,255,0.04)',
  frameGlow: '0 0 60px rgba(255,46,81,0.10), 0 0 120px rgba(81,88,255,0.06), 0 0 2px rgba(255,183,223,0.30)',
  fontFamily: '"Quicksand", "Nunito", "Comic Neue", system-ui, sans-serif',
  fontFamilyNative: 'System',
  uppercaseHeaders: false,
  spinner: '#FF2E51',
  switchTrack: '#FF2E51',
  macroProtein: '#FFB3DF',
  macroCarbs: '#5158FF',
  macroFat: '#FFF666',
  flames: '#FF2E51',
};
```

## Senpai Theme Definition

```typescript
export const senpaiTheme: ThemeDefinition = {
  id: 'senpai',
  name: 'Senpai Mode',
  description: 'Moon Prism Power, Make Up!',
  icon: 'heart-outline',
  isDark: true,
  soundTheme: 'senpai',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap',
  colors: senpaiColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(30, 0, 60, 0.4)',
    particles: 'moon-sparkle',
    particleColor: 'rgba(255, 46, 81, 0.08)',
    particleOpacity: 0.08,
    texture: 'none', textureOpacity: 0,
  },
};
```

Register in `ALL_THEMES` after `sheikahTheme` and add to `THEMES_BY_ID`.

## Moon-Sparkle Particle Renderer
Find where existing particle types like `'matrix-rain'` are rendered (likely a `ThemeOverlay` component). Add a `'moon-sparkle'` renderer that draws a mix of: crescent moons (☽), five-pointed stars (★), sparkle glints (✦), and hearts (♡) — gently floating/twinkling at low opacity in pinks, blues, yellows, and lavenders. NOT raining — drifting slowly with random twinkle fade in/out.

## Verification
- `npx tsc --noEmit` passes
- The senpai theme appears in `ALL_THEMES` and `THEMES_BY_ID`
- No existing themes are broken
