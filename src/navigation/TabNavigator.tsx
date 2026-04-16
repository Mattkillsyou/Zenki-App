import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
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
  const isEmployee = user?.isEmployee === true;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: 76,
          paddingTop: 10,
          paddingBottom: 18,
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          if (!icons) return null;
          const iconName = focused ? icons.active : icons.inactive;
          return (
            <AnimatedTabIcon
              name={iconName}
              size={focused ? 28 : 24}
              color={color}
              focused={focused}
            />
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
