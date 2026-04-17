import React from 'react';
import { Dimensions, View, ActivityIndicator } from 'react-native';
import {
  createStackNavigator,
  StackCardInterpolationProps,
} from '@react-navigation/stack';
import { TabNavigator } from './TabNavigator';
import { useAuth } from '../context/AuthContext';
import { easing, duration, scale, opacity } from '../theme';
import { palette } from '../theme/colors';

// Auth screens
import { SignInScreen } from '../screens/auth/SignInScreen';
import { SetPasswordScreen } from '../screens/auth/SetPasswordScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ContactScreen } from '../screens/auth/ContactScreen';
import { OnboardingScreen } from '../screens/auth/OnboardingScreen';

// Main stack screens
import { SettingsScreen } from '../screens/SettingsScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { AdminMembersScreen } from '../screens/AdminMembersScreen';
import { AdminProductsScreen } from '../screens/AdminProductsScreen';
import { AdminScheduleScreen } from '../screens/AdminScheduleScreen';
import { AttendanceHistoryScreen } from '../screens/AttendanceHistoryScreen';
import { AdminBroadcastScreen } from '../screens/AdminBroadcastScreen';
import { AdminAnnouncementsScreen } from '../screens/AdminAnnouncementsScreen';
import { AdminAppointmentsScreen } from '../screens/AdminAppointmentsScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { TimerScreen } from '../screens/TimerScreen';
import { PRDetailScreen } from '../screens/PRDetailScreen';
import { EmployeeChecklistScreen } from '../screens/EmployeeChecklistScreen';
import { AdminEmployeeTasksScreen } from '../screens/AdminEmployeeTasksScreen';
import { BookingPaymentScreen } from '../screens/BookingPaymentScreen';
import { PaymentMethodsScreen } from '../screens/PaymentMethodsScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CreatePostScreen } from '../screens/CreatePostScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { AchievementDetailScreen } from '../screens/AchievementDetailScreen';
import { ContactSupportScreen } from '../screens/ContactSupportScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { MessagesListScreen } from '../screens/MessagesListScreen';
import { MessagesChatScreen } from '../screens/MessagesChatScreen';
import { UserSearchScreen } from '../screens/UserSearchScreen';

const Stack = createStackNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────
// TRANSITION: Crossfade
// Used for auth → main and main → auth
// Clean opacity swap, no directional movement
// ─────────────────────────────────────────────────
const crossfadeInterpolator = ({ current }: StackCardInterpolationProps) => ({
  cardStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.3, 1],
    }),
  },
});

const crossfadeTransition = {
  cardStyleInterpolator: crossfadeInterpolator,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: { duration: duration.slow, easing: easing.emphasized },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.accelerate },
    },
  },
};

// ─────────────────────────────────────────────────
// TRANSITION: Push (slide right + fade + scale)
// Used for detail screens and auth sub-screens
// The entering screen slides in from right with slight scale-up
// The leaving screen fades/scales down slightly behind it
// ─────────────────────────────────────────────────
const pushInterpolator = ({
  current,
  next,
  layouts,
}: StackCardInterpolationProps) => {
  const progress = current.progress;
  const nextProgress = next?.progress;

  // Entering card: slide from right + fade in + scale up from 94%
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [layouts.screen.width * 0.4, 0],
  });
  const cardOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.6, 1],
  });
  const cardScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [scale.pageEnter, 1],
  });

  // Behind card dims and scales down slightly when something pushes on top
  const behindScale = nextProgress
    ? nextProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, scale.pageExit],
      })
    : 1;
  const behindOpacity = nextProgress
    ? nextProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [1, opacity.behindScreen],
      })
    : 1;

  return {
    cardStyle: {
      opacity: cardOpacity,
      transform: [
        { translateX },
        {
          scale: nextProgress
            ? // If this card is going behind, use behindScale
              progress.interpolate({
                inputRange: [0, 1],
                outputRange: [scale.pageEnter, 1],
              })
            : cardScale,
        },
      ],
    },
    overlayStyle: {
      opacity: nextProgress
        ? nextProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 0.06],
          })
        : 0,
    },
  };
};

const pushTransition = {
  cardStyleInterpolator: pushInterpolator,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.decelerate },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.standard - 40, easing: easing.accelerate },
    },
  },
  gestureDirection: 'horizontal' as const,
  gestureResponseDistance: SCREEN_WIDTH * 0.5,
};

// ─────────────────────────────────────────────────
// TRANSITION: Modal (slide up + fade + scale)
// Used for settings, payment, admin overlays
// Slides up from bottom with slight fade and scale
// ─────────────────────────────────────────────────
const modalInterpolator = ({
  current,
  layouts,
}: StackCardInterpolationProps) => {
  const progress = current.progress;

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [layouts.screen.height * 0.15, 0],
  });
  const modalOpacity = progress.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
  });
  const modalScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });

  return {
    cardStyle: {
      opacity: modalOpacity,
      transform: [{ translateY }, { scale: modalScale }],
    },
    overlayStyle: {
      opacity: progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, opacity.modalOverlay],
      }),
    },
  };
};

const modalTransition = {
  cardStyleInterpolator: modalInterpolator,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: { duration: duration.slow, easing: easing.decelerate },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.accelerate },
    },
  },
  gestureDirection: 'vertical' as const,
};

// ─────────────────────────────────────────────────
// NAVIGATOR
// ─────────────────────────────────────────────────
export function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.gold} size="small" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={user ? 'Main' : 'SignIn'}
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        cardOverlayEnabled: true,
        cardStyle: { backgroundColor: 'transparent' },
      }}
    >
      {/* Auth — crossfade */}
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ ...crossfadeTransition, gestureEnabled: false }}
      />
      <Stack.Screen name="SetPassword" component={SetPasswordScreen} options={pushTransition} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={pushTransition} />
      <Stack.Screen name="Contact" component={ContactScreen} options={pushTransition} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ ...crossfadeTransition, gestureEnabled: false }} />

      {/* Main tabs — crossfade from auth */}
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ ...crossfadeTransition, gestureEnabled: false }}
      />

      {/* Modals — slide up */}
      <Stack.Screen name="Settings" component={SettingsScreen} options={modalTransition} />
      <Stack.Screen name="Admin" component={AdminScreen} options={modalTransition} />
      <Stack.Screen name="BookingPayment" component={BookingPaymentScreen} options={modalTransition} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={modalTransition} />

      {/* Admin sub-screens — push */}
      <Stack.Screen name="AdminMembers" component={AdminMembersScreen} options={pushTransition} />
      <Stack.Screen name="AdminProducts" component={AdminProductsScreen} options={pushTransition} />
      <Stack.Screen name="AdminSchedule" component={AdminScheduleScreen} options={pushTransition} />
      <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={pushTransition} />
      <Stack.Screen name="AdminBroadcast" component={AdminBroadcastScreen} options={pushTransition} />
      <Stack.Screen name="AdminAnnouncements" component={AdminAnnouncementsScreen} options={pushTransition} />
      <Stack.Screen name="AdminAppointments" component={AdminAppointmentsScreen} options={pushTransition} />
      <Stack.Screen name="Workout" component={WorkoutScreen} options={pushTransition} />
      <Stack.Screen name="Timer" component={TimerScreen} options={pushTransition} />
      <Stack.Screen name="PRDetail" component={PRDetailScreen} options={pushTransition} />
      <Stack.Screen name="EmployeeChecklist" component={EmployeeChecklistScreen} options={pushTransition} />
      <Stack.Screen name="AdminEmployeeTasks" component={AdminEmployeeTasksScreen} options={pushTransition} />


      {/* Community */}
      <Stack.Screen name="CreatePost" component={CreatePostScreen} options={modalTransition} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} options={pushTransition} />

      {/* Detail — push */}
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={pushTransition} />
      <Stack.Screen name="Achievements" component={AchievementsScreen} options={pushTransition} />
      <Stack.Screen name="AchievementDetail" component={AchievementDetailScreen} options={pushTransition} />
      <Stack.Screen name="ContactSupport" component={ContactSupportScreen} options={pushTransition} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} options={pushTransition} />
      <Stack.Screen name="MessagesList" component={MessagesListScreen} options={pushTransition} />
      <Stack.Screen name="MessagesChat" component={MessagesChatScreen} options={pushTransition} />
      <Stack.Screen name="UserSearch" component={UserSearchScreen} options={pushTransition} />
    </Stack.Navigator>
  );
}
