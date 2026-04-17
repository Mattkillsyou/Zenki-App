/**
 * All 8 ThemeDefinition objects (system resolves at runtime).
 * Each theme is a COMPLETE, DISTINCT visual identity.
 */

import {
  ThemeDefinition,
  ThemeColors,
  ThemeOverlayConfig,
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
 * JURASSIC PARK — Isla Nublar
 * SGI IRIX workstation. NOT a CRT. Multicolor. Sans-serif. Clean.
 * ═══════════════════════════════════════════════════════════════════════════ */
const jurassicColors: ThemeColors = {
  background: '#000820',
  backgroundElevated: '#001030',
  backgroundSubtle: '#000C28',
  surface: '#001440',
  surfaceHover: '#002060',
  surfaceSecondary: '#001A50',
  surfaceTertiary: '#002468',
  gold: '#FFB800', goldLight: '#FFCC33', goldDark: '#CC9200', goldMuted: 'rgba(255,184,0,0.12)',
  red: '#FF3333', redLight: '#FF5555', redDark: '#CC0000', redMuted: 'rgba(255,51,51,0.10)',
  textPrimary: '#E0E8FF', textSecondary: '#8899BB', textMuted: '#556688', textTertiary: '#334466', textInverse: '#000820',
  success: '#33FF66', successMuted: 'rgba(51,255,102,0.12)',
  error: '#FF3333', errorMuted: 'rgba(255,51,51,0.10)',
  warning: '#FFB800', warningMuted: 'rgba(255,184,0,0.10)',
  info: '#00CCFF', infoMuted: 'rgba(0,204,255,0.10)',
  border: '#003366', borderSubtle: '#001A44', divider: '#002244',
  overlay: 'rgba(0,8,32,0.88)', shadow: 'rgba(0,0,0,0.4)',
  tabBar: '#000C28', tabBarBorder: '#003366',
  accentTint: 'rgba(255,184,0,0.07)',
  accent: '#FFB800', accentDim: '#CC9200', accentDark: '#664900',
  mapTileFilter: 'grayscale(0.4) brightness(0.45) contrast(1.2) hue-rotate(200deg) saturate(1.8)',
  mapRouteColor: '#00CCFF',
  textGlow: '0 0 3px rgba(0,204,255,0.3)',
  textGlowSubtle: '0 0 1px rgba(0,204,255,0.2)',
  boxGlow: '0 0 4px rgba(0,204,255,0.10)',
  frameGlow: '0 0 40px rgba(0,204,255,0.04), 0 0 1px rgba(0,204,255,0.15)',
  fontFamily: '"IBM Plex Sans", "DM Sans", system-ui, sans-serif',
  fontFamilyNative: 'System', uppercaseHeaders: true,
  spinner: '#00CCFF', switchTrack: '#FFB800',
  macroProtein: '#FF6B6B', macroCarbs: '#00CCFF', macroFat: '#FFB800', flames: '#FF3333',
};
export const jurassicTheme: ThemeDefinition = {
  id: 'jurassic', name: 'Jurassic Park',
  description: "Ah ah ah, you didn't say the magic word",
  icon: 'bug-outline', isDark: true, soundTheme: 'jurassic',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
  colors: jurassicColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(0,0,20,0.35)',
    particles: 'none', particleColor: '', particleOpacity: 0,
    texture: 'grid', textureOpacity: 0.025,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * GHOST IN THE SHELL — Section 9
 * Holographic HUD. Glassmorphism. Cyan/magenta on deep purple void.
 * ═══════════════════════════════════════════════════════════════════════════ */
const ghostColors: ThemeColors = {
  background: '#0D0221',
  backgroundElevated: '#160433',
  backgroundSubtle: '#110328',
  surface: 'rgba(30,10,60,0.65)',
  surfaceHover: 'rgba(45,15,85,0.75)',
  surfaceSecondary: 'rgba(22,6,45,0.55)',
  surfaceTertiary: 'rgba(35,12,70,0.50)',
  gold: '#00F0FF', goldLight: '#66F7FF', goldDark: '#0099AA', goldMuted: 'rgba(0,240,255,0.08)',
  red: '#FF4081', redLight: '#FF80AB', redDark: '#C51162', redMuted: 'rgba(255,64,129,0.08)',
  textPrimary: '#D0C4E8', textSecondary: '#8B7BA3', textMuted: '#5C4D73', textTertiary: '#3A2D4D', textInverse: '#0D0221',
  success: '#00E5A0', successMuted: 'rgba(0,229,160,0.10)',
  error: '#FF4081', errorMuted: 'rgba(255,64,129,0.08)',
  warning: '#FFD740', warningMuted: 'rgba(255,215,64,0.08)',
  info: '#00F0FF', infoMuted: 'rgba(0,240,255,0.08)',
  border: 'rgba(0,240,255,0.12)', borderSubtle: 'rgba(0,240,255,0.05)', divider: 'rgba(200,184,219,0.06)',
  overlay: 'rgba(13,2,33,0.88)', shadow: 'rgba(0,240,255,0.06)',
  tabBar: 'rgba(13,2,33,0.92)', tabBarBorder: 'rgba(0,240,255,0.10)',
  accentTint: 'rgba(0,240,255,0.04)',
  accent: '#00F0FF', accentDim: '#0099AA', accentDark: '#005566',
  mapTileFilter: 'grayscale(0.8) brightness(0.25) contrast(1.4) hue-rotate(260deg) saturate(3)',
  mapRouteColor: '#00F0FF',
  textGlow: '0 0 4px rgba(0,240,255,0.5), 0 0 14px rgba(0,240,255,0.2), 0 0 30px rgba(0,240,255,0.05)',
  textGlowSubtle: '0 0 3px rgba(0,240,255,0.35)',
  boxGlow: '0 0 15px rgba(0,240,255,0.12), 0 0 30px rgba(0,240,255,0.04), inset 0 0 15px rgba(0,240,255,0.03)',
  frameGlow: '0 0 100px rgba(0,240,255,0.06), 0 0 2px rgba(0,240,255,0.25)',
  fontFamily: '"Rajdhani", "Exo 2", system-ui, sans-serif',
  fontFamilyNative: 'System', uppercaseHeaders: false,
  spinner: '#00F0FF', switchTrack: '#00F0FF',
  macroProtein: '#FF4081', macroCarbs: '#00E5A0', macroFat: '#FFD740', flames: '#FF4081',
};
export const ghostTheme: ThemeDefinition = {
  id: 'ghost', name: 'Ghost in the Shell', description: 'Your ghost whispers to me',
  icon: 'eye-outline', isDark: true, soundTheme: 'ghost',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=Exo+2:wght@400;500;600&display=swap',
  colors: ghostColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(13,2,33,0.45)',
    particles: 'data-streams', particleColor: 'rgba(0,240,255,0.06)', particleOpacity: 0.06,
    texture: 'hex', textureOpacity: 0.025,
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * BLADE RUNNER — Tears in Rain
 * Neo-noir. Wet. Warm neon vs cool rain. Cinematic, NOT technological.
 * ═══════════════════════════════════════════════════════════════════════════ */
const bladerunnerColors: ThemeColors = {
  background: '#0A1A1F',
  backgroundElevated: '#122830',
  backgroundSubtle: '#0E2025',
  surface: 'rgba(20,50,60,0.75)',
  surfaceHover: 'rgba(30,70,85,0.80)',
  surfaceSecondary: 'rgba(15,40,50,0.65)',
  surfaceTertiary: 'rgba(25,60,72,0.60)',
  gold: '#FF6F3C', goldLight: '#FF9966', goldDark: '#CC4A1A', goldMuted: 'rgba(255,111,60,0.10)',
  red: '#FF3D3D', redLight: '#FF6666', redDark: '#CC1A1A', redMuted: 'rgba(255,61,61,0.08)',
  textPrimary: '#C5D8E8', textSecondary: '#7A97AB', textMuted: '#4A6678', textTertiary: '#2C4050', textInverse: '#0A1A1F',
  success: '#00CC88', successMuted: 'rgba(0,204,136,0.10)',
  error: '#FF3D3D', errorMuted: 'rgba(255,61,61,0.08)',
  warning: '#FFB347', warningMuted: 'rgba(255,179,71,0.08)',
  info: '#4DC9F6', infoMuted: 'rgba(77,201,246,0.08)',
  border: 'rgba(255,111,60,0.12)', borderSubtle: 'rgba(255,111,60,0.06)', divider: 'rgba(197,216,232,0.05)',
  overlay: 'rgba(10,26,31,0.88)', shadow: 'rgba(0,0,0,0.45)',
  tabBar: 'rgba(10,22,28,0.95)', tabBarBorder: 'rgba(255,111,60,0.10)',
  accentTint: 'rgba(255,111,60,0.05)',
  accent: '#FF6F3C', accentDim: '#CC4A1A', accentDark: '#662510',
  mapTileFilter: 'grayscale(0.5) brightness(0.30) contrast(1.3) sepia(0.2) hue-rotate(170deg) saturate(2)',
  mapRouteColor: '#FF6F3C',
  textGlow: '0 0 4px rgba(255,111,60,0.45), 0 0 12px rgba(255,111,60,0.15), 0 0 24px rgba(255,80,30,0.06)',
  textGlowSubtle: '0 0 3px rgba(255,111,60,0.3)',
  boxGlow: '0 0 12px rgba(255,111,60,0.14), 0 0 24px rgba(255,111,60,0.04), inset 0 0 8px rgba(255,111,60,0.03)',
  frameGlow: '0 0 80px rgba(255,111,60,0.08), 0 0 160px rgba(255,80,30,0.03), 0 0 2px rgba(255,111,60,0.25)',
  fontFamily: '"Bebas Neue", "Rajdhani", system-ui, sans-serif',
  fontFamilyNative: 'System', uppercaseHeaders: false,
  spinner: '#FF6F3C', switchTrack: '#FF6F3C',
  macroProtein: '#FF6F3C', macroCarbs: '#4DC9F6', macroFat: '#FFB347', flames: '#FF6F3C',
};
export const bladerunnerTheme: ThemeDefinition = {
  id: 'bladerunner', name: 'Blade Runner',
  description: 'All those moments will be lost in time, like tears in rain',
  icon: 'rainy-outline', isDark: true, soundTheme: 'bladerunner',
  webFontUrl: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Rajdhani:wght@400;500;600&display=swap',
  colors: bladerunnerColors,
  overlay: {
    scanlines: false, scanlineColor: '', scanlineOpacity: 0,
    flicker: false, flickerIntensity: 1,
    vignette: true, vignetteColor: 'rgba(5,15,18,0.65)',
    particles: 'rain-drops', particleColor: 'rgba(150,200,230,0.20)', particleOpacity: 0.20,
    texture: 'noise', textureOpacity: 0.045,
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
  matrixTheme, alienTheme, jurassicTheme, ghostTheme, bladerunnerTheme, sheikahTheme,
];

export const THEMES_BY_ID: Record<string, ThemeDefinition> = {};
for (const t of ALL_THEMES) THEMES_BY_ID[t.id] = t;
