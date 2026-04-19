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
import { AnnouncementProvider } from './src/context/AnnouncementContext';
import { AppointmentProvider } from './src/context/AppointmentContext';
import { EmployeeTaskProvider } from './src/context/EmployeeTaskContext';
import { WorkoutProvider } from './src/context/WorkoutContext';
import { HeartRateProvider } from './src/context/HeartRateContext';
import { GpsActivityProvider } from './src/context/GpsActivityContext';
import { NutritionProvider } from './src/context/NutritionContext';
import { ProductProvider } from './src/context/ProductContext';
import { SpinWheelProvider } from './src/context/SpinWheelContext';
import { CycleTrackerProvider } from './src/context/CycleTrackerContext';
import { SenpaiProvider } from './src/context/SenpaiContext';
import { SenpaiMascot } from './src/components/SenpaiMascot';
import { SenpaiOverlay } from './src/components/SenpaiOverlay';
import { SoundProvider } from './src/context/SoundContext';
import { BlocksProvider } from './src/context/BlocksContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeOverlay } from './src/components/ThemeOverlay';

function AppContent() {
  const { colors, isDark } = useTheme();

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.accent || colors.gold,
      background: colors.background,
      card: colors.background,
      text: colors.textPrimary,
      border: colors.divider,
      notification: colors.accent || colors.gold,
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
      <SenpaiMascot />
      <SenpaiOverlay />
      <ThemeOverlay />
    </NavigationContainer>
  );

  // On web, constrain to mobile width for premium app-like feel
  if (Platform.OS === 'web') {
    return (
      <View style={webStyles.outerContainer}>
        <View style={[
          webStyles.phoneFrame,
          {
            backgroundColor: colors.background,
            // @ts-ignore — web-only boxShadow
            boxShadow: colors.frameGlow || '0 0 80px rgba(0, 255, 65, 0.06), 0 0 0 1px rgba(0,255,65,0.08)',
          },
        ]}>
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
    borderRadius: 0,
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BlocksProvider>
        <MotionProvider>
          <ThemeProvider>
            <SoundProvider>
              <GamificationProvider>
                <DrinkTrackerProvider>
                  <AttendanceProvider>
                    <AnnouncementProvider>
                      <AppointmentProvider>
                        <EmployeeTaskProvider>
                        <WorkoutProvider>
                        <HeartRateProvider>
                        <GpsActivityProvider>
                        <NutritionProvider>
                        <ProductProvider>
                          <SpinWheelProvider>
                          <CycleTrackerProvider>
                          <SenpaiProvider>
                            <TimeClockProvider>
                              <AppContent />
                            </TimeClockProvider>
                          </SenpaiProvider>
                          </CycleTrackerProvider>
                          </SpinWheelProvider>
                        </ProductProvider>
                        </NutritionProvider>
                        </GpsActivityProvider>
                        </HeartRateProvider>
                        </WorkoutProvider>
                        </EmployeeTaskProvider>
                      </AppointmentProvider>
                    </AnnouncementProvider>
                  </AttendanceProvider>
                </DrinkTrackerProvider>
              </GamificationProvider>
            </SoundProvider>
          </ThemeProvider>
        </MotionProvider>
        </BlocksProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
