import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme, View, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ThemeColors, ThemeOverlayConfig, ThemeDefinition, NO_OVERLAY, palette } from '../theme/colors';
import { ALL_THEMES, THEMES_BY_ID, cleanLightTheme, cleanDarkTheme } from '../theme/themes';

export type ThemeMode =
  | 'system'
  | 'clean-light'
  | 'clean-dark'
  | 'matrix'
  | 'alien'
  | 'jurassic'
  | 'ghost'
  | 'bladerunner';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  overlay: ThemeOverlayConfig;
  theme: ThemeDefinition;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'clean-dark',
  isDark: true,
  colors: darkColors,
  overlay: { ...NO_OVERLAY },
  theme: cleanDarkTheme,
  setMode: () => {},
});

const STORAGE_KEY = '@zenki_theme_mode';

/** All valid mode IDs for validation */
const VALID_MODES = new Set<string>(ALL_THEMES.map((t) => t.id));

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('clean-dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && VALID_MODES.has(stored)) {
        setModeState(stored as ThemeMode);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  // Resolve the active theme
  let resolvedTheme: ThemeDefinition;
  if (mode === 'system') {
    resolvedTheme = systemScheme === 'light' ? cleanLightTheme : cleanDarkTheme;
  } else {
    resolvedTheme = THEMES_BY_ID[mode] ?? cleanDarkTheme;
  }

  const isDark = mode === 'system'
    ? systemScheme !== 'light'
    : resolvedTheme.isDark;

  // Inject web font if needed
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const fontUrl = resolvedTheme.webFontUrl;
    if (!fontUrl) return;

    const linkId = 'zenki-theme-font';
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (link) {
      if (link.href === fontUrl) return; // already loaded
      link.href = fontUrl;
    } else {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  }, [resolvedTheme.webFontUrl]);

  // Inject global font family override on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'zenki-theme-font-override';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    const fontFamily = resolvedTheme.colors.fontFamily;

    if (!fontFamily) {
      // Remove override if no custom font
      if (style) style.textContent = '';
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `body, body * { font-family: ${fontFamily} !important; }`;
  }, [resolvedTheme.colors.fontFamily]);

  // Inject text glow on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const styleId = 'zenki-theme-glow';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    const glow = resolvedTheme.colors.textGlow;

    if (!glow) {
      if (style) style.textContent = '';
      return;
    }

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `
      [data-testid="section-title"], [data-testid="page-title"] {
        text-shadow: ${glow};
      }
    `;
  }, [resolvedTheme.colors.textGlow]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.gold} size="small" />
      </View>
    );
  }

  return (
    <ThemeContext.Provider
      value={{
        mode,
        isDark,
        colors: resolvedTheme.colors,
        overlay: resolvedTheme.overlay,
        theme: resolvedTheme,
        setMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
