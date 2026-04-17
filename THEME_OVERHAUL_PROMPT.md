# THEME OVERHAUL — Claude Code Prompt

Copy everything below the line into Claude Code.

---

## CONTEXT

This is a React Native / Expo app (Zenki). It has a theme system with these files:

- `src/theme/colors.ts` — defines `ThemeColors` interface (50+ fields), `ThemeOverlayConfig` interface, `palette`, `darkColors`, `lightColors`, `NO_OVERLAY`
- `src/theme/themes.ts` — defines all themed `ThemeDefinition` objects and `ALL_THEMES` array
- `src/context/ThemeContext.tsx` — `ThemeMode` union type, `ThemeProvider`, `useTheme()` hook
- `src/components/ThemeOverlay.tsx` — renders scanlines, vignette, flicker, particles (matrix-rain, rain-drops, static-noise, data-streams), textures (noise, grid, hex, paper)
- `src/sounds/synth.ts` — Web Audio procedural sound synthesis per theme. Each theme has its own sound function handling events: tap, success, error, navigate, open, close
- `src/context/SoundContext.tsx` — `SoundTheme` type, wires theme sounds to the app

Every component in the app reads from `useTheme()` — Cards, Buttons, LineCharts, StreakBadge, XPProgressBar, AchievementBadge, CelebrationModal, SpinWheelModal, Confetti, etc. The ThemeColors interface includes: backgrounds (background, backgroundElevated, backgroundSubtle), surfaces (surface, surfaceHover, surfaceSecondary, surfaceTertiary), brand colors (gold/goldLight/goldDark/goldMuted, red/redLight/redDark/redMuted), text (textPrimary/textSecondary/textMuted/textTertiary/textInverse), semantic (success/error/warning/info + muted variants), structure (border/borderSubtle/divider/overlay/shadow), navigation (tabBar/tabBarBorder), plus theme metadata: accent/accentDim/accentDark, mapTileFilter, mapRouteColor, textGlow, textGlowSubtle, boxGlow, frameGlow, fontFamily, fontFamilyNative, uppercaseHeaders, spinner, switchTrack, macroProtein/macroCarbs/macroFat, flames.

The ThemeOverlayConfig has: scanlines (bool + color + opacity), flicker (bool + intensity), vignette (bool + color), particles (string type + color + opacity), texture (string type + opacity).

## THE PROBLEM

Right now, Matrix, Alien, Jurassic Park, Ghost in the Shell, and Blade Runner are all slight variations of the same formula: dark background, monochrome accent color, CRT-style scanlines/flicker, monospace font. They look like palette swaps of the same theme. Each theme needs to be a COMPLETELY DIFFERENT visual identity — different typography philosophy, different overlay strategy, different surface treatment, different color relationships, different animation personality. Switching themes should feel like opening a different app entirely.

Additionally, a new Zelda (Sheikah Slate) theme needs to be added.

## INSTRUCTIONS

Work through each theme ONE AT A TIME. For each theme, update ALL of the following layers before moving to the next theme:

1. ThemeColors object in `src/theme/themes.ts`
2. ThemeOverlayConfig object in `src/theme/themes.ts`
3. ThemeDefinition metadata (description, icon, soundTheme, webFontUrl) in `src/theme/themes.ts`
4. Sound function in `src/sounds/synth.ts`
5. Any new particle/texture type in `src/components/ThemeOverlay.tsx` (if needed)

Do NOT change: Clean Light, Clean Dark, System themes, ThemeColors interface, ThemeOverlayConfig interface, NO_OVERLAY, palette, darkColors, lightColors, or any component files.

After all individual themes are done, update ThemeContext.tsx to add 'sheikah' to the ThemeMode union, and update ALL_THEMES in themes.ts with the new Sheikah theme.

---

## THEME 1: THE MATRIX — "Zion Mainframe"

### Design Philosophy
A 1999 green-phosphor CRT terminal. The screen is alive — it flickers, it rains code, it hums. Every element looks like it was rendered by a 1990s Unix terminal. This is the only theme that should feel like a CRT.

### Colors (ThemeColors)
- **Backgrounds**: Pure black (#000000) base. backgroundElevated and backgroundSubtle should be barely distinguishable — extremely dark greens (#060D06, #030803). The screen should feel like it's OFF when there's no content.
- **Surfaces**: Very dark green tints (#0D1A0D for surface, stepping up to #1A2E1A for surfaceHover). Surface should feel like a dim green glow against void black. surfaceSecondary and surfaceTertiary should each be noticeably different steps — don't cluster them.
- **Brand/gold**: Replace gold entirely with Matrix green. gold=#00FF41, goldLight=#33FF66 (a brighter highlight green for important callouts), goldDark=#00AA2A, goldMuted=rgba(0,255,65,0.10). The "gold" tokens ARE the phosphor green in this theme.
- **Brand/red**: ALSO Matrix green. red=#00FF41, redLight=#33FF66, redDark=#007A1E, redMuted=rgba(0,255,65,0.08). Buttons that use `colors.red` should still glow green. There is no red in the Matrix UI.
- **Text**: textPrimary=#00FF41 (full phosphor), textSecondary=#00CC33 (80% brightness), textMuted=#007A1E (dark green, barely readable — like dimmed terminal text), textTertiary=#003B00 (almost invisible, for ghost elements), textInverse=#000000.
- **Semantic**: success=#00FF41, error=#FF0033 (this is the ONE exception — errors should flash red like a system alarm, jarring against the green), warning=#CCFF00 (yellow-green, like a phosphor warning), info=#00CC33. Give each appropriate muted variants at ~10% opacity.
- **Structure**: border=#004D00, borderSubtle=#002200, divider=#003300. overlay=rgba(0,0,0,0.90) — very dark, the Matrix is deep. shadow=rgba(0,255,65,0.08) — shadows glow green, not black.
- **Tab bar**: tabBar=#030803 (nearly black), tabBarBorder=#003300.
- **Accent**: accent=#00FF41, accentDim=#00CC33, accentDark=#003B00, accentTint=rgba(0,255,65,0.06).
- **Map**: mapTileFilter='grayscale(1) brightness(0.25) sepia(1) hue-rotate(70deg) saturate(8)' — push the map HARD into green. mapRouteColor=#00FF41.
- **Glow effects**: textGlow='0 0 4px #00FF41, 0 0 12px #00FF41, 0 0 24px rgba(0,255,65,0.3)' — triple-layer glow, stronger than before. textGlowSubtle='0 0 3px #00FF41, 0 0 6px rgba(0,255,65,0.4)'. boxGlow='0 0 10px rgba(0,255,65,0.25), 0 0 20px rgba(0,255,65,0.08), inset 0 0 6px rgba(0,255,65,0.04)'. frameGlow='0 0 80px rgba(0,255,65,0.10), 0 0 160px rgba(0,255,65,0.04), 0 0 2px rgba(0,255,65,0.4)'.
- **Typography**: fontFamily='"VT323", "Share Tech Mono", "Courier New", monospace'. fontFamilyNative='Courier'. uppercaseHeaders=true.
- **Component tokens**: spinner=#00FF41, switchTrack=#00FF41, macroProtein=#00FF41, macroCarbs=#00CC33, macroFat=#66FF66, flames=#00FF41.

### Overlay (ThemeOverlayConfig)
- scanlines: true, scanlineColor='rgba(0,255,65,0.035)', scanlineOpacity=0.035
- flicker: true, flickerIntensity=0.96 (noticeable but not migraine-inducing)
- vignette: true, vignetteColor='rgba(0,0,0,0.65)' — heavy vignette, CRT edges are dark
- particles: 'matrix-rain', particleColor='#00FF41', particleOpacity=0.08
- texture: 'none', textureOpacity=0

### ThemeDefinition
- id: 'matrix', name: 'The Matrix', description: 'Wake up, Neo...', icon: 'code-slash-outline', isDark: true, soundTheme: 'matrix'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap'

### Sound Design (matrixSound in synth.ts)
The Matrix sounds like a 1990s hacker terminal. Every interaction should feel like typing into a command line.
- **tap**: Quick square wave blip, very short. freq=800, wave='square', duration=0.04, gain=0.08. Like a keypress.
- **success**: Three rapid ascending square blips (think: "ACCESS GRANTED" terminal confirmation). First: freq=400, wave='square', duration=0.06, gain=0.10. Second: freq=600, wave='square', duration=0.06, gain=0.09, delay=0.05. Third: freq=900, wave='square', duration=0.10, gain=0.08, delay=0.10.
- **error**: Low harsh buzz. freq=120, wave='sawtooth', duration=0.25, gain=0.14, sweep=60. Like a terminal rejection.
- **navigate**: Single mid-pitch square tick. freq=550, wave='square', duration=0.05, gain=0.07.
- **open**: Rising square sweep. freq=300, wave='square', duration=0.12, gain=0.09, sweep=800.
- **close**: Falling square sweep. freq=700, wave='square', duration=0.10, gain=0.08, sweep=200.

---

## THEME 2: NOSTROMO (Alien) — "MU/TH/UR 6000"

### Design Philosophy
The computer interface aboard the Nostromo from Alien (1979). Amber phosphor monochrome CRT, but CRITICALLY DIFFERENT from Matrix: this is a slow, institutional, 1970s mainframe. Where Matrix is fast and alive, Nostromo is sluggish, warm, and claustrophobic. The amber color is warmer and more orange than the Matrix green. The flicker is slower. The scanlines are heavier. The fonts are more industrial. Think: an old IBM 3270 terminal in a dark room.

### Colors (ThemeColors)
- **Backgrounds**: Pure black (#000000) base. backgroundElevated=#0F0A00 (very slight warm tint). backgroundSubtle=#080500.
- **Surfaces**: Warm dark amber tints. surface=#1A1200, surfaceHover=#2E2000, surfaceSecondary=#221600, surfaceTertiary=#332200. These should feel like stained glass lit from behind by amber light — warm, not cold.
- **Brand/gold**: gold=#FF8C00 (true amber), goldLight=#FFA033, goldDark=#AA5500, goldMuted=rgba(255,140,0,0.10).
- **Brand/red**: KEEP as amber in most cases. red=#FF6600 (orange-red, like an amber CRT trying to show "danger"), redLight=#FF8833, redDark=#993300, redMuted=rgba(255,102,0,0.08). Danger in this theme looks like intensified amber, not a different color.
- **Text**: textPrimary=#FF8C00 (full amber phosphor), textSecondary=#CC7000 (dimmed amber), textMuted=#885000 (dark amber, low contrast), textTertiary=#442800 (ghost text), textInverse=#000000.
- **Semantic**: success=#FF8C00 (no green — this is a monochrome terminal), error=#FF4400 (bright hot orange — alarm state), warning=#FFAA00, info=#CC7000. Muted variants at ~8-12% opacity.
- **Structure**: border=#663800, borderSubtle=#331C00, divider=#442400. overlay=rgba(0,0,0,0.88). shadow=rgba(255,140,0,0.06) — warm amber shadow.
- **Tab bar**: tabBar=#080500, tabBarBorder=#442400.
- **Accent**: accent=#FF8C00, accentDim=#CC7000, accentDark=#442800, accentTint=rgba(255,140,0,0.05).
- **Map**: mapTileFilter='grayscale(1) brightness(0.30) sepia(1) hue-rotate(-15deg) saturate(6)' — deep amber map. mapRouteColor=#FF8C00.
- **Glow effects**: textGlow='0 0 3px #FF8C00, 0 0 8px rgba(255,140,0,0.4), 0 0 20px rgba(255,100,0,0.15)'. textGlowSubtle='0 0 2px #FF8C00, 0 0 5px rgba(255,140,0,0.3)'. boxGlow='0 0 8px rgba(255,140,0,0.18), 0 0 16px rgba(255,140,0,0.06), inset 0 0 4px rgba(255,140,0,0.03)'. frameGlow='0 0 60px rgba(255,140,0,0.08), 0 0 120px rgba(255,100,0,0.03), 0 0 1px rgba(255,140,0,0.3)'.
- **Typography**: fontFamily='"IBM Plex Mono", "Share Tech Mono", "Courier New", monospace'. fontFamilyNative='Courier'. uppercaseHeaders=true. IBM Plex Mono is the key differentiator from Matrix's VT323 — Plex feels institutional, corporate, 1970s mainframe. VT323 feels hacker.
- **Component tokens**: spinner=#FF8C00, switchTrack=#FF8C00, macroProtein=#FF8C00, macroCarbs=#CC7000, macroFat=#FFAA33, flames=#FF6600.

### Overlay (ThemeOverlayConfig)
- scanlines: true, scanlineColor='rgba(255,140,0,0.045)', scanlineOpacity=0.045 — HEAVIER than Matrix (0.035). The Nostromo's screen is older, more degraded.
- flicker: true, flickerIntensity=0.93 — MORE noticeable flicker than Matrix (0.96). This CRT is old and failing. The flicker function in ThemeOverlay.tsx uses `intensity + Math.random() * (1 - intensity)` so lower intensity = more flicker.
- vignette: true, vignetteColor='rgba(0,0,0,0.75)' — HEAVIER vignette than Matrix. The CRT is deeply curved, the edges are very dark.
- particles: 'static-noise', particleColor='#FF8C00', particleOpacity=0.025 — subtle static interference, NOT code rain. This is an old screen with signal noise.
- texture: 'noise', textureOpacity=0.035 — grain/film noise over everything, like a degraded signal.

### ThemeDefinition
- id: 'alien', name: 'Nostromo', description: 'MU/TH/UR 6000 INTERFACE ACTIVE', icon: 'warning-outline', isDark: true, soundTheme: 'alien'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Share+Tech+Mono&display=swap'

### Sound Design (alienSound in synth.ts)
Nostromo sounds slow, heavy, institutional. Low-frequency hums and thuds. Everything sounds like it echoes in a metal corridor.
- **tap**: Deep low thud. freq=180, wave='triangle', duration=0.08, gain=0.12. Like pressing a heavy mechanical button.
- **success**: Slow two-tone confirmation ping — low then high, with a gap. First: freq=220, wave='sine', duration=0.20, gain=0.10. Second: freq=440, wave='sine', duration=0.25, gain=0.09, delay=0.15. Slow. Deliberate. Not celebratory.
- **error**: Long alarming low sawtooth buzz that sweeps down. freq=180, wave='sawtooth', duration=0.40, gain=0.16, sweep=60. This should feel like a WARNING KLAXON compressed into a tiny sound.
- **navigate**: Soft low mechanical click. freq=300, wave='triangle', duration=0.06, gain=0.08.
- **open**: Slow rising sine sweep (airlock opening). freq=150, wave='sine', duration=0.25, gain=0.10, sweep=400.
- **close**: Slow falling sine sweep (airlock closing). freq=350, wave='sine', duration=0.20, gain=0.09, sweep=100.

---

## THEME 3: JURASSIC PARK — "Isla Nublar"

### Design Philosophy
THIS IS NOT A CRT THEME. This is a 1993 Silicon Graphics IRIX workstation — the actual computer Dennis Nedry used. The SGI interface was: dark navy/blue-black backgrounds, clean geometric UI, multicolor elements (amber, cyan, red, green all used meaningfully), bitmap-style but clean sans-serif fonts, wireframe/grid aesthetics. Think: a professional Unix workstation UI from the early 90s. Clean. Functional. MULTICOLOR — this is the key differentiator. Every other theme is essentially monochrome or duo-chrome. Jurassic Park uses 4+ distinct hue families.

### Colors (ThemeColors)
- **Backgrounds**: Deep navy blue-black. background=#000820, backgroundElevated=#001030, backgroundSubtle=#000C28. NOT pure black — the blue tint is critical.
- **Surfaces**: Blue-tinted dark surfaces. surface=#001440, surfaceHover=#002060, surfaceSecondary=#001A50, surfaceTertiary=#002468. These should feel like dark blue glass panels.
- **Brand/gold**: Amber/gold — the primary action color. gold=#FFB800, goldLight=#FFCC33, goldDark=#CC9200, goldMuted=rgba(255,184,0,0.12).
- **Brand/red**: TRUE RED — danger, urgency, the T-Rex warning. red=#FF3333, redLight=#FF5555, redDark=#CC0000, redMuted=rgba(255,51,51,0.10). This is NOT the accent color bent into red — it is a genuinely different, alarming red.
- **Text**: NOT monochrome! textPrimary=#E0E8FF (cool white with blue tint — like a backlit LCD), textSecondary=#8899BB (steel blue-gray), textMuted=#556688 (muted navy), textTertiary=#334466, textInverse=#000820.
- **Semantic**: EACH IS A DIFFERENT COLOR. success=#33FF66 (bright green — system nominal), error=#FF3333 (red — system critical), warning=#FFB800 (amber — caution), info=#00CCFF (bright cyan — informational). This multicolor semantic palette is the defining visual characteristic. Muted variants at 10-12% opacity.
- **Structure**: border=#003366 (blue), borderSubtle=#001A44, divider=#002244. overlay=rgba(0,8,32,0.88). shadow=rgba(0,0,0,0.4) — normal shadows, not colored.
- **Tab bar**: tabBar=#000C28, tabBarBorder=#003366.
- **Accent**: accent=#FFB800, accentDim=#CC9200, accentDark=#664900, accentTint=rgba(255,184,0,0.07).
- **Map**: mapTileFilter='grayscale(0.4) brightness(0.45) contrast(1.2) hue-rotate(200deg) saturate(1.8)' — blue-tinted but not as extreme as the CRT themes. mapRouteColor=#00CCFF (cyan route line — like a tracking system).
- **Glow effects**: MINIMAL. This is NOT a glowing CRT. textGlow='0 0 3px rgba(0,204,255,0.3)' — very subtle cyan glow, like an LCD backlight bleed. textGlowSubtle='0 0 1px rgba(0,204,255,0.2)'. boxGlow='0 0 4px rgba(0,204,255,0.10)' — barely visible. frameGlow='0 0 40px rgba(0,204,255,0.04), 0 0 1px rgba(0,204,255,0.15)'.
- **Typography**: fontFamily='"IBM Plex Sans", "DM Sans", system-ui, sans-serif'. fontFamilyNative='System'. uppercaseHeaders=true. SANS-SERIF. Not monospace. This is a workstation, not a terminal. IBM Plex Sans has that early-90s Silicon Graphics institutional feel.
- **Component tokens**: spinner=#00CCFF, switchTrack=#FFB800, macroProtein=#FF6B6B (red — protein is visually distinct), macroCarbs=#00CCFF (cyan), macroFat=#FFB800 (amber). THREE different macro colors. flames=#FF3333 (red flames, not themed).

### Overlay (ThemeOverlayConfig)
- scanlines: false — NOT a CRT.
- scanlineColor: '', scanlineOpacity: 0
- flicker: false, flickerIntensity: 1 — NO flicker. This is a stable SGI workstation.
- vignette: true, vignetteColor='rgba(0,0,20,0.35)' — SUBTLE. Just slightly darker edges, like a flat panel display, NOT a CRT curve.
- particles: 'none', particleColor: '', particleOpacity: 0 — NO particles. Clean workstation.
- texture: 'grid', textureOpacity=0.025 — very faint grid lines in the background, like a wireframe coordinate system. This is the Nedry grid.

### ThemeDefinition
- id: 'jurassic', name: 'Jurassic Park', description: "Ah ah ah, you didn't say the magic word", icon: 'bug-outline', isDark: true, soundTheme: 'jurassic'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap'

### Sound Design (jurassicSound in synth.ts)
Workstation sounds — clean, digital, functional. Think: 1990s SGI boot chime, Macintosh Quadra UI sounds. Clicks, not bleeps.
- **tap**: Clean digital click. freq=1000, wave='triangle', duration=0.03, gain=0.09. Sharp and precise.
- **success**: Bright ascending three-note chime (like a system completion sound). First: freq=523, wave='sine', duration=0.12, gain=0.11. Second: freq=659, wave='sine', duration=0.12, gain=0.10, delay=0.08. Third: freq=784, wave='sine', duration=0.18, gain=0.09, delay=0.16. Clean major triad.
- **error**: Two quick descending tones (system error boop-boop). First: freq=440, wave='triangle', duration=0.10, gain=0.13. Second: freq=330, wave='triangle', duration=0.14, gain=0.12, delay=0.08.
- **navigate**: Soft click. freq=800, wave='triangle', duration=0.03, gain=0.07.
- **open**: Short rising chime. freq=400, wave='sine', duration=0.10, gain=0.08, sweep=700.
- **close**: Short falling chime. freq=600, wave='sine', duration=0.08, gain=0.07, sweep=300.

---

## THEME 4: GHOST IN THE SHELL — "Section 9"

### Design Philosophy
Cyberpunk neural-net interface. NOT a CRT — this is a translucent holographic HUD. Glassmorphism everywhere: semi-transparent surfaces with soft blur, layered over a deep purple-black void. Neon cyan and magenta accents bleed through frosted glass panels. Hexagonal geometry. The aesthetic is: you're looking at a heads-up display projected onto the inside of your retina. Cool, clinical, beautiful, alien.

### Colors (ThemeColors)
- **Backgrounds**: Ultra-deep purple-black. background=#0D0221, backgroundElevated=#160433, backgroundSubtle=#110328. The purple undertone is ESSENTIAL — this is not blue-black (Jurassic) or pure black (Matrix/Alien).
- **Surfaces**: SEMI-TRANSPARENT. This is the defining visual characteristic. surface='rgba(30,10,60,0.65)', surfaceHover='rgba(45,15,85,0.75)', surfaceSecondary='rgba(22,6,45,0.55)', surfaceTertiary='rgba(35,12,70,0.50)'. Every card, every panel should look like frosted purple glass floating over the void.
- **Brand/gold**: Replaced with cyan. gold=#00F0FF, goldLight=#66F7FF, goldDark=#0099AA, goldMuted=rgba(0,240,255,0.08). Cyan IS the primary accent.
- **Brand/red**: Hot magenta/pink. red=#FF4081, redLight=#FF80AB, redDark=#C51162, redMuted=rgba(255,64,129,0.08). Magenta is the secondary accent — danger and emphasis.
- **Text**: textPrimary=#D0C4E8 (soft lavender-white — warm and readable against purple), textSecondary=#8B7BA3 (dusty purple), textMuted=#5C4D73, textTertiary=#3A2D4D, textInverse=#0D0221.
- **Semantic**: success=#00E5A0 (bright teal-green), error=#FF4081 (magenta), warning=#FFD740 (warm amber — stands out against the cool palette), info=#00F0FF (cyan). FOUR distinct hue families.
- **Structure**: border='rgba(0,240,255,0.12)' (glowing cyan hairline borders), borderSubtle='rgba(0,240,255,0.05)', divider='rgba(200,184,219,0.06)'. overlay='rgba(13,2,33,0.88)'. shadow='rgba(0,240,255,0.06)' — shadows glow faintly cyan.
- **Tab bar**: tabBar='rgba(13,2,33,0.92)', tabBarBorder='rgba(0,240,255,0.10)'.
- **Accent**: accent=#00F0FF, accentDim=#0099AA, accentDark=#005566, accentTint='rgba(0,240,255,0.04)'.
- **Map**: mapTileFilter='grayscale(0.8) brightness(0.25) contrast(1.4) hue-rotate(260deg) saturate(3)' — deep purple haze map. mapRouteColor=#00F0FF.
- **Glow effects**: Strong neon glow — this is holographic. textGlow='0 0 4px rgba(0,240,255,0.5), 0 0 14px rgba(0,240,255,0.2), 0 0 30px rgba(0,240,255,0.05)'. textGlowSubtle='0 0 3px rgba(0,240,255,0.35)'. boxGlow='0 0 15px rgba(0,240,255,0.12), 0 0 30px rgba(0,240,255,0.04), inset 0 0 15px rgba(0,240,255,0.03)'. frameGlow='0 0 100px rgba(0,240,255,0.06), 0 0 2px rgba(0,240,255,0.25)'.
- **Typography**: fontFamily='"Rajdhani", "Exo 2", system-ui, sans-serif'. fontFamilyNative='System'. uppercaseHeaders=false. Rajdhani is geometric but humanist — futuristic yet readable. NOT monospace. This is a holographic HUD, not a terminal.
- **Component tokens**: spinner=#00F0FF, switchTrack=#00F0FF, macroProtein=#FF4081 (magenta), macroCarbs=#00E5A0 (teal), macroFat=#FFD740 (amber). flames=#FF4081 (magenta flames — cyber).

### Overlay (ThemeOverlayConfig)
- scanlines: false — NOT a CRT.
- scanlineColor: '', scanlineOpacity: 0
- flicker: false, flickerIntensity: 1 — holograms don't flicker like CRTs.
- vignette: true, vignetteColor='rgba(13,2,33,0.45)' — soft purple fade at edges, like looking through a visor.
- particles: 'data-streams', particleColor='rgba(0,240,255,0.06)', particleOpacity=0.06 — floating data fragments drifting upward.
- texture: 'hex', textureOpacity=0.025 — faint hexagonal lattice underlying everything. Neural net geometry.

### ThemeDefinition
- id: 'ghost', name: 'Ghost in the Shell', description: 'Your ghost whispers to me', icon: 'eye-outline', isDark: true, soundTheme: 'ghost'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap'

### Sound Design (ghostSound in synth.ts)
Ethereal, digital, airy. Sounds like data being processed by a neural net. Crystalline tones with slight reverb feel (achieved via layered slightly detuned oscillators).
- **tap**: Soft crystalline ping. freq=1200, wave='sine', duration=0.08, gain=0.07. Paired with a ghost tone: freq=1205, wave='sine', duration=0.08, gain=0.04, detune=+8 (slight chorus effect from detuning).
- **success**: Ascending ethereal chord — three layered sines drifting upward. First: freq=440, wave='sine', duration=0.30, gain=0.08, sweep=550. Second: freq=660, wave='sine', duration=0.30, gain=0.07, sweep=770, delay=0.03. Third: freq=880, wave='sine', duration=0.35, gain=0.06, sweep=990, delay=0.06.
- **error**: Discordant low pulse. freq=200, wave='sine', duration=0.20, gain=0.12. Plus: freq=203, wave='sine', duration=0.20, gain=0.10 (beating frequency creates unease).
- **navigate**: Quick high ethereal blip. freq=900, wave='sine', duration=0.06, gain=0.06.
- **open**: Rising harmonic sweep. freq=300, wave='sine', duration=0.20, gain=0.07, sweep=900.
- **close**: Descending harmonic. freq=800, wave='sine', duration=0.18, gain=0.06, sweep=250.

---

## THEME 5: BLADE RUNNER — "Tears in Rain"

### Design Philosophy
Neo-noir. Wet. Warm. Analog. This is NOT a computer interface theme — it's an atmosphere. Think: neon signs reflected in rain puddles at night. Warm amber/orange neon against cool teal-gray night. The surfaces should feel like rain-slicked glass. The vignette should feel like looking through a dirty windshield. Heavy rain particles. NO scanlines, NO CRT effects, NO monospace fonts. This is cinematic, not technological. The typography should feel like a 1980s science fiction movie poster: condensed, bold, slightly industrial but NOT a terminal font.

### Colors (ThemeColors)
- **Backgrounds**: Dark teal-gray. background=#0A1A1F (cool dark teal, NOT pure black, NOT navy), backgroundElevated=#122830, backgroundSubtle=#0E2025. The blue-green undertone distinguishes this from every other theme.
- **Surfaces**: Semi-transparent with warm tint, like rain-fogged glass. surface='rgba(20,50,60,0.75)', surfaceHover='rgba(30,70,85,0.80)', surfaceSecondary='rgba(15,40,50,0.65)', surfaceTertiary='rgba(25,60,72,0.60)'. Cards should feel like glass with condensation.
- **Brand/gold**: Warm amber-orange neon. gold=#FF6F3C (burnt orange), goldLight=#FF9966, goldDark=#CC4A1A, goldMuted=rgba(255,111,60,0.10).
- **Brand/red**: red=#FF3D3D (neon red — like a neon sign), redLight=#FF6666, redDark=#CC1A1A, redMuted=rgba(255,61,61,0.08).
- **Text**: textPrimary=#C5D8E8 (cool steel blue-white — like moonlight), textSecondary=#7A97AB (muted blue-gray), textMuted=#4A6678, textTertiary=#2C4050, textInverse=#0A1A1F.
- **Semantic**: success=#00CC88 (teal green), error=#FF3D3D (neon red), warning=#FFB347 (soft warm amber), info=#4DC9F6 (rain blue). Each distinct.
- **Structure**: border='rgba(255,111,60,0.12)' (subtle warm border), borderSubtle='rgba(255,111,60,0.06)', divider='rgba(197,216,232,0.05)'. overlay='rgba(10,26,31,0.88)'. shadow='rgba(0,0,0,0.45)'.
- **Tab bar**: tabBar='rgba(10,22,28,0.95)', tabBarBorder='rgba(255,111,60,0.10)'.
- **Accent**: accent=#FF6F3C, accentDim=#CC4A1A, accentDark=#662510, accentTint='rgba(255,111,60,0.05)'.
- **Map**: mapTileFilter='grayscale(0.5) brightness(0.30) contrast(1.3) sepia(0.2) hue-rotate(170deg) saturate(2)' — cool, dark, slightly teal. mapRouteColor=#FF6F3C.
- **Glow effects**: Warm neon glow — like light diffused through rain. textGlow='0 0 4px rgba(255,111,60,0.45), 0 0 12px rgba(255,111,60,0.15), 0 0 24px rgba(255,80,30,0.06)'. textGlowSubtle='0 0 3px rgba(255,111,60,0.3)'. boxGlow='0 0 12px rgba(255,111,60,0.14), 0 0 24px rgba(255,111,60,0.04), inset 0 0 8px rgba(255,111,60,0.03)'. frameGlow='0 0 80px rgba(255,111,60,0.08), 0 0 160px rgba(255,80,30,0.03), 0 0 2px rgba(255,111,60,0.25)'.
- **Typography**: fontFamily='"Bebas Neue", "Rajdhani", system-ui, sans-serif'. fontFamilyNative='System'. uppercaseHeaders=false. Bebas Neue is a condensed display font — it screams 80s sci-fi movie poster. For body text Rajdhani provides readable geometric sans.
- **Component tokens**: spinner=#FF6F3C, switchTrack=#FF6F3C, macroProtein=#FF6F3C (orange), macroCarbs=#4DC9F6 (rain blue), macroFat=#FFB347 (warm amber). flames=#FF6F3C.

### Overlay (ThemeOverlayConfig)
- scanlines: false — NOT a CRT.
- scanlineColor: '', scanlineOpacity: 0
- flicker: false, flickerIntensity: 1 — No.
- vignette: true, vignetteColor='rgba(5,15,18,0.65)' — HEAVY dark vignette, like looking through a car windshield at night. Cool-tinted.
- particles: 'rain-drops', particleColor='rgba(150,200,230,0.20)', particleOpacity=0.20 — MORE rain than before. The rain IS the identity of this theme. Increase from previous 0.15.
- texture: 'noise', textureOpacity=0.045 — film grain. Blade Runner is shot on film. The noise should be visible.

### ThemeDefinition
- id: 'bladerunner', name: 'Blade Runner', description: "All those moments will be lost in time, like tears in rain", icon: 'rainy-outline', isDark: true, soundTheme: 'bladerunner'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600&display=swap'

### Sound Design (bladerunnerSound in synth.ts)
Vangelis synth pads. Warm, reverberant, melancholic. Sine waves with slow attacks — every sound should feel like it comes from far away through rain.
- **tap**: Warm soft thump. freq=250, wave='sine', duration=0.10, gain=0.08, attack=0.02. Rounded, not sharp.
- **success**: Slow warm chord — like a Vangelis pad swell. First: freq=261, wave='sine', duration=0.40, gain=0.08, attack=0.05. Second: freq=329, wave='sine', duration=0.40, gain=0.07, attack=0.05, delay=0.02. Third: freq=392, wave='sine', duration=0.50, gain=0.06, attack=0.05, delay=0.04. Major triad, slow bloom.
- **error**: Low mournful tone. freq=150, wave='sine', duration=0.35, gain=0.12, attack=0.03, sweep=100.
- **navigate**: Gentle raindrop ping. freq=700, wave='sine', duration=0.08, gain=0.06, attack=0.01.
- **open**: Slow warm rising tone. freq=200, wave='sine', duration=0.30, gain=0.07, attack=0.06, sweep=500.
- **close**: Slow warm descending tone. freq=450, wave='sine', duration=0.25, gain=0.06, attack=0.04, sweep=150.

---

## THEME 6: SHEIKAH SLATE (Zelda: Breath of the Wild) — NEW THEME

### Design Philosophy
The Sheikah Slate UI from The Legend of Zelda: Breath of the Wild. Ancient technology reawakened. This is NEITHER a CRT NOR a hologram NOR a workstation. It's something entirely unique: an ancient relic that projects a clean, minimal, luminous blue interface. The aesthetic is: precision geometry, sparse minimalism, soft blue luminance against deep dark. Sheikah technology is the opposite of cluttered — it's zen-like. Thin precise lines. Geometric shapes. Everything feels carved from light. The blue is distinct from Ghost in the Shell's cyan (GiTS is electric neon cyan; Sheikah is a softer, slightly more periwinkle/slate blue). Where GiTS is busy and layered, Sheikah is calm and minimal.

### Colors (ThemeColors)
- **Backgrounds**: Deep blue-black with a slight slate/periwinkle undertone. background=#0A1628 (distinct from Jurassic's navy #000820 — this has more blue, less black). backgroundElevated=#12203A, backgroundSubtle=#0E1B30.
- **Surfaces**: Dark slate-blue, OPAQUE (not glassmorphic like GiTS), but with a subtle inner luminance feel. surface=#162A48, surfaceHover=#1E3658, surfaceSecondary=#142440, surfaceTertiary=#1A3050. These should feel like ancient stone lit from within by soft blue light.
- **Brand/gold**: Sheikah cyan-blue. gold=#5AC8FA (NOT the electric #00F0FF of GiTS — this is softer, more sky-blue), goldLight=#7DD8FF, goldDark=#3A8FBB, goldMuted=rgba(90,200,250,0.10).
- **Brand/red**: Amber-orange — the secondary color of the Sheikah Slate (used for warnings, malice indicators). red=#FF9500, redLight=#FFB340, redDark=#CC7700, redMuted=rgba(255,149,0,0.08).
- **Text**: textPrimary=#D8E4F0 (clean white with slight blue tint — legible, not harsh), textSecondary=#8A9DB5 (muted slate), textMuted=#5A7088, textTertiary=#3A5068, textInverse=#0A1628.
- **Semantic**: success=#4CD964 (soft green — like a completed shrine), error=#FF3B30 (red — like malice/guardian laser), warning=#FF9500 (amber — Sheikah secondary), info=#5AC8FA (Sheikah blue). Apple-inspired semantic colors fit the Sheikah Slate's clean aesthetic.
- **Structure**: border='rgba(90,200,250,0.10)' (faint blue luminous line), borderSubtle='rgba(90,200,250,0.05)', divider='rgba(216,228,240,0.05)'. overlay='rgba(10,22,40,0.90)'. shadow='rgba(0,0,0,0.35)'.
- **Tab bar**: tabBar=#0C1830, tabBarBorder='rgba(90,200,250,0.08)'.
- **Accent**: accent=#5AC8FA, accentDim=#3A8FBB, accentDark=#1E5A7A, accentTint='rgba(90,200,250,0.05)'.
- **Map**: mapTileFilter='grayscale(0.6) brightness(0.40) contrast(1.1) hue-rotate(190deg) saturate(1.5)' — muted blue-tinted cartographic feel, like the Sheikah Slate's map. mapRouteColor=#5AC8FA.
- **Glow effects**: Soft, ethereal blue luminance. NOT harsh neon. textGlow='0 0 4px rgba(90,200,250,0.35), 0 0 10px rgba(90,200,250,0.12)'. textGlowSubtle='0 0 2px rgba(90,200,250,0.25)'. boxGlow='0 0 8px rgba(90,200,250,0.10), 0 0 16px rgba(90,200,250,0.03)'. frameGlow='0 0 60px rgba(90,200,250,0.05), 0 0 1px rgba(90,200,250,0.18)'.
- **Typography**: fontFamily='"Rajdhani", "Exo 2", system-ui, sans-serif'. fontFamilyNative='System'. uppercaseHeaders=true. Geometric sans-serif — futuristic but ancient. Clean. Same font as GiTS but the uppercase headers, minimal glow, and opaque surfaces will make it feel completely different.
- **Component tokens**: spinner=#5AC8FA, switchTrack=#5AC8FA, macroProtein=#FF3B30 (red — stands out), macroCarbs=#5AC8FA (Sheikah blue), macroFat=#FF9500 (amber). flames=#FF9500 (amber flames — like a shrine torch, NOT the blue accent).

### Overlay (ThemeOverlayConfig)
This theme needs a NEW PARTICLE TYPE: 'sheikah-runes'. You must add handling for this in ThemeOverlay.tsx.
- scanlines: false — NOT a CRT.
- scanlineColor: '', scanlineOpacity: 0
- flicker: false, flickerIntensity: 1
- vignette: true, vignetteColor='rgba(10,22,40,0.30)' — VERY subtle. Just a slight darkening at the edges. The Sheikah Slate has a clean display.
- particles: 'sheikah-runes', particleColor='rgba(90,200,250,0.06)', particleOpacity=0.06 — See particle implementation below.
- texture: 'none', textureOpacity: 0 — CLEAN. No grain, no grid. Ancient technology is perfect.

### New Particle Type: 'sheikah-runes' (add to ThemeOverlay.tsx)
Implement a new `SheikaRunes` component in ThemeOverlay.tsx alongside MatrixRain, RainDrops, etc. Add 'sheikah-runes' as a case in the Particles switch.

Behavior: 10-15 geometric shapes (small circles, triangles, diamonds — simple SVG-like shapes achievable with View + borderRadius + rotation) that:
1. Start at random X positions across the screen, at random Y positions in the lower 2/3
2. Float UPWARD slowly (8-15 seconds per cycle — much slower than rain or data-streams)
3. Fade in over 20% of their cycle, hold at full opacity for 60%, fade out over 20%
4. Each shape is 4-8px in size
5. Each shape VERY SLOWLY rotates (one full rotation per 20+ seconds) — barely perceptible
6. When a shape reaches the top and fades out, it resets to a new random position in the lower 2/3
7. Color is the particleColor from the config (pale translucent Sheikah blue)
8. Shapes should be: some circles (borderRadius: 50%), some diamonds (45deg rotated squares), some triangles (using border trick). Randomize per particle.

This should feel like ancient rune energy slowly rising and dissipating. Calm. Meditative. The opposite of Matrix rain's urgency.

### ThemeDefinition
- id: 'sheikah', name: 'Sheikah Slate', description: 'Sheikah Slate activated', icon: 'tablet-portrait-outline', isDark: true, soundTheme: 'sheikah'
- webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap'

### Sound Design (NEW sheikaSound function in synth.ts)
Zelda UI sounds: clean, musical, slightly magical. Chime-like. Bright sine tones with medium decay — like striking a small bell. Every sound should feel like a Sheikah Slate menu interaction.
- **tap**: Clean bright chime. freq=880, wave='sine', duration=0.10, gain=0.09. Simple, pure.
- **success**: Ascending two-note musical chime (like completing a Shrine). First: freq=659, wave='sine', duration=0.18, gain=0.10. Second: freq=988, wave='sine', duration=0.25, gain=0.09, delay=0.10. A perfect fifth — musical, resolved, satisfying.
- **error**: Soft dissonant tone. freq=330, wave='triangle', duration=0.18, gain=0.11. Plus: freq=349, wave='triangle', duration=0.18, gain=0.09 (minor second — gentle dissonance, not harsh).
- **navigate**: Quick light ping. freq=1047, wave='sine', duration=0.06, gain=0.07.
- **open**: Rising bell-like chime. freq=523, wave='sine', duration=0.15, gain=0.08, sweep=880.
- **close**: Falling bell-like chime. freq=784, wave='sine', duration=0.12, gain=0.07, sweep=440.

Add 'sheikah' to the SoundTheme union in synth.ts. Add a case for 'sheikah' in the playSynth switch. Create the sheikaSound function.

---

## FINAL INTEGRATION CHECKLIST

After completing all 6 themes above:

1. **ThemeContext.tsx**: Add `| 'sheikah'` to the `ThemeMode` union type. Import `sheikahTheme` from themes.ts.
2. **themes.ts**: Add `sheikahTheme` to the `ALL_THEMES` array (before the closing bracket, after bladerunnerTheme).
3. **ThemeOverlay.tsx**: Add 'sheikah-runes' case to the Particles switch. Implement the SheikaRunes component as specified above.
4. **synth.ts**: Add 'sheikah' to the `SoundTheme` union. Add case 'sheikah' to playSynth switch. Add sheikaSound function.
5. Verify: every ThemeColors object has ALL fields from the interface (count them — there are 50+ fields). Missing fields will cause TypeScript errors.
6. Verify: every ThemeOverlayConfig has all 10 fields (scanlines, scanlineColor, scanlineOpacity, flicker, flickerIntensity, vignette, vignetteColor, particles, particleColor, particleOpacity, texture, textureOpacity).
7. Verify: the webFontUrl loads the actual fonts referenced in fontFamily.

Do NOT rush. Work through each theme completely before starting the next. Every hex code, every opacity value, every sound parameter is specified above — use them exactly. Do not simplify, do not skip, do not approximate.
