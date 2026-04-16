import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { AnimatedTabIcon } from '../components/AnimatedTabIcon';
import {
  HomeScreen,
  ScheduleScreen,
  BookScreen,
  StoreScreen,
  ProfileScreen,
} from '../screens';

const Tab = createBottomTabNavigator();

const TAB_ICONS: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Schedule: { active: 'calendar', inactive: 'calendar-outline' },
  Book: { active: 'add-circle', inactive: 'add-circle-outline' },
  Store: { active: 'bag', inactive: 'bag-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export function TabNavigator() {
  const { colors } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBarBorder,
          borderTopWidth: 1,
          height: 84,
          paddingTop: 6,
          paddingBottom: 24,
        },
        tabBarActiveTintColor: colors.red,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600' as const,
          letterSpacing: 0.3,
          textTransform: 'uppercase' as const,
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          const iconName = focused ? icons.active : icons.inactive;
          return (
            <AnimatedTabIcon
              name={iconName}
              size={focused ? 26 : 24}
              color={color}
              focused={focused}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} />
      <Tab.Screen name="Book" component={BookScreen} options={{ tabBarLabel: 'Book' }} />
      <Tab.Screen name="Store" component={StoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
