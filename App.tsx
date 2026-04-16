import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Platform, StyleSheet } from 'react-native';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { MotionProvider } from './src/context/MotionContext';
import { AuthProvider } from './src/context/AuthContext';
import { TimeClockProvider } from './src/context/TimeClockContext';
import { GamificationProvider } from './src/context/GamificationContext';
import { DrinkTrackerProvider } from './src/context/DrinkTrackerContext';
import { AttendanceProvider } from './src/context/AttendanceContext';
import { RootNavigator } from './src/navigation/RootNavigator';

function AppContent() {
  const { colors, isDark } = useTheme();

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.gold,
      background: colors.background,
      card: colors.background,
      text: colors.textPrimary,
      border: colors.divider,
      notification: colors.gold,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '700' as const },
      heavy: { fontFamily: 'System', fontWeight: '900' as const },
    },
  };

  const content = (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
    </NavigationContainer>
  );

  // On web, constrain to mobile width for premium app-like feel
  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.outerContainer}>
        <View style={[webStyles.phoneFrame, { backgroundColor: colors.background }]}>
          {content}
        </View>
      </View>
    );
  }

  return content;
}

const webStyles = StyleSheet.create({
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
    // @ts-ignore — web-only boxShadow
    boxShadow: '0 0 80px rgba(232, 184, 40, 0.06), 0 0 0 1px rgba(255,255,255,0.08)',
    borderRadius: 0,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MotionProvider>
          <ThemeProvider>
            <GamificationProvider>
              <DrinkTrackerProvider>
                <AttendanceProvider>
                  <TimeClockProvider>
                    <AppContent />
                  </TimeClockProvider>
                </AttendanceProvider>
              </DrinkTrackerProvider>
            </GamificationProvider>
          </ThemeProvider>
        </MotionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
