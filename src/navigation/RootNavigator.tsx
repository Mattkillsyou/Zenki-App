import React from 'react';
import { Dimensions, View, ActivityIndicator } from 'react-native';
import {
  createStackNavigator,
  StackCardInterpolationProps,
  CardStyleInterpolators,
} from '@react-navigation/stack';
import { TabNavigator } from './TabNavigator';
import { useAuth } from '../context/AuthContext';
import { useMotion } from '../context/MotionContext';
import { easing, duration, opacity, spring } from '../theme';
import { palette } from '../theme/colors';
import { ErrorBoundary } from '../components/ErrorBoundary';

/** Wrap a screen component in an ErrorBoundary.
 *
 * Audit 2.0.5 P1: MEMOIZED by (component, screenName). This is called inline
 * in RootNavigator's JSX for ~50 Stack.Screens while RootNavigator subscribes
 * to useAuth() — without the cache, every auth value change (including every
 * /members onSnapshot delivery) minted ~50 brand-new component identities,
 * and React Navigation unmounted/remounted every mounted screen: DM drafts
 * wiped, lists reset, every listener torn down and resubscribed. The cache
 * returns the SAME wrapper identity per screen across renders, so screen
 * components stay referentially stable. WeakMap keyed on the component keeps
 * hot-reloaded/dead components collectable. */
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

// Auth screens
import { SignInScreen } from '../screens/auth/SignInScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { ContactScreen } from '../screens/auth/ContactScreen';
import { OnboardingScreen } from '../screens/auth/OnboardingScreen';
import { PermissionsOnboardingScreen } from '../screens/auth/PermissionsOnboardingScreen';

// Main stack screens
import { SettingsScreen } from '../screens/SettingsScreen';
import { BlockedUsersScreen } from '../screens/BlockedUsersScreen';
import { BluetoothDevicesScreen } from '../screens/BluetoothDevicesScreen';
import { HelpScreen } from '../screens/HelpScreen';
import { TrainingHomeScreen } from '../screens/TrainingHomeScreen';
import { TrainingModuleScreen } from '../screens/TrainingModuleScreen';
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
import { AdminReportsScreen } from '../screens/AdminReportsScreen';
import { AdminPostsScreen } from '../screens/AdminPostsScreen';
import { WeightTrackerScreen } from '../screens/WeightTrackerScreen';
import { OrderHistoryScreen } from '../screens/OrderHistoryScreen';
import { MacroTrackerScreen } from '../screens/MacroTrackerScreen';
import { MacroSetupScreen } from '../screens/MacroSetupScreen';
import { BarcodeScannerScreen } from '../screens/BarcodeScannerScreen';
import { PhotoFoodScreen } from '../screens/PhotoFoodScreen';
import { DexaScansScreen } from '../screens/DexaScansScreen';
import { DexaUploadScreen } from '../screens/DexaUploadScreen';
import { DexaScanDetailScreen } from '../screens/DexaScanDetailScreen';
import { BloodworkScreen } from '../screens/BloodworkScreen';
import { BloodworkUploadScreen } from '../screens/BloodworkUploadScreen';
import { BloodworkReportDetailScreen } from '../screens/BloodworkReportDetailScreen';
import { WorkoutSessionScreen } from '../screens/WorkoutSessionScreen';
import { SessionHistoryScreen } from '../screens/SessionHistoryScreen';
import { ActivityTrackerScreen } from '../screens/ActivityTrackerScreen';
import { BodyLabScreen } from '../screens/BodyLabScreen';
import { ProductDetailScreen } from '../screens/ProductDetailScreen';
import { CreatePostScreen } from '../screens/CreatePostScreen';
import { CommentsScreen } from '../screens/CommentsScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { FollowRequestsScreen } from '../screens/FollowRequestsScreen';
import { AchievementsScreen } from '../screens/AchievementsScreen';
import { AchievementDetailScreen } from '../screens/AchievementDetailScreen';
import { ContactSupportScreen } from '../screens/ContactSupportScreen';
import { MessagesListScreen } from '../screens/MessagesListScreen';
import { MessagesChatScreen } from '../screens/MessagesChatScreen';
import { UserSearchScreen } from '../screens/UserSearchScreen';
import { CycleTrackerScreen } from '../screens/CycleTrackerScreen';
import { MedicationTrackerScreen } from '../screens/MedicationTrackerScreen';
import { SenpaiMemoryScreen } from '../screens/SenpaiMemoryScreen';

const Stack = createStackNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────────
// TRANSITION: Crossfade
// Used for auth → main and main → auth
// Clean opacity swap, no directional movement
// ─────────────────────────────────────────────────
// Linear-in-opacity [0,1]→[0,1] — no dark hold through the first half (the
// old [0,.5,1]→[0,.3,1] map read as perceived dead time).
const crossfadeInterpolator = ({ current }: StackCardInterpolationProps) => ({
  cardStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  },
});

const crossfadeTransition = {
  cardStyleInterpolator: crossfadeInterpolator,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.emphasized },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.accelerate },
    },
  },
};

// ─────────────────────────────────────────────────
// TRANSITION: Fade fallback (Reduce Motion)
// A short opacity-only swap used in place of push/modal/crossfade when the
// user has Reduce Motion enabled — no slide, no scale, no spring.
// ─────────────────────────────────────────────────
const fadeInterpolator = ({ current }: StackCardInterpolationProps) => ({
  cardStyle: { opacity: current.progress },
});

const fadeTransition = {
  cardStyleInterpolator: fadeInterpolator,
  transitionSpec: {
    open: {
      animation: 'timing' as const,
      config: { duration: duration.fast, easing: easing.decelerate },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.fast, easing: easing.accelerate },
    },
  },
};

// ─────────────────────────────────────────────────
// TRANSITION: Push (slide right + fade + scale)
// Used for detail screens and auth sub-screens
// The entering screen slides in from right with slight scale-up
// The leaving screen fades/scales down slightly behind it
// ─────────────────────────────────────────────────
// Use React Navigation's built-in iOS horizontal interpolator. It's
// battle-tested, GPU-accelerated where possible, and handles edge cases
// like the back-gesture cancel correctly.
// Open drives into a spring (spring.settle character) so an interactive
// back-gesture release hands off into the same physics instead of a floaty
// timing curve. Close stays timing/accelerate — exits read best as fades.
const pushTransition = {
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  transitionSpec: {
    open: {
      animation: 'spring' as const,
      config: { ...spring.settle },
    },
    close: {
      animation: 'timing' as const,
      config: { duration: duration.standard, easing: easing.accelerate },
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
  const { user, isGuest, isLoading, needsOnboarding } = useAuth();
  const { reduceMotion } = useMotion();

  // Audit 2.0.5 P2: a signed-in user who started onboarding but never
  // finished it (first-time OAuth force-quit) resumes Onboarding instead of
  // landing in Main with EULA/waiver/permissions bypassed. needsOnboarding
  // is only ever true on positive proof recorded at OAuth first sign-in —
  // every existing user resolves to Main with zero network round-trips (see
  // the PENDING_ONBOARDING_KEY decision table in AuthContext).
  const resumeOnboarding = !!user && needsOnboarding;

  // Reduce Motion → every transition collapses to a short opacity fade (no
  // slide, scale, or spring). Otherwise use the designed push/modal/crossfade.
  const push = reduceMotion ? fadeTransition : pushTransition;
  const modal = reduceMotion ? fadeTransition : modalTransition;
  const crossfade = reduceMotion ? fadeTransition : crossfadeTransition;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.gold} size="small" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName={user ? (resumeOnboarding ? 'Onboarding' : 'Main') : isGuest ? 'Main' : 'SignIn'}
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
        options={{ ...crossfade, gestureEnabled: false }}
      />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={push} />
      <Stack.Screen name="Contact" component={ContactScreen} options={push} />
      {/* Resume case only: the abandoned onboarding was OAuth-initiated, so
          the resumed screen skips the email/password step exactly like the
          live OAuth entry (SignInScreen passes { oauth: true } explicitly). */}
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        initialParams={resumeOnboarding ? { oauth: true } : undefined}
        options={{ ...crossfade, gestureEnabled: false }}
      />
      <Stack.Screen name="PermissionsOnboarding" component={PermissionsOnboardingScreen} options={{ ...crossfade, gestureEnabled: false }} />

      {/* Main tabs — crossfade from auth */}
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ ...crossfade, gestureEnabled: false }}
      />

      {/* Modals — slide up */}
      <Stack.Screen name="Settings" component={withErrorBoundary(SettingsScreen, 'Settings')} options={modal} />
      <Stack.Screen name="BlockedUsers" component={withErrorBoundary(BlockedUsersScreen, 'Blocked Users')} options={push} />
      <Stack.Screen name="FollowRequests" component={withErrorBoundary(FollowRequestsScreen, 'Follow Requests')} options={push} />
      <Stack.Screen name="BluetoothDevices" component={withErrorBoundary(BluetoothDevicesScreen, 'Bluetooth Devices')} options={push} />
      <Stack.Screen name="Help" component={withErrorBoundary(HelpScreen, 'Help')} options={push} />
      <Stack.Screen name="TrainingHome" component={withErrorBoundary(TrainingHomeScreen, 'Training')} options={push} />
      <Stack.Screen name="TrainingModule" component={withErrorBoundary(TrainingModuleScreen, 'Training Module')} options={push} />
      <Stack.Screen name="Admin" component={withErrorBoundary(AdminScreen, 'Admin')} options={modal} />

      {/* Admin sub-screens — push */}
      <Stack.Screen name="AdminMembers" component={withErrorBoundary(AdminMembersScreen, 'Admin Members')} options={push} />
      <Stack.Screen name="AdminProducts" component={withErrorBoundary(AdminProductsScreen, 'Admin Products')} options={push} />
      <Stack.Screen name="AdminSchedule" component={withErrorBoundary(AdminScheduleScreen, 'Admin Schedule')} options={push} />
      <Stack.Screen name="AttendanceHistory" component={withErrorBoundary(AttendanceHistoryScreen, 'Attendance')} options={push} />
      <Stack.Screen name="AdminBroadcast" component={withErrorBoundary(AdminBroadcastScreen, 'Broadcast')} options={push} />
      <Stack.Screen name="AdminAnnouncements" component={withErrorBoundary(AdminAnnouncementsScreen, 'Announcements')} options={push} />
      <Stack.Screen name="AdminAppointments" component={withErrorBoundary(AdminAppointmentsScreen, 'Appointments')} options={push} />
      <Stack.Screen name="Workout" component={withErrorBoundary(WorkoutScreen, 'Workout')} options={push} />
      <Stack.Screen name="Timer" component={withErrorBoundary(TimerScreen, 'Timer')} options={push} />
      <Stack.Screen name="PRDetail" component={withErrorBoundary(PRDetailScreen, 'PR Detail')} options={push} />
      <Stack.Screen name="EmployeeChecklist" component={withErrorBoundary(EmployeeChecklistScreen, 'Checklist')} options={push} />
      <Stack.Screen name="AdminEmployeeTasks" component={withErrorBoundary(AdminEmployeeTasksScreen, 'Employee Tasks')} options={push} />
      <Stack.Screen name="AdminReports" component={withErrorBoundary(AdminReportsScreen, 'Reports')} options={push} />
      <Stack.Screen name="AdminPosts" component={withErrorBoundary(AdminPostsScreen, 'Community Posts')} options={push} />
      <Stack.Screen name="WeightTracker" component={withErrorBoundary(WeightTrackerScreen, 'Weight Tracker')} options={push} />
      <Stack.Screen name="OrderHistory" component={withErrorBoundary(OrderHistoryScreen, 'My Orders')} options={push} />
      <Stack.Screen name="MacroTracker" component={withErrorBoundary(MacroTrackerScreen, 'Macro Tracker')} options={push} />
      <Stack.Screen name="MacroSetup" component={withErrorBoundary(MacroSetupScreen, 'Macro Setup')} options={modal} />
      <Stack.Screen name="BarcodeScanner" component={withErrorBoundary(BarcodeScannerScreen, 'Barcode Scanner')} options={modal} />
      <Stack.Screen name="PhotoFood" component={withErrorBoundary(PhotoFoodScreen, 'Photo Food')} options={modal} />
      <Stack.Screen name="DexaScans" component={withErrorBoundary(DexaScansScreen, 'DEXA Scans')} options={push} />
      <Stack.Screen name="DexaUpload" component={withErrorBoundary(DexaUploadScreen, 'DEXA Upload')} options={modal} />
      <Stack.Screen name="DexaScanDetail" component={withErrorBoundary(DexaScanDetailScreen, 'DEXA Detail')} options={push} />
      <Stack.Screen name="Bloodwork" component={withErrorBoundary(BloodworkScreen, 'Bloodwork')} options={push} />
      <Stack.Screen name="BloodworkUpload" component={withErrorBoundary(BloodworkUploadScreen, 'Bloodwork Upload')} options={modal} />
      <Stack.Screen name="BloodworkReportDetail" component={withErrorBoundary(BloodworkReportDetailScreen, 'Bloodwork Detail')} options={push} />
      <Stack.Screen name="WorkoutSession" component={withErrorBoundary(WorkoutSessionScreen, 'Start Workout')} options={modal} />
      <Stack.Screen name="SessionHistory" component={withErrorBoundary(SessionHistoryScreen, 'Session History')} options={push} />
      <Stack.Screen name="ActivityTracker" component={withErrorBoundary(ActivityTrackerScreen, 'GPS Tracker')} options={modal} />
      <Stack.Screen name="BodyLab" component={withErrorBoundary(BodyLabScreen, 'Body Lab')} options={push} />

      {/* Community */}
      <Stack.Screen name="CreatePost" component={withErrorBoundary(CreatePostScreen, 'Create Post')} options={modal} />
      <Stack.Screen name="Comments" component={withErrorBoundary(CommentsScreen, 'Comments')} options={push} />
      <Stack.Screen name="UserProfile" component={withErrorBoundary(UserProfileScreen, 'User Profile')} options={push} />

      {/* Detail — push */}
      <Stack.Screen name="ProductDetail" component={withErrorBoundary(ProductDetailScreen, 'Product Detail')} options={push} />
      <Stack.Screen name="Achievements" component={withErrorBoundary(AchievementsScreen, 'Achievements')} options={push} />
      <Stack.Screen name="AchievementDetail" component={withErrorBoundary(AchievementDetailScreen, 'Achievement Detail')} options={push} />
      <Stack.Screen name="ContactSupport" component={withErrorBoundary(ContactSupportScreen, 'Contact Support')} options={push} />
      <Stack.Screen name="MessagesList" component={withErrorBoundary(MessagesListScreen, 'Messages')} options={push} />
      <Stack.Screen name="MessagesChat" component={withErrorBoundary(MessagesChatScreen, 'Chat')} options={push} />
      <Stack.Screen name="UserSearch" component={withErrorBoundary(UserSearchScreen, 'Search')} options={push} />
      <Stack.Screen name="CycleTracker" component={withErrorBoundary(CycleTrackerScreen, 'Cycle Tracker')} options={push} />
      <Stack.Screen name="MedicationTracker" component={withErrorBoundary(MedicationTrackerScreen, 'Medication Tracker')} options={push} />
      <Stack.Screen name="SenpaiMemory" component={withErrorBoundary(SenpaiMemoryScreen, 'Senpai Memory')} options={push} />
    </Stack.Navigator>
  );
}
