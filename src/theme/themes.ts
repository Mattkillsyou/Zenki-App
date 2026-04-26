/**
 * All 8 ThemeDefinition objects (system resolves at runtime).
 * Each theme is a COMPLETE, DISTINCT visual identity.
 */

import {
  ThemeDefinition,
  ThemeColors,
  NO_OVERLAY,
  darkColors,
  lightColors,
} from './colors';

/* ═══════════════════════════════════════════════════════════════════════════
 * Clean Light
 * ═══════════════════════════════════════════════════════════════════════════ */
export const cleanLightTheme: ThemeDefinition = {
  id: 'clean-light', name: 'Clean Light', description: 'Minimal and bright',
  icon: 'sunny-outline', isDark: false, soundTheme: 'default',
  colors: { ...lightColors }, overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Clean Dark
 * ═══════════════════════════════════════════════════════════════════════════ */
export const cleanDarkTheme: ThemeDefinition = {
  id: 'clean-dark', name: 'Clean Dark', description: 'Premium dark mode',
  icon: 'moon-outline', isDark: true, soundTheme: 'default',
  colors: { ...darkColors }, overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * THE MATRIX — Zion Mainframe
 * Green phosphor CRT terminal. The ONLY CRT-like theme besides Nostromo.
 * ═══════════════════════════════════════════════════════════════════════════ */
const matrixColors: ThemeColors = {
  background: '#000000',
  backgroundElevated: '#060D06',
  backgroundSubtle: '#030803',
  surface: '#0D1A0D',
  surfaceHover: '#1A2E1A',
  surfaceSecondary: '#112211',
  surfaceTertiary: '#1A331A',
  gold: '#00FF41', goldLight: '#33FF66', goldDark: '#00AA2A', goldMuted: 'rgba(0,255,65,0.10)',
  red: '#00FF41', redLight: '#33FF66', redDark: '#007A1E', redMuted: 'rgba(0,255,65,0.08)',
  textPrimary: '#00FF41', textSecondary: '#00CC33', textMuted: '#007A1E', textTertiary: '#003B00', textInverse: '#000000',
  success: '#00FF41', successMuted: 'rgba(0,255,65,0.12)',
  error: '#FF0033', errorMuted: 'rgba(255,0,51,0.10)',
  warning: '#CCFF00', warningMuted: 'rgba(204,255,0,0.10)',
  info: '#00CC33', infoMuted: 'rgba(0,204,51,0.10)',
  border: '#004D00', borderSubtle: '#002200', divider: '#003300',
  overlay: 'rgba(0,0,0,0.90)', shadow: 'rgba(0,255,65,0.08)',
  tabBar: '#030803', tabBarBorder: '#003300',
  accentTint: 'rgba(0,255,65,0.06)',
  accent: '#00FF41', accentDim: '#00CC33', accentDark: '#003B00',
  mapTileFilter: 'grayscale(1) brightness(0.25) sepia(1) hue-rotate(70deg) saturate(8)',
  mapRouteColor: '#00FF41',
  textGlow: '0 0 4px #00FF41, 0 0 12px #00FF41, 0 0 24px rgba(0,255,65,0.3)',
  textGlowSubtle: '0 0 3px #00FF41, 0 0 6px rgba(0,255,65,0.4)',
  boxGlow: '0 0 10px rgba(0,255,65,0.25), 0 0 20px rgba(0,255,65,0.08), inset 0 0 6px rgba(0,255,65,0.04)',
  frameGlow: '0 0 80px rgba(0,255,65,0.10), 0 0 160px rgba(0,255,65,0.04), 0 0 2px rgba(0,255,65,0.4)',
  fontFamily: '"VT323", "Share Tech Mono", "Courier New", monospace',
  fontFamilyNative: 'Courier', uppercaseHeaders: true,
  spinner: '#00FF41', switchTrack: '#00FF41',
  macroProtein: '#00FF41', macroCarbs: '#00CC33', macroFat: '#66FF66', flames: '#00FF41',
};
export const matrixTheme: ThemeDefinition = {
  id: 'matrix', name: 'The Matrix', description: 'Wake up, Neo...',
  icon: 'code-slash-outline', isDark: true, soundTheme: 'matrix',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=VT323&family=Share+Tech+Mono&display=swap',
  colors: matrixColors,
  overlay: {
    scanlines: true, scanlineColor: 'rgba(0,255,65,0.035)', scanlineOpacity: 0.035,
    flicker: true, flickerIntensity: 0.96,
    vignette: true, vignetteColor: 'rgba(0,0,0,0.65)',
    particles: 'matrix-rain', particleColor: '#00FF41', particleOpacity: 0.08,
    texture: 'none', textureOpacity: 0,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * NOSTROMO — MU/TH/UR 6000
 * Amber phosphor 1970s mainframe. Slow, warm, claustrophobic.
 * ═══════════════════════════════════════════════════════════════════════════ */
const alienColors: ThemeColors = {
  background: '#000000',
  backgroundElevated: '#0F0A00',
  backgroundSubtle: '#080500',
  surface: '#1A1200',
  surfaceHover: '#2E2000',
  surfaceSecondary: '#221600',
  surfaceTertiary: '#332200',
  gold: '#FF8C00', goldLight: '#FFA033', goldDark: '#AA5500', goldMuted: 'rgba(255,140,0,0.10)',
  red: '#FF6600', redLight: '#FF8833', redDark: '#993300', redMuted: 'rgba(255,102,0,0.08)',
  textPrimary: '#FF8C00', textSecondary: '#CC7000', textMuted: '#885000', textTertiary: '#442800', textInverse: '#000000',
  success: '#FF8C00', successMuted: 'rgba(255,140,0,0.12)',
  error: '#FF4400', errorMuted: 'rgba(255,68,0,0.10)',
  warning: '#FFAA00', warningMuted: 'rgba(255,170,0,0.10)',
  info: '#CC7000', infoMuted: 'rgba(204,112,0,0.10)',
  border: '#663800', borderSubtle: '#331C00', divider: '#442400',
  overlay: 'rgba(0,0,0,0.88)', shadow: 'rgba(255,140,0,0.06)',
  tabBar: '#080500', tabBarBorder: '#442400',
  accentTint: 'rgba(255,140,0,0.05)',
  accent: '#FF8C00', accentDim: '#CC7000', accentDark: '#442800',
  mapTileFilter: 'grayscale(1) brightness(0.30) sepia(1) hue-rotate(-15deg) saturate(6)',
  mapRouteColor: '#FF8C00',
  textGlow: '0 0 3px #FF8C00, 0 0 8px rgba(255,140,0,0.4), 0 0 20px rgba(255,100,0,0.15)',
  textGlowSubtle: '0 0 2px #FF8C00, 0 0 5px rgba(255,140,0,0.3)',
  boxGlow: '0 0 8px rgba(255,140,0,0.18), 0 0 16px rgba(255,140,0,0.06), inset 0 0 4px rgba(255,140,0,0.03)',
  frameGlow: '0 0 60px rgba(255,140,0,0.08), 0 0 120px rgba(255,100,0,0.03), 0 0 1px rgba(255,140,0,0.3)',
  fontFamily: '"IBM Plex Mono", "Share Tech Mono", "Courier New", monospace',
  fontFamilyNative: 'Courier', uppercaseHeaders: true,
  spinner: '#FF8C00', switchTrack: '#FF8C00',
  macroProtein: '#FF8C00', macroCarbs: '#CC7000', macroFat: '#FFAA33', flames: '#FF6600',
};
export const alienTheme: ThemeDefinition = {
  id: 'alien', name: 'Nostromo', description: 'MU/TH/UR 6000 INTERFACE ACTIVE',
  icon: 'warning-outline', isDark: true, soundTheme: 'alien',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Share+Tech+Mono&display=swap',
  colors: alienColors,
  overlay: {
    scanlines: true, scanlineColor: 'rgba(255,140,0,0.045)', scanlineOpacity: 0.045,
    flicker: true, flickerIntensity: 0.93,
    vignette: true, vignetteColor: 'rgba(0,0,0,0.75)',
    particles: 'static-noise', particleColor: '#FF8C00', particleOpacity: 0.025,
    texture: 'noise', textureOpacity: 0.035,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * SHEIKAH SLATE — Zelda: Breath of the Wild
 * Ancient tech. Clean, minimal, luminous blue. Opaque surfaces. Calm.
 * ═══════════════════════════════════════════════════════════════════════════ */
const sheikahColors: ThemeColors = {
  background: '#0A1628',
  backgroundElevated: '#12203A',
  backgroundSubtle: '#0E1B30',
  surface: '#162A48',
  surfaceHover: '#1E3658',
  surfaceSecondary: '#142440',
  surfaceTertiary: '#1A3050',
  gold: '#5AC8FA', goldLight: '#7DD8FF', goldDark: '#3A8FBB', goldMuted: 'rgba(90,200,250,0.10)',
  red: '#FF9500', redLight: '#FFB340', redDark: '#CC7700', redMuted: 'rgba(255,149,0,0.08)',
  textPrimary: '#D8E4F0', textSecondary: '#8A9DB5', textMuted: '#5A7088', textTertiary: '#3A5068', textInverse: '#0A1628',
  success: '#4CD964', successMuted: 'rgba(76,217,100,0.10)',
  error: '#FF3B30', errorMuted: 'rgba(255,59,48,0.10)',
  warning: '#FF9500', warningMuted: 'rgba(255,149,0,0.10)',
  info: '#5AC8FA', infoMuted: 'rgba(90,200,250,0.10)',
  border: 'rgba(90,200,250,0.10)', borderSubtle: 'rgba(90,200,250,0.05)', divider: 'rgba(216,228,240,0.05)',
  overlay: 'rgba(10,22,40,0.90)', shadow: 'rgba(0,0,0,0.35)',
  tabBar: '#0C1830', tabBarBorder: 'rgba(90,200,250,0.08)',
  accentTint: 'rgba(90,200,250,0.05)',
  accent: '#5AC8FA', accentDim: '#3A8FBB', accentDark: '#1E5A7A',
  mapTileFilter: 'grayscale(0.6) brightness(0.40) contrast(1.1) hue-rotate(190deg) saturate(1.5)',
  mapRouteColor: '#5AC8FA',
  textGlow: '0 0 4px rgba(90,200,250,0.35), 0 0 10px rgba(90,200,250,0.12)',
  textGlowSubtle: '0 0 2px rgba(90,200,250,0.25)',
  boxGlow: '0 0 8px rgba(90,200,250,0.10), 0 0 16px rgba(90,200,250,0.03)',
  frameGlow: '0 0 60px rgba(90,200,250,0.05), 0 0 1px rgba(90,200,250,0.18)',
  fontFamily: '"Rajdhani", "Exo 2", system-ui, sans-serif',
  fontFamilyNative: 'System', uppercaseHeaders: true,
  spinner: '#5AC8FA', switchTrack: '#5AC8FA',
  macroProtein: '#FF3B30', macroCarbs: '#5AC8FA', macroFat: '#FF9500', flames: '#FF9500',
};
export const sheikahTheme: ThemeDefinition = {
  id: 'sheikah', name: 'Sheikah Slate', description: 'Sheikah Slate activated',
  icon: 'tablet-portrait-outline', isDark: true, soundTheme: 'sheikah',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap',
  colors: sheikahColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(10,22,40,0.30)',
    particles: 'sheikah-runes', particleColor: 'rgba(90,200,250,0.06)', particleOpacity: 0.06,
    texture: 'none', textureOpacity: 0,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * SENPAI MODE — Moon Prism Power
 * Magical girl transformation aesthetic. Deep cosmic blue canvas with hot pink
 * and purple accents. Yume kawaii / mahou shoujo. Bright, soft, maximalist.
 * ═══════════════════════════════════════════════════════════════════════════ */
const senpaiColors: ThemeColors = {
  // Backgrounds — sparkling twilight blue (transformation canvas), bright enough to feel magical
  background: '#1E2670',
  backgroundElevated: '#2B3490',
  backgroundSubtle: '#252D80',
  surface: 'rgba(90, 80, 200, 0.45)',
  surfaceHover: 'rgba(110, 100, 220, 0.55)',
  surfaceSecondary: 'rgba(80, 70, 185, 0.40)',
  surfaceTertiary: 'rgba(100, 90, 210, 0.50)',

  // Brand — hot pink primary + purple secondary (Sailor Moon signature)
  gold: '#FF2E51', goldLight: '#FF6B8A', goldDark: '#C41E3D', goldMuted: 'rgba(255,46,81,0.14)',
  red: '#D260FF', redLight: '#E08FFF', redDark: '#9C3DC4', redMuted: 'rgba(210,96,255,0.12)',

  // Text — bright white-blue / soft lavender (readable on lighter backgrounds)
  textPrimary: '#F5F2FF',
  textSecondary: '#C4BFE8',
  textMuted: '#9893C5',
  textTertiary: '#6E6A9A',
  textInverse: '#1E2670',

  // Semantic — magical girl palette
  success: '#7FFFD4', successMuted: 'rgba(127,255,212,0.14)',
  error: '#FF6B6B', errorMuted: 'rgba(255,107,107,0.12)',
  warning: '#FFF666', warningMuted: 'rgba(255,246,102,0.14)',
  info: '#5EE1FF', infoMuted: 'rgba(94,225,255,0.12)',

  // Structure — pink-tinted borders
  border: 'rgba(255,46,81,0.16)',
  borderSubtle: 'rgba(255,46,81,0.08)',
  divider: 'rgba(245,242,255,0.08)',
  overlay: 'rgba(30,38,112,0.85)',
  shadow: 'rgba(40,15,90,0.35)',

  // Navigation
  tabBar: 'rgba(30,38,112,0.92)',
  tabBarBorder: 'rgba(255,46,81,0.14)',

  // Interactive
  accentTint: 'rgba(255,46,81,0.08)',

  // Theme metadata
  accent: '#FF2E51', accentDim: '#C41E3D', accentDark: '#6B1122',
  mapTileFilter: 'grayscale(0.3) brightness(0.50) contrast(1.1) hue-rotate(260deg) saturate(1.8)',
  mapRouteColor: '#FF2E51',
  textGlow: '0 0 4px #FF2E51, 0 0 12px rgba(255,46,81,0.3), 0 0 24px rgba(81,88,255,0.15)',
  textGlowSubtle: '0 0 3px rgba(255,46,81,0.3), 0 0 8px rgba(81,88,255,0.1)',
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
export const senpaiTheme: ThemeDefinition = {
  id: 'senpai', name: 'Senpai Mode', description: 'Moon Prism Power, Make Up!',
  icon: 'heart-outline', isDark: true, soundTheme: 'senpai',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap',
  colors: senpaiColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(20, 10, 70, 0.30)',
    particles: 'moon-sparkle', particleColor: 'rgba(255,183,223,0.8)', particleOpacity: 0.3,
    texture: 'none', textureOpacity: 0,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * System — resolves at runtime to clean-light or clean-dark
 * ═══════════════════════════════════════════════════════════════════════════ */
export const systemTheme: ThemeDefinition = {
  id: 'system', name: 'System', description: 'Follows your device preference',
  icon: 'phone-portrait-outline', isDark: false, soundTheme: 'default',
  colors: darkColors, overlay: { ...NO_OVERLAY },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Registry
 * ═══════════════════════════════════════════════════════════════════════════ */
export const ALL_THEMES: ThemeDefinition[] = [
  systemTheme, cleanLightTheme, cleanDarkTheme,
  matrixTheme, alienTheme, sheikahTheme, senpaiTheme,
];

export const THEMES_BY_ID: Record<string, ThemeDefinition> = {};
for (const t of ALL_THEMES) THEMES_BY_ID[t.id] = t;
