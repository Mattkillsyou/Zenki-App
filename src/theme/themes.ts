/**
 * All 7 ThemeDefinition objects (system resolves at runtime).
 * Each theme defines a COMPLETE ThemeColors object + overlay config.
 */

import {
  ThemeDefinition,
  ThemeColors,
  ThemeOverlayConfig,
  NO_OVERLAY,
  darkColors,
  lightColors,
  palette,
} from './colors';

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 2: Clean Light
 * ═══════════════════════════════════════════════════════════════════════════ */

export const cleanLightTheme: ThemeDefinition = {
  id: 'clean-light',
  name: 'Clean Light',
  description: 'Minimal and bright',
  icon: 'sunny-outline',
  isDark: false,
  soundTheme: 'default',
  colors: { ...lightColors },
  overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 3: Clean Dark
 * ═══════════════════════════════════════════════════════════════════════════ */

export const cleanDarkTheme: ThemeDefinition = {
  id: 'clean-dark',
  name: 'Clean Dark',
  description: 'Premium dark mode',
  icon: 'moon-outline',
  isDark: true,
  soundTheme: 'default',
  colors: { ...darkColors },
  overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 4: Matrix
 * ═══════════════════════════════════════════════════════════════════════════ */

const matrixColors: ThemeColors = {
  background: '#000000',
  backgroundElevated: '#0a120a',
  backgroundSubtle: '#050a05',
  surface: '#0d1a0d',
  surfaceHover: '#1a2e1a',
  surfaceSecondary: '#112211',
  surfaceTertiary: '#1a331a',

  gold: '#00ff41',
  goldLight: '#33ff66',
  goldDark: '#00aa2a',
  goldMuted: 'rgba(0, 255, 65, 0.10)',
  red: '#00ff41',
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
  error: '#00ff41',
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
};

const matrixOverlay: ThemeOverlayConfig = {
  scanlines: true,
  scanlineColor: 'rgba(0, 255, 65, 0.03)',
  scanlineOpacity: 0.03,
  flicker: true,
  flickerIntensity: 0.97,
  vignette: true,
  vignetteColor: 'rgba(0, 0, 0, 0.6)',
  particles: 'matrix-rain',
  particleColor: '#00ff41',
  particleOpacity: 0.07,
  texture: 'none',
  textureOpacity: 0,
};

export const matrixTheme: ThemeDefinition = {
  id: 'matrix',
  name: 'The Matrix',
  description: 'Welcome to the real world',
  icon: 'code-slash-outline',
  isDark: true,
  soundTheme: 'matrix',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap',
  colors: matrixColors,
  overlay: matrixOverlay,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 5: Alien (Nostromo)
 * ═══════════════════════════════════════════════════════════════════════════ */

const alienColors: ThemeColors = {
  background: '#000000',
  backgroundElevated: '#0f0a00',
  backgroundSubtle: '#0a0700',
  surface: '#1a1200',
  surfaceHover: '#2e2200',
  surfaceSecondary: '#221800',
  surfaceTertiary: '#332400',

  gold: '#FF8C00',
  goldLight: '#FFa500',
  goldDark: '#AA5500',
  goldMuted: 'rgba(255, 140, 0, 0.10)',
  red: '#FF8C00',
  redLight: '#FFa500',
  redDark: '#885000',
  redMuted: 'rgba(255, 140, 0, 0.08)',

  textPrimary: '#FF8C00',
  textSecondary: '#CC7000',
  textMuted: '#885000',
  textTertiary: '#442800',
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
};

const alienOverlay: ThemeOverlayConfig = {
  scanlines: true,
  scanlineColor: 'rgba(255, 140, 0, 0.03)',
  scanlineOpacity: 0.03,
  flicker: true,
  flickerIntensity: 0.96,
  vignette: true,
  vignetteColor: 'rgba(0, 0, 0, 0.7)',
  particles: 'static-noise',
  particleColor: '#FF8C00',
  particleOpacity: 0.02,
  texture: 'noise',
  textureOpacity: 0.03,
};

export const alienTheme: ThemeDefinition = {
  id: 'alien',
  name: 'Nostromo',
  description: 'MU/TH/UR 6000 interface',
  icon: 'warning-outline',
  isDark: true,
  soundTheme: 'alien',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap',
  colors: alienColors,
  overlay: alienOverlay,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 6: Jurassic Park
 * ═══════════════════════════════════════════════════════════════════════════ */

const jurassicColors: ThemeColors = {
  background: '#000820',
  backgroundElevated: '#001030',
  backgroundSubtle: '#000c28',
  surface: '#001440',
  surfaceHover: '#002060',
  surfaceSecondary: '#001a50',
  surfaceTertiary: '#002060',

  gold: '#FFB800',
  goldLight: '#FFCC33',
  goldDark: '#CC9200',
  goldMuted: 'rgba(255, 184, 0, 0.10)',
  red: '#FF3333',
  redLight: '#FF5555',
  redDark: '#CC0000',
  redMuted: 'rgba(255, 51, 51, 0.10)',

  textPrimary: '#E0E8FF',
  textSecondary: '#8899BB',
  textMuted: '#556688',
  textTertiary: '#334466',
  textInverse: '#000820',

  success: '#33FF66',
  successMuted: 'rgba(51, 255, 102, 0.12)',
  error: '#FF3333',
  errorMuted: 'rgba(255, 51, 51, 0.10)',
  warning: '#FFB800',
  warningMuted: 'rgba(255, 184, 0, 0.10)',
  info: '#00CCFF',
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
  mapRouteColor: '#00CCFF',
  textGlow: '0 0 4px rgba(0, 204, 255, 0.4), 0 0 8px rgba(0, 204, 255, 0.2)',
  textGlowSubtle: '0 0 2px rgba(0, 204, 255, 0.3)',
  boxGlow: '0 0 6px rgba(0, 204, 255, 0.15)',
  frameGlow: '0 0 60px rgba(0, 204, 255, 0.06), 0 0 1px rgba(0, 204, 255, 0.2)',
  fontFamily: '"IBM Plex Mono", "VT323", "Courier New", monospace',
  fontFamilyNative: 'Courier',
  uppercaseHeaders: true,
  spinner: '#00CCFF',
  switchTrack: '#FFB800',
};

const jurassicOverlay: ThemeOverlayConfig = {
  scanlines: true,
  scanlineColor: 'rgba(0, 204, 255, 0.02)',
  scanlineOpacity: 0.02,
  flicker: false,
  flickerIntensity: 1,
  vignette: true,
  vignetteColor: 'rgba(0, 0, 20, 0.4)',
  particles: 'none',
  particleColor: '',
  particleOpacity: 0,
  texture: 'grid',
  textureOpacity: 0.03,
};

export const jurassicTheme: ThemeDefinition = {
  id: 'jurassic',
  name: 'Jurassic Park',
  description: "You didn't say the magic word",
  icon: 'bug-outline',
  isDark: true,
  soundTheme: 'jurassic',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500&display=swap',
  colors: jurassicColors,
  overlay: jurassicOverlay,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 7: Ghost in the Shell
 * ═══════════════════════════════════════════════════════════════════════════ */

const ghostColors: ThemeColors = {
  background: '#0D0221',
  backgroundElevated: '#160433',
  backgroundSubtle: '#110328',
  surface: 'rgba(30, 10, 60, 0.7)',
  surfaceHover: 'rgba(40, 15, 80, 0.8)',
  surfaceSecondary: 'rgba(25, 8, 50, 0.6)',
  surfaceTertiary: 'rgba(35, 12, 70, 0.5)',

  gold: '#00F0FF',
  goldLight: '#66F7FF',
  goldDark: '#0099AA',
  goldMuted: 'rgba(0, 240, 255, 0.08)',
  red: '#FF4081',
  redLight: '#FF80AB',
  redDark: '#C51162',
  redMuted: 'rgba(255, 64, 129, 0.08)',

  textPrimary: '#C8B8DB',
  textSecondary: '#8B7BA3',
  textMuted: '#5C4D73',
  textTertiary: '#3A2D4D',
  textInverse: '#0D0221',

  success: '#00E5A0',
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
};

const ghostOverlay: ThemeOverlayConfig = {
  scanlines: false,
  scanlineColor: '',
  scanlineOpacity: 0,
  flicker: false,
  flickerIntensity: 1,
  vignette: true,
  vignetteColor: 'rgba(13, 2, 33, 0.5)',
  particles: 'data-streams',
  particleColor: 'rgba(0, 240, 255, 0.08)',
  particleOpacity: 0.08,
  texture: 'hex',
  textureOpacity: 0.02,
};

export const ghostTheme: ThemeDefinition = {
  id: 'ghost',
  name: 'Ghost in the Shell',
  description: 'Your ghost whispers to me',
  icon: 'eye-outline',
  isDark: true,
  soundTheme: 'ghost',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600&family=Orbitron:wght@400;500&display=swap',
  colors: ghostColors,
  overlay: ghostOverlay,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THEME 8: Blade Runner
 * ═══════════════════════════════════════════════════════════════════════════ */

const bladerunnerColors: ThemeColors = {
  background: '#001B24',
  backgroundElevated: '#002530',
  backgroundSubtle: '#001F28',
  surface: '#003040',
  surfaceHover: '#004050',
  surfaceSecondary: '#002838',
  surfaceTertiary: '#003848',

  gold: '#FF6F3C',
  goldLight: '#FF9966',
  goldDark: '#CC4A1A',
  goldMuted: 'rgba(255, 111, 60, 0.10)',
  red: '#FF3D3D',
  redLight: '#FF6666',
  redDark: '#CC1A1A',
  redMuted: 'rgba(255, 61, 61, 0.08)',

  textPrimary: '#C5D8E8',
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
};

const bladerunnerOverlay: ThemeOverlayConfig = {
  scanlines: false,
  scanlineColor: '',
  scanlineOpacity: 0,
  flicker: false,
  flickerIntensity: 1,
  vignette: true,
  vignetteColor: 'rgba(0, 15, 20, 0.6)',
  particles: 'rain-drops',
  particleColor: 'rgba(150, 200, 230, 0.15)',
  particleOpacity: 0.15,
  texture: 'noise',
  textureOpacity: 0.04,
};

export const bladerunnerTheme: ThemeDefinition = {
  id: 'bladerunner',
  name: 'Blade Runner',
  description: "I've seen things you wouldn't believe",
  icon: 'rainy-outline',
  isDark: true,
  soundTheme: 'bladerunner',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600&family=Orbitron:wght@400;500&display=swap',
  colors: bladerunnerColors,
  overlay: bladerunnerOverlay,
};

/* ═══════════════════════════════════════════════════════════════════════════
 * System theme — resolves at runtime, defined as reference object
 * ═══════════════════════════════════════════════════════════════════════════ */

export const systemTheme: ThemeDefinition = {
  id: 'system',
  name: 'System',
  description: 'Follows your device preference',
  icon: 'phone-portrait-outline',
  isDark: false, // resolved at runtime
  soundTheme: 'default',
  colors: darkColors, // resolved at runtime
  overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Theme registry — lookup by id
 * ═══════════════════════════════════════════════════════════════════════════ */

export const ALL_THEMES: ThemeDefinition[] = [
  systemTheme,
  cleanLightTheme,
  cleanDarkTheme,
  matrixTheme,
  alienTheme,
  jurassicTheme,
  ghostTheme,
  bladerunnerTheme,
];

export const THEMES_BY_ID: Record<string, ThemeDefinition> = {};
for (const t of ALL_THEMES) THEMES_BY_ID[t.id] = t;
