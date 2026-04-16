export const palette = {
  // Brand
  red: '#C41E2A',
  redLight: '#E63946',
  redDark: '#9B1520',
  gold: '#D4A017',
  goldLight: '#E8B828',
  goldDark: '#B8890F',

  // Neutrals
  black: '#0A0A0A',
  grey950: '#111111',
  grey900: '#1A1A1A',
  grey850: '#1E1E1E',
  grey800: '#2A2A2A',
  grey700: '#3A3A3A',
  grey600: '#555555',
  grey500: '#6B6B6B',
  grey400: '#8A8A8A',
  grey300: '#B0B0B0',
  grey200: '#D0D0D0',
  grey150: '#E0E0E0',
  grey100: '#EEEEEE',
  grey50: '#F5F5F5',
  white: '#FFFFFF',

  // Semantic
  success: '#4CAF50',
  error: '#E63946',
  warning: '#D4A017',
  info: '#3498DB',
};

export interface ThemeColors {
  background: string;
  backgroundElevated: string;
  surface: string;
  surfaceSecondary: string;
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
  textInverse: string;
  success: string;
  error: string;
  warning: string;
  info: string;
  border: string;
  divider: string;
  overlay: string;
  shadow: string;
  tabBar: string;
  tabBarBorder: string;
}

export const darkColors: ThemeColors = {
  background: palette.black,
  backgroundElevated: palette.grey900,
  surface: palette.grey850,
  surfaceSecondary: palette.grey800,
  gold: palette.gold,
  goldLight: palette.goldLight,
  goldDark: palette.goldDark,
  goldMuted: 'rgba(212, 160, 23, 0.12)',
  red: palette.red,
  redLight: palette.redLight,
  redDark: palette.redDark,
  redMuted: 'rgba(196, 30, 42, 0.12)',
  textPrimary: palette.white,
  textSecondary: palette.grey300,
  textMuted: palette.grey500,
  textInverse: palette.black,
  success: palette.success,
  error: palette.error,
  warning: palette.warning,
  info: palette.info,
  border: palette.grey800,
  divider: 'rgba(255, 255, 255, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.75)',
  shadow: 'rgba(0, 0, 0, 0.6)',
  tabBar: palette.grey950,
  tabBarBorder: 'rgba(255, 255, 255, 0.06)',
};

export const lightColors: ThemeColors = {
  background: palette.grey50,
  backgroundElevated: palette.white,
  surface: palette.white,
  surfaceSecondary: palette.grey100,
  gold: palette.goldDark,
  goldLight: palette.gold,
  goldDark: '#9A7610',
  goldMuted: 'rgba(184, 137, 15, 0.10)',
  red: palette.red,
  redLight: palette.redLight,
  redDark: palette.redDark,
  redMuted: 'rgba(196, 30, 42, 0.08)',
  textPrimary: palette.grey950,
  textSecondary: palette.grey600,
  textMuted: palette.grey400,
  textInverse: palette.white,
  success: palette.success,
  error: palette.error,
  warning: palette.warning,
  info: palette.info,
  border: palette.grey150,
  divider: 'rgba(0, 0, 0, 0.06)',
  overlay: 'rgba(0, 0, 0, 0.5)',
  shadow: 'rgba(0, 0, 0, 0.12)',
  tabBar: palette.white,
  tabBarBorder: 'rgba(0, 0, 0, 0.08)',
};

// Backwards compat — will be replaced by useTheme() hook in components
export const colors = darkColors;
