import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Platform,
  Animated,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius, shadows } from '../theme';
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock, StreakBadge, PointsBadge, XPProgressBar, AchievementGrid, CelebrationModal } from '../components';
import { ReorderableSections, ReorderableItem } from '../components/ReorderableSections';
import { Skeleton } from '../components/Skeleton';
import { SpinWheelModal } from '../components/SpinWheelModal';
import { SpinWheelIcon } from '../components/SpinWheelIcon';
import { CoachmarkTutorial, CoachmarkStep, shouldShowCoachmarks } from '../components/CoachmarkTutorial';
import { NotificationsModal } from '../components/NotificationsModal';
import { useSpinWheel } from '../context/SpinWheelContext';
import { useGamification } from '../context/GamificationContext';
import { useAnnouncements } from '../context/AnnouncementContext';
import { useAppointments } from '../context/AppointmentContext';
import { useWorkouts } from '../context/WorkoutContext';
import { useHeartRate } from '../context/HeartRateContext';
import { useGpsActivity } from '../context/GpsActivityContext';
import { useNutrition } from '../context/NutritionContext';
import { useEmployeeTasks } from '../context/EmployeeTaskContext';
import { useScreenSoundTheme, useSound } from '../context/SoundContext';
import { getDailyQuote } from '../data/quotes';
import { getTodaysSchedule } from '../data/schedule';
import { useHasUnreadNotifications } from './NotificationsScreen';
import { formatCount } from '../utils/formatCount';
import { formatDistance, distanceUnit, formatDurationHuman } from '../utils/gps';
import { useCycleTracker } from '../context/CycleTrackerContext';
import { useSenpai } from '../context/SenpaiContext';
import { randomDialogue } from '../data/senpaiDialogue';
import { PHASE_LABELS, PHASE_COLORS, PHASE_ICONS } from '../types/cycle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function sessionTypeToClassType(s: string): 'jiu-jitsu' | 'muay-thai' | 'pilates' | 'open-mat' {
  const lc = s.toLowerCase();
  if (lc.includes('jiu') || lc.includes('bjj')) return 'jiu-jitsu';
  if (lc.includes('muay') || lc.includes('thai') || lc.includes('kickbox')) return 'muay-thai';
  if (lc.includes('pilates') || lc.includes('mobility')) return 'pilates';
  return 'open-mat';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** Parse "12:00 PM" → minutes since midnight, used to sort. */
function parseTimeSort(label: string): number {
  const m = label.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 24 * 60 + 1; // "By Appointment" etc — push to end
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const mer = m[3].toUpperCase();
  if (mer === 'PM' && h !== 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

/**
 * Employee-only card on Home showing today's checklist progress.
 * Tap to open full EmployeeChecklist screen.
 */
function EmployeeChecklistCard({ navigation, memberId }: { navigation: any; memberId: string }) {
  const { colors } = useTheme();
  const { todayTasksFor } = useEmployeeTasks();
  const tasks = todayTasksFor(memberId);
  const done = tasks.filter((t) => t.completedToday).length;
  const total = tasks.length;
  const progressPct = total > 0 ? (done / total) * 100 : 0;

  return (
    <FadeInView delay={160} slideUp={16}>
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Checklist</Text>
          <TouchableOpacity
            style={[styles.seeAllButton, { backgroundColor: colors.accentTint }]}
            onPress={() => navigation.navigate('EmployeeChecklist')}
          >
            <Text style={[styles.seeAllText, { color: colors.gold }]}>Open</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.gold} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('EmployeeChecklist')}
          activeOpacity={0.85}
          style={[
            {
              padding: 18,
              borderRadius: 18,
              borderWidth: 1.5,
              gap: 10,
              marginHorizontal: spacing.lg,
              backgroundColor: colors.surface,
              borderColor: done === total && total > 0 ? colors.success : colors.border,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons
                name={total > 0 && done === total ? 'checkmark-circle' : 'list-outline'}
                size={22}
                color={total > 0 && done === total ? colors.success : colors.gold}
              />
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>
                {total === 0 ? 'No tasks today' : `${done}/${total} complete`}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </View>
          {total > 0 && (
            <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.backgroundElevated, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${progressPct}%`, backgroundColor: colors.gold, borderRadius: 3 }} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </FadeInView>
  );
}

export function HomeScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isEmployee = user?.isEmployee === true;
  const { state: gamState, levelInfo, dismissCelebration, recordAppOpen } = useGamification();
  const { state: senpaiState, triggerReaction: senpaiReact, shouldReact: senpaiShouldReact } = useSenpai();
  React.useEffect(() => { recordAppOpen(); }, [recordAppOpen]);
  React.useEffect(() => {
    if (!senpaiState.enabled) return;
    if (!senpaiShouldReact()) return;
    const hour = new Date().getHours();
    const key = hour < 12 ? 'morning' : hour >= 18 ? 'evening' : 'appOpen';
    const t = setTimeout(() => senpaiReact('encouraging', randomDialogue(key), 4000), 1500);
    return () => clearTimeout(t);
  }, [senpaiState.enabled]);
  const { announcements } = useAnnouncements();

  // ── Per-user dismissed-announcements list ──
  // Admins push announcements; users can individually close any card via
  // the X in its corner. Dismiss flag is stored locally in AsyncStorage
  // keyed by uid so multiple users on one device don't share state.
  const dismissedKey = user?.id ? `@zenki_dismissed_announcements_${user.id}` : null;
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!dismissedKey) return;
    AsyncStorage.getItem(dismissedKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setDismissedIds(parsed);
        } catch { /* ignore */ }
      })
      .catch(() => { /* ignore */ });
  }, [dismissedKey]);
  const dismissAnnouncement = useCallback((id: string) => {
    setDismissedIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      if (dismissedKey) AsyncStorage.setItem(dismissedKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [dismissedKey]);
  const visibleAnnouncements = announcements.filter((a) => !dismissedIds.includes(a.id));
  const { myAppointments } = useAppointments();
  const { myLogs, myPRs } = useWorkouts();
  const userLogsCount = user?.id ? myLogs(user.id).length : 0;
  const userPRsCount = user?.id ? myPRs(user.id).length : 0;
  const dailyQuote = getDailyQuote();
  const hasUnreadNotifications = useHasUnreadNotifications();

  useScreenSoundTheme('home');
  const { play } = useSound();
  const { hasSpunToday } = useSpinWheel();
  const [spinOpen, setSpinOpen] = React.useState(false);
  const [notifOpen, setNotifOpen] = React.useState(false);

  // ── Coachmark tutorial: refs + measurements ──
  const editPillRef = useRef<View>(null);
  const trainingRef = useRef<View>(null);
  const foodActionsRef = useRef<View>(null);
  const spinFabRef = useRef<View>(null);
  const [coachRects, setCoachRects] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [coachmarksOpen, setCoachmarksOpen] = useState(false);

  const measureCoachTarget = useCallback((name: string, ref: React.RefObject<View>) => () => {
    // Delay so layout has settled before we pull screen-space coords
    setTimeout(() => {
      ref.current?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
        // Ignore bogus (0,0,0,0) measurements that occur during unmount / off-screen
        if (width > 0 && height > 0) {
          setCoachRects((r) => ({ ...r, [name]: { x, y, width, height } }));
        }
      });
    }, 60);
  }, []);

  // First-ever Home visit (fresh signup completes Onboarding → lands here) →
  // show the tutorial. Flag stored in AsyncStorage so it never re-triggers
  // unless the user resets from Settings → Secret Lab or Profile → Help →
  // Replay tutorial. Re-checks on focus so those replay paths work
  // immediately.
  React.useEffect(() => {
    if (isEmployee) return;
    const check = () => {
      shouldShowCoachmarks().then((show) => {
        if (show) setCoachmarksOpen(true);
      });
    };
    check();
    const unsub = navigation?.addListener?.('focus', check);
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [isEmployee, navigation]);

  // Spin wheel is now opened manually via the icon in the header
  // (previously auto-opened on first visit of the day)

  // User's confirmed/pending private bookings for today
  const todaysBookings = myAppointments
    .filter((a) => a.memberId === user?.id && a.status !== 'cancelled' && a.status !== 'completed')
    .filter((a) => isToday(a.startsAt))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  // Today's full studio schedule (group classes)
  const studioClasses = getTodaysSchedule();

  // Merged view: studio classes + user's private sessions, sorted by time
  const todaysFullSchedule = [
    ...studioClasses.map((cls) => ({
      key: `class-${cls.name}-${cls.time}`,
      name: cls.name,
      instructor: cls.instructor,
      time: cls.time,
      duration: cls.duration,
      spotsLeft: cls.spotsLeft,
      type: cls.type,
      sortKey: parseTimeSort(cls.time),
      booked: false as const,
      status: undefined as undefined,
    })),
    ...todaysBookings.map((a) => ({
      key: `booking-${a.id}`,
      name: a.sessionType,
      instructor: a.instructor,
      time: formatTime(a.startsAt),
      duration: `${a.durationMinutes} min`,
      spotsLeft: 0,
      type: sessionTypeToClassType(a.sessionType),
      sortKey: new Date(a.startsAt).getHours() * 60 + new Date(a.startsAt).getMinutes(),
      booked: true as const,
      status: a.status,
    })),
  ].sort((x, y) => x.sortKey - y.sortKey);

  // ── Today's Dashboard Metrics ──
  const todayISO = new Date().toISOString().slice(0, 10);
  const { totalsForDate, latestWeight, myWeights } = useNutrition();
  const { sessions: hrSessions } = useHeartRate();
  const { memberActivities } = useGpsActivity();

  const todayNutrition = user?.id ? totalsForDate(user.id, todayISO) : { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const goalsCtx = useNutrition();
  const todayGoals = user?.id ? goalsCtx.goalsFor(user.id) : { calories: 2200, protein: 160, carbs: 220, fat: 70 };

  const todayStats = useMemo(() => {
    if (!user?.id) return { workouts: 0, caloriesBurned: 0, macrosPct: 0, activeMinutes: 0 };

    // Workouts today
    const todayLogs = myLogs(user.id).filter((l: any) => l.date?.startsWith(todayISO));
    const workoutsToday = todayLogs.length;

    // HR sessions today calories
    const todayHRCals = (hrSessions || [])
      .filter((s: any) => s.memberId === user.id && s.date?.startsWith(todayISO))
      .reduce((sum: number, s: any) => sum + (s.calories || 0), 0);

    // GPS activities today calories
    const todayGPS = memberActivities(user.id)
      .filter((a) => a.startedAt?.startsWith(todayISO));
    const todayGPSCals = todayGPS.reduce((sum, a) => sum + (a.calories || 0), 0);

    // Total active minutes (HR sessions + GPS + workout logs)
    const hrMinutes = (hrSessions || [])
      .filter((s: any) => s.memberId === user.id && s.date?.startsWith(todayISO))
      .reduce((sum: number, s: any) => sum + (s.durationSeconds || 0) / 60, 0);
    const gpsMinutes = todayGPS.reduce((sum, a) => sum + a.durationSeconds / 60, 0);
    const logMinutes = todayLogs.reduce((sum: number, l: any) => sum + (l.durationMinutes || 0), 0);
    const activeMinutes = Math.round(hrMinutes + gpsMinutes + logMinutes);

    // Macros percentage
    const macrosPct = todayGoals.calories > 0
      ? Math.min(100, Math.round((todayNutrition.calories / todayGoals.calories) * 100))
      : 0;

    const caloriesBurned = todayHRCals + todayGPSCals;

    return { workouts: workoutsToday, caloriesBurned, macrosPct, activeMinutes };
  }, [user?.id, todayISO, hrSessions, todayNutrition, todayGoals]);

  // ── Next Class Countdown ──
  const nextClass = useMemo(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    for (const cls of todaysFullSchedule) {
      if (cls.sortKey > currentMinutes) return cls;
    }
    return null;
  }, [todaysFullSchedule]);

  const [countdown, setCountdown] = React.useState('');
  React.useEffect(() => {
    if (!nextClass) return;
    const update = () => {
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const diff = nextClass.sortKey - nowMin;
      if (diff <= 0) { setCountdown('NOW'); return; }
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      setCountdown(h > 0 ? `IN ${h}H ${m}M` : `IN ${m}M`);
    };
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [nextClass]);

  // ── Quick Stats ──
  const quickStats = useMemo(() => {
    if (!user?.id) return [];
    const stats: { label: string; value: string; sub: string; icon: string }[] = [];

    // 1. Latest weight + 7-day trend
    const weights = myWeights(user.id);
    if (weights.length > 0) {
      const latest = weights[0];
      const weekAgo = weights.find((w: any) => {
        const d = new Date(w.date);
        const diff = (Date.now() - d.getTime()) / 86400000;
        return diff >= 6 && diff <= 8;
      });
      const arrow = weekAgo
        ? latest.weight > weekAgo.weight ? '↑' : latest.weight < weekAgo.weight ? '↓' : '→'
        : '→';
      stats.push({
        label: 'Weight',
        value: `${latest.weight} ${latest.unit}`,
        sub: `7d trend ${arrow}`,
        icon: 'scale-outline',
      });
    }

    // 2. Latest PR
    const prs = user.id ? myPRs(user.id) : [];
    if (prs.length > 0) {
      const latest = prs[prs.length - 1] as any;
      stats.push({
        label: 'Latest PR',
        value: `${latest.value || '--'}`,
        sub: latest.exerciseName || 'Exercise',
        icon: 'trophy-outline',
      });
    }

    // 4. Last GPS activity
    const gpsActs = memberActivities(user.id);
    if (gpsActs.length > 0) {
      const last = gpsActs[0];
      stats.push({
        label: 'Last Activity',
        value: formatDistance(last.distanceMeters),
        sub: `${formatDurationHuman(last.durationSeconds)} ${last.type}`,
        icon: 'navigate-outline',
      });
    }

    // 5. Weekly strain average
    const weekHR = (hrSessions || []).filter((s: any) => {
      if (s.memberId !== user.id) return false;
      const d = new Date(s.date);
      return (Date.now() - d.getTime()) / 86400000 <= 7;
    });
    if (weekHR.length > 0) {
      const avgStrain = weekHR.reduce((sum: number, s: any) => sum + (s.strain || 0), 0) / weekHR.length;
      stats.push({
        label: 'Avg Strain',
        value: avgStrain.toFixed(1),
        sub: `${weekHR.length} session${weekHR.length !== 1 ? 's' : ''} this week`,
        icon: 'pulse-outline',
      });
    }

    return stats;
  }, [user?.id, gamState.streak, hrSessions]);

  // ── Cycle Phase (female users only) ──
  const { memberCycleInfo, settings: cycleSettings } = useCycleTracker();
  const isFemale = user?.biologicalSex === 'female';
  const cycleInfo = isFemale && user?.id ? memberCycleInfo(user.id) : null;
  const showCyclePhase = isFemale && cycleInfo && cycleSettings.showOnDashboard;

  // ── Pull-to-Refresh ──
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => setRefreshing(false), 800);
  }, []);

  // ── Module reorder (drag to rearrange) + show/hide ──
  const DEFAULT_MODULE_ORDER = ['announcements', 'training', 'quickFoodActions', 'dashboard', 'quickStats', 'schedule', 'quote', 'xpBar', 'achievements'];
  const [moduleOrder, setModuleOrder] = useState<string[]>(DEFAULT_MODULE_ORDER);
  const [moduleVisibility, setModuleVisibility] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState(false);
  const orderStorageKey = user?.id ? `@zenki_home_order_${user.id}` : null;
  const visibilityStorageKey = user?.id ? `@zenki_home_visibility_${user.id}` : null;

  useEffect(() => {
    if (!orderStorageKey) return;
    AsyncStorage.getItem(orderStorageKey).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved)) return;
        const merged = [
          ...saved.filter((id: string) => DEFAULT_MODULE_ORDER.includes(id)),
          ...DEFAULT_MODULE_ORDER.filter((id) => !saved.includes(id)),
        ];
        setModuleOrder(merged);
      } catch { /* ignore */ }
    });
  }, [orderStorageKey]);

  useEffect(() => {
    if (!visibilityStorageKey) return;
    AsyncStorage.getItem(visibilityStorageKey).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') setModuleVisibility(saved);
      } catch { /* ignore */ }
    });
  }, [visibilityStorageKey]);

  const handleReorder = useCallback((next: string[]) => {
    setModuleOrder(next);
    if (orderStorageKey) AsyncStorage.setItem(orderStorageKey, JSON.stringify(next));
  }, [orderStorageKey]);

  const toggleVisibility = useCallback((id: string) => {
    setModuleVisibility((prev) => {
      const next = { ...prev, [id]: prev[id] === false };
      if (visibilityStorageKey) AsyncStorage.setItem(visibilityStorageKey, JSON.stringify(next));
      return next;
    });
  }, [visibilityStorageKey]);

  const isModuleVisible = useCallback((id: string) => moduleVisibility[id] !== false, [moduleVisibility]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
        }
      >

        {/* ─── Header (compact with corner logo) ─── */}
        <FadeInView delay={0} slideUp={0}>
          <View style={styles.header}>
            <AnimatedLogo size={56} />
            <View style={styles.headerRight}>
              {!isEmployee && (
                <PointsBadge
                  points={gamState.dojoPoints || 0}
                  compact
                  onPress={() => navigation.navigate('Store')}
                />
              )}
              {!isEmployee && (
                <View style={[styles.flamesChip, { backgroundColor: colors.surface }]}>
                  <Ionicons name="flame" size={16} color={colors.flames} />
                  <Text style={[styles.flamesChipText, { color: colors.textPrimary }]}>
                    {formatCount(gamState.flames || 0)}
                  </Text>
                </View>
              )}
              {!isEmployee && <StreakBadge streak={gamState.streak} compact />}
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.surface }]}
                onPress={() => { play('navigate'); setNotifOpen(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
                {hasUnreadNotifications && (
                  <View style={[styles.notifDot, { backgroundColor: colors.red }]} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </FadeInView>

        {/* ─── Welcome row (name + Edit pill) ─── */}
        <FadeInView delay={40} slideUp={12}>
          <View style={[styles.welcomeSection, { paddingBottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
            <Text style={[styles.welcomeLine, { flex: 1 }]} numberOfLines={1}>
              <Text style={[styles.welcomeLabel, { color: colors.textTertiary }]}>Welcome back, </Text>
              <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>
                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member'}
              </Text>
            </Text>
            {!isEmployee && !editMode && (
              <View ref={editPillRef} onLayout={measureCoachTarget('edit', editPillRef)}>
                <TouchableOpacity
                  onPress={() => setEditMode(true)}
                  activeOpacity={0.8}
                  style={[styles.editPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <Ionicons name="create-outline" size={11} color={colors.textSecondary} />
                  <Text style={[styles.editPillText, { color: colors.textSecondary }]}>Edit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </FadeInView>

        {/* ─── Employee Clock ─── */}
        {isEmployee && (
          <FadeInView delay={120} slideUp={16}>
            <View style={styles.section}><TimeClock /></View>
          </FadeInView>
        )}

        {/* ─── Employee Checklist (employee-only) ─── */}
        {isEmployee && <EmployeeChecklistCard navigation={navigation} memberId={user?.id ?? ''} />}

        {/* ─── Member Content ─── */}
        {!isEmployee && (
          <>
            {/* ── Cycle Phase Pill (female users only) ── */}
            {showCyclePhase && cycleInfo && (
              <FadeInView delay={180} slideUp={10}>
                <TouchableOpacity
                  style={[styles.cyclePill, { backgroundColor: PHASE_COLORS[cycleInfo.currentPhase] + '18', borderColor: PHASE_COLORS[cycleInfo.currentPhase] + '40' }]}
                  onPress={() => navigation.navigate('CycleTracker')}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 14 }}>{PHASE_ICONS[cycleInfo.currentPhase]}</Text>
                  <Text style={[styles.cyclePillText, { color: PHASE_COLORS[cycleInfo.currentPhase] }]}>
                    {PHASE_LABELS[cycleInfo.currentPhase]} · Day {cycleInfo.cycleDay}
                  </Text>
                  {cycleInfo.daysUntilNextPeriod <= 5 && !cycleInfo.isOnPeriod && (
                    <Text style={[styles.cyclePillAlert, { color: PHASE_COLORS.menstrual }]}>
                      {cycleInfo.daysUntilNextPeriod}d
                    </Text>
                  )}
                  <Ionicons name="chevron-forward" size={14} color={PHASE_COLORS[cycleInfo.currentPhase]} />
                </TouchableOpacity>
              </FadeInView>
            )}

            {/* ── Edit-mode bar: shown while reordering ── */}
            {editMode && (
              <View style={[styles.editBar, { backgroundColor: colors.surface, borderColor: colors.gold + '40' }]}>
                <Ionicons name="move-outline" size={16} color={colors.gold} />
                <Text style={[styles.editHint, { color: colors.textSecondary }]}>
                  Drag to rearrange · tap − to hide
                </Text>
                <TouchableOpacity
                  style={[styles.doneBtn, { backgroundColor: colors.gold }]}
                  onPress={() => setEditMode(false)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.doneBtnText, { color: '#000' }]}>DONE</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Reorderable sections ── */}
            {(() => {
              const sectionsById: Record<string, React.ReactElement | null> = {
                announcements: visibleAnnouncements.length > 0 ? (
                  <FadeInView delay={80} slideUp={12}>
                    <View style={[styles.announcementsWrap, { marginTop: 4 }]}>
                      {visibleAnnouncements.slice(0, 3).map((a) => (
                        <View key={a.id} style={[styles.announcementCard, { backgroundColor: colors.goldMuted }]}>
                          <View style={[styles.announcementIcon, { backgroundColor: colors.gold + '20' }]}>
                            <Ionicons name="megaphone-outline" size={20} color={colors.gold} />
                          </View>
                          <View style={styles.announcementContent}>
                            <Text style={[styles.announcementTitle, { color: colors.textPrimary }]} numberOfLines={2}>{a.title}</Text>
                            {a.description ? (
                              <Text style={[styles.announcementDesc, { color: colors.textSecondary }]} numberOfLines={2}>{a.description}</Text>
                            ) : null}
                          </View>
                          <TouchableOpacity
                            onPress={() => !editMode && dismissAnnouncement(a.id)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={styles.announcementDismiss}
                            accessibilityLabel="Dismiss announcement"
                          >
                            <Ionicons name="close" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </FadeInView>
                ) : null,
                xpBar: (
                  <FadeInView delay={100} slideUp={16}>
                    <View style={{ paddingHorizontal: 24, marginTop: 4 }}>
                      <View style={[styles.compactXpRow, { backgroundColor: colors.surface, marginBottom: 0 }]}>
                        <View style={[styles.compactLevelCircle, { backgroundColor: colors.gold }]}>
                          <Text style={styles.compactLevelText}>{levelInfo.level}</Text>
                        </View>
                        <View style={styles.compactXpBody}>
                          <View style={styles.compactXpLabels}>
                            <Text style={[styles.compactXpText, { color: colors.textSecondary }]}>
                              Level {levelInfo.level}
                            </Text>
                            <Text style={[styles.compactXpText, { color: colors.gold }]}>
                              {levelInfo.currentXP} / {levelInfo.nextLevelXP} XP
                            </Text>
                          </View>
                          <View style={[styles.compactXpBarBg, { backgroundColor: colors.backgroundElevated }]}>
                            <View style={[styles.compactXpBarFill, {
                              backgroundColor: colors.gold,
                              width: `${Math.max(4, levelInfo.progress * 100)}%`,
                            }]} />
                          </View>
                        </View>
                      </View>
                    </View>
                  </FadeInView>
                ),
                quickFoodActions: (
                  <FadeInView delay={110} slideUp={16}>
                    <View
                      ref={foodActionsRef}
                      onLayout={measureCoachTarget('foodActions', foodActionsRef)}
                      style={{ paddingHorizontal: 20, marginTop: 6, flexDirection: 'row', gap: 10 }}
                    >
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => !editMode && navigation.navigate('MacroTracker', { openSearch: true })}
                        style={[styles.quickFoodBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Ionicons name="search" size={22} color={colors.gold} />
                        <Text style={[styles.quickFoodLabel, { color: colors.textPrimary }]}>Search</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => !editMode && navigation.navigate('BarcodeScanner')}
                        style={[styles.quickFoodBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Ionicons name="barcode-outline" size={22} color={colors.gold} />
                        <Text style={[styles.quickFoodLabel, { color: colors.textPrimary }]}>Scan</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => !editMode && navigation.navigate('PhotoFood')}
                        style={[styles.quickFoodBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      >
                        <Ionicons name="sparkles-outline" size={22} color={colors.gold} />
                        <Text style={[styles.quickFoodLabel, { color: colors.textPrimary }]}>Photo</Text>
                      </TouchableOpacity>
                    </View>
                  </FadeInView>
                ),
                achievements: (
                  <FadeInView delay={120} slideUp={16}>
                    <View style={{ paddingHorizontal: 24, marginTop: 6 }}>
                      {(() => {
                        const unlocked = gamState.achievements.filter((a: any) => a.unlocked);
                        const recent = unlocked.slice(-4);
                        return (
                          <TouchableOpacity
                            style={[styles.homePill, { backgroundColor: colors.surface, borderColor: colors.border, marginBottom: 0 }]}
                            onPress={() => !editMode && navigation.navigate('Achievements')}
                            activeOpacity={0.8}
                          >
                            <View style={[styles.homePillIcon, { backgroundColor: colors.goldMuted }]}>
                              <Ionicons name="trophy" size={16} color={colors.gold} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.homePillTitle, { color: colors.textPrimary }]}>Achievements</Text>
                              <Text style={[styles.homePillSub, { color: colors.textMuted }]}>
                                {unlocked.length}/{gamState.achievements.length} unlocked · {gamState.flames || 0} 🔥
                              </Text>
                            </View>
                            <View style={styles.recentBadges}>
                              {recent.map((a: any) => (
                                <View key={a.id} style={[styles.miniBadge, { backgroundColor: colors.goldMuted }]}>
                                  <Ionicons name={a.icon} size={12} color={colors.gold} />
                                </View>
                              ))}
                              {recent.length === 0 && (
                                <>
                                  <View style={[styles.miniBadge, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                                  </View>
                                  <View style={[styles.miniBadge, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                                  </View>
                                  <View style={[styles.miniBadge, { backgroundColor: colors.surfaceSecondary }]}>
                                    <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                                  </View>
                                </>
                              )}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        );
                      })()}
                    </View>
                  </FadeInView>
                ),
                quote: (
                  <FadeInView delay={140} slideUp={16}>
                    <View style={{ paddingHorizontal: 24, marginTop: 6 }}>
                      <View style={[styles.quoteCard, { backgroundColor: colors.surface }]}>
                        <Text style={[styles.quoteText, { color: colors.textPrimary }]}>{dailyQuote.text}</Text>
                        <Text style={[styles.quoteAttr, { color: colors.gold }]}>- {dailyQuote.attribution}</Text>
                      </View>
                    </View>
                  </FadeInView>
                ),
                dashboard: (
                  <FadeInView delay={200} slideUp={16}>
                    <View style={[styles.section, { marginTop: 4 }]}>
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10, fontSize: 16, fontWeight: '800' }]}>YOUR DAY</Text>
                      <View style={styles.dashGrid}>
                        <View style={[styles.dashCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                          <View style={[styles.dashIconWrap, { backgroundColor: colors.redMuted }]}>
                            <Ionicons name="barbell" size={18} color={colors.red} />
                          </View>
                          <Text style={[styles.dashValue, { color: colors.textPrimary }]}>{todayStats.workouts}</Text>
                          <Text style={[styles.dashLabel, { color: colors.textMuted }]}>Workouts</Text>
                          <View style={[styles.dashProgressBg, { backgroundColor: colors.backgroundElevated }]}>
                            <View style={[styles.dashProgressFill, { backgroundColor: colors.red, width: `${Math.min(100, todayStats.workouts * 100)}%` }]} />
                          </View>
                        </View>
                        <View style={[styles.dashCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                          <View style={[styles.dashIconWrap, { backgroundColor: colors.warningMuted }]}>
                            <Ionicons name="flame" size={18} color={colors.warning} />
                          </View>
                          <Text style={[styles.dashValue, { color: colors.textPrimary }]}>{todayStats.caloriesBurned}</Text>
                          <Text style={[styles.dashLabel, { color: colors.textMuted }]}>Cal Burned</Text>
                          <View style={[styles.dashProgressBg, { backgroundColor: colors.backgroundElevated }]}>
                            <View style={[styles.dashProgressFill, { backgroundColor: colors.warning, width: `${Math.min(100, (todayStats.caloriesBurned / 500) * 100)}%` }]} />
                          </View>
                        </View>
                        <View style={[styles.dashCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                          <View style={[styles.dashIconWrap, { backgroundColor: colors.successMuted }]}>
                            <Ionicons name="nutrition" size={18} color={colors.success} />
                          </View>
                          <Text style={[styles.dashValue, { color: colors.textPrimary }]}>{todayStats.macrosPct}%</Text>
                          <Text style={[styles.dashLabel, { color: colors.textMuted }]}>Macros Hit</Text>
                          <View style={[styles.dashProgressBg, { backgroundColor: colors.backgroundElevated }]}>
                            <View style={[styles.dashProgressFill, { backgroundColor: colors.success, width: `${todayStats.macrosPct}%` }]} />
                          </View>
                        </View>
                        <View style={[styles.dashCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                          <View style={[styles.dashIconWrap, { backgroundColor: colors.infoMuted }]}>
                            <Ionicons name="time" size={18} color={colors.info} />
                          </View>
                          <Text style={[styles.dashValue, { color: colors.textPrimary }]}>{todayStats.activeMinutes}</Text>
                          <Text style={[styles.dashLabel, { color: colors.textMuted }]}>Active Min</Text>
                          <View style={[styles.dashProgressBg, { backgroundColor: colors.backgroundElevated }]}>
                            <View style={[styles.dashProgressFill, { backgroundColor: colors.info, width: `${Math.min(100, (todayStats.activeMinutes / 30) * 100)}%` }]} />
                          </View>
                        </View>
                      </View>
                    </View>
                  </FadeInView>
                ),
                quickStats: quickStats.length > 0 ? (
                  <FadeInView delay={300} slideUp={16}>
                    <View style={{ marginTop: 10 }}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
                        decelerationRate="fast"
                        snapToInterval={150}
                        scrollEnabled={!editMode}
                      >
                        {quickStats.map((stat, i) => (
                          <View
                            key={i}
                            style={[styles.quickStatCard, { backgroundColor: colors.surface, borderColor: colors.gold + '20' }]}
                          >
                            <View style={[styles.quickStatIconWrap, { backgroundColor: colors.goldMuted }]}>
                              <Ionicons name={stat.icon as any} size={16} color={colors.gold} />
                            </View>
                            <Text style={[styles.quickStatValue, { color: colors.textPrimary }]}>{stat.value}</Text>
                            <Text style={[styles.quickStatLabel, { color: colors.textMuted }]}>{stat.label}</Text>
                            <Text style={[styles.quickStatSub, { color: colors.textTertiary }]}>{stat.sub}</Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </FadeInView>
                ) : null,
                training: (
                  <FadeInView delay={340} slideUp={16}>
                    <View
                      ref={trainingRef}
                      onLayout={measureCoachTarget('training', trainingRef)}
                      style={styles.section}
                    >
                      <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Training</Text>
                      <View style={styles.toolsGrid}>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('WorkoutSession')} style={[styles.homeTool, { backgroundColor: colors.redMuted, borderColor: colors.red }]}>
                          <Ionicons name="heart" size={20} color={colors.red} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>HR Session</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('Workout')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="barbell" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Workout</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('MacroTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="restaurant-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Food Log</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('WeightTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="scale-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Weight</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('Timer', { mode: 'round' })} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="timer-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Timers</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('BodyLab')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="medkit-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Body Lab</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('MedicationTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="bandage-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Meds</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('ActivityTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="navigate-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>GPS</Text>
                        </TouchableOpacity>
                        <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('WeeklyReport')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                          <Ionicons name="bar-chart-outline" size={20} color={colors.gold} />
                          <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Report</Text>
                        </TouchableOpacity>
                        {isFemale && (
                          <TouchableOpacity activeOpacity={0.85} onPress={() => !editMode && navigation.navigate('CycleTracker')} style={[styles.homeTool, { backgroundColor: 'rgba(230, 57, 70, 0.08)', borderColor: '#E63946' + '40' }]}>
                            <Ionicons name="heart-circle-outline" size={20} color="#E63946" />
                            <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Cycle</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </FadeInView>
                ),
                schedule: todaysFullSchedule.length > 0 ? (
                  <FadeInView delay={400} slideUp={16}>
                    <View style={styles.section}>
                      <View style={styles.sectionHeader}>
                        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: 18 }]}>Today's Schedule</Text>
                        <TouchableOpacity
                          style={[styles.seeAllButton, { backgroundColor: colors.accentTint }]}
                          onPress={() => !editMode && navigation.navigate('Schedule')}
                        >
                          <Text style={[styles.seeAllText, { color: colors.gold }]}>All</Text>
                          <Ionicons name="chevron-forward" size={14} color={colors.gold} />
                        </TouchableOpacity>
                      </View>
                      {todaysFullSchedule.slice(0, 5).map((cls) => (
                        <TouchableOpacity
                          key={cls.key}
                          activeOpacity={0.85}
                          onPress={() => !editMode && navigation.navigate('Schedule')}
                          style={[styles.scheduleRow, { borderColor: colors.borderSubtle }]}
                        >
                          <View style={[styles.scheduleTimeBadge, {
                            backgroundColor: cls.booked ? colors.successMuted : colors.surfaceSecondary,
                          }]}>
                            <Text style={[styles.scheduleTime, {
                              color: cls.booked ? colors.success : colors.textSecondary,
                            }]}>{cls.time}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.scheduleClassName, { color: colors.textPrimary }]}>{cls.name}</Text>
                            <Text style={[styles.scheduleInstructor, { color: colors.textMuted }]}>
                              {cls.instructor} · {cls.duration}
                            </Text>
                          </View>
                          {cls.booked && (
                            <View style={[styles.bookedBadge, { backgroundColor: colors.successMuted }]}>
                              <Ionicons name="checkmark" size={12} color={colors.success} />
                            </View>
                          )}
                          {!cls.booked && cls.spotsLeft !== undefined && cls.spotsLeft > 0 && cls.spotsLeft <= 3 && (
                            <Text style={[styles.spotsLeft, { color: colors.warning }]}>{cls.spotsLeft} left</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </FadeInView>
                ) : null,
              };
              const items: ReorderableItem[] = [];
              for (const id of moduleOrder) {
                const n = sectionsById[id];
                if (!n) continue;
                const visible = isModuleVisible(id);
                if (!visible && !editMode) continue;
                items.push({ id, node: n, hidden: !visible });
              }
              return (
                <ReorderableSections
                  items={items}
                  editMode={editMode}
                  onReorder={handleReorder}
                  onToggleVisibility={toggleVisibility}
                />
              );
            })()}

          </>
        )}

      </ScrollView>

      {!isEmployee && (
        <CelebrationModal celebration={gamState.pendingCelebration} onDismiss={dismissCelebration} />
      )}

      {/* Floating spin wheel button — bottom left above the Home tab.
          Only shown when the user hasn't spun yet today. Once spun,
          disappears entirely until tomorrow. */}
      {!isEmployee && !hasSpunToday && (
        <View
          ref={spinFabRef}
          onLayout={measureCoachTarget('spinFab', spinFabRef)}
          style={[
            styles.spinFab,
            {
              backgroundColor: colors.gold,
              bottom: 72 + insets.bottom,
              shadowColor: colors.gold,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => { play('navigate'); setSpinOpen(true); }}
            activeOpacity={0.8}
            style={{ width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel="Daily spin"
          >
            <SpinWheelIcon size={26} color="#000000" background="rgba(0,0,0,0.15)" />
          </TouchableOpacity>
        </View>
      )}

      {/* Daily Spin Wheel */}
      <SpinWheelModal visible={spinOpen} onClose={() => setSpinOpen(false)} />

      {/* Notifications popup */}
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        navigation={navigation}
      />

      {/* First-run coachmark tutorial (one time; can be replayed via Settings → Secret Lab or Profile → Help) */}
      {(() => {
        const steps: CoachmarkStep[] = [
          {
            target: coachRects.edit ?? null,
            title: 'Customize your home',
            body: 'Tap Edit to drag sections into the order you want, or hide anything you don\u2019t use. Your layout, your way.',
          },
          {
            target: coachRects.training ?? null,
            title: 'Your training toolkit',
            body: 'Every training tool lives here \u2014 heart-rate sessions, workouts, weight, timers, body lab, GPS, weekly report.',
          },
          {
            target: coachRects.foodActions ?? null,
            title: 'Log food three ways',
            body: 'Search for a food by name, Scan a barcode, or snap a Photo and let AI estimate the macros.',
          },
          ...(coachRects.spinFab ? [{
            target: coachRects.spinFab,
            title: 'Free daily spin',
            body: 'Every day get a free spin for bonus points. Tap the wheel to see today\u2019s prizes.',
          }] : []),
          {
            target: null,
            title: 'You\u2019re all set',
            body: 'Tap Profile \u2192 Help any time to replay this tutorial or browse the FAQ.',
          },
        ];
        // Only open once we've measured at least the first couple of targets.
        const measuredCount = ['edit', 'training', 'foodActions'].filter((k) => coachRects[k]).length;
        const ready = measuredCount >= 2;
        return (
          <CoachmarkTutorial
            visible={coachmarksOpen && ready}
            steps={steps}
            onDone={() => setCoachmarksOpen(false)}
          />
        );
      })()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },

  // Welcome + Quote
  welcomeSection: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
  },
  welcomeLine: {
    marginBottom: 12,
  },
  welcomeLabel: {
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: -0.3,
  },
  welcomeName: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  // Compact XP row under name
  compactXpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  compactLevelCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactLevelText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000',
  },
  compactXpBody: {
    flex: 1,
    gap: 4,
  },
  compactXpLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  compactXpText: {
    fontSize: 11,
    fontWeight: '600',
  },
  compactXpBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  compactXpBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  quoteCard: {
    borderRadius: 16,
    padding: 16,
    gap: 2,
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 17,
    lineHeight: 26,
    textAlign: 'center',
    letterSpacing: 0.2,
    fontStyle: 'italic',
    fontWeight: '400',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  },
  quoteAttr: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 10,
    textAlign: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Hero
  heroCard: {
    marginHorizontal: 24,
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 44,
    gap: 22,
  },
  heroText: { alignItems: 'center' },
  heroTagline: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 5,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginTop: 24,
    gap: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 22,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // Sections
  section: {
    paddingHorizontal: 24,
    marginTop: 14,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 22,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Empty-state card for "no bookings today"
  noBookingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  noBookingsIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noBookingsTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  noBookingsDesc: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
    lineHeight: 18,
  },

  // Announcements — top of feed, admin-editable
  announcementsWrap: {
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 4,
  },
  announcementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  announcementIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementContent: { flex: 1 },
  announcementDismiss: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  announcementDesc: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 3,
    lineHeight: 18,
  },

  // Quick Actions — with colored icon backgrounds
  actionsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  actionFlex: { flex: 1 },
  actionCard: {
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 12,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  spinFab: {
    position: 'absolute',
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  spinFabIcon: {
    fontSize: 24,
  },
  flamesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  flamesChipText: {
    fontSize: 14,
    fontWeight: '800',
  },

  // Training mini-cards (replaces WOD card)
  homePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  homePillIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  homePillTitle: { fontSize: 13, fontWeight: '800' },
  homePillSub: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  recentBadges: {
    flexDirection: 'row',
    gap: 4,
    marginRight: 4,
  },
  miniBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 10,
  },
  mapImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#1a1a2e',
  },
  mapOverlay: {
    padding: 12,
  },
  mapOverlayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapLabel: { fontSize: 14, fontWeight: '800' },
  mapAddress: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  homeTool: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  homeToolLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  trainingRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: spacing.lg,
  },
  trainingCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 4,
  },
  trainingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  trainingCardValue: { fontSize: 24, fontWeight: '900' },
  trainingCardLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },

  // Timer launcher
  timerLauncherRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginTop: 10,
  },
  timerChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  timerChipLabel: { fontSize: 13, fontWeight: '700' },

  // ── Dashboard 2x2 grid ──
  dashGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashCard: {
    width: '48%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  dashIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  dashValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  dashLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dashProgressBg: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    overflow: 'hidden',
  },
  dashProgressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Next Class Countdown ──
  nextClassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  nextClassLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  nextClassDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  nextClassName: {
    fontSize: 14,
    fontWeight: '700',
  },
  nextClassMeta: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  nextClassRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  nextClassCountdown: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
  bookNowBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bookNowText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  bookedText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Quick Stats Carousel ──
  quickStatCard: {
    width: 140,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 3,
  },
  quickStatIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  quickStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  quickStatSub: {
    fontSize: 9,
    fontWeight: '500',
    textAlign: 'center',
  },

  // ── Schedule rows ──
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  scheduleTimeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  scheduleTime: {
    fontSize: 11,
    fontWeight: '700',
  },
  scheduleClassName: {
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleInstructor: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 1,
  },
  spotsLeft: {
    fontSize: 10,
    fontWeight: '700',
  },

  // ── Home quick-food actions row (Search / Scan / Photo) ──
  quickFoodBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  quickFoodLabel: {
    fontSize: 15,
    fontWeight: '700',
  },

  // ── Edit pillbox (enters reorder mode) ──
  editPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginLeft: 8,
  },
  editPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // ── Edit-mode bar (reorder) ──
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  editHint: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Cycle phase pill ──
  cyclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 24,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  cyclePillText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  cyclePillAlert: {
    fontSize: 10,
    fontWeight: '800',
  },
});
