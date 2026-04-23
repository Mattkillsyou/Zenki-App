import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useDrinkTracker } from '../context/DrinkTrackerContext';
import { useSenpai } from '../context/SenpaiContext';
import { AnimatedTabIcon } from '../components/AnimatedTabIcon';
import {
  HomeScreen,
  ScheduleScreen,
  BookScreen,
  StoreScreen,
  ProfileScreen,
  DrinkScreen,
  CommunityScreen,
} from '../screens';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Schedule: { active: 'calendar', inactive: 'calendar-outline' },
  Community: { active: 'people', inactive: 'people-outline' },
  Book: { active: 'add-circle', inactive: 'add-circle-outline' },
  Hydration: { active: 'water', inactive: 'water-outline' },
  Store: { active: 'bag', inactive: 'bag-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function TabNavigator() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { unpaidTotal } = useDrinkTracker();
  const { state: senpaiState } = useSenpai();
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
                size={focused ? 28 : 24}
                color={color}
                focused={focused}
              />
              {showDot && (
                <View style={[tabStyles.badge, { backgroundColor: colors.red, borderColor: colors.tabBar }]} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      {!isEmployee && <Tab.Screen name="Schedule" component={ScheduleScreen} />}
      {!isEmployee && <Tab.Screen name="Community" component={CommunityScreen} />}
      {!isEmployee && <Tab.Screen name="Book" component={BookScreen} />}
      {!isEmployee && <Tab.Screen name="Hydration" component={DrinkScreen} />}
      {!isEmployee && <Tab.Screen name="Store" component={StoreScreen} />}
      <Tab.Screen name="Profile" component={ProfileScreen} />
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
