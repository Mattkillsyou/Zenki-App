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
import { MedicationTrackerProvider } from './src/context/MedicationTrackerContext';
import { HealthKitProvider } from './src/context/HealthKitContext';
import { SenpaiProvider } from './src/context/SenpaiContext';
import { SenpaiMascot } from './src/components/SenpaiMascot';
import { SenpaiOverlay } from './src/components/SenpaiOverlay';
import { SenpaiReactionBridge } from './src/components/SenpaiReactionBridge';
import { SenpaiThemeBridge } from './src/components/SenpaiThemeBridge';
import { SenpaiTransformation } from './src/components/SenpaiTransformation';
import { SenpaiScreenFlash } from './src/components/SenpaiScreenFlash';
import { SenpaiImpactBridge } from './src/components/SenpaiImpactBridge';
import { SoundProvider } from './src/context/SoundContext';
import { BlocksProvider } from './src/context/BlocksContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { ThemeOverlay } from './src/components/ThemeOverlay';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppContent() {
  const { colors, isDark } = useTheme();
  const [navKey, setNavKey] = React.useState(0);

  const getActiveRouteKey = (state: any): string | null => {
    try {
      let cur: any = state;
      for (let i = 0; i < 6; i++) {
        if (!cur || typeof cur.index !== 'number' || !Array.isArray(cur.routes)) break;
        const next = cur.routes[cur.index];
        if (!next) break;
        if (!next.state) return typeof next.key === 'string' ? next.key : null;
        cur = next.state;
      }
      return null;
    } catch { return null; }
  };
  const lastRouteKeyRef = React.useRef<string | null>(null);

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
    <NavigationContainer
      theme={navTheme}
      onStateChange={(state) => {
        const key = getActiveRouteKey(state);
        if (key && key !== lastRouteKeyRef.current) {
          lastRouteKeyRef.current = key;
          setNavKey((k) => k + 1);
        }
      }}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootNavigator />
      <SenpaiThemeBridge />
      <SenpaiReactionBridge />
      <SenpaiMascot />
      <SenpaiOverlay />
      <SenpaiImpactBridge />
      <SenpaiTransformation />
      <SenpaiScreenFlash navKey={navKey} />
      <ThemeOverlay />
    </NavigationContainer>
  );

  // On web, constrain to mobile width for premium app-like feel.
  // Top padding (54) + bottom padding (34) reserve space for an iPhone
  // Dynamic Island and home-indicator. We can't rely on
  // react-native-safe-area-context's `initialMetrics` here because the
  // library reads CSS env(safe-area-inset-*) which are 0 in the browser
  // and override the initial values. Padding the phone frame itself is
  // the correct fix.
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
          {/* Simulated Dynamic Island so the user can visualize how content
              clears the notch on a real iPhone 14 Pro. */}
          <View style={webStyles.fakeIsland} pointerEvents="none" />
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
    // Reserve space at the top + bottom that mirrors the iPhone 14 Pro
    // Dynamic Island and home indicator so screen content stops where it
    // would on a real device.
    paddingTop: 54,
    paddingBottom: 34,
  },
  // Visual representation of the Dynamic Island — pill at the top center.
  fakeIsland: {
    position: 'absolute',
    top: 12,
    left: '50%',
    width: 120,
    height: 32,
    marginLeft: -60,
    backgroundColor: '#000',
    borderRadius: 20,
    zIndex: 100,
  },
});

export default function App() {
  return (
    <ErrorBoundary screenName="App Root">
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
                          <MedicationTrackerProvider>
                          <SenpaiProvider>
                            <TimeClockProvider>
                              <HealthKitProvider>
                                <AppContent />
                              </HealthKitProvider>
                            </TimeClockProvider>
                          </SenpaiProvider>
                          </MedicationTrackerProvider>
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
    </ErrorBoundary>
  );
}
