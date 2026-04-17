import React, { useMemo, useEffect, useRef } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { typography, spacing, borderRadius, shadows } from '../theme';
import { ClassCard, AnimatedLogo, FadeInView, PressableScale, TimeClock, StreakBadge, PointsBadge, XPProgressBar, AchievementGrid, CelebrationModal } from '../components';
import { Skeleton } from '../components/Skeleton';
import { SpinWheelModal } from '../components/SpinWheelModal';
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
  React.useEffect(() => { recordAppOpen(); }, [recordAppOpen]);
  const { announcements } = useAnnouncements();
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

    // 2. Current streak
    const streak = gamState.streak || 0;
    stats.push({
      label: 'Streak',
      value: `${streak} day${streak !== 1 ? 's' : ''}`,
      sub: streak >= 7 ? 'On fire!' : 'Keep going',
      icon: 'flame',
    });

    // 3. Latest PR
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

  // ── Pull-to-Refresh ──
  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Force a re-render by briefly toggling state
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={{ flex: 1 }}>

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
                  <Ionicons name="flame" size={16} color="#FF6B35" />
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

        {/* ─── Welcome (above announcements) ─── */}
        <FadeInView delay={40} slideUp={12}>
          <View style={[styles.welcomeSection, { paddingBottom: 0 }]}>
            <Text style={styles.welcomeLine} numberOfLines={1}>
              <Text style={[styles.welcomeLabel, { color: colors.textTertiary }]}>Welcome back, </Text>
              <Text style={[styles.welcomeName, { color: colors.textPrimary }]}>
                {[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Member'}
              </Text>
            </Text>
          </View>
        </FadeInView>

        {/* ─── Announcements (admin-editable, below welcome) ─── */}
        {!isEmployee && announcements.length > 0 && (
          <FadeInView delay={80} slideUp={12}>
            <View style={[styles.announcementsWrap, { marginTop: 12 }]}>
              {announcements.slice(0, 3).map((a) => (
                <PressableScale key={a.id}>
                  <View style={[styles.announcementCard, { backgroundColor: colors.goldMuted }]}>
                    <View style={[styles.announcementIcon, { backgroundColor: colors.gold + '20' }]}>
                      <Ionicons name="megaphone-outline" size={20} color={colors.gold} />
                    </View>
                    <View style={styles.announcementContent}>
                      <Text style={[styles.announcementTitle, { color: colors.textPrimary }]} numberOfLines={2}>{a.title}</Text>
                      {a.description ? (
                        <Text style={[styles.announcementDesc, { color: colors.textSecondary }]} numberOfLines={2}>{a.description}</Text>
                      ) : null}
                    </View>
                  </View>
                </PressableScale>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ─── Compact XP + Daily Quote ─── */}
        <FadeInView delay={120} slideUp={20}>
          <View style={[styles.welcomeSection, { paddingTop: 12 }]}>

            {/* Compact XP row — only for members */}
            {!isEmployee && (
              <View style={[styles.compactXpRow, { backgroundColor: colors.surface }]}>
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
            )}

            {/* Achievements pillbox with recent badge icons */}
            {!isEmployee && (() => {
              const unlocked = gamState.achievements.filter((a: any) => a.unlocked);
              const recent = unlocked.slice(-4); // last 4 unlocked
              return (
                <TouchableOpacity
                  style={[styles.homePill, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => navigation.navigate('Achievements')}
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

            <View style={[styles.quoteCard, { backgroundColor: colors.surface }]}>
              <Text style={[styles.quoteText, { color: colors.textPrimary }]}>{dailyQuote.text}</Text>
              <Text style={[styles.quoteAttr, { color: colors.gold }]}>— {dailyQuote.attribution}</Text>
            </View>
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

        {/* ─── Member Content (scrollable) ─── */}
        {!isEmployee && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
            }
          >
            {/* ── 1.1 Today's Dashboard Panel ── */}
            <FadeInView delay={200} slideUp={16}>
              <View style={[styles.section, { marginTop: 4 }]}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10, fontSize: 16, fontWeight: '800' }]}>YOUR DAY</Text>
                <View style={styles.dashGrid}>
                  {/* Workouts Today */}
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

                  {/* Calories Burned */}
                  <View style={[styles.dashCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <View style={[styles.dashIconWrap, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                      <Ionicons name="flame" size={18} color="#F59E0B" />
                    </View>
                    <Text style={[styles.dashValue, { color: colors.textPrimary }]}>{todayStats.caloriesBurned}</Text>
                    <Text style={[styles.dashLabel, { color: colors.textMuted }]}>Cal Burned</Text>
                    <View style={[styles.dashProgressBg, { backgroundColor: colors.backgroundElevated }]}>
                      <View style={[styles.dashProgressFill, { backgroundColor: '#F59E0B', width: `${Math.min(100, (todayStats.caloriesBurned / 500) * 100)}%` }]} />
                    </View>
                  </View>

                  {/* Macros Hit */}
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

                  {/* Active Minutes */}
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

            {/* ── 1.2 Next Class Countdown ── */}
            <FadeInView delay={260} slideUp={16}>
              <View style={[styles.section, { marginTop: 6 }]}>
                {nextClass ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => navigation.navigate('Schedule')}
                    style={[styles.nextClassCard, { backgroundColor: colors.surface, borderColor: colors.gold + '30' }]}
                  >
                    <View style={styles.nextClassLeft}>
                      <View style={[styles.nextClassDot, { backgroundColor: colors.gold }]} />
                      <View>
                        <Text style={[styles.nextClassName, { color: colors.textPrimary }]}>{nextClass.name}</Text>
                        <Text style={[styles.nextClassMeta, { color: colors.textSecondary }]}>
                          {nextClass.instructor} · {nextClass.time}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.nextClassRight}>
                      <Text style={[styles.nextClassCountdown, { color: colors.gold }]}>{countdown}</Text>
                      {!nextClass.booked && (
                        <TouchableOpacity
                          style={[styles.bookNowBtn, { backgroundColor: colors.gold }]}
                          onPress={() => navigation.navigate('Book')}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.bookNowText, { color: '#000' }]}>BOOK</Text>
                        </TouchableOpacity>
                      )}
                      {nextClass.booked && (
                        <View style={[styles.bookedBadge, { backgroundColor: colors.successMuted }]}>
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                          <Text style={[styles.bookedText, { color: colors.success }]}>BOOKED</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.nextClassCard, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}>
                    <Ionicons name="moon-outline" size={18} color={colors.textMuted} />
                    <Text style={[styles.nextClassMeta, { color: colors.textMuted, marginLeft: 8 }]}>
                      NO CLASSES REMAINING TODAY
                    </Text>
                  </View>
                )}
              </View>
            </FadeInView>

            {/* ── 1.3 Quick Stats Carousel ── */}
            {quickStats.length > 0 && (
              <FadeInView delay={300} slideUp={16}>
                <View style={{ marginTop: 10 }}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
                    decelerationRate="fast"
                    snapToInterval={150}
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
            )}

            {/* Training — log workouts, track PRs */}
            <FadeInView delay={340} slideUp={16}>
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 10 }]}>Training</Text>

                {/* Tools grid — all tools accessible from Home */}
                <View style={styles.toolsGrid}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('WorkoutSession')} style={[styles.homeTool, { backgroundColor: colors.redMuted, borderColor: colors.red }]}>
                    <Ionicons name="heart" size={20} color={colors.red} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>HR Session</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Workout')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="barbell" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Workout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('MacroTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="restaurant-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Food Log</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('WeightTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="scale-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Weight</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('Timer', { mode: 'round' })} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="timer-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Timers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('BodyLab')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="medkit-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Body Lab</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('ActivityTracker')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="navigate-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>GPS</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => navigation.navigate('WeeklyReport')} style={[styles.homeTool, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="bar-chart-outline" size={20} color={colors.gold} />
                    <Text style={[styles.homeToolLabel, { color: colors.textPrimary }]}>Report</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeInView>

            {/* ── Today's Schedule ── */}
            {todaysFullSchedule.length > 0 && (
              <FadeInView delay={400} slideUp={16}>
                <View style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: 18 }]}>Today's Schedule</Text>
                    <TouchableOpacity
                      style={[styles.seeAllButton, { backgroundColor: colors.accentTint }]}
                      onPress={() => navigation.navigate('Schedule')}
                    >
                      <Text style={[styles.seeAllText, { color: colors.gold }]}>All</Text>
                      <Ionicons name="chevron-forward" size={14} color={colors.gold} />
                    </TouchableOpacity>
                  </View>
                  {todaysFullSchedule.slice(0, 5).map((cls) => (
                    <TouchableOpacity
                      key={cls.key}
                      activeOpacity={0.85}
                      onPress={() => navigation.navigate('Schedule')}
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
            )}

          </ScrollView>
        )}

      </View>

      {!isEmployee && (
        <CelebrationModal celebration={gamState.pendingCelebration} onDismiss={dismissCelebration} />
      )}

      {/* Floating spin wheel button — bottom left above the Home tab.
          Only shown when the user hasn't spun yet today. Once spun,
          disappears entirely until tomorrow. */}
      {!isEmployee && !hasSpunToday && (
        <TouchableOpacity
          onPress={() => { play('navigate'); setSpinOpen(true); }}
          activeOpacity={0.8}
          style={[
            styles.spinFab,
            {
              backgroundColor: colors.gold,
              bottom: 100 + insets.bottom,
              shadowColor: colors.gold,
            },
          ]}
        >
          <Text style={styles.spinFabIcon}>🎡</Text>
        </TouchableOpacity>
      )}

      {/* Daily Spin Wheel */}
      <SpinWheelModal visible={spinOpen} onClose={() => setSpinOpen(false)} />

      {/* Notifications popup */}
      <NotificationsModal
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
        navigation={navigation}
      />
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
});
