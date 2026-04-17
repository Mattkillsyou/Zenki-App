# PIP-BOY RESTYLE — COMPLETE IMPLEMENTATION PROMPT

## ⚠️ ANTI-SIMPLIFICATION DIRECTIVE ⚠️

**READ THIS FIRST. THIS IS THE MOST IMPORTANT INSTRUCTION.**

You have a pattern of simplifying, stubbing, and truncating code. DO NOT DO THIS. I will reject the output if you:
- Write `// ... rest of component` or `// similar for other items`
- Output `// TODO: implement`
- Say "simplified for brevity" or "abbreviated"
- Skip rendering items in a list because "they follow the same pattern"
- Collapse 10 stat rows into a comment saying "repeat for each stat"
- Omit error handling, edge cases, or conditional branches
- Create a component with fewer than the specified number of features
- Produce a file under 200 lines when the spec clearly requires 400+

**Every file must be COMPLETE, COMPILABLE, and PRODUCTION-READY. Every function fully implemented. Every UI element fully rendered. Every prop fully typed. Every style fully defined. If I specify 12 stat rows, I expect to see 12 <PipBoyStatRow> JSX elements in the code. If I specify 4 tab views, I expect 4 complete render functions with full UI — not 1 real tab and 3 stubs.**

**WRITE LONG FILES. A 600-line screen component is NORMAL and EXPECTED for this level of feature density. Do not artificially compress.**

---

## PROJECT CONTEXT

**Framework**: Expo 52 + React Native 0.76.3 + React 18.3.1 + TypeScript
**Location**: `D:\Zenki\App`
**Runs on**: iOS, Android, Web (`expo start --web`)
**Web constraint**: 430px width frame in App.tsx
**Styling**: React Native `StyleSheet.create()` + `Platform.OS === 'web'` for web-specific CSS
**State**: React Context + AsyncStorage (no Redux, no Zustand)
**Maps**: Leaflet (already installed, dynamically imported on web via `require('leaflet')`)
**Location**: expo-location (already installed, permissions already handled)
**Sound**: Web Audio API via `src/sounds/synth.ts` (procedural tones, no audio files)
**Navigation**: @react-navigation/stack v7 — ActivityTrackerScreen is a push-stack screen

**DO NOT**: scaffold a new project, install Tailwind, install new npm packages, change the framework, break other screens.

---

## EXISTING CODE MAP (read each file before modifying)

### Files you MUST read first:
```
src/screens/ActivityTrackerScreen.tsx    ← 447 lines, full rewrite target
src/context/GpsActivityContext.tsx       ← 255 lines, add features
src/theme/colors.ts                     ← 189 lines, add pipboy palette
src/theme/typography.ts                 ← 95 lines, add pipboy fonts
src/theme/spacing.ts                    ← 66 lines, reference only
src/types/activity.ts                   ← 58 lines, add new types
src/utils/gps.ts                        ← 163 lines, add new utils
src/context/GamificationContext.tsx      ← read to access level/XP/streak
src/context/HeartRateContext.tsx         ← read to access HR data
src/context/SoundContext.tsx             ← read to access sound system
src/context/AuthContext.tsx              ← read to access user.id
src/sounds/synth.ts                     ← read to understand sound themes
src/components/LineChart.tsx             ← read for chart pattern (SVG-based)
App.tsx                                 ← 127 lines, update web frame
```

### Key interfaces already defined in `src/types/activity.ts`:
```typescript
GpsPoint { latitude, longitude, altitude: number|null, speed: number|null, timestamp: number }
GpsActivity { id, memberId, type, startedAt, endedAt, durationSeconds, distanceMeters, elevationGainMeters, avgPaceSecsPerKm, maxSpeedMps, route: GpsPoint[], splits: SplitData[], calories }
SplitData { splitNumber, distanceMeters, durationSeconds, paceSecsPerKm, elevationDelta }
GpsActivityType = 'run' | 'walk' | 'bike' | 'hike'
GPS_ACTIVITY_LABELS, GPS_ACTIVITY_ICONS, GPS_ACTIVITY_METS — all Record<GpsActivityType, ...>
```

### Key utils already defined in `src/utils/gps.ts`:
```typescript
haversineMeters(lat1, lon1, lat2, lon2): number
totalDistance(route: GpsPoint[]): number         // meters
totalElevationGain(route: GpsPoint[]): number    // meters (uphill only)
paceSecsPerKm(distMeters, durSecs): number
formatPace(secsPerKm): string                    // "M:SS"
formatDistance(meters, useMiles?): string         // "2.34"
distanceUnit(useMiles?): string                  // "mi" or "km"
formatPaceForUnit(secsPerKm, useMiles?): string
paceUnit(useMiles?): string
computeSplits(route, splitDistM?): SplitData[]
estimateCaloriesMET(met, weightKg, durationSecs): number
downsampleRoute(route, maxPts?): GpsPoint[]
```

### Key context values available via hooks:
```typescript
useAuth()         → { user: { id, name, belt, ... } }
useGpsActivity()  → { isTracking, currentActivityType, liveDistance, liveDuration, livePace, liveElevGain, liveSpeed, currentPosition, startTracking, stopTracking, activities, memberActivities }
useTheme()        → { colors, isDark }  // DO NOT use theme colors on PipBoy screens — use pipboy palette directly
useSound()        → { play(event), enabled, volume }
useGamification() → { state: { xp, level, streak, dojoPoints, flames, ... }, levelInfo: { level, currentXP, nextLevelXP, progress } }
useHeartRate()    → { currentBpm, isRecording, bleStatus, ... }
```

### Sound system (`src/sounds/synth.ts`):
- `playSynth(theme: SoundTheme, event: SoundEvent)` — plays procedural Web Audio tones
- SoundTheme: `'default' | 'retro' | 'zen'`
- SoundEvent: `'tap' | 'success' | 'error' | 'levelUp' | 'swipe' | 'toggle' | 'confirm' | 'cancel'`
- Add a new `'pipboy'` theme with Geiger-counter tick sounds (see Phase 7)

---

## PHASE 1: THEME INFRASTRUCTURE (2 files modified)

### 1A. File: `src/theme/colors.ts` — ADD (do not modify existing code)

```typescript
/** Fallout Pip-Boy monochrome green palette. */
export const pipboy = {
  // Core greens
  primary:      '#00ff41',     // CRT phosphor green — text, borders, active elements
  primaryDim:   '#00cc33',     // secondary text, inactive elements
  primaryDark:  '#003b00',     // darkest green — dot leaders, subtle borders, muted
  primaryMid:   '#007a1e',     // mid-range green for gradients, secondary borders

  // Backgrounds
  bg:           '#0a0f0a',     // screen background — near-black with green tint
  bgPure:       '#000000',     // true black for outer frame
  surface:      '#0d1a0d',     // elevated panel background
  surfaceHover: '#1a2e1a',     // pressed/hover state background
  surfaceAlt:   '#112211',     // alternate surface for visual separation

  // Borders
  border:       '#004d00',     // visible panel borders
  borderDim:    '#002200',     // subtle dividers
  borderBright: '#00ff41',     // active/focused borders

  // Glow effects (web CSS strings)
  textShadow:       '0 0 4px #00ff41, 0 0 8px #00ff41, 0 0 16px #003b00',
  textShadowSubtle: '0 0 2px #00ff41, 0 0 4px #003b00',
  textShadowStrong: '0 0 6px #00ff41, 0 0 12px #00ff41, 0 0 24px #00ff41, 0 0 48px #003b00',
  boxGlow:          '0 0 8px rgba(0,255,65,0.3), inset 0 0 8px rgba(0,255,65,0.05)',
  boxGlowStrong:    '0 0 16px rgba(0,255,65,0.4), 0 0 32px rgba(0,255,65,0.1)',

  // Overlays
  scanline:     'rgba(0, 255, 65, 0.03)',
  scanlineHeavy:'rgba(0, 255, 65, 0.06)',
  noise:        'rgba(0, 255, 65, 0.02)',
  vignette:     'rgba(0, 0, 0, 0.7)',

  // Semantic (still green, but differentiated)
  danger:       '#00ff41',     // same green — danger indicated by blinking, not color change
  warning:      '#33ff00',     // slightly yellow-green for warnings
  inactive:     '#1a3a1a',     // very dim for disabled states
};
```

### 1B. File: `src/theme/typography.ts` — ADD (do not modify existing code)

```typescript
/** Pip-Boy terminal font stack. VT323 on web (loaded via Google Fonts), monospace fallback on native. */
export const pipboyFontFamily = Platform.OS === 'web'
  ? '"VT323", "Share Tech Mono", "Courier New", monospace'
  : 'Courier';

/** Full Pip-Boy type scale — all single-weight (VT323 has no bold). */
export const pipboyTypography = {
  heroTitle:    { fontSize: 32, fontWeight: '400' as const, lineHeight: 38, letterSpacing: 2, textTransform: 'uppercase' as const },
  pageTitle:    { fontSize: 26, fontWeight: '400' as const, lineHeight: 32, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  sectionTitle: { fontSize: 20, fontWeight: '400' as const, lineHeight: 26, letterSpacing: 1, textTransform: 'uppercase' as const },
  statValue:    { fontSize: 36, fontWeight: '400' as const, lineHeight: 42, letterSpacing: -1 },
  statValueSm:  { fontSize: 24, fontWeight: '400' as const, lineHeight: 30, letterSpacing: -0.5 },
  statLabel:    { fontSize: 14, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  body:         { fontSize: 16, fontWeight: '400' as const, lineHeight: 24, letterSpacing: 0.5 },
  bodySmall:    { fontSize: 13, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 0.3 },
  caption:      { fontSize: 11, fontWeight: '400' as const, lineHeight: 14, letterSpacing: 1, textTransform: 'uppercase' as const },
  button:       { fontSize: 16, fontWeight: '400' as const, lineHeight: 20, letterSpacing: 2, textTransform: 'uppercase' as const },
  tabLabel:     { fontSize: 14, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 3, textTransform: 'uppercase' as const },
  mono:         { fontSize: 14, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 0.5 },
  monoSmall:    { fontSize: 11, fontWeight: '400' as const, lineHeight: 14, letterSpacing: 0.3 },
  tableHeader:  { fontSize: 12, fontWeight: '400' as const, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' as const },
  tableCell:    { fontSize: 13, fontWeight: '400' as const, lineHeight: 18, letterSpacing: 0.3 },
};
```

Add `import { Platform } from 'react-native';` at top of file.

---

## PHASE 2: NEW COMPONENT FILES (6 new files)

### 2A. File: `src/components/PipBoyShell.tsx` (NEW — expect ~350 lines)

Full CRT terminal wrapper component. Props:
```typescript
interface PipBoyShellProps {
  children: React.ReactNode;
  activeTab?: 'STATS' | 'MAP' | 'DATA' | 'RADIO';
  onTabChange?: (tab: 'STATS' | 'MAP' | 'DATA' | 'RADIO') => void;
  showTabs?: boolean;          // default true
  showStatusBar?: boolean;     // default true
  showScanlines?: boolean;     // default true
  title?: string;              // blinking cursor title in top-left
  headerRight?: React.ReactNode; // optional top-right widget
  scanlineIntensity?: number;  // 0.03 normal, 0.06 heavy (for paused state)
}
```

**MUST implement ALL of these layers (in z-index order, bottom to top):**

1. **Root container**: `backgroundColor: pipboy.bg`, full flex, `fontFamily: pipboyFontFamily` on web
2. **Google Fonts loader**: `useEffect` on web injects `<link>` for VT323 + Share Tech Mono into `document.head` if not already present. Check by ID `pipboy-fonts`.
3. **Inject global CSS**: `useEffect` on web injects a `<style id="pipboy-global-css">` tag with:
   ```css
   @keyframes pipboy-flicker {
     0% { opacity: 0.97; }
     5% { opacity: 1.0; }
     10% { opacity: 0.98; }
     15% { opacity: 1.0; }
     50% { opacity: 0.99; }
     55% { opacity: 0.97; }
     70% { opacity: 1.0; }
     80% { opacity: 0.98; }
     100% { opacity: 1.0; }
   }
   @keyframes pipboy-blink {
     0%, 100% { opacity: 1; }
     50% { opacity: 0; }
   }
   @keyframes pipboy-pulse {
     0%, 100% { opacity: 1; }
     50% { opacity: 0.4; }
   }
   @keyframes pipboy-scanmove {
     0% { transform: translateY(0); }
     100% { transform: translateY(4px); }
   }
   .pipboy-text { font-family: "VT323", "Share Tech Mono", "Courier New", monospace; text-shadow: 0 0 4px #00ff41, 0 0 8px #00ff41; }
   .pipboy-text-dim { font-family: "VT323", "Share Tech Mono", "Courier New", monospace; text-shadow: 0 0 2px #00cc33; }
   .pipboy-blink { animation: pipboy-blink 1s step-end infinite; }
   .pipboy-flicker { animation: pipboy-flicker 4s infinite; }
   ```
4. **Content area**: renders `children` between tab bar and status bar
5. **Tab bar** (rendered if `showTabs`):
   - 4 tabs: STATS, MAP, DATA, RADIO
   - Each tab: touchable, uppercase text, letterSpacing 3
   - Active tab: `color: pipboy.primary`, bottom border 2px `pipboy.primary`, subtle glow
   - Inactive tabs: `color: pipboy.primaryDark`, no bottom border
   - Separator between tabs: `│` character in `pipboy.primaryDark`
   - Entire bar has top border: `═══════════` repeated (box-drawing character)
   - On press: calls `onTabChange`, plays `tap` sound via `useSound()`
6. **Status bar footer** (rendered if `showStatusBar`):
   - Top border: thin 1px `pipboy.border`
   - Left: `HP ███/███` as solid green bar (always full — decorative)
   - Center: real date/time formatted as `MM.DD.YYYY HH:MM` from `new Date()`, updates every second via `setInterval`
   - Right: `LVL {level}` pulled from `useGamification().levelInfo.level`
   - All text `pipboy.primaryDim`, fontSize 11, monospace
7. **Scanline overlay** (rendered if `showScanlines`):
   - Absolutely positioned, full screen, `pointerEvents: 'none'`
   - On web: `<div>` with CSS `background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,65,${scanlineIntensity}) 2px, rgba(0,255,65,${scanlineIntensity}) 4px);`
   - On native: render using a semi-transparent View with repeating pattern (or skip — native doesn't need CRT effects)
8. **Vignette overlay**:
   - Absolutely positioned, full screen, `pointerEvents: 'none'`
   - On web: `background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%);`
9. **Flicker wrapper**:
   - On web: apply `className: 'pipboy-flicker'` to the root container

### 2B. File: `src/components/PipBoyPanel.tsx` (NEW — expect ~150 lines)

ASCII box-drawing bordered container.

Props:
```typescript
interface PipBoyPanelProps {
  title?: string;
  children: React.ReactNode;
  variant?: 'single' | 'double';   // single = ┌─┐, double = ╔═╗ (default double)
  noPadding?: boolean;
  collapsible?: boolean;            // tap title to collapse/expand
  defaultCollapsed?: boolean;
  rightHeader?: React.ReactNode;    // widget in title bar (e.g., count badge)
  glowing?: boolean;                // extra glow on border
}
```

Implementation:
- On web: render Unicode box-drawing characters as absolutely positioned text
  - Top: `╔` + `═` repeated to fill width + `╗`
  - If title: `╠` + `═══` + ` TITLE ` + `═══` + `╣` (title interrupts the line)
  - Sides: `║` on left and right (positioned absolutely)
  - Bottom: `╚` + `═` repeated + `╝`
  - All box chars in `pipboy.border`, title in `pipboy.primary` with glow
- On native: 2px solid border in `pipboy.border`, title as text with line-through decoration
- `collapsible`: animated height collapse with `Animated.Value`
- `glowing`: web `box-shadow: ${pipboy.boxGlow}`
- Content padding: 12px horizontal, 8px vertical (unless `noPadding`)

### 2C. File: `src/components/PipBoyStatRow.tsx` (NEW — expect ~120 lines)

Dot-leader stat display.

Props:
```typescript
interface PipBoyStatRowProps {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;      // extra glow on value
  blinking?: boolean;       // append ▮ cursor
  dimLabel?: boolean;       // label in primaryDark instead of primaryDim
  compact?: boolean;        // smaller font size
  prefix?: string;          // e.g., ">" for list items
}
```

Implementation:
- Layout: single row, `flexDirection: 'row'`
- Label: UPPERCASE, `pipboy.primaryDim` (or `primaryDark` if `dimLabel`)
- Dots: `pipboy.primaryDark`, fill remaining space. Calculate dot count:
  - Use `onLayout` to get container width
  - Measure label text width + value text width (estimate: charCount × fontSize × 0.6 for VT323)
  - Fill remaining space with `.` characters
  - Minimum 3 dots always shown
- Value: `pipboy.primary`, right-aligned
- Unit: `pipboy.primaryDim`, appended after value with space
- If `highlight`: on web, `textShadow: pipboy.textShadowStrong`
- If `blinking`: append `<Text style={{animation: pipboy-blink}}>▮</Text>` (web) or `Animated.View` opacity loop (native)
- If `prefix`: render before label in `pipboy.primary`
- `compact`: use `pipboyTypography.monoSmall` instead of `mono`
- All text: `fontFamily: pipboyFontFamily`

### 2D. File: `src/components/PipBoyButton.tsx` (NEW — expect ~130 lines)

Terminal button with bracket decoration.

Props:
```typescript
interface PipBoyButtonProps {
  label: string;
  onPress: () => void;
  icon?: string;            // Ionicons name
  variant?: 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
}
```

Implementation:
- Render: `[ ► LABEL ]` with bracket decorations
  - `[` and `]` in `pipboy.primaryDim`
  - Icon (Ionicons) + label in `pipboy.primary`
  - Brackets, icon, and label all monospace
- Default state: `backgroundColor: 'transparent'`, `borderWidth: 2`, `borderColor: pipboy.border`
- Pressed state (use `useState` + `onPressIn`/`onPressOut`): INVERT — `backgroundColor: pipboy.primary`, text `color: pipboy.bgPure`
- On web: `cursor: pointer`, `transition: all 0.1s ease`
- `variant: 'danger'`: border blinks between `pipboy.primary` and `pipboy.primaryDark`
- `variant: 'ghost'`: no border, just text
- `disabled`: `opacity: 0.3`, no press handler
- `loading`: replace label with animated `PROCESSING...` with cycling dots
- `size`: sm = paddingV 6, fontSize 12 | md = paddingV 12, fontSize 16 | lg = paddingV 16, fontSize 18
- `fullWidth`: `width: '100%'`
- Play `tap` sound on press via `useSound()`

### 2E. File: `src/components/PipBoyProgressBar.tsx` (NEW — expect ~80 lines)

ASCII block character progress bar.

Props:
```typescript
interface PipBoyProgressBarProps {
  progress: number;         // 0-1
  width?: number;           // char count (default 20)
  label?: string;           // left label
  showPercent?: boolean;    // show "67%" right
  animated?: boolean;       // animate fill
  variant?: 'bar' | 'segmented';  // ████░░░ vs [■■■■□□□]
}
```

Implementation:
- `bar` variant: filled = `█`, empty = `░`, all in monospace
  - Filled chars in `pipboy.primary`
  - Empty chars in `pipboy.primaryDark`
- `segmented` variant: filled = `■`, empty = `□`, wrapped in `[` `]`
- Label left of bar in `pipboy.primaryDim`
- Percent right of bar in `pipboy.primary`
- `animated`: fill chars appear one at a time over 500ms using `useEffect` + `setTimeout` chain

### 2F. File: `src/components/PipBoyTable.tsx` (NEW — expect ~180 lines)

ASCII-bordered data table.

Props:
```typescript
interface PipBoyTableProps {
  columns: { key: string; header: string; width?: number; align?: 'left' | 'right' | 'center' }[];
  data: Record<string, string | number>[];
  highlightRow?: number;       // index to highlight (bright green)
  onRowPress?: (index: number) => void;
  maxRows?: number;            // truncate with "... N MORE" indicator
  emptyMessage?: string;
}
```

Implementation:
- Render full ASCII table with box-drawing characters:
  ```
  ╔═════╦══════╦════════╦═════════╗
  ║ #   ║ TIME ║ PACE   ║ ELEV    ║
  ╠═════╬══════╬════════╬═════════╣
  ║ 1   ║ 5:42 ║ 5:42/K ║ +12 FT  ║
  ║ 2   ║ 5:38 ║ 5:38/K ║ +8 FT   ║
  ╚═════╩══════╩════════╩═════════╝
  ```
- Each character rendered as `<Text>` with monospace font
- Column widths: specified or auto-calculated from header + content max width
- Headers: `pipboy.primary`, content: `pipboy.primaryDim`
- `highlightRow`: that row's text becomes `pipboy.primary` with glow
- `onRowPress`: each data row is `TouchableOpacity`
- `emptyMessage`: centered in table body, blinking cursor
- Box characters: `pipboy.border`

---

## PHASE 3: TYPES & UTILS ADDITIONS (2 files modified)

### 3A. File: `src/types/activity.ts` — ADD

```typescript
/** Extended activity with computed fields for display. */
export interface GpsActivityDisplay extends GpsActivity {
  formattedDistance: string;
  formattedDuration: string;
  formattedPace: string;
  formattedDate: string;
  typeLabel: string;
}

/** Aggregate stats for a member's activity history. */
export interface ActivityTotalStats {
  totalActivities: number;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  totalElevationMeters: number;
  totalCalories: number;
  longestActivity: GpsActivity | null;
  fastestPace: number;                    // lowest seconds per km (fastest)
  avgPace: number;                        // average seconds per km
  maxSpeed: number;                       // m/s
  byType: Record<GpsActivityType, number>;
  currentStreak: number;                  // consecutive days with an activity
  longestStreak: number;
  thisWeek: { count: number; distance: number; duration: number; calories: number };
  thisMonth: { count: number; distance: number; duration: number; calories: number };
  allTime: { count: number; distance: number; duration: number; calories: number };
  recentTrend: 'improving' | 'declining' | 'stable';   // pace trend over last 5 activities
  personalRecords: {
    longestDistance: { value: number; date: string } | null;
    longestDuration: { value: number; date: string } | null;
    fastestMile: { value: number; date: string } | null;
    highestElevation: { value: number; date: string } | null;
    mostCalories: { value: number; date: string } | null;
  };
}

/** Compass heading direction. */
export type CompassDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
```

### 3B. File: `src/utils/gps.ts` — ADD (do not modify existing functions)

```typescript
/** Bearing between two GPS points in degrees (0-360). */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Convert bearing degrees to compass direction. */
export function toCompassDirection(degrees: number): CompassDirection {
  const dirs: CompassDirection[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

/** Format duration as HH:MM:SS or MM:SS if under an hour. */
export function formatDurationHMS(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Meters to feet. */
export function metersToFeet(m: number): number {
  return m * 3.28084;
}

/** M/s to MPH. */
export function msToMph(ms: number): number {
  return ms * 2.23694;
}

/** Format coordinates as "34.1006°N 118.2916°W". */
export function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;
}

/** Straight-line distance between first and last point of a route. */
export function straightLineDistance(route: GpsPoint[]): number {
  if (route.length < 2) return 0;
  return haversineMeters(
    route[0].latitude, route[0].longitude,
    route[route.length - 1].latitude, route[route.length - 1].longitude
  );
}

/** Route sinuosity: total distance / straight-line distance. 1.0 = perfectly straight. */
export function routeSinuosity(route: GpsPoint[]): number {
  const straight = straightLineDistance(route);
  if (straight <= 0) return 1;
  return totalDistance(route) / straight;
}

/** Compute total stats for a member's activity history. FULLY IMPLEMENT — no stubs. */
export function computeTotalStats(activities: GpsActivity[]): ActivityTotalStats {
  // ... IMPLEMENT COMPLETELY with all fields populated:
  // - iterate all activities for totals
  // - compute streak by sorting by date and counting consecutive days
  // - compute this week/month by filtering by date range
  // - compute personal records by finding max/min across all activities
  // - compute recentTrend by comparing avgPace of last 5 activities
  // WRITE THE FULL IMPLEMENTATION
}

/** Generate elevation profile data from route for charting. Returns array of {distance, elevation} pairs. */
export function elevationProfile(route: GpsPoint[]): { distanceM: number; elevationM: number }[] {
  // cumulative distance at each point paired with altitude
  // WRITE THE FULL IMPLEMENTATION
}

/** Find the fastest split (lowest pace) from an array of splits. */
export function fastestSplit(splits: SplitData[]): SplitData | null {
  if (splits.length === 0) return null;
  return splits.reduce((best, s) => s.paceSecsPerKm < best.paceSecsPerKm ? s : best);
}

/** Find the slowest split (highest pace). */
export function slowestSplit(splits: SplitData[]): SplitData | null {
  if (splits.length === 0) return null;
  return splits.reduce((worst, s) => s.paceSecsPerKm > worst.paceSecsPerKm ? s : worst);
}
```

**CRITICAL: `computeTotalStats` must be FULLY implemented — 50+ lines minimum. Calculate every field. Do not stub.**

---

## PHASE 4: GpsActivityContext.tsx EXPANSION (~120 lines added)

Add to existing context WITHOUT breaking anything. Read the file first.

### New state:
```typescript
isPaused: boolean;
pausedDuration: number;        // accumulated paused seconds
```

### New refs (inside provider):
```typescript
pauseStartRef = useRef<number>(0);          // timestamp when pause began
totalPausedMsRef = useRef<number>(0);       // total ms spent paused
```

### New methods:

**`pauseTracking(): void`**
- Set `isPaused = true`
- Record `pauseStartRef.current = Date.now()`
- Stop GPS watch (`watchRef.current?.remove()`)
- Stop sim timer (if web sim running)
- Stop duration timer
- Do NOT reset route or call stopTracking

**`resumeTracking(): void`**
- Calculate paused time: `totalPausedMsRef.current += Date.now() - pauseStartRef.current`
- Set `isPaused = false`
- Update `pausedDuration` state: `Math.floor(totalPausedMsRef.current / 1000)`
- Restart GPS watch (same config as startTracking)
- Restart sim timer (if web)
- Restart duration timer (adjusting for paused time: `liveDuration = (Date.now() - startTimeRef.current - totalPausedMsRef.current) / 1000`)

**`removeActivity(id: string): void`**
- Filter out activity by id from `activities` state
- AsyncStorage auto-persists via existing useEffect

**`getActivityById(id: string): GpsActivity | undefined`**
- Find activity in `activities` array by id

**`totalStats(memberId: string): ActivityTotalStats`**
- Call `computeTotalStats(memberActivities(memberId))` from `utils/gps.ts`
- Memoize with `useCallback` + member activities as dep

### Update context interface + default values with all new fields/methods.

### Update `stopTracking` to account for paused time:
- `durationSeconds` should subtract `totalPausedMsRef.current / 1000`
- Reset `totalPausedMsRef.current = 0` and `pauseStartRef.current = 0`
- Reset `isPaused = false` and `pausedDuration = 0`

---

## PHASE 5: ActivityTrackerScreen.tsx — COMPLETE REWRITE (~800+ lines)

**This is the main deliverable. Read the existing 447-line file first. Preserve ALL existing logic. Wrap in PipBoyShell. Add all new features.**

### 5A. IMPORTS

Import from: PipBoyShell, PipBoyPanel, PipBoyStatRow, PipBoyButton, PipBoyProgressBar, PipBoyTable, pipboy colors, pipboy typography, all gps utils (including new ones), GpsActivityContext (including new methods), GamificationContext, SoundContext, AuthContext, activity types.

### 5B. STATE

```typescript
const [activeTab, setActiveTab] = useState<'STATS' | 'MAP' | 'DATA' | 'RADIO'>('MAP');
const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
const [replayingActivity, setReplayingActivity] = useState<GpsActivity | null>(null);
const [replayProgress, setReplayProgress] = useState(0);      // 0-1
const [replayMarkerPos, setReplayMarkerPos] = useState<{lat:number;lng:number}|null>(null);
const [selectedRadioStation, setSelectedRadioStation] = useState(0);
const [radioStaticText, setRadioStaticText] = useState<Record<number,string>>({});
```

### 5C. LEAFLET MAP OVERHAUL

Keep the existing `LeafletMap` component structure but modify:

**Tile layer**: keep CartoDB dark_all URL. Inject CSS:
```css
.leaflet-tile-pane {
  filter: grayscale(1) brightness(0.4) sepia(1) hue-rotate(70deg) saturate(6);
  image-rendering: pixelated;
}
.leaflet-container { background: #000000 !important; }
.leaflet-control-attribution { display: none !important; }
.leaflet-control-zoom { display: none !important; }
.pipboy-route { filter: drop-shadow(0 0 3px #00ff41) drop-shadow(0 0 6px #003b00); }
@keyframes crosshair-pulse { 0%,100% { opacity: 1; box-shadow: 0 0 6px #00ff41; } 50% { opacity: 0.4; box-shadow: 0 0 2px #00ff41; } }
```

**User marker**: replace blue dot with green crosshair:
```javascript
const userIcon = L.divIcon({
  html: `<div style="width:24px;height:24px;position:relative;image-rendering:pixelated;">
    <div style="position:absolute;top:11px;left:0;width:24px;height:2px;background:#00ff41;box-shadow:0 0 4px #00ff41;"></div>
    <div style="position:absolute;top:0;left:11px;width:2px;height:24px;background:#00ff41;box-shadow:0 0 4px #00ff41;"></div>
    <div style="position:absolute;top:8px;left:8px;width:8px;height:8px;border:1px solid #00ff41;animation:crosshair-pulse 1.5s ease-in-out infinite;"></div>
    <div style="position:absolute;top:11px;left:11px;width:2px;height:2px;background:#00ff41;"></div>
  </div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  className: '',
});
```

**Polyline**: `color: '#00ff41'`, `weight: 4`, `opacity: 0.9`, `className: 'pipboy-route'`

**Replay marker** (separate from user marker): dimmer green dot that animates along saved route
```javascript
const replayIcon = L.divIcon({
  html: `<div style="width:10px;height:10px;background:#00cc33;border-radius:50%;box-shadow:0 0 8px #00ff41;"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
  className: '',
});
```

**Add mini-map coordinates display**: overlay in bottom-left corner of map showing current coords in `pipboy.primaryDim` monospace

**Add compass indicator**: overlay in top-right of map showing current heading as compass letter (N/NE/E/etc) with rotating line indicator

**Add scale bar**: simple text showing `"100m"` or `"0.1mi"` based on zoom level

### 5D. SCREEN LAYOUT

Wrap entire screen in `<PipBoyShell activeTab={activeTab} onTabChange={setActiveTab}>`.

**Conditionally render based on `activeTab`:**

#### MAP TAB (activeTab === 'MAP'):
Scrollable content below map:

1. **Map area**: 55% of screen height, absolutely positioned behind scroll content
2. **Stats panel** (`PipBoyPanel title="LIVE STATISTICS"`):
   - 12 stat rows in 2 columns (6 left, 6 right) using `flexDirection: 'row'` wrapper:
   
   **Left column:**
   - `DIST` → `formatDistance(liveDistance)` + `distanceUnit()` — HIGHLIGHT when tracking
   - `TIME` → `formatDurationHMS(liveDuration)` — BLINKING when tracking
   - `PACE` → `formatPaceForUnit(livePace)` + `paceUnit()`
   - `ELEV` → `+${Math.round(metersToFeet(liveElevGain))}` + `FT`
   - `SPEED` → `msToMph(liveSpeed).toFixed(1)` + `MPH`
   - `CAL` → `estimateCaloriesMET(GPS_ACTIVITY_METS[type], 80, liveDuration)` + `KCAL`

   **Right column:**
   - `AVG PACE` → running average pace (compute from total distance / total time)
   - `HEADING` → `toCompassDirection(bearingDegrees(...))` from last 2 GPS points
   - `ALT` → `metersToFeet(currentPosition?.altitude || 0).toFixed(0)` + `FT`
   - `COORDS` → `formatCoords(lat, lng)` (compact format)
   - `GPS PTS` → `routeCoords.length`
   - `PAUSED` → `formatDurationHMS(pausedDuration)` (only show if pausedDuration > 0)

   When NOT tracking: show all values as `---` with dim color

3. **Activity type selector** (`PipBoyPanel title="ACTIVITY TYPE"`):
   - 4 `PipBoyButton` components in a row: `[RUN]` `[WALK]` `[BIKE]` `[HIKE]`
   - Selected type: inverted (green bg, black text)
   - Unselected: ghost variant
   - Each shows Ionicons icon above label

4. **Control buttons**:
   - NOT tracking: `[ ► START TRACKING ]` — large, fullWidth, primary
   - Tracking + NOT paused: `[ ❚❚ PAUSE ]` + `[ ■ STOP ]` side by side
   - Tracking + paused: `[ ► RESUME ]` + `[ ■ STOP ]` side by side, pulsing `-- PAUSED --` text above buttons
   - Stop confirms via Alert (keep existing behavior)
   - On start: play `confirm` sound, clear route coords
   - On stop: play `success` sound
   - On pause/resume: play `toggle` sound

5. **Activity history** (`PipBoyPanel title="RECENT ACTIVITIES" collapsible`):
   - Get `memberActivities(user.id)` — show last 15
   - Each row:
     ```
     > 04.16.2026  RUN   2.34 MI  24:31  10:28/MI
     ```
   - `>` in bright green, date in dim, type in primary (4-char padded), stats in dim
   - `onRowPress` → toggle `expandedActivityId`
   - Expanded view for selected activity (renders below the row):
     - `PipBoyPanel` with splits table using `PipBoyTable`
     - Elevation gain, calories, max speed as `PipBoyStatRow`
     - `[ REPLAY ROUTE ]` button → starts route replay
     - `[ DELETE ]` button (danger variant) → `removeActivity(id)` with Alert confirmation
   - If no activities: `NO RECORDED ACTIVITIES ▮` with blinking cursor

6. **Route replay overlay** (when `replayingActivity` is set):
   - `PipBoyProgressBar` showing replay progress: `REPLAYING... [████░░░░] 43%`
   - Stats panel shows the replaying activity's final stats
   - `[ STOP REPLAY ]` button
   - Map shows the full route polyline + animated replay marker

#### STATS TAB (activeTab === 'STATS'):
**Full aggregate statistics view. Pull from `totalStats(user.id)`. IMPLEMENT ALL OF THIS — no stubs.**

1. **Overview panel** (`PipBoyPanel title="ALL-TIME STATISTICS"`):
   - `TOTAL ACTIVITIES` → count
   - `TOTAL DISTANCE` → formatted in miles
   - `TOTAL TIME` → formatted as Xh XXm
   - `TOTAL ELEVATION` → feet
   - `TOTAL CALORIES` → with comma formatting
   - `AVG PACE` → formatted
   - `MAX SPEED` → mph
   - `TREND` → "IMPROVING" / "DECLINING" / "STABLE" with appropriate icon

2. **Personal records panel** (`PipBoyPanel title="PERSONAL RECORDS"`):
   - `LONGEST RUN` → distance + date
   - `LONGEST SESSION` → duration + date
   - `FASTEST MILE` → pace + date
   - `HIGHEST CLIMB` → elevation + date
   - `MOST CALORIES` → calories + date
   - Each with highlight if achieved in last 7 days

3. **Activity breakdown panel** (`PipBoyPanel title="BY ACTIVITY TYPE"`):
   - Bar chart using block characters for each type:
     ```
     RUN  ████████████████████░░░░  12 (55%)
     WALK ████████░░░░░░░░░░░░░░░░   5 (23%)
     BIKE ██████░░░░░░░░░░░░░░░░░░   3 (14%)
     HIKE ████░░░░░░░░░░░░░░░░░░░░   2 (9%)
     ```

4. **Streak panel** (`PipBoyPanel title="STREAKS"`):
   - `CURRENT STREAK` → days with activity icon
   - `LONGEST STREAK` → days
   - Visual streak calendar: last 30 days as squares `■` (active) or `□` (missed), 7 per row

5. **Period summaries** (`PipBoyPanel title="THIS WEEK"` + `"THIS MONTH"`):
   - Count, distance, duration, calories for each period
   - Progress bars comparing to previous period if available

#### DATA TAB (activeTab === 'DATA'):
**Technical data analysis view.**

1. **Splits table** (`PipBoyPanel title="SPLIT ANALYSIS"`):
   - Dropdown/selector to pick which activity to analyze (default: most recent)
   - Full `PipBoyTable` with columns: `#`, `DIST`, `TIME`, `PACE`, `ELEV`, `DELTA`
   - Fastest split highlighted in bright green
   - Slowest split marked with `!` prefix
   - Summary row at bottom: averages

2. **Elevation profile** (`PipBoyPanel title="ELEVATION PROFILE"`):
   - ASCII art elevation chart using block characters:
     ```
     250 ┤          ▓▓▓
     200 ┤    ▓▓▓▓▓▓   ▓▓▓
     150 ┤▓▓▓▓           ▓▓▓▓▓▓
     100 ┤                     ▓▓
      50 ┤
         └──────────────────────
          0   1   2   3   4  KM
     ```
   - Use `elevationProfile()` from utils, render using `░▒▓█` block chars
   - Width: full panel width, height: 8 rows
   - Y-axis labels in feet, X-axis in distance

3. **Route analysis** (`PipBoyPanel title="ROUTE ANALYSIS"`):
   - `TOTAL DISTANCE` vs `STRAIGHT LINE` comparison
   - `SINUOSITY` → ratio (1.0 = straight, higher = more winding)
   - `GPS POINTS` → count
   - `AVG POINT INTERVAL` → seconds between points
   - `ROUTE QUALITY` → rating based on point density ("EXCELLENT" / "GOOD" / "FAIR" / "POOR")

4. **Pace analysis** (`PipBoyPanel title="PACE ANALYSIS"`):
   - ASCII bar chart of pace per split:
     ```
     SPLIT 1  █████████████████  5:42/KM
     SPLIT 2  ████████████████   5:38/KM  ← FASTEST
     SPLIT 3  ██████████████████ 5:51/KM
     SPLIT 4  ███████████████    5:35/KM
     ```
   - Bars scaled relative to fastest/slowest
   - Labels: FASTEST and SLOWEST marked

#### RADIO TAB (activeTab === 'RADIO'):
**Decorative Pip-Boy radio simulation. Fully implemented — not a placeholder.**

1. **Station list** (`PipBoyPanel title="WASTELAND FREQUENCIES"`):
   - 6 stations:
     - `> DIAMOND CITY RADIO    ═══ 103.7 FM`
     - `> CLASSICAL RADIO       ═══  91.3 FM`
     - `> GALAXY NEWS RADIO     ═══  87.9 FM`
     - `> FREEDOM RADIO         ═══  76.5 FM`
     - `> ENCLAVE RADIO         ═══ 106.1 FM`
     - `> MYSTERIOUS SIGNAL     ═══  ??. ? FM`
   - Selected station: bright green, `>` prefix pulses
   - Unselected: dim green
   - On press: select station, play `tap` sound

2. **Now playing panel** (`PipBoyPanel title="NOW PLAYING"`):
   - Animated text: `♪ ♫ DIAMOND CITY RADIO ♫ ♪` with the notes blinking
   - Signal strength bar: `SIGNAL [████████░░] STRONG`
   - Volume bar: `VOL [████████░░] 80%`
   - Frequency display: `FREQ: 103.7 FM` with subtle jitter animation (number flickers ±0.1)

3. **Static effect**: every 2 seconds, randomly replace 1-3 characters in station names with `░`, `▒`, `▓`, or random ASCII chars, then revert after 200ms. Use `setInterval` + state updates.

4. **Waveform visualizer**: animated ASCII waveform at bottom:
   ```
   ─╮  ╭─╮  ╭─╮  ╭──
     ╰──╯  ╰──╯  ╰
   ```
   Shifts left every 100ms to simulate audio visualization. Generate with `Math.sin()` mapped to `─╮╯╰╭` characters.

---

## PHASE 6: SOUND THEME (1 file modified)

### File: `src/sounds/synth.ts` — ADD new theme

Add a `'pipboy'` sound theme alongside existing `'default'`, `'retro'`, `'zen'` themes.

**Pip-Boy sounds (all using Web Audio oscillators):**
- `tap`: short Geiger-counter click — 2000Hz square wave, 20ms, very low gain (0.05)
- `success`: ascending two-tone beep — 800Hz→1200Hz sine, 150ms
- `error`: descending buzz — 400Hz→200Hz sawtooth, 200ms
- `confirm`: three rapid clicks — 1500Hz square, 30ms each, 50ms apart
- `cancel`: single low thud — 200Hz triangle, 100ms
- `toggle`: soft tick — 3000Hz square, 15ms, gain 0.03
- `levelUp`: victory fanfare — 4-note ascending (C5→E5→G5→C6), 100ms each, sine
- `swipe`: whoosh — white noise burst, 80ms, filtered

Add `'pipboy'` to the `SoundTheme` type union.
Add the `PIPBOY_SOUNDS` map in the same format as existing theme maps.

In `ActivityTrackerScreen.tsx`, call `useScreenSoundTheme('pipboy')` at mount to activate the theme while on this screen.

---

## PHASE 7: App.tsx WEB FRAME UPDATE

Change the web frame styling:
```typescript
outerContainer: {
  flex: 1,
  backgroundColor: '#000000',
  alignItems: 'center',
  justifyContent: 'center',
},
phoneFrame: {
  width: 430,
  maxWidth: '100%',
  height: '100%',
  maxHeight: 932,
  overflow: 'hidden',
  // @ts-ignore
  boxShadow: '0 0 60px rgba(0, 255, 65, 0.08), 0 0 120px rgba(0, 255, 65, 0.04), 0 0 1px rgba(0, 255, 65, 0.3)',
  borderRadius: 0,
  border: '1px solid #003b00',
},
```

---

## PHASE 8: GAMIFICATION INTEGRATION

When an activity is saved (in `stopTracking` or after save):
- Call `recordSession()` from GamificationContext (awards XP + points)
- If distance > personal best: show inline `NEW RECORD` text with strong glow
- Award bonus XP for milestones:
  - First activity ever: +50 XP
  - 10th activity: +100 XP
  - Every 10km total distance milestone: +25 XP

In the STATS tab, show gamification data:
- Current level + XP progress bar (`PipBoyProgressBar`)
- Dojo Points earned from activities
- Flames earned from activity-related achievements

---

## PHASE 9: AUTO-PAUSE (smart feature)

Detect when user has stopped moving (speed < 0.3 m/s for > 15 seconds) and show a prompt:
- `MOVEMENT STOPPED. AUTO-PAUSE IN 10...9...8...` countdown text
- If user starts moving again, cancel countdown
- If countdown reaches 0, automatically call `pauseTracking()`
- Show `AUTO-PAUSED — TAP TO RESUME` indicator
- This prevents stationary GPS drift from inflating distance

Implement in `ActivityTrackerScreen.tsx` with a `useRef` for the stopped timer and a `useEffect` that watches `liveSpeed`.

---

## FILES SUMMARY

### CREATE (7 new files):
1. `src/components/PipBoyShell.tsx` (~350 lines)
2. `src/components/PipBoyPanel.tsx` (~150 lines)
3. `src/components/PipBoyStatRow.tsx` (~120 lines)
4. `src/components/PipBoyButton.tsx` (~130 lines)
5. `src/components/PipBoyProgressBar.tsx` (~80 lines)
6. `src/components/PipBoyTable.tsx` (~180 lines)

### MODIFY (6 existing files):
1. `src/theme/colors.ts` — add `pipboy` palette
2. `src/theme/typography.ts` — add `pipboyFontFamily` + `pipboyTypography` + Platform import
3. `src/types/activity.ts` — add `GpsActivityDisplay`, `ActivityTotalStats`, `CompassDirection`
4. `src/utils/gps.ts` — add 10+ new utility functions
5. `src/context/GpsActivityContext.tsx` — add pause/resume, removeActivity, totalStats
6. `src/screens/ActivityTrackerScreen.tsx` — FULL REWRITE (~800+ lines)
7. `src/sounds/synth.ts` — add `'pipboy'` sound theme
8. `App.tsx` — update web frame glow

### DO NOT TOUCH:
- All other screens (HomeScreen, ProfileScreen, etc.)
- All other contexts (ThemeContext, etc.) — except reading from GamificationContext
- Navigation structure
- Services
- package.json

---

## VERIFICATION CHECKLIST (25 points)

1. Zero non-green colors on ActivityTrackerScreen — NO blue, gold, red, white
2. All text is monospace VT323 on web, Courier on native
3. All headers/labels UPPERCASE
4. CRT scanlines visible as horizontal lines
5. Screen flicker animation active (subtle)
6. Text bloom glow on all text (web)
7. Map tiles are green-filtered — no original colors visible
8. Crosshair marker blinks — not a default pin
9. Route polyline is bright green with drop-shadow glow
10. Stats use dot-leader formatting: `LABEL......... VALUE UNIT`
11. Box-drawing borders on all panels
12. Pause/resume fully functional — GPS stops, timer stops, visual indicator
13. Auto-pause triggers when stationary for 15+ seconds
14. Activity history renders with expandable details
15. Route replay animates a marker along saved route with progress bar
16. All 4 tabs have COMPLETE UI — no stubs, no empty views
17. STATS tab shows 5+ panels with aggregate data
18. DATA tab shows splits table + elevation profile + pace analysis
19. RADIO tab has stations, waveform, static effect, volume bar
20. Sound effects play on interactions (Geiger tick on tap)
21. Gamification integration — XP/points awarded on activity save
22. Personal records detected and highlighted
23. No TypeScript errors
24. No existing screens broken
25. Each new component file is >80 lines of real implementation
