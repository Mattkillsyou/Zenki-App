import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useColorScheme, View, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, ThemeColors, palette } from '../theme';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  isDark: true,
  colors: darkColors,
  setMode: () => {},
});

const STORAGE_KEY = '@zenki_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setModeState(stored);
      }
      setLoaded(true);
    });
  }, []);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(STORAGE_KEY, newMode);
  }, []);

  const isDark = mode === 'system' ? systemScheme !== 'light' : mode === 'dark';
  const themeColors = isDark ? darkColors : lightColors;

  if (!loaded) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.gold} size="small" />
      </View>
    );
  }

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors: themeColors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
