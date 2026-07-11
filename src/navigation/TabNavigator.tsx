import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useDrinkTracker } from '../context/DrinkTrackerContext';
import { useSenpai } from '../context/SenpaiContext';
import { useMotion } from '../context/MotionContext';
import { AnimatedTabIcon } from '../components/AnimatedTabIcon';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  HomeScreen,
  ScheduleScreen,
  BookScreen,
  StoreScreen,
  ProfileScreen,
  DrinkScreen,
  CommunityScreen,
  EmployeeChecklistScreen,
  TimeClockScreen,
} from '../screens';

const Tab = createBottomTabNavigator();

/** Wrap a tab screen component in an ErrorBoundary.
 *
 * Audit 2.0.5 P2: without this, a render crash in any tab escalated to the
 * App Root boundary and replaced the ENTIRE app (nav state lost) instead of
 * just the broken tab.
 *
 * Replicated from RootNavigator's helper (not exported there — RootNavigator
 * is owned separately). Same memoization contract: keyed by
 * (component, screenName) so repeated inline calls in JSX return the SAME
 * wrapper identity across renders — TabNavigator re-renders on every
 * theme/auth/drink/senpai context change, and a fresh identity per render
 * would make React Navigation unmount/remount every tab screen. WeakMap
 * keyed on the component keeps hot-reloaded/dead components collectable. */
const boundaryCache = new WeakMap<React.ComponentType<any>, Map<string, React.ComponentType<any>>>();
function withErrorBoundary(ScreenComponent: React.ComponentType<any>, screenName: string) {
  let byName = boundaryCache.get(ScreenComponent);
  if (!byName) {
    byName = new Map();
    boundaryCache.set(ScreenComponent, byName);
  }
  const cached = byName.get(screenName);
  if (cached) return cached;
  function WrappedScreen(props: any) {
    return (
      <ErrorBoundary screenName={screenName}>
        <ScreenComponent {...props} />
      </ErrorBoundary>
    );
  }
  byName.set(screenName, WrappedScreen);
  return WrappedScreen;
}

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Schedule: { active: 'calendar', inactive: 'calendar-outline' },
  Community: { active: 'add-circle', inactive: 'add-circle-outline' },
  Book: { active: 'people', inactive: 'people-outline' },
  Hydration: { active: 'water', inactive: 'water-outline' },
  Store: { active: 'bag', inactive: 'bag-outline' },
  Tasks: { active: 'checkbox', inactive: 'checkbox-outline' },
  Clock: { active: 'time', inactive: 'time-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function TabNavigator() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { unpaidTotal } = useDrinkTracker();
  const { state: senpaiState } = useSenpai();
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const isEmployee = user?.isEmployee === true;
  const tabBarHeight = 60 + insets.bottom;
  const hasUnpaidDrinks = unpaidTotal > 0;
  const activeTint = senpaiState.enabled ? '#FF69B4' : colors.gold;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        // v7 cross-content shift instead of a hard cut between tabs.
        // Reduce Motion → opacity-only fade (no translation), matching the
        // stack navigator's fade fallback in RootNavigator.
        animation: reduceMotion ? 'fade' : 'shift',
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingTop: 10,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: activeTint,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          const iconName = focused ? icons.active : icons.inactive;
          const showDot = route.name === 'Hydration' && hasUnpaidDrinks;
          return (
            <View style={{ position: 'relative' }}>
              <AnimatedTabIcon
                name={iconName}
                size={24}
                color={color}
                focused={focused}
                senpaiActive={senpaiState.enabled}
              />
              {showDot && (
                <View style={[tabStyles.badge, { backgroundColor: colors.red, borderColor: colors.tabBar }]} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={withErrorBoundary(HomeScreen, 'Home')} />
      <Tab.Screen name="Schedule" component={withErrorBoundary(ScheduleScreen, 'Schedule')} />
      <Tab.Screen name="Book" component={withErrorBoundary(BookScreen, 'Book')} />
      <Tab.Screen name="Community" component={withErrorBoundary(CommunityScreen, 'Community')} />
      {!isEmployee && <Tab.Screen name="Hydration" component={withErrorBoundary(DrinkScreen, 'Hydration')} />}
      {!isEmployee && <Tab.Screen name="Store" component={withErrorBoundary(StoreScreen, 'Store')} />}
      {isEmployee && <Tab.Screen name="Tasks" component={withErrorBoundary(EmployeeChecklistScreen, 'Tasks')} />}
      {isEmployee && <Tab.Screen name="Clock" component={withErrorBoundary(TimeClockScreen, 'Time Clock')} />}
      <Tab.Screen name="Profile" component={withErrorBoundary(ProfileScreen, 'Profile')} />
    </Tab.Navigator>
  );
}

const tabStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
});
