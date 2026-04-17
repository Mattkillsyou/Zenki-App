export const palette = {
  // Brand
  red: '#C41E2A',
  redLight: '#E63946',
  redDark: '#9B1520',
  gold: '#D4A017',
  goldLight: '#E8B828',
  goldDark: '#B8890F',

  // Neutrals — warm-tinted for premium feel
  black: '#08080A',
  grey950: '#0F0F12',
  grey900: '#161619',
  grey850: '#1C1C20',
  grey800: '#242428',
  grey750: '#2C2C31',
  grey700: '#3A3A40',
  grey600: '#52525B',
  grey500: '#71717A',
  grey400: '#A1A1AA',
  grey300: '#D4D4D8',
  grey200: '#E4E4E7',
  grey150: '#ECECEF',
  grey100: '#F4F4F5',
  grey50: '#FAFAFA',
  white: '#FFFFFF',

  // Semantic — refined
  success: '#22C55E',
  successMuted: 'rgba(34, 197, 94, 0.15)',
  error: '#EF4444',
  errorMuted: 'rgba(239, 68, 68, 0.12)',
  warning: '#F59E0B',
  warningMuted: 'rgba(245, 158, 11, 0.12)',
  info: '#3B82F6',
  infoMuted: 'rgba(59, 130, 246, 0.12)',
};

export interface ThemeColors {
  // Backgrounds
  background: string;
  backgroundElevated: string;
  backgroundSubtle: string;
  surface: string;
  surfaceHover: string;
  surfaceSecondary: string;
  surfaceTertiary: string;

  // Brand
  gold: string;
  goldLight: string;
  goldDark: string;
  goldMuted: string;
  red: string;
  redLight: string;
  redDark: string;
  redMuted: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  textInverse: string;

  // Semantic
  success: string;
  successMuted: string;
  error: string;
  errorMuted: string;
  warning: string;
  warningMuted: string;
  info: string;
  infoMuted: string;

  // Structure
  border: string;
  borderSubtle: string;
  divider: string;
  overlay: string;
  shadow: string;

  // Navigation
  tabBar: string;
  tabBarBorder: string;

  // Interactive
  accentTint: string;

  // === THEME METADATA FIELDS ===
  /** Primary accent color for this theme */
  accent: string;
  accentDim: string;
  accentDark: string;
  /** Map tile CSS filter (web only) */
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
  /** Macro chart colors */
  macroProtein: string;
  macroCarbs: string;
  macroFat: string;
  /** Flame/streak color */
  flames: string;
}

export const darkColors: ThemeColors = {
  // Backgrounds — warm charcoal, NOT pure black
  // The key: background and surface need 30+ brightness steps apart
  background: '#111113',
  backgroundElevated: '#1A1A1E',
  backgroundSubtle: '#151517',
  surface: '#1E1E22',         // Clearly lifted from background
  surfaceHover: '#252529',
  surfaceSecondary: '#252529',
  surfaceTertiary: '#2C2C32',

  // Brand
  gold: '#D4A017',
  goldLight: '#E8B828',
  goldDark: palette.goldDark,
  goldMuted: 'rgba(212, 160, 23, 0.12)',
  red: '#C41E2A',
  redLight: '#E63946',
  redDark: palette.redDark,
  redMuted: 'rgba(196, 30, 42, 0.10)',

  // Text
  textPrimary: '#F0F0F2',
  textSecondary: '#9999A1',
  textMuted: '#666670',
  textTertiary: '#4A4A54',
  textInverse: '#111113',

  // Semantic
  success: palette.success,
  successMuted: palette.successMuted,
  error: palette.error,
  errorMuted: palette.errorMuted,
  warning: palette.warning,
  warningMuted: palette.warningMuted,
  info: palette.info,
  infoMuted: palette.infoMuted,

  // Structure — MINIMAL borders, let surface contrast do the work
  border: 'rgba(255, 255, 255, 0.07)',
  borderSubtle: 'rgba(255, 255, 255, 0.04)',
  divider: 'rgba(255, 255, 255, 0.04)',
  overlay: 'rgba(0, 0, 0, 0.75)',
  shadow: 'rgba(0, 0, 0, 0.5)',

  // Navigation
  tabBar: '#161618',
  tabBarBorder: 'rgba(255, 255, 255, 0.05)',

  // Interactive
  accentTint: 'rgba(212, 160, 23, 0.08)',

  // Theme metadata
  accent: '#D4A017',
  accentDim: '#B8890F',
  accentDark: '#8A6A0A',
  mapTileFilter: '',
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
  macroProtein: '#FF6B6B',
  macroCarbs: '#4ECDC4',
  macroFat: '#FFD166',
  flames: '#FF6B35',
};

export const lightColors: ThemeColors = {
  background: '#F5F5F7',
  backgroundElevated: palette.white,
  backgroundSubtle: '#EDEDF0',
  surface: palette.white,
  surfaceHover: palette.grey50,
  surfaceSecondary: '#F0F0F3',
  surfaceTertiary: '#E8E8EC',

  gold: '#B8890F',
  goldLight: palette.gold,
  goldDark: '#8A6A0A',
  goldMuted: 'rgba(184, 137, 15, 0.08)',
  red: palette.red,
  redLight: palette.redLight,
  redDark: palette.redDark,
  redMuted: 'rgba(196, 30, 42, 0.06)',

  textPrimary: '#09090B',
  textSecondary: '#3F3F46',
  textMuted: '#71717A',
  textTertiary: '#A1A1AA',
  textInverse: palette.white,

  success: palette.success,
  successMuted: palette.successMuted,
  error: palette.error,
  errorMuted: palette.errorMuted,
  warning: palette.warning,
  warningMuted: palette.warningMuted,
  info: palette.info,
  infoMuted: palette.infoMuted,

  border: 'rgba(0, 0, 0, 0.12)',
  borderSubtle: 'rgba(0, 0, 0, 0.06)',
  divider: 'rgba(0, 0, 0, 0.05)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.10)',

  tabBar: 'rgba(255, 255, 255, 0.92)',
  tabBarBorder: 'rgba(0, 0, 0, 0.08)',

  accentTint: 'rgba(184, 137, 15, 0.06)',

  // Theme metadata
  accent: '#B8890F',
  accentDim: '#8A6A0A',
  accentDark: '#5C4607',
  mapTileFilter: '',
  mapRouteColor: '#B8890F',
  textGlow: '',
  textGlowSubtle: '',
  boxGlow: '',
  frameGlow: '0 0 80px rgba(184, 137, 15, 0.06), 0 0 0 1px rgba(0,0,0,0.08)',
  fontFamily: '',
  fontFamilyNative: 'System',
  uppercaseHeaders: false,
  spinner: '#B8890F',
  switchTrack: '#B8890F',
  macroProtein: '#FF6B6B',
  macroCarbs: '#4ECDC4',
  macroFat: '#FFD166',
  flames: '#FF6B35',
};

export const colors = darkColors;

// ─── Theme overlay configuration ───
export interface ThemeOverlayConfig {
  scanlines: boolean;
  scanlineColor: string;
  scanlineOpacity: number;
  flicker: boolean;
  flickerIntensity: number;
  vignette: boolean;
  vignetteColor: string;
  particles: 'none' | 'matrix-rain' | 'rain-drops' | 'static-noise' | 'data-streams' | 'dust' | 'dna-helix' | 'sheikah-runes';
  particleColor: string;
  particleOpacity: number;
  texture: 'none' | 'noise' | 'grid' | 'paper' | 'hex';
  textureOpacity: number;
}

export const NO_OVERLAY: ThemeOverlayConfig = {
  scanlines: false, scanlineColor: '', scanlineOpacity: 0,
  flicker: false, flickerIntensity: 1,
  vignette: false, vignetteColor: '',
  particles: 'none', particleColor: '', particleOpacity: 0,
  texture: 'none', textureOpacity: 0,
};

export interface ThemeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  isDark: boolean;
  colors: ThemeColors;
  overlay: ThemeOverlayConfig;
  soundTheme: string;
  webFontUrl?: string;
}

// ─── Pip-Boy terminal palette (Fallout) ───
// Used ONLY by ActivityTrackerScreen — does not affect other screens.
export const pipboy = {
  primary:  '#00ff41',    // bright terminal green
  dim:      '#00cc33',    // dimmer green for secondary text
  dark:     '#003b00',    // darkest green for borders/tracks
  bg:       '#0a0f0a',    // near-black with green tint
  black:    '#000000',
  amber:    '#ffb000',    // for warnings / highlights
};
