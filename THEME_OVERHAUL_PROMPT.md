# THEME OVERHAUL — Claude Code Prompt

Copy everything below the line into Claude Code.

---

## CONTEXT

This is a React Native / Expo app (Zenki). Themes touch EVERY layer of the app:

**Theme system files:**
- `src/theme/colors.ts` — ThemeColors interface (50+ fields), ThemeOverlayConfig interface, palette, darkColors, lightColors, NO_OVERLAY
- `src/theme/themes.ts` — ThemeDefinition objects + ALL_THEMES array
- `src/context/ThemeContext.tsx` — ThemeMode union, ThemeProvider, useTheme() hook
- `src/components/ThemeOverlay.tsx` — overlay effects: Scanlines, Vignette, Flicker, Particles (matrix-rain, rain-drops, static-noise, data-streams), Textures (noise, grid, hex, paper)
- `src/sounds/synth.ts` — Web Audio procedural synthesis. Each theme has its own sound function handling: tap, success, error, navigate, open, close
- `src/context/SoundContext.tsx` — SoundTheme type, wires sounds to app

**Components that consume the theme (all use useTheme()):**
- Card.tsx — 4 variants (default, elevated, outlined, subtle) using surface/border colors
- Button.tsx — 4 variants (primary uses colors.red, secondary/outline/ghost)
- PostCard.tsx — Instagram-style feed cards
- StreakBadge.tsx — flame icon + count, uses colors.flames
- XPProgressBar.tsx — level badge (colors.gold circle) + progress bar fill
- AchievementBadge.tsx — circle badges with Ionicons, uses colors.gold/goldMuted
- CelebrationModal.tsx — level-up/achievement popups with confetti
- SpinWheelModal.tsx — daily spin wheel using colors.gold and colors.red
- Confetti.tsx — particle burst on celebrations, hardcoded colors: '#D4A017', '#C41E2A', '#FFFFFF', '#FF6B35', '#FFD60A'
- LineChart.tsx — SVG line chart, defaults to colors.gold for line
- EmptyState.tsx — placeholder screens with emoji icons + titles + subtitles
- AnimatedTabIcon.tsx — tab bar icons with bounce animation
- SectionHeader.tsx — section titles using colors.textPrimary + colors.gold for action links
- AnimatedLogo.tsx — app logo display

**Navigation (TabNavigator.tsx):**
- Tab bar icons: Home, Schedule, Community, Book, Hydration, Store, Profile
- Tab bar uses TAB_ICONS mapping (Ionicons active/inactive pairs)
- Active tint: colors.gold, Inactive tint: colors.textMuted

**Screens that are theme-aware:**
- HomeScreen — dashboard with sections: schedule, streaks, XP, achievements, announcements, workout stats, nutrition
- WorkoutScreen — training log/PRs/stats
- MacroTrackerScreen — calorie/macro tracking with SVG pie chart
- CommunityScreen — Instagram-style feed
- All 55 screens in src/screens/

**Daily quotes (src/data/quotes.ts):**
- 365 quotes shown on home screen from philosophers, athletes, anime, films, video games

## THE PROBLEM

The current themes are COLOR PALETTES. They swap hex values and nothing else. A real theme overhaul means each theme is a TOTAL EXPERIENCE:
- Different icon sets (tab bar icons, section icons, empty state icons all change to match the film's world)
- Different particle/overlay effects unique to that film (not just "scanlines on/off")
- Different sounds that evoke the film's audio identity
- Different typography that matches the film's design language
- Different loading/empty state text written in the voice of that film's world
- Different confetti/celebration behavior
- Different daily quotes sourced from or inspired by that film
- Different section headers and terminology
- Different spin wheel visual treatment
- Different map styling
- Different animation personality (snappy vs. sluggish vs. ethereal)

## ARCHITECTURE CHANGES NEEDED FIRST

Before touching individual themes, the theme system needs to be extended to support per-theme content. Add these fields to the ThemeDefinition interface (or a new ThemeContent interface):

### 1. Add to ThemeDefinition in themes.ts:

```ts
interface ThemeDefinition {
  // ... existing fields ...

  /** Per-theme tab bar icon overrides. If undefined, use defaults. */
  tabIcons?: Partial<Record<string, { active: string; inactive: string }>>;

  /** Per-theme empty state overrides */
  emptyStates?: {
    workout?: { icon: string; title: string; subtitle: string; actionLabel: string };
    macros?: { icon: string; title: string; subtitle: string; actionLabel: string };
    community?: { icon: string; title: string; subtitle: string; actionLabel: string };
    schedule?: { icon: string; title: string; subtitle: string; actionLabel: string };
    hr?: { icon: string; title: string; subtitle: string; actionLabel: string };
  };

  /** Per-theme celebration config */
  celebration?: {
    confettiColors: string[];        // replaces hardcoded Confetti.tsx colors
    celebrationButtonText: string;   // replaces "AWESOME!" in CelebrationModal
    levelUpIcon: string;             // Ionicons name, replaces 'arrow-up-circle'
  };

  /** Per-theme quotes — if provided, these replace the daily quote on HomeScreen */
  quotes?: Array<{ text: string; attribution: string }>;

  /** Per-theme section label overrides */
  labels?: {
    training?: string;               // replaces "Training" header
    achievements?: string;           // replaces "Achievements"
    dailySpin?: string;              // replaces "DAILY SPIN"
    streakLabel?: string;            // replaces "day streak"
  };

  /** Per-theme loading spinner style override */
  spinnerStyle?: 'default' | 'pulse' | 'dots' | 'terminal';
}
```

### 2. Wire the new fields into components:

**TabNavigator.tsx** — check `theme.tabIcons` and merge with defaults:
```tsx
const icons = theme.tabIcons?.[route.name] ?? TAB_ICONS[route.name];
```

**EmptyState.tsx** — check `theme.emptyStates` for overrides:
```tsx
// In each preset (WorkoutEmpty, MacrosEmpty, etc.), check theme.emptyStates?.workout
```

**Confetti.tsx** — use `theme.celebration?.confettiColors ?? DEFAULT_COLORS`

**CelebrationModal.tsx** — use `theme.celebration?.celebrationButtonText ?? 'AWESOME!'` and `theme.celebration?.levelUpIcon ?? 'arrow-up-circle'`

**HomeScreen.tsx** — if `theme.quotes` exists and is non-empty, pick from that pool instead of the default quotes

**SectionHeader** and relevant screens — use `theme.labels` overrides where applicable

### 3. Add new particle types to ThemeOverlay.tsx:

Each theme below specifies unique particle effects. You'll need to add these new cases to the Particles switch:
- 'matrix-rain' (exists)
- 'rain-drops' (exists)
- 'static-noise' (exists)
- 'data-streams' (exists)
- 'motion-tracker' (NEW — for Alien)
- 'wireframe-grid' (NEW — for Jurassic Park)
- 'neural-pulse' (NEW — for Ghost in the Shell)
- 'neon-reflections' (NEW — for Blade Runner)
- 'sheikah-runes' (NEW — for Zelda)

Each is described in its theme section below.

---

Now, work through each theme ONE AT A TIME. For each theme, complete ALL layers before moving to the next.

---

## THEME 1: THE MATRIX — "Zion Mainframe"

### Film Reference
The green-phosphor hacker terminal from The Matrix (1999). Everything looks like the Nebuchadnezzar's operator console. The UI IS the Matrix — code is reality.

### Colors
- Backgrounds: Pure black (#000000). backgroundElevated=#060D06, backgroundSubtle=#030803. The screen feels OFF until content appears.
- Surfaces: Dark green glass. surface=#0D1A0D, surfaceHover=#1A2E1A, surfaceSecondary=#112211, surfaceTertiary=#1A331A.
- Gold → Matrix green: gold=#00FF41, goldLight=#33FF66, goldDark=#00AA2A, goldMuted=rgba(0,255,65,0.10).
- Red → Also green: red=#00FF41, redLight=#33FF66, redDark=#007A1E, redMuted=rgba(0,255,65,0.08). NO red exists in the Matrix.
- Text: textPrimary=#00FF41, textSecondary=#00CC33, textMuted=#007A1E, textTertiary=#003B00, textInverse=#000000.
- Semantic: success=#00FF41, error=#FF0033 (the ONE exception — errors flash red like Agent Smith arriving), warning=#CCFF00, info=#00CC33.
- Structure: border=#004D00, borderSubtle=#002200, divider=#003300, overlay=rgba(0,0,0,0.90), shadow=rgba(0,255,65,0.08).
- Tab bar: tabBar=#030803, tabBarBorder=#003300.
- Accent: accent=#00FF41, accentDim=#00CC33, accentDark=#003B00, accentTint=rgba(0,255,65,0.06).
- Map: mapTileFilter='grayscale(1) brightness(0.25) sepia(1) hue-rotate(70deg) saturate(8)', mapRouteColor=#00FF41.
- Glow: textGlow='0 0 4px #00FF41, 0 0 12px #00FF41, 0 0 24px rgba(0,255,65,0.3)', textGlowSubtle='0 0 3px #00FF41, 0 0 6px rgba(0,255,65,0.4)', boxGlow='0 0 10px rgba(0,255,65,0.25), 0 0 20px rgba(0,255,65,0.08), inset 0 0 6px rgba(0,255,65,0.04)', frameGlow='0 0 80px rgba(0,255,65,0.10), 0 0 160px rgba(0,255,65,0.04), 0 0 2px rgba(0,255,65,0.4)'.
- Font: fontFamily='"VT323", "Share Tech Mono", "Courier New", monospace', fontFamilyNative='Courier', uppercaseHeaders=true.
- Tokens: spinner=#00FF41, switchTrack=#00FF41, macroProtein=#00FF41, macroCarbs=#00CC33, macroFat=#66FF66, flames=#00FF41.

### Overlay
- scanlines: true, color='rgba(0,255,65,0.035)', opacity=0.035
- flicker: true, intensity=0.96
- vignette: true, color='rgba(0,0,0,0.65)'
- particles: 'matrix-rain', color='#00FF41', opacity=0.08
- texture: 'none', opacity=0

### Tab Bar Icons (override TAB_ICONS)
Replace the friendly Ionicons with terminal-appropriate ones:
- Home → { active: 'terminal', inactive: 'terminal-outline' }
- Schedule → { active: 'time', inactive: 'time-outline' }
- Community → { active: 'git-network', inactive: 'git-network-outline' }
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'flask', inactive: 'flask-outline' }
- Store → { active: 'cube', inactive: 'cube-outline' }
- Profile → { active: 'finger-print', inactive: 'finger-print-outline' }

### Empty States (film-referenced text)
- Workout: icon="⌨️", title="NO TRAINING LOGS", subtitle="There is no spoon... but there is a workout to log. Free your mind.", actionLabel="JACK IN"
- Macros: icon="💊", title="FUEL THE BODY", subtitle="The body cannot live without the mind. Track your intake to optimize the vessel.", actionLabel="INITIALIZE"
- Community: icon="📡", title="THE NETWORK IS QUIET", subtitle="Broadcast from the Nebuchadnezzar. Zion needs to hear from you.", actionLabel="TRANSMIT"
- Schedule: icon="🕐", title="NO SCHEDULED OPERATIONS", subtitle="The Matrix has you... but no classes today. Check back, Operator.", actionLabel="SCAN TIMELINE"
- HR: icon="💚", title="NO BIOSIGNAL DATA", subtitle="Connect your heart rate monitor to monitor your residual self-image.", actionLabel="CONNECT BIOSENSOR"

### Celebration Config
- confettiColors: ['#00FF41', '#00CC33', '#33FF66', '#009926', '#66FF99'] (all green)
- celebrationButtonText: 'CONFIRMED'
- levelUpIcon: 'code-slash'

### Theme Quotes (30+ Matrix-universe quotes for daily rotation)
Include quotes like:
- "There is no spoon." — The Matrix
- "I know kung fu." — Neo
- "Free your mind." — Morpheus
- "What is real? How do you define real?" — Morpheus
- "The Matrix is everywhere. It is all around us." — Morpheus
- "I'm trying to free your mind, Neo. But I can only show you the door." — Morpheus
- "Guns. Lots of guns." — Neo
- "Dodge this." — Trinity
- "Not like this. Not like this." — Switch
- "To deny our own impulses is to deny the very thing that makes us human." — Mouse
- "Everything that has a beginning has an end." — The Oracle
- "Choice. The problem is choice." — Neo
- "Hope. It is the quintessential human delusion." — The Architect
- "What do all men with power want? More power." — The Oracle
Write at least 25 quotes from across all three Matrix films.

### Labels
- training: 'COMBAT SIMULATION'
- achievements: 'UNLOCKED PROTOCOLS'
- dailySpin: 'PROBABILITY MATRIX'
- streakLabel: 'day uplink'

### Sound Design (matrixSound)
1990s hacker terminal. Every interaction = command line.
- tap: Quick square blip. freq=800, wave='square', duration=0.04, gain=0.08.
- success: Three ascending square blips ("ACCESS GRANTED"). freq=400→600→900, wave='square', durations=0.06/0.06/0.10, gains=0.10/0.09/0.08, delays=0/0.05/0.10.
- error: Low harsh buzz. freq=120, wave='sawtooth', duration=0.25, gain=0.14, sweep=60.
- navigate: Single square tick. freq=550, wave='square', duration=0.05, gain=0.07.
- open: Rising square sweep. freq=300, wave='square', duration=0.12, gain=0.09, sweep=800.
- close: Falling square sweep. freq=700, wave='square', duration=0.10, gain=0.08, sweep=200.

### ThemeDefinition
id='matrix', name='The Matrix', description='Wake up, Neo...', icon='code-slash-outline', isDark=true, soundTheme='matrix', webFontUrl='https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap'

---

## THEME 2: NOSTROMO (Alien) — "MU/TH/UR 6000"

### Film Reference
The Nostromo's shipboard computer from Alien (1979). Amber phosphor CRT. Everything feels like a 1970s aerospace mainframe: slow, heavy, institutional, claustrophobic. The UI should feel like you're interfacing with MU/TH/UR in a dark corridor. Key differentiator from Matrix: amber not green, SLOW not fast, institutional not hacker, heavy not nimble.

### Colors
- Backgrounds: Pure black (#000000). backgroundElevated=#0F0A00, backgroundSubtle=#080500.
- Surfaces: Warm dark amber. surface=#1A1200, surfaceHover=#2E2000, surfaceSecondary=#221600, surfaceTertiary=#332200.
- Gold → Amber: gold=#FF8C00, goldLight=#FFA033, goldDark=#AA5500, goldMuted=rgba(255,140,0,0.10).
- Red → Intensified amber alarm: red=#FF6600, redLight=#FF8833, redDark=#993300, redMuted=rgba(255,102,0,0.08).
- Text: textPrimary=#FF8C00, textSecondary=#CC7000, textMuted=#885000, textTertiary=#442800, textInverse=#000000.
- Semantic: success=#FF8C00, error=#FF4400 (hot orange alarm), warning=#FFAA00, info=#CC7000. Monochrome terminal — no green/blue.
- Structure: border=#663800, borderSubtle=#331C00, divider=#442400, overlay=rgba(0,0,0,0.88), shadow=rgba(255,140,0,0.06).
- Tab bar: tabBar=#080500, tabBarBorder=#442400.
- Accent: accent=#FF8C00, accentDim=#CC7000, accentDark=#442800, accentTint=rgba(255,140,0,0.05).
- Map: mapTileFilter='grayscale(1) brightness(0.30) sepia(1) hue-rotate(-15deg) saturate(6)', mapRouteColor=#FF8C00.
- Glow: textGlow='0 0 3px #FF8C00, 0 0 8px rgba(255,140,0,0.4), 0 0 20px rgba(255,100,0,0.15)', textGlowSubtle='0 0 2px #FF8C00, 0 0 5px rgba(255,140,0,0.3)', boxGlow='0 0 8px rgba(255,140,0,0.18), 0 0 16px rgba(255,140,0,0.06), inset 0 0 4px rgba(255,140,0,0.03)', frameGlow='0 0 60px rgba(255,140,0,0.08), 0 0 120px rgba(255,100,0,0.03), 0 0 1px rgba(255,140,0,0.3)'.
- Font: fontFamily='"IBM Plex Mono", "Share Tech Mono", "Courier New", monospace', fontFamilyNative='Courier', uppercaseHeaders=true.
- Tokens: spinner=#FF8C00, switchTrack=#FF8C00, macroProtein=#FF8C00, macroCarbs=#CC7000, macroFat=#FFAA33, flames=#FF6600.

### Overlay
- scanlines: true, color='rgba(255,140,0,0.045)', opacity=0.045 (HEAVIER than Matrix — older CRT)
- flicker: true, intensity=0.93 (MORE flicker — this CRT is failing)
- vignette: true, color='rgba(0,0,0,0.75)' (HEAVY vignette — deeply curved tube)
- particles: 'motion-tracker' (NEW — see below), color='#FF8C00', opacity=0.04
- texture: 'noise', opacity=0.035

### NEW Particle Type: 'motion-tracker'
The Alien motion tracker — a sweeping radar arc. Implementation in ThemeOverlay.tsx:
- A single thin arc (like a radar sweep line) that slowly rotates 360° around a fixed center point positioned at bottom-center of the screen
- The arc is a 2px line, 120px long, emanating from center, amber colored
- It completes one revolution every 6 seconds
- As it sweeps, it leaves a fading trail (opacity 0.15 → 0 over 2 seconds behind it)
- Every ~4 seconds, a small amber dot "blips" at a random position along the sweep arc (briefly appears at opacity=0.3, fades in 1s) — like a contact on the motion tracker
- This is subtle and ambient — mostly visible in corners of the screen, not obstructing content
- Implementation: a rotating Animated.View for the sweep line, plus intermittent blip dots using setTimeout + Animated.Value for opacity

### Tab Bar Icons
All should feel utilitarian, aerospace, institutional:
- Home → { active: 'desktop', inactive: 'desktop-outline' }
- Schedule → { active: 'calendar', inactive: 'calendar-outline' } (keep — calendars exist in 1979)
- Community → { active: 'radio', inactive: 'radio-outline' }
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'beaker', inactive: 'beaker-outline' }
- Store → { active: 'cube', inactive: 'cube-outline' }
- Profile → { active: 'id-card', inactive: 'id-card-outline' }

### Empty States
- Workout: icon="⚠️", title="NO SESSIONS LOGGED", subtitle="MU/TH/UR recommends regular physical maintenance for crew readiness. Log your session, crew member.", actionLabel="LOG SESSION"
- Macros: icon="🧪", title="NUTRITIONAL INTAKE NOT TRACKED", subtitle="Weyland-Yutani standard protocol requires crew dietary monitoring. Begin intake logging.", actionLabel="BEGIN LOGGING"
- Community: icon="📻", title="NO TRANSMISSIONS", subtitle="COMMS ARRAY SILENT. No crew broadcasts detected. Transmit your status report.", actionLabel="TRANSMIT"
- Schedule: icon="🔲", title="NO SCHEDULED OPERATIONS", subtitle="Ship operations calendar is clear. Consult MU/TH/UR for updated directives.", actionLabel="QUERY MU/TH/UR"
- HR: icon="💛", title="BIOSENSOR OFFLINE", subtitle="Crew vital monitoring system disconnected. Reconnect biosensor for health telemetry.", actionLabel="RECONNECT"

### Celebration Config
- confettiColors: ['#FF8C00', '#CC7000', '#FFAA33', '#FF6600', '#FFD700'] (all amber/orange)
- celebrationButtonText: 'ACKNOWLEDGED'
- levelUpIcon: 'shield-checkmark'

### Theme Quotes (25+ Alien franchise quotes)
- "In space, no one can hear you scream." — Alien (1979)
- "I admire its purity." — Ash
- "The crew is expendable." — Special Order 937
- "Final report of the commercial starship Nostromo." — Ripley
- "Get away from her, you bitch!" — Ripley, Aliens
- "Game over, man! Game over!" — Hudson
- "They mostly come at night. Mostly." — Newt
- "I say we take off and nuke the entire site from orbit." — Ripley
- "This time it's war." — Aliens tagline
- "We're on an express elevator to hell, going down!" — Hudson
- "That's it, man. What the fuck are we gonna do now?" — Hudson
- "You know, Burke, I don't know which species is worse." — Ripley
- "These people are dead, Burke! Don't you have any idea what you've done?" — Ripley
- "Lucky for us someone has a good head on their shoulders." — Ash
- "I can't lie to you about your chances, but... you have my sympathies." — Ash
Write at least 25 quotes across Alien, Aliens, Alien 3, and Prometheus.

### Labels
- training: 'PHYSICAL MAINTENANCE'
- achievements: 'CREW COMMENDATIONS'
- dailySpin: 'SUPPLY REQUISITION'
- streakLabel: 'day rotation'

### Sound Design (alienSound)
Slow. Heavy. Institutional. Everything echoes in metal corridors.
- tap: Deep low thud. freq=180, wave='triangle', duration=0.08, gain=0.12.
- success: Slow two-tone confirmation. freq=220, wave='sine', duration=0.20, gain=0.10. Then freq=440, wave='sine', duration=0.25, gain=0.09, delay=0.15.
- error: Long alarming low buzz sweeping down. freq=180, wave='sawtooth', duration=0.40, gain=0.16, sweep=60.
- navigate: Soft low click. freq=300, wave='triangle', duration=0.06, gain=0.08.
- open: Slow rising sine (airlock). freq=150, wave='sine', duration=0.25, gain=0.10, sweep=400.
- close: Slow falling sine (airlock). freq=350, wave='sine', duration=0.20, gain=0.09, sweep=100.

### ThemeDefinition
id='alien', name='Nostromo', description='MU/TH/UR 6000 INTERFACE ACTIVE', icon='warning-outline', isDark=true, soundTheme='alien', webFontUrl='https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Share+Tech+Mono&display=swap'

---

## THEME 3: JURASSIC PARK — "Isla Nublar"

### Film Reference
Dennis Nedry's Silicon Graphics IRIX workstation from Jurassic Park (1993). This is NOT A CRT. It's a 1990s Unix workstation: clean geometry, MULTICOLOR UI (amber + cyan + red + green all used semantically), sans-serif fonts, wireframe aesthetics. Think: the "ACCESS MAIN PROGRAM" screen, the door locks interface, the embryo storage system. The key differentiator: this is the ONLY MULTICOLOR theme — every other theme is essentially monochrome or duo-chrome.

### Colors
- Backgrounds: Deep navy. background=#000820, backgroundElevated=#001030, backgroundSubtle=#000C28.
- Surfaces: Blue-tinted. surface=#001440, surfaceHover=#002060, surfaceSecondary=#001A50, surfaceTertiary=#002468.
- Gold → Amber: gold=#FFB800, goldLight=#FFCC33, goldDark=#CC9200, goldMuted=rgba(255,184,0,0.12).
- Red → TRUE RED: red=#FF3333, redLight=#FF5555, redDark=#CC0000, redMuted=rgba(255,51,51,0.10).
- Text: textPrimary=#E0E8FF (blue-white LCD), textSecondary=#8899BB, textMuted=#556688, textTertiary=#334466, textInverse=#000820.
- Semantic: FOUR DISTINCT COLORS. success=#33FF66, error=#FF3333, warning=#FFB800, info=#00CCFF. This is the defining characteristic.
- Structure: border=#003366, borderSubtle=#001A44, divider=#002244, overlay=rgba(0,8,32,0.88), shadow=rgba(0,0,0,0.4).
- Tab bar: tabBar=#000C28, tabBarBorder=#003366.
- Accent: accent=#FFB800, accentDim=#CC9200, accentDark=#664900, accentTint=rgba(255,184,0,0.07).
- Map: mapTileFilter='grayscale(0.4) brightness(0.45) contrast(1.2) hue-rotate(200deg) saturate(1.8)', mapRouteColor=#00CCFF.
- Glow: MINIMAL — not a CRT. textGlow='0 0 3px rgba(0,204,255,0.3)', textGlowSubtle='0 0 1px rgba(0,204,255,0.2)', boxGlow='0 0 4px rgba(0,204,255,0.10)', frameGlow='0 0 40px rgba(0,204,255,0.04), 0 0 1px rgba(0,204,255,0.15)'.
- Font: fontFamily='"IBM Plex Sans", "DM Sans", system-ui, sans-serif', fontFamilyNative='System', uppercaseHeaders=true. SANS-SERIF. Not monospace. Workstation, not terminal.
- Tokens: spinner=#00CCFF, switchTrack=#FFB800, macroProtein=#FF6B6B, macroCarbs=#00CCFF, macroFat=#FFB800, flames=#FF3333.

### Overlay
- scanlines: false — NOT a CRT
- flicker: false — stable workstation
- vignette: true, color='rgba(0,0,20,0.35)' — subtle LCD edge darkening
- particles: 'wireframe-grid' (NEW — see below), color='rgba(0,204,255,0.04)', opacity=0.04
- texture: 'grid', opacity=0.025

### NEW Particle Type: 'wireframe-grid'
A slowly rotating 3D wireframe grid effect, like the IRIX file manager's 3D navigation view.
- Implementation: on web, use CSS perspective transforms on a grid of thin lines that slowly rotates in 3D (rotateX oscillates ±5° over 20 seconds, rotateY oscillates ±3° over 15 seconds). Grid lines are 1px, color from particleColor, spacing 60px.
- On native: simplified to a static grid overlay (same as existing 'grid' texture but with the specified opacity).
- The effect is VERY subtle — it's ambient depth, not distracting geometry.

### Tab Bar Icons
Workstation/scientific feel:
- Home → { active: 'grid', inactive: 'grid-outline' }
- Schedule → { active: 'calendar', inactive: 'calendar-outline' } (keep)
- Community → { active: 'people', inactive: 'people-outline' } (keep)
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'water', inactive: 'water-outline' } (keep)
- Store → { active: 'bag', inactive: 'bag-outline' } (keep)
- Profile → { active: 'person-circle', inactive: 'person-circle-outline' }

### Empty States
- Workout: icon="🦖", title="NO WORKOUT DATA", subtitle="Life finds a way... but you have to log it first. Start tracking your training, Dr. Grant.", actionLabel="BEGIN TRACKING"
- Macros: icon="🧬", title="NUTRITIONAL DATA EMPTY", subtitle="Your scientists were so preoccupied with whether they could, they didn't stop to eat. Log your meals.", actionLabel="LOG INTAKE"
- Community: icon="📡", title="COMMUNICATIONS OFFLINE", subtitle="The phones are out too. The lysine contingency is irrelevant — just post something.", actionLabel="BROADCAST"
- Schedule: icon="🔐", title="NO EVENTS SCHEDULED", subtitle="Ah ah ah, you didn't say the magic word. Check back for scheduled sessions.", actionLabel="ACCESS SCHEDULE"
- HR: icon="💓", title="BIOSYSTEMS OFFLINE", subtitle="Dodgson! We've got Dodgson here! ...Nobody cares. Connect your heart rate monitor.", actionLabel="CONNECT SENSOR"

### Celebration Config
- confettiColors: ['#FFB800', '#00CCFF', '#FF3333', '#33FF66', '#FFFFFF'] (multicolor — matching the theme's polychromatic identity)
- celebrationButtonText: 'CLEVER GIRL'
- levelUpIcon: 'trophy'

### Theme Quotes (25+ Jurassic Park franchise quotes)
- "Life finds a way." — Dr. Ian Malcolm
- "Clever girl." — Robert Muldoon
- "Hold on to your butts." — Ray Arnold
- "Spared no expense." — John Hammond
- "Your scientists were so preoccupied with whether or not they could, they didn't stop to think if they should." — Malcolm
- "That's a big pile of shit." — Ian Malcolm
- "We're gonna make a fortune with this place." — Gennaro
- "Must go faster." — Ian Malcolm
- "Don't move. He can't see us if we don't move." — Dr. Grant
- "Ah ah ah, you didn't say the magic word." — Nedry's screen
- "What do they got in there, King Kong?" — Ian Malcolm
- "Objects in mirror are closer than they appear." — Jurassic Park (mirror)
- "Welcome to Jurassic Park." — John Hammond
- "When you gotta go, you gotta go." — Ian Malcolm
- "That is one big pile of shit." — Ian Malcolm
Write at least 25 quotes across all JP films.

### Labels
- training: 'FIELD RESEARCH'
- achievements: 'SPECIMEN CATALOG'
- dailySpin: 'AMBER EXTRACTION'
- streakLabel: 'day expedition'

### Sound Design (jurassicSound)
Clean 1990s workstation. Digital clicks and chimes. Not bleepy — clean.
- tap: Clean digital click. freq=1000, wave='triangle', duration=0.03, gain=0.09.
- success: Bright ascending three-note chime. freq=523→659→784, wave='sine', durations=0.12/0.12/0.18, gains=0.11/0.10/0.09, delays=0/0.08/0.16.
- error: Two quick descending tones. freq=440→330, wave='triangle', durations=0.10/0.14, gains=0.13/0.12, delays=0/0.08.
- navigate: Soft click. freq=800, wave='triangle', duration=0.03, gain=0.07.
- open: Short rising chime. freq=400, wave='sine', duration=0.10, gain=0.08, sweep=700.
- close: Short falling chime. freq=600, wave='sine', duration=0.08, gain=0.07, sweep=300.

### ThemeDefinition
id='jurassic', name='Jurassic Park', description="Ah ah ah, you didn't say the magic word", icon='bug-outline', isDark=true, soundTheme='jurassic', webFontUrl='https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap'

---

## THEME 4: GHOST IN THE SHELL — "Section 9"

### Film Reference
The cyberspace/neural-net interface from Ghost in the Shell (1995). NOT a CRT, NOT a workstation — a translucent holographic HUD. Glassmorphism: semi-transparent frosted surfaces over deep purple void. Neon cyan + magenta. Hexagonal geometry. The UI is projected onto your retina. Cool, clinical, alien, beautiful. Key differentiator: GLASSMORPHISM + PURPLE BASE + DUAL ACCENT (cyan primary, magenta secondary).

### Colors
- Backgrounds: Ultra-deep purple-black. background=#0D0221, backgroundElevated=#160433, backgroundSubtle=#110328.
- Surfaces: SEMI-TRANSPARENT (glassmorphism). surface='rgba(30,10,60,0.65)', surfaceHover='rgba(45,15,85,0.75)', surfaceSecondary='rgba(22,6,45,0.55)', surfaceTertiary='rgba(35,12,70,0.50)'.
- Gold → Cyan: gold=#00F0FF, goldLight=#66F7FF, goldDark=#0099AA, goldMuted=rgba(0,240,255,0.08).
- Red → Hot magenta: red=#FF4081, redLight=#FF80AB, redDark=#C51162, redMuted=rgba(255,64,129,0.08).
- Text: textPrimary=#D0C4E8 (lavender-white), textSecondary=#8B7BA3, textMuted=#5C4D73, textTertiary=#3A2D4D, textInverse=#0D0221.
- Semantic: success=#00E5A0, error=#FF4081, warning=#FFD740, info=#00F0FF.
- Structure: border='rgba(0,240,255,0.12)', borderSubtle='rgba(0,240,255,0.05)', divider='rgba(200,184,219,0.06)', overlay='rgba(13,2,33,0.88)', shadow='rgba(0,240,255,0.06)'.
- Tab bar: tabBar='rgba(13,2,33,0.92)', tabBarBorder='rgba(0,240,255,0.10)'.
- Accent: accent=#00F0FF, accentDim=#0099AA, accentDark=#005566, accentTint='rgba(0,240,255,0.04)'.
- Map: mapTileFilter='grayscale(0.8) brightness(0.25) contrast(1.4) hue-rotate(260deg) saturate(3)', mapRouteColor=#00F0FF.
- Glow: Strong neon. textGlow='0 0 4px rgba(0,240,255,0.5), 0 0 14px rgba(0,240,255,0.2), 0 0 30px rgba(0,240,255,0.05)', textGlowSubtle='0 0 3px rgba(0,240,255,0.35)', boxGlow='0 0 15px rgba(0,240,255,0.12), 0 0 30px rgba(0,240,255,0.04), inset 0 0 15px rgba(0,240,255,0.03)', frameGlow='0 0 100px rgba(0,240,255,0.06), 0 0 2px rgba(0,240,255,0.25)'.
- Font: fontFamily='"Rajdhani", "Exo 2", system-ui, sans-serif', fontFamilyNative='System', uppercaseHeaders=false.
- Tokens: spinner=#00F0FF, switchTrack=#00F0FF, macroProtein=#FF4081, macroCarbs=#00E5A0, macroFat=#FFD740, flames=#FF4081.

### Overlay
- scanlines: false
- flicker: false
- vignette: true, color='rgba(13,2,33,0.45)'
- particles: 'neural-pulse' (NEW — see below), color='rgba(0,240,255,0.06)', opacity=0.06
- texture: 'hex', opacity=0.025

### NEW Particle Type: 'neural-pulse'
Neural network signal visualization — connection lines that briefly illuminate between random points.
- Implementation: maintain 8 fixed "node" positions scattered across the screen (random but stable per mount). Every 2-4 seconds (random interval), a thin line draws itself between two random nodes over 400ms (animated stroke — line appears progressively from point A to B), glows briefly at full opacity for 200ms, then fades out over 600ms. Line color from particleColor. Line width 1px. Additionally, the node endpoints briefly flash (opacity pulse 0→0.4→0 over the line's lifetime) as small 4px circles.
- This creates a subtle "thinking network" effect — synapses firing in the background.
- On native: use Animated.View lines (position absolute, calculated width/rotation between two points). On web: SVG lines if available, otherwise same Animated.View approach.
- Max 2 lines visible simultaneously. New line only fires after previous line's fade-out begins.

### Tab Bar Icons
Cyberpunk/neural:
- Home → { active: 'eye', inactive: 'eye-outline' }
- Schedule → { active: 'time', inactive: 'time-outline' }
- Community → { active: 'git-network', inactive: 'git-network-outline' }
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'water', inactive: 'water-outline' } (keep)
- Store → { active: 'cube', inactive: 'cube-outline' }
- Profile → { active: 'scan', inactive: 'scan-outline' }

### Empty States
- Workout: icon="🧠", title="NO COMBAT DATA", subtitle="Your ghost is quiet. Sync your cyberbrain and log combat training, Major.", actionLabel="SYNC CYBERBRAIN"
- Macros: icon="🔬", title="METABOLIC DATA ABSENT", subtitle="Section 9 requires operational readiness. Upload nutritional telemetry.", actionLabel="UPLOAD DATA"
- Community: icon="🌐", title="NET SILENCE", subtitle="The net is vast and infinite... but empty of your posts. Dive in.", actionLabel="DIVE IN"
- Schedule: icon="📡", title="NO OPERATIONS SCHEDULED", subtitle="Section 9 has no active missions. Stand by for the Chief's orders.", actionLabel="QUERY HQ"
- HR: icon="💜", title="BIOSYNC DISCONNECTED", subtitle="Prosthetic body vitals require continuous monitoring. Reconnect your sensors.", actionLabel="RECONNECT"

### Celebration Config
- confettiColors: ['#00F0FF', '#FF4081', '#00E5A0', '#FFD740', '#9B59B6'] (cyan, magenta, teal, amber, purple)
- celebrationButtonText: 'ACKNOWLEDGED'
- levelUpIcon: 'flash'

### Theme Quotes (25+ Ghost in the Shell quotes)
- "Your effort to remain what you are is what limits you." — Puppet Master
- "I feel confined, only free to expand myself within boundaries." — Major Kusanagi
- "If we all reacted the same way, we'd be predictable." — Major Kusanagi
- "There are countless ingredients that make up the human body and mind." — Major Kusanagi
- "A copy is just an identical image." — Major Kusanagi
- "The net is vast and infinite." — Major Kusanagi
- "We cling to memories as if they define us, but what we do defines us." — Ghost in the Shell
- "Overspecialize, and you breed in weakness." — Major Kusanagi
- "All things change in a dynamic environment." — Major Kusanagi
- "What if a cyber-brain could generate its own ghost?" — Project 2501
- "When I float weightless back to the surface, I'm imagining I'm becoming someone else." — Major
Write at least 25 quotes across the films and Stand Alone Complex.

### Labels
- training: 'COMBAT TRAINING'
- achievements: 'MISSION RECORDS'
- dailySpin: 'DATA EXTRACTION'
- streakLabel: 'day uplinked'

### Sound Design (ghostSound)
Ethereal, crystalline, digital. Neural net processing. Layered sines with slight detune for chorus.
- tap: Crystalline ping. freq=1200 + freq=1205 (detune +8), wave='sine', duration=0.08, gain=0.07/0.04.
- success: Ascending ethereal chord. freq=440→550, 660→770, 880→990, wave='sine', duration=0.30/0.30/0.35, gains=0.08/0.07/0.06, delays=0/0.03/0.06, all with sweep.
- error: Discordant beating. freq=200 + freq=203, wave='sine', duration=0.20, gains=0.12/0.10.
- navigate: Quick high blip. freq=900, wave='sine', duration=0.06, gain=0.06.
- open: Rising harmonic. freq=300→900, wave='sine', duration=0.20, gain=0.07.
- close: Descending harmonic. freq=800→250, wave='sine', duration=0.18, gain=0.06.

### ThemeDefinition
id='ghost', name='Ghost in the Shell', description='Your ghost whispers to me', icon='eye-outline', isDark=true, soundTheme='ghost', webFontUrl='https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap'

---

## THEME 5: BLADE RUNNER — "Tears in Rain"

### Film Reference
Neo-noir Los Angeles 2019 from Blade Runner (1982). NOT a computer interface — an ATMOSPHERE. Neon signs in rain puddles. Warm amber against cool teal night. Wet glass surfaces. Heavy rain. Film grain. The UI feels like you're looking at it through a rain-streaked car windshield at 2am in downtown LA. Key differentiator: CINEMATIC not technological. Warm/cool color tension. Rain IS the identity.

### Colors
- Backgrounds: Dark teal-gray (NOT black, NOT navy). background=#0A1A1F, backgroundElevated=#122830, backgroundSubtle=#0E2025.
- Surfaces: Semi-transparent warm rain glass. surface='rgba(20,50,60,0.75)', surfaceHover='rgba(30,70,85,0.80)', surfaceSecondary='rgba(15,40,50,0.65)', surfaceTertiary='rgba(25,60,72,0.60)'.
- Gold → Burnt orange neon: gold=#FF6F3C, goldLight=#FF9966, goldDark=#CC4A1A, goldMuted=rgba(255,111,60,0.10).
- Red → Neon red: red=#FF3D3D, redLight=#FF6666, redDark=#CC1A1A, redMuted=rgba(255,61,61,0.08).
- Text: textPrimary=#C5D8E8 (cool steel moonlight), textSecondary=#7A97AB, textMuted=#4A6678, textTertiary=#2C4050, textInverse=#0A1A1F.
- Semantic: success=#00CC88, error=#FF3D3D, warning=#FFB347, info=#4DC9F6.
- Structure: border='rgba(255,111,60,0.12)', borderSubtle='rgba(255,111,60,0.06)', divider='rgba(197,216,232,0.05)', overlay='rgba(10,26,31,0.88)', shadow='rgba(0,0,0,0.45)'.
- Tab bar: tabBar='rgba(10,22,28,0.95)', tabBarBorder='rgba(255,111,60,0.10)'.
- Accent: accent=#FF6F3C, accentDim=#CC4A1A, accentDark=#662510, accentTint='rgba(255,111,60,0.05)'.
- Map: mapTileFilter='grayscale(0.5) brightness(0.30) contrast(1.3) sepia(0.2) hue-rotate(170deg) saturate(2)', mapRouteColor=#FF6F3C.
- Glow: Warm neon diffused through rain. textGlow='0 0 4px rgba(255,111,60,0.45), 0 0 12px rgba(255,111,60,0.15), 0 0 24px rgba(255,80,30,0.06)', textGlowSubtle='0 0 3px rgba(255,111,60,0.3)', boxGlow='0 0 12px rgba(255,111,60,0.14), 0 0 24px rgba(255,111,60,0.04), inset 0 0 8px rgba(255,111,60,0.03)', frameGlow='0 0 80px rgba(255,111,60,0.08), 0 0 160px rgba(255,80,30,0.03), 0 0 2px rgba(255,111,60,0.25)'.
- Font: fontFamily='"Bebas Neue", "Rajdhani", system-ui, sans-serif', fontFamilyNative='System', uppercaseHeaders=false. Condensed display font — 80s sci-fi movie poster.
- Tokens: spinner=#FF6F3C, switchTrack=#FF6F3C, macroProtein=#FF6F3C, macroCarbs=#4DC9F6, macroFat=#FFB347, flames=#FF6F3C.

### Overlay
- scanlines: false — NOT a CRT
- flicker: false
- vignette: true, color='rgba(5,15,18,0.65)' — HEAVY, like a dirty windshield
- particles: 'neon-reflections' (NEW — see below), color='rgba(150,200,230,0.20)', opacity=0.20
- texture: 'noise', opacity=0.045 — visible film grain

### NEW Particle Type: 'neon-reflections'
Heavy rain with occasional neon color flashes in the background — not just white drops.
- Base: the existing 'rain-drops' logic but with MORE drops (80 instead of 50), FASTER (speed 600-1000ms instead of 800-1200), and slightly angled (rotate 5deg instead of 3deg).
- Addition: every 3-5 seconds, one of the rain drops should be a "neon drop" — colored orange (#FF6F3C at opacity 0.3) or cyan (#4DC9F6 at opacity 0.3) instead of the base color. These neon drops are slightly wider (2px instead of 1px) and have a subtle glow trail.
- Background ambiance: at the very bottom of the screen (last 100px), add a subtle horizontal reflection effect — a thin band of color (the particleColor) at opacity 0.03, simulating wet ground reflecting the neon rain. This is a static View, not animated.

### Tab Bar Icons
Noir/detective feel:
- Home → { active: 'home', inactive: 'home-outline' } (keep — contrast with the atmospheric theme, grounded)
- Schedule → { active: 'calendar', inactive: 'calendar-outline' } (keep)
- Community → { active: 'chatbubbles', inactive: 'chatbubbles-outline' }
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'water', inactive: 'water-outline' } (keep)
- Store → { active: 'storefront', inactive: 'storefront-outline' }
- Profile → { active: 'person', inactive: 'person-outline' } (keep)

### Empty States
- Workout: icon="🌧️", title="NO SESSIONS RECORDED", subtitle="I've seen things you people wouldn't believe. But first, log a workout.", actionLabel="LOG SESSION"
- Macros: icon="🍜", title="NO NUTRITION DATA", subtitle="You look like a good Joe. Track your meals at the noodle bar.", actionLabel="START TRACKING"
- Community: icon="🌃", title="THE CITY IS QUIET", subtitle="All those moments will be lost in time, like tears in rain. Post something before they fade.", actionLabel="CREATE POST"
- Schedule: icon="🔍", title="NOTHING SCHEDULED", subtitle="Retirement isn't on the calendar today. Check back for upcoming sessions.", actionLabel="BROWSE SCHEDULE"
- HR: icon="🧡", title="NO VITALS DETECTED", subtitle="A Voight-Kampff test requires a heartbeat. Connect your monitor.", actionLabel="CONNECT"

### Celebration Config
- confettiColors: ['#FF6F3C', '#4DC9F6', '#FFB347', '#FF3D3D', '#C5D8E8'] (warm neon + cool rain)
- celebrationButtonText: 'TIME TO LIVE'
- levelUpIcon: 'arrow-up-circle'

### Theme Quotes (25+ Blade Runner quotes)
- "All those moments will be lost in time, like tears in rain." — Roy Batty
- "I've seen things you people wouldn't believe." — Roy Batty
- "It's too bad she won't live. But then again, who does?" — Gaff
- "The light that burns twice as bright burns half as long." — Tyrell
- "More human than human is our motto." — Tyrell
- "Quite an experience to live in fear, isn't it? That's what it is to be a slave." — Roy
- "You've done a man's job, sir!" — Gaff
- "Wake up! Time to die!" — Leon
- "I want more life." — Roy Batty
- "Do you like our owl?" — Rachael
- "You were made as well as we could make you." — Tyrell
- "Replicants are like any other machine. They're either a benefit or a hazard." — Bryant
- "I'm not in the business. I am the business." — Rachael
- "Sometimes to love someone, you gotta be a stranger." — Deckard (2049)
- "You look lonely. I can fix that." — Joi (2049)
- "Every civilization was built on the back of a disposable workforce." — Wallace (2049)
- "Dying for the right cause is the most human thing we can do." — Freysa (2049)
Write at least 25 quotes across both films.

### Labels
- training: 'TRAINING'  (keep default — the film doesn't have jargon for this)
- achievements: 'CASE FILES'
- dailySpin: 'DAILY SCAN'
- streakLabel: 'day surviving'

### Sound Design (bladerunnerSound)
Vangelis synth pads. Warm, reverberant, melancholic. Slow attacks.
- tap: Warm thump. freq=250, wave='sine', duration=0.10, gain=0.08, attack=0.02.
- success: Slow warm chord. freq=261→329→392, wave='sine', durations=0.40/0.40/0.50, gains=0.08/0.07/0.06, attacks=0.05, delays=0/0.02/0.04.
- error: Low mournful tone. freq=150, wave='sine', duration=0.35, gain=0.12, attack=0.03, sweep=100.
- navigate: Gentle raindrop. freq=700, wave='sine', duration=0.08, gain=0.06, attack=0.01.
- open: Slow warm rise. freq=200, wave='sine', duration=0.30, gain=0.07, attack=0.06, sweep=500.
- close: Slow warm descent. freq=450, wave='sine', duration=0.25, gain=0.06, attack=0.04, sweep=150.

### ThemeDefinition
id='bladerunner', name='Blade Runner', description="All those moments will be lost in time, like tears in rain", icon='rainy-outline', isDark=true, soundTheme='bladerunner', webFontUrl='https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600&display=swap'

---

## THEME 6: SHEIKAH SLATE (Zelda: Breath of the Wild) — NEW

### Film/Game Reference
The Sheikah Slate UI from Breath of the Wild. Ancient technology reawakened. Precision minimalism. Soft blue luminance against deep dark. Geometric shapes. Everything carved from light. NEITHER CRT NOR hologram NOR workstation — a divine relic. Calm, meditative, sacred. Key differentiator from GiTS: softer blue (sky-blue not electric cyan), OPAQUE surfaces (not glassmorphic), uppercase headers, MINIMAL effects, calm not busy.

### Colors
- Backgrounds: Deep slate-blue. background=#0A1628, backgroundElevated=#12203A, backgroundSubtle=#0E1B30.
- Surfaces: Opaque dark slate with inner luminance feel. surface=#162A48, surfaceHover=#1E3658, surfaceSecondary=#142440, surfaceTertiary=#1A3050.
- Gold → Sheikah sky-blue: gold=#5AC8FA, goldLight=#7DD8FF, goldDark=#3A8FBB, goldMuted=rgba(90,200,250,0.10).
- Red → Guardian amber-orange: red=#FF9500, redLight=#FFB340, redDark=#CC7700, redMuted=rgba(255,149,0,0.08).
- Text: textPrimary=#D8E4F0, textSecondary=#8A9DB5, textMuted=#5A7088, textTertiary=#3A5068, textInverse=#0A1628.
- Semantic: success=#4CD964, error=#FF3B30, warning=#FF9500, info=#5AC8FA.
- Structure: border='rgba(90,200,250,0.10)', borderSubtle='rgba(90,200,250,0.05)', divider='rgba(216,228,240,0.05)', overlay='rgba(10,22,40,0.90)', shadow='rgba(0,0,0,0.35)'.
- Tab bar: tabBar=#0C1830, tabBarBorder='rgba(90,200,250,0.08)'.
- Accent: accent=#5AC8FA, accentDim=#3A8FBB, accentDark=#1E5A7A, accentTint='rgba(90,200,250,0.05)'.
- Map: mapTileFilter='grayscale(0.6) brightness(0.40) contrast(1.1) hue-rotate(190deg) saturate(1.5)', mapRouteColor=#5AC8FA.
- Glow: Soft ethereal luminance. textGlow='0 0 4px rgba(90,200,250,0.35), 0 0 10px rgba(90,200,250,0.12)', textGlowSubtle='0 0 2px rgba(90,200,250,0.25)', boxGlow='0 0 8px rgba(90,200,250,0.10), 0 0 16px rgba(90,200,250,0.03)', frameGlow='0 0 60px rgba(90,200,250,0.05), 0 0 1px rgba(90,200,250,0.18)'.
- Font: fontFamily='"Rajdhani", "Exo 2", system-ui, sans-serif', fontFamilyNative='System', uppercaseHeaders=true.
- Tokens: spinner=#5AC8FA, switchTrack=#5AC8FA, macroProtein=#FF3B30, macroCarbs=#5AC8FA, macroFat=#FF9500, flames=#FF9500.

### Overlay
- scanlines: false
- flicker: false
- vignette: true, color='rgba(10,22,40,0.30)' — very subtle
- particles: 'sheikah-runes' (NEW — see below), color='rgba(90,200,250,0.06)', opacity=0.06
- texture: 'none', opacity=0 — ancient tech is PERFECT, no grain

### NEW Particle Type: 'sheikah-runes'
Slowly rising geometric shapes — ancient rune energy dissipating upward.
- 10-15 small shapes (4-8px): circles (borderRadius:50%), diamonds (rotated 45° squares), triangles (border trick)
- Start at random X, random Y in lower 2/3 of screen
- Float UPWARD slowly (8-15 seconds per shape, much slower than rain/data-streams)
- Fade: 20% fade-in, 60% hold, 20% fade-out
- Very slow rotation (~1 revolution per 20s)
- When shape completes, reset to new random position in lower 2/3
- Color from particleColor. Randomize shape type per particle.
- Calm. Meditative. The opposite of Matrix rain.

### Tab Bar Icons
Ancient/sacred technology:
- Home → { active: 'compass', inactive: 'compass-outline' }
- Schedule → { active: 'map', inactive: 'map-outline' }
- Community → { active: 'people', inactive: 'people-outline' } (keep)
- Book → { active: 'add-circle', inactive: 'add-circle-outline' } (keep)
- Hydration → { active: 'water', inactive: 'water-outline' } (keep)
- Store → { active: 'diamond', inactive: 'diamond-outline' }
- Profile → { active: 'shield', inactive: 'shield-outline' }

### Empty States
- Workout: icon="⚔️", title="NO TRAINING RECORDED", subtitle="A hero must prepare. The Sheikah Slate logs all trials. Begin your training.", actionLabel="BEGIN TRIAL"
- Macros: icon="🍎", title="NO MEALS LOGGED", subtitle="Even the Hero of Hyrule must eat. Cook a meal and log your hearty intake.", actionLabel="LOG MEAL"
- Community: icon="🏔️", title="THE LAND IS QUIET", subtitle="Hyrule awaits your story. Share your adventures with fellow travelers.", actionLabel="SHARE"
- Schedule: icon="🏛️", title="NO SHRINES AVAILABLE", subtitle="No trials are scheduled. Meditate and return when the Goddess guides you.", actionLabel="VIEW MAP"
- HR: icon="💙", title="SHEIKAH SENSOR OFFLINE", subtitle="The ancient technology requires calibration. Connect your heart rate sensor.", actionLabel="CALIBRATE"

### Celebration Config
- confettiColors: ['#5AC8FA', '#7DD8FF', '#3A8FBB', '#FF9500', '#4CD964'] (Sheikah blue family + amber + green)
- celebrationButtonText: 'SPIRIT ORB COLLECTED'
- levelUpIcon: 'star'

### Theme Quotes (25+ Zelda quotes and proverbs)
- "It's dangerous to go alone." — Old Man, The Legend of Zelda
- "The flow of time is always cruel." — Sheik, Ocarina of Time
- "Courage need not be remembered, for it is never forgotten." — Zelda, Breath of the Wild
- "A sword wields no strength unless the hand that holds it has courage." — Hero's Shade, Twilight Princess
- "The right thing... is not always real." — Midna, Twilight Princess
- "Time passes, people move. Like a river's flow, it never ends." — Sheik
- "Shadow and light are two sides of the same coin." — Princess Zelda, Twilight Princess
- "Open your eyes." — Zelda, Breath of the Wild
- "Your current power alone is not enough." — Impa
- "The goddess smiles upon you." — Zelda
- "May the Goddess smile upon you." — Hylian blessing
- "Even the smallest person can change the course of the future." — Zelda
- "Link... you may not be at a point where you have fully recovered your power or memories, but courage need not be remembered." — Zelda
- "Wake up, Link." — Zelda, Breath of the Wild
Write at least 25 quotes across all Zelda games.

### Labels
- training: 'TRAINING TRIALS'
- achievements: 'SPIRIT ORBS'
- dailySpin: 'GODDESS OFFERING'
- streakLabel: 'day quest'

### Sound Design (NEW sheikahSound function)
Clean, musical, slightly magical. Bell-like chimes. Every sound = a Sheikah Slate menu interaction.
- tap: Clean bright chime. freq=880, wave='sine', duration=0.10, gain=0.09.
- success: Ascending two-note chime (Shrine completion). freq=659→988, wave='sine', durations=0.18/0.25, gains=0.10/0.09, delays=0/0.10. Perfect fifth.
- error: Soft dissonant tone. freq=330 + freq=349, wave='triangle', duration=0.18, gains=0.11/0.09. Minor second.
- navigate: Quick light ping. freq=1047, wave='sine', duration=0.06, gain=0.07.
- open: Rising bell chime. freq=523, wave='sine', duration=0.15, gain=0.08, sweep=880.
- close: Falling bell chime. freq=784, wave='sine', duration=0.12, gain=0.07, sweep=440.

Add 'sheikah' to SoundTheme union. Add case in playSynth switch.

### ThemeDefinition
id='sheikah', name='Sheikah Slate', description='Sheikah Slate activated', icon='tablet-portrait-outline', isDark=true, soundTheme='sheikah', webFontUrl='https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap'

---

## FINAL INTEGRATION CHECKLIST

1. **ThemeDefinition interface** — add the new optional fields (tabIcons, emptyStates, celebration, quotes, labels, spinnerStyle)
2. **TabNavigator.tsx** — read tabIcons from current theme and merge with defaults
3. **EmptyState.tsx** — read emptyStates from current theme, use overrides in each preset component
4. **Confetti.tsx** — read celebration.confettiColors from theme, fall back to hardcoded defaults
5. **CelebrationModal.tsx** — read celebration.celebrationButtonText and celebration.levelUpIcon from theme
6. **HomeScreen.tsx** — if theme.quotes is populated, use those for daily quote instead of default quotes pool
7. **Relevant screens** — use theme.labels overrides for section headers where applicable
8. **ThemeContext.tsx** — add 'sheikah' to ThemeMode union
9. **themes.ts** — add sheikahTheme to ALL_THEMES
10. **ThemeOverlay.tsx** — add 5 new particle types: motion-tracker, wireframe-grid, neural-pulse, neon-reflections, sheikah-runes
11. **synth.ts** — add 'sheikah' to SoundTheme, add sheikahSound function, add case in playSynth
12. **Verify** — every ThemeColors object has all 50+ fields. Every ThemeOverlayConfig has all fields. Every new theme has all new optional fields populated.

Work through EACH THEME completely before starting the next. Each theme should take significant effort — the particle effects alone (motion-tracker, wireframe-grid, neural-pulse, neon-reflections, sheikah-runes) are each custom animated components. The quotes need to be sourced and written. The empty states need to be written in-voice. Do not rush. Do not shortcut. Do not approximate.
