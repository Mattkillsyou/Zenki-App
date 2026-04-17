# ZENKI DOJO — APP-WIDE THEME SYSTEM PROMPT

## ⚠️ ANTI-SIMPLIFICATION DIRECTIVE ⚠️

**DO NOT simplify, stub, or truncate. Every theme must have EVERY color defined. Every overlay effect must be FULLY implemented. Every sound theme must have EVERY event mapped. No "// same as dark" shortcuts. No "// repeat pattern from above." I expect 8 complete, distinct, production-quality theme definitions — each one a visually different experience when applied. Write the full code.**

---

## PROJECT CONTEXT

- **Framework**: Expo 52 + React Native 0.76.3 + React 18.3.1 + TypeScript
- **Location**: `D:\Zenki\App`
- **Current theme system**: `src/context/ThemeContext.tsx` — stores `ThemeMode` ('light'|'dark'|'system') in AsyncStorage, provides `colors: ThemeColors` to all screens via `useTheme()`
- **Current colors**: `src/theme/colors.ts` — defines `ThemeColors` interface (40 semantic color slots), `darkColors`, `lightColors`
- **Current typography**: `src/theme/typography.ts` — defines `typography` record with 10 text styles
- **Current motion**: `src/theme/motion.ts` — easing curves, durations, scale/opacity tokens
- **Current sounds**: `src/sounds/synth.ts` — `SoundTheme` type, `playSynth()`, per-screen themes with procedural Web Audio tones
- **Settings screen**: `src/screens/SettingsScreen.tsx` — currently has Light/Dark/System toggle + sound theme selector
- **App.tsx**: web frame with gold boxShadow, 430px width

**DO NOT scaffold a new project. Work within existing architecture.**

---

## ARCHITECTURE OVERVIEW

### What changes:

1. **`ThemeMode` type** expands from `'light' | 'dark' | 'system'` to include all visual themes
2. **`ThemeColors` interface** gets new fields for theme-specific features (overlays, glows, fonts)
3. **Each theme** defines a complete `ThemeColors` object + metadata (name, icon, font, overlay config, sound theme)
4. **ThemeContext** resolves the active theme → colors + metadata, provides to all screens
5. **Every screen** already uses `useTheme().colors` — so new colors propagate automatically for base styling
6. **Overlay effects** (scanlines, rain, static, particles) are rendered by a new `<ThemeOverlay>` component placed in App.tsx
7. **Settings screen** gets a visual theme picker grid replacing the simple Light/Dark/System toggle
8. **Sounds** get per-theme audio profiles
9. **App.tsx** web frame glow color adapts to active theme

### Theme list (8 total):
1. **System** — follows device light/dark preference (current behavior)
2. **Clean Light** — refined light mode (current `lightColors` with polish)
3. **Clean Dark** — refined dark mode (current `darkColors` with polish)
4. **Matrix** — green terminal rain
5. **Alien** — amber Nostromo computer
6. **Jurassic Park** — Dennis Nedry's UNIX system
7. **Ghost in the Shell** — translucent cyberbrain
8. **Blade Runner** — rain-soaked neon noir

---

## PHASE 1: EXPAND TYPE SYSTEM

### File: `src/theme/colors.ts` — MODIFY

**Expand `ThemeColors` interface** to add theme-specific metadata fields. Keep all existing 40 color fields. Add:

```typescript
export interface ThemeColors {
  // === EXISTING 40 FIELDS (keep all of them unchanged) ===
  background: string;
  backgroundElevated: string;
  backgroundSubtle: string;
  surface: string;
  surfaceHover: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  gold: string;
  goldLight: string;
  goldDark: string;
  goldMuted: string;
  red: string;
  redLight: string;
  redDark: string;
  redMuted: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  textInverse: string;
  success: string;
  successMuted: string;
  error: string;
  errorMuted: string;
  warning: string;
  warningMuted: string;
  info: string;
  infoMuted: string;
  border: string;
  borderSubtle: string;
  divider: string;
  overlay: string;
  shadow: string;
  tabBar: string;
  tabBarBorder: string;
  accentTint: string;

  // === NEW THEME METADATA FIELDS ===
  /** Primary accent color for this theme (replaces gold in themed contexts) */
  accent: string;
  accentDim: string;
  accentDark: string;

  /** Map tile CSS filter (web only) — applied to .leaflet-tile-pane */
  mapTileFilter: string;

  /** Route polyline color on map */
  mapRouteColor: string;

  /** Glow/bloom CSS text-shadow (web only) — empty string for no glow */
  textGlow: string;
  textGlowSubtle: string;

  /** Box glow CSS box-shadow (web only) */
  boxGlow: string;

  /** Web frame glow for App.tsx outer container */
  frameGlow: string;

  /** Font family override — empty string means use system default */
  fontFamily: string;

  /** Font family for native (React Native fontFamily prop) */
  fontFamilyNative: string;

  /** Whether headers should be forced UPPERCASE */
  uppercaseHeaders: boolean;

  /** Loading spinner color */
  spinner: string;

  /** Switch track active color */
  switchTrack: string;
}
```

**Add new `ThemeOverlayConfig` interface** (separate from colors):

```typescript
export interface ThemeOverlayConfig {
  /** CRT scanline overlay */
  scanlines: boolean;
  scanlineColor: string;
  scanlineOpacity: number;

  /** Screen flicker animation */
  flicker: boolean;
  flickerIntensity: number;     // min opacity (e.g., 0.97 means flickers between 0.97–1.0)

  /** Vignette darkening at edges */
  vignette: boolean;
  vignetteColor: string;

  /** Animated particle/effect overlay */
  particles: 'none' | 'matrix-rain' | 'rain-drops' | 'static-noise' | 'dna-helix' | 'data-streams' | 'dust';
  particleColor: string;
  particleOpacity: number;

  /** Background texture */
  texture: 'none' | 'noise' | 'grid' | 'paper' | 'hex';
  textureOpacity: number;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;            // Ionicons name
  isDark: boolean;
  colors: ThemeColors;
  overlay: ThemeOverlayConfig;
  soundTheme: string;      // maps to SoundTheme in synth.ts
  webFontUrl?: string;     // Google Fonts CSS URL to inject
}
```

### Now define ALL 8 themes:

---

### THEME 1: `system`
```
id: 'system'
name: 'System'
description: 'Follows your device preference'
icon: 'phone-portrait-outline'
isDark: (resolves at runtime from device scheme)
colors: (resolves to cleanDark or cleanLight based on device)
overlay: all disabled (no scanlines, no flicker, no particles)
soundTheme: 'default'
```
No new color object needed — resolves to cleanLight or cleanDark at runtime.

---

### THEME 2: `clean-light`
```
id: 'clean-light'
name: 'Clean Light'
description: 'Minimal and bright'
icon: 'sunny-outline'
isDark: false
soundTheme: 'default'
```

Colors: **Use existing `lightColors`** with the new fields added:
```typescript
accent: '#B8890F',
accentDim: '#8A6A0A',
accentDark: '#5C4607',
mapTileFilter: '',                          // no filter — default tiles
mapRouteColor: '#B8890F',                   // gold route
textGlow: '',                               // no glow
textGlowSubtle: '',
boxGlow: '',
frameGlow: '0 0 80px rgba(184, 137, 15, 0.06), 0 0 0 1px rgba(0,0,0,0.08)',
fontFamily: '',                             // system font
fontFamilyNative: 'System',
uppercaseHeaders: false,
spinner: '#B8890F',
switchTrack: '#B8890F',
```

Overlay: all `false` / `'none'`.

---

### THEME 3: `clean-dark`
```
id: 'clean-dark'
name: 'Clean Dark'
description: 'Premium dark mode'
icon: 'moon-outline'
isDark: true
soundTheme: 'default'
```

Colors: **Use existing `darkColors`** with new fields:
```typescript
accent: '#D4A017',
accentDim: '#B8890F',
accentDark: '#8A6A0A',
mapTileFilter: '',                          // dark tiles already look good
mapRouteColor: '#D4A017',
textGlow: '',
textGlowSubtle: '',
boxGlow: '',
frameGlow: '0 0 80px rgba(212, 160, 23, 0.06), 0 0 0 1px rgba(255,255,255,0.08)',
fontFamily: '',
fontFamilyNative: 'System',
uppercaseHeaders: false,
spinner: '#D4A017',
switchTrack: '#D4A017',
```

Overlay: all `false` / `'none'`.

---

### THEME 4: `matrix`
```
id: 'matrix'
name: 'The Matrix'
description: 'Welcome to the real world'
icon: 'code-slash-outline'
isDark: true
soundTheme: 'matrix'
webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap'
```

Colors:
```typescript
background: '#000000',
backgroundElevated: '#0a120a',
backgroundSubtle: '#050a05',
surface: '#0d1a0d',
surfaceHover: '#1a2e1a',
surfaceSecondary: '#112211',
surfaceTertiary: '#1a331a',

gold: '#00ff41',                  // accent IS green in this theme
goldLight: '#33ff66',
goldDark: '#00aa2a',
goldMuted: 'rgba(0, 255, 65, 0.10)',
red: '#00ff41',                   // even "red" is green — monochrome
redLight: '#33ff66',
redDark: '#007a1e',
redMuted: 'rgba(0, 255, 65, 0.08)',

textPrimary: '#00ff41',
textSecondary: '#00cc33',
textMuted: '#007a1e',
textTertiary: '#003b00',
textInverse: '#000000',

success: '#00ff41',
successMuted: 'rgba(0, 255, 65, 0.12)',
error: '#00ff41',                 // errors still green — indicated by blinking, not color
errorMuted: 'rgba(0, 255, 65, 0.08)',
warning: '#33ff00',
warningMuted: 'rgba(51, 255, 0, 0.10)',
info: '#00cc33',
infoMuted: 'rgba(0, 204, 51, 0.10)',

border: '#004d00',
borderSubtle: '#002200',
divider: '#003300',
overlay: 'rgba(0, 0, 0, 0.85)',
shadow: 'rgba(0, 255, 65, 0.1)',

tabBar: '#050a05',
tabBarBorder: '#003300',

accentTint: 'rgba(0, 255, 65, 0.06)',

accent: '#00ff41',
accentDim: '#00cc33',
accentDark: '#003b00',

mapTileFilter: 'grayscale(1) brightness(0.35) sepia(1) hue-rotate(70deg) saturate(6)',
mapRouteColor: '#00ff41',
textGlow: '0 0 4px #00ff41, 0 0 8px #00ff41, 0 0 16px #003b00',
textGlowSubtle: '0 0 2px #00ff41, 0 0 4px #003b00',
boxGlow: '0 0 8px rgba(0,255,65,0.2), inset 0 0 4px rgba(0,255,65,0.03)',
frameGlow: '0 0 60px rgba(0,255,65,0.08), 0 0 120px rgba(0,255,65,0.04), 0 0 1px rgba(0,255,65,0.3)',
fontFamily: '"VT323", "Share Tech Mono", "Courier New", monospace',
fontFamilyNative: 'Courier',
uppercaseHeaders: true,
spinner: '#00ff41',
switchTrack: '#00ff41',
```

Overlay:
```typescript
scanlines: true,
scanlineColor: 'rgba(0, 255, 65, 0.03)',
scanlineOpacity: 0.03,
flicker: true,
flickerIntensity: 0.97,
vignette: true,
vignetteColor: 'rgba(0, 0, 0, 0.6)',
particles: 'matrix-rain',           // falling green characters
particleColor: '#00ff41',
particleOpacity: 0.07,
texture: 'none',
textureOpacity: 0,
```

---

### THEME 5: `alien`
```
id: 'alien'
name: 'Nostromo'
description: 'MU/TH/UR 6000 interface'
icon: 'warning-outline'
isDark: true
soundTheme: 'alien'
webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap'
```

**Visual language**: Amber/orange monochrome CRT. Think the MU/TH/UR 6000 Mother computer from Alien (1979). All text amber on black. Blocky. Command-line feel. `>` prompt prefixes. Slow, deliberate. Status readouts: `SYSTEM......OK`. Warning states flash amber-to-black. Claustrophobic.

Colors:
```typescript
background: '#000000',
backgroundElevated: '#0f0a00',
backgroundSubtle: '#0a0700',
surface: '#1a1200',
surfaceHover: '#2e2200',
surfaceSecondary: '#221800',
surfaceTertiary: '#332400',

gold: '#FF8C00',                  // amber IS the accent
goldLight: '#FFa500',
goldDark: '#AA5500',
goldMuted: 'rgba(255, 140, 0, 0.10)',
red: '#FF8C00',                   // monochrome — "red" is amber
redLight: '#FFa500',
redDark: '#885000',
redMuted: 'rgba(255, 140, 0, 0.08)',

textPrimary: '#FF8C00',           // bright amber
textSecondary: '#CC7000',         // dim amber
textMuted: '#885000',             // dark amber
textTertiary: '#442800',          // barely visible
textInverse: '#000000',

success: '#FF8C00',
successMuted: 'rgba(255, 140, 0, 0.12)',
error: '#FF8C00',
errorMuted: 'rgba(255, 140, 0, 0.08)',
warning: '#FFa500',
warningMuted: 'rgba(255, 165, 0, 0.10)',
info: '#CC7000',
infoMuted: 'rgba(204, 112, 0, 0.10)',

border: '#663800',
borderSubtle: '#331C00',
divider: '#442400',
overlay: 'rgba(0, 0, 0, 0.85)',
shadow: 'rgba(255, 140, 0, 0.08)',

tabBar: '#0a0700',
tabBarBorder: '#442400',

accentTint: 'rgba(255, 140, 0, 0.05)',

accent: '#FF8C00',
accentDim: '#CC7000',
accentDark: '#442800',

mapTileFilter: 'grayscale(1) brightness(0.35) sepia(1) hue-rotate(-10deg) saturate(5)',
mapRouteColor: '#FF8C00',
textGlow: '0 0 4px #FF8C00, 0 0 8px #FF8C00, 0 0 16px #663800',
textGlowSubtle: '0 0 2px #FF8C00, 0 0 4px #663800',
boxGlow: '0 0 8px rgba(255,140,0,0.2), inset 0 0 4px rgba(255,140,0,0.03)',
frameGlow: '0 0 60px rgba(255,140,0,0.08), 0 0 120px rgba(255,140,0,0.04), 0 0 1px rgba(255,140,0,0.3)',
fontFamily: '"Share Tech Mono", "VT323", "Courier New", monospace',
fontFamilyNative: 'Courier',
uppercaseHeaders: true,
spinner: '#FF8C00',
switchTrack: '#FF8C00',
```

Overlay:
```typescript
scanlines: true,
scanlineColor: 'rgba(255, 140, 0, 0.03)',
scanlineOpacity: 0.03,
flicker: true,
flickerIntensity: 0.96,                    // heavier flicker than Matrix — older CRT
vignette: true,
vignetteColor: 'rgba(0, 0, 0, 0.7)',
particles: 'static-noise',                 // subtle CRT static
particleColor: '#FF8C00',
particleOpacity: 0.02,
texture: 'noise',                          // film grain texture
textureOpacity: 0.03,
```

---

### THEME 6: `jurassic`
```
id: 'jurassic'
name: 'Jurassic Park'
description: "Ah ah ah, you didn't say the magic word"
icon: 'bug-outline'
isDark: true
soundTheme: 'jurassic'
webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500&display=swap'
```

**Visual language**: Dennis Nedry's Silicon Graphics IRIX workstation. Cream/white text on deep navy-blue (#000033) background. System readouts in bright cyan (#00FFFF). Red warnings. Green success confirmations. NOT monochrome — this one uses color but in a retro UNIX terminal way. File browser grid feel. Big blocky buttons. `ACCESS MAIN SECURITY GRID` style labels. The famous "Ah ah ah, you didn't say the magic word" popup style error dialogs. Jurassic Park logo amber (#FFB800) as accent.

Colors:
```typescript
background: '#000820',             // deep navy — SGI workstation dark
backgroundElevated: '#001030',
backgroundSubtle: '#000c28',
surface: '#001440',
surfaceHover: '#002060',
surfaceSecondary: '#001a50',
surfaceTertiary: '#002060',

gold: '#FFB800',                   // Jurassic Park logo amber
goldLight: '#FFCC33',
goldDark: '#CC9200',
goldMuted: 'rgba(255, 184, 0, 0.10)',
red: '#FF3333',                    // Nedry's warning red
redLight: '#FF5555',
redDark: '#CC0000',
redMuted: 'rgba(255, 51, 51, 0.10)',

textPrimary: '#E0E8FF',           // cool white with blue tint
textSecondary: '#8899BB',
textMuted: '#556688',
textTertiary: '#334466',
textInverse: '#000820',

success: '#33FF66',               // retro green confirmation
successMuted: 'rgba(51, 255, 102, 0.12)',
error: '#FF3333',                 // actual red — this theme USES color
errorMuted: 'rgba(255, 51, 51, 0.10)',
warning: '#FFB800',
warningMuted: 'rgba(255, 184, 0, 0.10)',
info: '#00CCFF',                  // bright cyan — IRIX terminal
infoMuted: 'rgba(0, 204, 255, 0.10)',

border: '#003366',
borderSubtle: '#001a44',
divider: '#002244',
overlay: 'rgba(0, 8, 32, 0.85)',
shadow: 'rgba(0, 0, 0, 0.4)',

tabBar: '#000c28',
tabBarBorder: '#003366',

accentTint: 'rgba(255, 184, 0, 0.06)',

accent: '#FFB800',
accentDim: '#CC9200',
accentDark: '#664900',

mapTileFilter: 'grayscale(0.5) brightness(0.5) contrast(1.2) hue-rotate(200deg) saturate(2)',
mapRouteColor: '#00CCFF',                  // cyan route
textGlow: '0 0 4px rgba(0, 204, 255, 0.4), 0 0 8px rgba(0, 204, 255, 0.2)',
textGlowSubtle: '0 0 2px rgba(0, 204, 255, 0.3)',
boxGlow: '0 0 6px rgba(0, 204, 255, 0.15)',
frameGlow: '0 0 60px rgba(0, 204, 255, 0.06), 0 0 1px rgba(0, 204, 255, 0.2)',
fontFamily: '"IBM Plex Mono", "VT323", "Courier New", monospace',
fontFamilyNative: 'Courier',
uppercaseHeaders: true,
spinner: '#00CCFF',
switchTrack: '#FFB800',
```

Overlay:
```typescript
scanlines: true,
scanlineColor: 'rgba(0, 204, 255, 0.02)',
scanlineOpacity: 0.02,
flicker: false,                              // SGI monitors don't flicker like CRTs
vignette: true,
vignetteColor: 'rgba(0, 0, 20, 0.4)',
particles: 'none',
particleColor: '',
particleOpacity: 0,
texture: 'grid',                             // subtle grid lines like IRIX file browser
textureOpacity: 0.03,
```

**Special UI behavior for this theme** (implement in ThemeOverlay or screen-level):
- Error dialogs show "Ah ah ah! You didn't say the magic word!" animated text (looping vertically like the movie) as an optional easter egg on the error Alert replacement.
- Loading states show `ACCESS: MAIN PROGRAM GRID` → `ACCESSING...` text sequence.

---

### THEME 7: `ghost`
```
id: 'ghost'
name: 'Ghost in the Shell'
description: 'Your ghost whispers to me'
icon: 'eye-outline'
isDark: true
soundTheme: 'ghost'
webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600&family=Orbitron:wght@400;500&display=swap'
```

**Visual language**: Translucent holographic panels floating in dark space. Deep indigo/purple (#0D0221) background. Lavender (#C8B8DB) text. Cyan (#00F0FF) data highlights. Semi-transparent surfaces with glassmorphism blur. Thermoptic shimmer on transitions. Japanese characters as decorative watermarks. Data visualization aesthetic — everything looks like a heads-up display projected onto glass. Thin, elegant, futuristic.

Colors:
```typescript
background: '#0D0221',             // deep indigo void
backgroundElevated: '#160433',
backgroundSubtle: '#110328',
surface: 'rgba(30, 10, 60, 0.7)', // translucent — glassmorphism
surfaceHover: 'rgba(40, 15, 80, 0.8)',
surfaceSecondary: 'rgba(25, 8, 50, 0.6)',
surfaceTertiary: 'rgba(35, 12, 70, 0.5)',

gold: '#00F0FF',                   // cyan replaces gold
goldLight: '#66F7FF',
goldDark: '#0099AA',
goldMuted: 'rgba(0, 240, 255, 0.08)',
red: '#FF4081',                    // pink-magenta for danger
redLight: '#FF80AB',
redDark: '#C51162',
redMuted: 'rgba(255, 64, 129, 0.08)',

textPrimary: '#C8B8DB',           // soft lavender
textSecondary: '#8B7BA3',
textMuted: '#5C4D73',
textTertiary: '#3A2D4D',
textInverse: '#0D0221',

success: '#00E5A0',               // teal-green
successMuted: 'rgba(0, 229, 160, 0.10)',
error: '#FF4081',
errorMuted: 'rgba(255, 64, 129, 0.08)',
warning: '#FFD740',
warningMuted: 'rgba(255, 215, 64, 0.08)',
info: '#00F0FF',
infoMuted: 'rgba(0, 240, 255, 0.08)',

border: 'rgba(0, 240, 255, 0.12)',
borderSubtle: 'rgba(0, 240, 255, 0.06)',
divider: 'rgba(200, 184, 219, 0.08)',
overlay: 'rgba(13, 2, 33, 0.85)',
shadow: 'rgba(0, 240, 255, 0.08)',

tabBar: 'rgba(13, 2, 33, 0.9)',
tabBarBorder: 'rgba(0, 240, 255, 0.1)',

accentTint: 'rgba(0, 240, 255, 0.04)',

accent: '#00F0FF',
accentDim: '#0099AA',
accentDark: '#005566',

mapTileFilter: 'grayscale(0.8) brightness(0.3) contrast(1.3) hue-rotate(260deg) saturate(3)',
mapRouteColor: '#00F0FF',
textGlow: '0 0 4px rgba(0, 240, 255, 0.4), 0 0 12px rgba(0, 240, 255, 0.15)',
textGlowSubtle: '0 0 2px rgba(0, 240, 255, 0.3)',
boxGlow: '0 0 12px rgba(0, 240, 255, 0.12), inset 0 0 12px rgba(0, 240, 255, 0.03)',
frameGlow: '0 0 80px rgba(0, 240, 255, 0.06), 0 0 1px rgba(0, 240, 255, 0.2)',
fontFamily: '"Rajdhani", "Orbitron", system-ui, sans-serif',
fontFamilyNative: 'System',
uppercaseHeaders: false,
spinner: '#00F0FF',
switchTrack: '#00F0FF',
```

Overlay:
```typescript
scanlines: false,
scanlineColor: '',
scanlineOpacity: 0,
flicker: false,
flickerIntensity: 1,
vignette: true,
vignetteColor: 'rgba(13, 2, 33, 0.5)',
particles: 'data-streams',                   // floating translucent data fragments (Japanese chars, hex values) drifting slowly upward
particleColor: 'rgba(0, 240, 255, 0.08)',
particleOpacity: 0.08,
texture: 'hex',                               // faint hexagonal grid pattern
textureOpacity: 0.02,
```

**Special UI behavior**:
- On web: surfaces get `backdrop-filter: blur(12px)` for glassmorphism effect
- Borders are semi-transparent cyan, creating a holographic panel look
- Tab bar slightly translucent — content scrolls behind it

---

### THEME 8: `bladerunner`
```
id: 'bladerunner'
name: 'Blade Runner'
description: "I've seen things you people wouldn't believe"
icon: 'rainy-outline'
isDark: true
soundTheme: 'bladerunner'
webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600&family=Orbitron:wght@400;500&display=swap'
```

**Visual language**: Rain-soaked neon noir. Deep teal-black (#001B24) background. Warm orange (#FF6F3C) as primary accent — neon signs reflecting off wet streets. Cool blue-white (#C5D8E8) text. Contrast between warm neon and cold rain. Moody. Condensation texture on glass surfaces. Esper machine enhance-zoom aesthetic on images/data. Film grain. Atmospheric.

Colors:
```typescript
background: '#001B24',             // deep teal-black — rainy night sky
backgroundElevated: '#002530',
backgroundSubtle: '#001F28',
surface: '#003040',
surfaceHover: '#004050',
surfaceSecondary: '#002838',
surfaceTertiary: '#003848',

gold: '#FF6F3C',                   // neon orange — the hero accent
goldLight: '#FF9966',
goldDark: '#CC4A1A',
goldMuted: 'rgba(255, 111, 60, 0.10)',
red: '#FF3D3D',                    // danger red
redLight: '#FF6666',
redDark: '#CC1A1A',
redMuted: 'rgba(255, 61, 61, 0.08)',

textPrimary: '#C5D8E8',           // cool blue-white — like neon on wet pavement
textSecondary: '#7A97AB',
textMuted: '#4A6678',
textTertiary: '#2C4050',
textInverse: '#001B24',

success: '#00CC88',
successMuted: 'rgba(0, 204, 136, 0.10)',
error: '#FF3D3D',
errorMuted: 'rgba(255, 61, 61, 0.08)',
warning: '#FFB347',
warningMuted: 'rgba(255, 179, 71, 0.08)',
info: '#4DC9F6',
infoMuted: 'rgba(77, 201, 246, 0.08)',

border: 'rgba(255, 111, 60, 0.15)',
borderSubtle: 'rgba(255, 111, 60, 0.07)',
divider: 'rgba(197, 216, 232, 0.06)',
overlay: 'rgba(0, 27, 36, 0.85)',
shadow: 'rgba(0, 0, 0, 0.4)',

tabBar: '#001820',
tabBarBorder: 'rgba(255, 111, 60, 0.12)',

accentTint: 'rgba(255, 111, 60, 0.05)',

accent: '#FF6F3C',
accentDim: '#CC4A1A',
accentDark: '#662510',

mapTileFilter: 'grayscale(0.6) brightness(0.35) contrast(1.3) sepia(0.3) hue-rotate(170deg) saturate(2.5)',
mapRouteColor: '#FF6F3C',
textGlow: '0 0 4px rgba(255, 111, 60, 0.4), 0 0 10px rgba(255, 111, 60, 0.15)',
textGlowSubtle: '0 0 2px rgba(255, 111, 60, 0.3)',
boxGlow: '0 0 10px rgba(255, 111, 60, 0.12), inset 0 0 6px rgba(255, 111, 60, 0.03)',
frameGlow: '0 0 60px rgba(255, 111, 60, 0.08), 0 0 120px rgba(255, 111, 60, 0.03), 0 0 1px rgba(255, 111, 60, 0.2)',
fontFamily: '"Rajdhani", "Orbitron", system-ui, sans-serif',
fontFamilyNative: 'System',
uppercaseHeaders: false,
spinner: '#FF6F3C',
switchTrack: '#FF6F3C',
```

Overlay:
```typescript
scanlines: false,
scanlineColor: '',
scanlineOpacity: 0,
flicker: false,
flickerIntensity: 1,
vignette: true,
vignetteColor: 'rgba(0, 15, 20, 0.6)',
particles: 'rain-drops',                     // vertical rain streaks falling down screen
particleColor: 'rgba(150, 200, 230, 0.15)',
particleOpacity: 0.15,
texture: 'noise',                             // film grain
textureOpacity: 0.04,
```

---

## PHASE 2: THEME CONTEXT REWRITE

### File: `src/context/ThemeContext.tsx` — REWRITE

Expand `ThemeMode` to:
```typescript
export type ThemeMode =
  | 'system'
  | 'clean-light'
  | 'clean-dark'
  | 'matrix'
  | 'alien'
  | 'jurassic'
  | 'ghost'
  | 'bladerunner';
```

Expand context value:
```typescript
interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  overlay: ThemeOverlayConfig;
  theme: ThemeDefinition;          // full theme object
  setMode: (mode: ThemeMode) => void;
}
```

**Resolution logic:**
- `'system'` → check `useColorScheme()`: light → `cleanLightTheme`, dark → `cleanDarkTheme`
- All other modes → look up in `THEMES` map by id

Import all 7 `ThemeDefinition` objects from a new file `src/theme/themes.ts`.

The provider must:
1. Load saved mode from AsyncStorage on mount
2. Resolve to correct `ThemeDefinition`
3. Inject web font `<link>` tag if `theme.webFontUrl` is defined (web only, via useEffect)
4. Provide `colors`, `overlay`, and full `theme` to consumers

---

## PHASE 3: THEME OVERLAY COMPONENT

### File: `src/components/ThemeOverlay.tsx` (NEW — expect ~400 lines)

Reads `useTheme().overlay` and renders the appropriate effects.

**Place this component in App.tsx**, absolutely positioned over the entire app content, with `pointerEvents: 'none'`.

**Must implement ALL particle types:**

#### `matrix-rain`
- Canvas-based (web) or Animated (native) falling green characters
- Characters: mix of katakana (ア-ン), latin, numbers
- 20-30 columns, each falling at different speeds
- Characters change randomly as they fall
- Trail fade: bright at head, fading behind
- Render at `particleOpacity` (very low — background effect, not foreground)

#### `rain-drops`
- Thin vertical lines falling down screen
- Random x positions, varying lengths (20-60px), varying speeds
- Slight wind angle (2-5 degrees from vertical)
- 40-60 drops visible at once
- Subtle splash at bottom edge (optional)

#### `static-noise`
- Animated SVG `<feTurbulence>` filter
- Slowly shifting `baseFrequency` over time
- Very low opacity — barely perceptible CRT static

#### `data-streams`
- Slowly floating text fragments drifting upward
- Content: random hex values (`0x4F2A`), Japanese characters (攻殻機動隊), binary strings
- Translucent, varying sizes, varying speeds
- Fade in at bottom, fade out at top

#### `dust`
- Tiny particles floating in brownian motion
- For paper/parchment themes (not currently used but good to have)

#### `dna-helix`
- Reserved for future bio/health theme
- Rotating double helix made of dots

**Scanline overlay**: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${scanlineColor} 2px, ${scanlineColor} 4px)`

**Flicker wrapper**: CSS animation on parent container, keyframes with irregular opacity dips

**Vignette**: `radial-gradient(ellipse at center, transparent 50%, ${vignetteColor} 100%)`

**Texture overlays**:
- `noise`: SVG `<feTurbulence>` + `<feColorMatrix>`
- `grid`: CSS `repeating-linear-gradient` forming a faint grid
- `hex`: SVG hexagon pattern (tiled)
- `paper`: off-white noise texture with slight yellowing

---

## PHASE 4: SOUND THEMES

### File: `src/sounds/synth.ts` — ADD 4 new theme functions

Add to `SoundTheme` type:
```typescript
export type SoundTheme =
  | 'home' | 'schedule' | 'store' | 'drinks' | 'community' | 'profile' | 'settings' | 'default'
  | 'matrix' | 'alien' | 'jurassic' | 'ghost' | 'bladerunner';
```

Add cases to `playSynth` switch + implement each:

#### `matrixSound(ctx, event)`
- `tap`: Geiger-counter click — 2000Hz square, 20ms, gain 0.05
- `success`: digital chirp — 800→1200Hz sine, 150ms
- `error`: glitch buzz — 300→100Hz sawtooth, 200ms, harsh
- `navigate`: soft data whoosh — 600→1200Hz sine, 100ms, low gain
- `open`: descending matrix tone — 1000→400Hz, 200ms
- `close`: ascending — 400→1000Hz, 150ms

#### `alienSound(ctx, event)`
- `tap`: heavy mechanical click — 400Hz square, 40ms, gain 0.08 (like a relay switch)
- `success`: MU/TH/UR confirmation — two-tone beep 600Hz then 800Hz, 100ms each
- `error`: alarm klaxon — 200Hz sawtooth, 300ms, pulsing gain (gain ramps up/down 3x)
- `navigate`: airlock hiss — white noise burst filtered through bandpass, 150ms
- `open`: hydraulic door — low rumble 80Hz→40Hz, 300ms
- `close`: same reversed

#### `jurassicSound(ctx, event)`
- `tap`: keyboard clack — 3000Hz square, 15ms, sharp attack (old mechanical keyboard)
- `success`: system confirm — 880Hz→1760Hz sine, two quick notes
- `error`: access denied buzzer — 220Hz square, 400ms, harsh (Nedry's terminal)
- `navigate`: IRIX window chime — 1046Hz sine, 80ms, soft
- `open`: disk drive whir — 200Hz sawtooth with rapid detune sweep, 200ms
- `close`: soft click — 1500Hz, 10ms

#### `ghostSound(ctx, event)`
- `tap`: ethereal ping — 1400Hz sine, 100ms, very low gain (0.04), long release (200ms) for reverb feel
- `success`: ascending crystalline — 880→1320→1760Hz sine, 80ms each, overlapping, very quiet
- `error`: digital distortion — 150Hz sawtooth, 100ms, with 50Hz sub-harmonic
- `navigate`: holographic swipe — 2000→800Hz sine, 120ms, with slight detune chorus (+5/-5 cents)
- `open`: data unfold — 3 ascending tones 600→900→1200, 60ms each, triangle wave
- `close`: fold — reverse of open

#### `bladerunnerSound(ctx, event)`
- `tap`: rain drop — 2500Hz sine, 30ms, sweep down to 1200Hz, gain 0.06
- `success`: Vangelis-style pad — 440Hz + 554Hz + 659Hz sine chord, 300ms, slow attack (100ms), long release
- `error`: bass warning — 110Hz triangle, 200ms, with 220Hz harmonic
- `navigate`: neon hum — 330Hz sawtooth, 80ms, filtered (low gain 0.04)
- `open`: synth swell — 220→440Hz sine, 250ms, slow attack
- `close`: descending — 440→220Hz, 200ms

---

## PHASE 5: SETTINGS SCREEN THEME PICKER

### File: `src/screens/SettingsScreen.tsx` — MODIFY

**Replace** the current 3-button Light/Dark/System toggle with a visual theme picker grid.

#### Layout:
```
VISUAL THEME

┌──────────┐  ┌──────────┐  ┌──────────┐
│  ⬛⬛⬛  │  │  ☀️     │  │  🌙     │
│  System  │  │  Light   │  │  Dark    │
└──────────┘  └──────────┘  └──────────┘
┌──────────┐  ┌──────────┐  ┌──────────┐
│  ░░░░░░  │  │  ▓▓▓▓▓▓  │  │  ██████  │
│  Matrix  │  │ Nostromo │  │ Jurassic │
└──────────┘  └──────────┘  └──────────┘
┌──────────┐  ┌──────────┐
│  ◇◇◇◇◇◇  │  │  ╌╌╌╌╌╌  │
│  Ghost   │  │  Blade   │
│ in Shell │  │  Runner  │
└──────────┘  └──────────┘
```

Each card:
- **120×90px** touchable area
- **Color swatch**: 4 small circles showing the theme's key colors (background, accent, text, surface)
- **Theme name** below swatch
- **Active indicator**: accent-colored 2px border + checkmark icon
- **Description** (small text below name): the `description` from `ThemeDefinition`
- Tap → `setMode(theme.id)`, plays `tap` sound
- **Animated transition**: when switching themes, crossfade the entire app (200ms opacity transition)

Move the old sound theme selector below the visual theme picker. The sound theme should auto-set when a visual theme is selected (since each `ThemeDefinition` has a `soundTheme` field), but allow manual override.

---

## PHASE 6: App.tsx UPDATES

### File: `App.tsx` — MODIFY

1. **Add `<ThemeOverlay />`** as the last child inside the providers, absolutely positioned above everything:
```tsx
<ThemeProvider>
  {/* ... all other providers ... */}
  <AppContent />
  <ThemeOverlay />    {/* NEW — renders scanlines, particles, vignette, etc. */}
</ThemeProvider>
```

2. **Web frame** — read `theme.colors.frameGlow` for the `boxShadow` value instead of hardcoded gold:
```typescript
const { colors } = useTheme();
// in phoneFrame style:
boxShadow: colors.frameGlow,
border: `1px solid ${colors.borderSubtle}`,
```

3. **Loading spinner** — use `colors.spinner` instead of `palette.gold`

4. **Navigation theme** — update `navTheme.colors.primary` to use `colors.accent` instead of `colors.gold`

---

## PHASE 7: APP-WIDE COLOR MIGRATION

**This is critical.** Every screen currently references `colors.gold` as the primary accent. With the new theme system, `colors.gold` IS remapped per-theme (Matrix: green, Alien: amber, etc.), so most screens will automatically adapt. But verify:

### Screens to audit:
- Any screen using hardcoded hex colors (search for `'#D4A017'`, `'#E8B828'`, `'#3B82F6'`, `'#C41E2A'` etc.) — replace with `colors.*` references
- `ActivityTrackerScreen.tsx` — polyline color: use `colors.mapRouteColor` instead of hardcoded
- `ActivityTrackerScreen.tsx` — marker: use `colors.accent` for crosshair color
- `ActivityTrackerScreen.tsx` — tile filter: use `colors.mapTileFilter`
- Any `<Switch>` — use `colors.switchTrack` for `trackColor.true`
- `LineChart.tsx` — if it uses hardcoded colors, make them theme-aware

### Web font application:
On web, when `colors.fontFamily` is non-empty, inject a global `<style>` tag:
```css
body, * { font-family: ${colors.fontFamily} !important; }
```
This forces ALL text to use the theme font without modifying every component.

For native: each screen's root `<Text>` style should check `colors.fontFamilyNative` and apply if not 'System'.

### Uppercase headers:
When `colors.uppercaseHeaders` is true, all `typography.pageTitle`, `typography.sectionTitle`, `typography.label` text should render with `textTransform: 'uppercase'`. Apply this at the `SectionHeader` and page title level.

### Text glow:
On web, when `colors.textGlow` is non-empty, inject:
```css
h1, h2, h3, .section-title { text-shadow: ${colors.textGlow}; }
```
Or apply per-component using `Platform.OS === 'web'` conditional styles.

---

## FILES SUMMARY

### CREATE (3 new files):
1. `src/theme/themes.ts` — all 7 `ThemeDefinition` objects (system resolves at runtime)
2. `src/components/ThemeOverlay.tsx` — particle/scanline/vignette/texture renderer
3. (ThemeOverlay handles all overlay rendering — no other new files needed)

### MODIFY (6 files):
1. `src/theme/colors.ts` — expand `ThemeColors` interface, add `ThemeOverlayConfig` + `ThemeDefinition`
2. `src/context/ThemeContext.tsx` — rewrite for expanded `ThemeMode`, provide overlay config
3. `src/screens/SettingsScreen.tsx` — visual theme picker grid
4. `src/sounds/synth.ts` — 5 new sound themes (matrix, alien, jurassic, ghost, bladerunner)
5. `App.tsx` — add ThemeOverlay, dynamic frame glow, dynamic nav theme
6. `src/screens/ActivityTrackerScreen.tsx` — use `colors.mapRouteColor`, `colors.mapTileFilter`, `colors.accent` for marker

### DO NOT TOUCH (unless fixing hardcoded colors):
- Navigation structure
- Context logic (other than ThemeContext)
- Services / Firebase
- Type definitions (other than theme types)

---

## VERIFICATION CHECKLIST (20 points)

1. Settings shows 8 theme options in a visual grid with color swatches
2. Selecting a theme persists to AsyncStorage and survives app restart
3. System theme follows device light/dark preference
4. Clean Light renders with light backgrounds, gold accent, no overlays
5. Clean Dark renders with dark backgrounds, gold accent, no overlays
6. Matrix renders green-on-black with falling character rain overlay + scanlines + flicker
7. Alien renders amber-on-black with static noise + scanlines + heavier flicker
8. Jurassic renders cyan/amber on navy with grid texture + scanlines
9. Ghost in the Shell renders lavender/cyan on deep purple with floating data streams + hex texture + glassmorphism
10. Blade Runner renders orange/blue-white on teal-black with rain overlay + film grain
11. All overlays are `pointerEvents: 'none'` — do not block touches
12. Web fonts load for themed modes (VT323 for Matrix/Alien, IBM Plex Mono for Jurassic, Rajdhani for Ghost/Blade Runner)
13. Map tiles adapt to theme filter — each theme's map looks appropriately color-shifted
14. Route polyline uses theme accent color
15. Sound effects change with theme — Matrix clicks differently than Blade Runner
16. Web frame glow color adapts to theme accent
17. No TypeScript errors
18. No existing screens broken — all screens use `colors.*` and render correctly
19. Theme transition is smooth (no flash of wrong colors)
20. Monochrome themes (Matrix, Alien) have NO off-palette colors anywhere — success, error, warning are all the same hue
