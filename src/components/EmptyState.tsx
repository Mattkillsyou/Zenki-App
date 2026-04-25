import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { typography, spacing, borderRadius } from '../theme';
import { Button } from './Button';
import { FadeInView } from './FadeInView';

/* ─────────────────────────────────────────────────────────────────────────────
 * EmptyState — contextual placeholder when a screen/section has no data.
 *
 * Renders a centered icon + title + subtitle with an optional action button.
 * Each screen should supply copy tailored to what's missing and what the user
 * can do to populate the section.
 *
 * Usage:
 *   <EmptyState
 *     icon="🏋️"
 *     title="NO WORKOUTS YET"
 *     subtitle="Log your first session to start tracking your progress."
 *     actionLabel="LOG WORKOUT"
 *     onAction={() => navigation.navigate('WorkoutSession')}
 *   />
 *
 * Preset usage:
 *   <EmptyState.Workout onAction={...} />
 *   <EmptyState.Macros onAction={...} />
 * ────────────────────────────────────────────────────────────────────────── */

interface EmptyStateProps {
  /** Large emoji or icon string */
  icon: string;
  /** Bold heading, e.g. "NO WORKOUTS YET" */
  title: string;
  /** Supporting description */
  subtitle: string;
  /** CTA button label. If omitted, no button is shown */
  actionLabel?: string;
  /** CTA callback */
  onAction?: () => void;
  /** Secondary CTA label */
  secondaryLabel?: string;
  /** Secondary CTA callback */
  onSecondary?: () => void;
  /** Extra style for outer container */
  style?: ViewStyle;
  /** Whether to animate in. Default true */
  animate?: boolean;
  /** Size variant. Default 'md' */
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  style,
  animate = true,
  size = 'md',
}: EmptyStateProps) {
  const { colors } = useTheme();

  const iconSize = size === 'sm' ? 36 : size === 'lg' ? 64 : 48;
  const titleStyle =
    size === 'sm'
      ? typography.subheading
      : size === 'lg'
      ? typography.sectionTitle
      : typography.cardTitle;
  const subtitleStyle = size === 'sm' ? typography.caption : typography.bodySmall;
  const containerPadding =
    size === 'sm' ? spacing.md : size === 'lg' ? spacing.xxl : spacing.xl;

  const content = (
    <View style={[styles.container, { paddingVertical: containerPadding }, style]}>
      {/* Icon circle background */}
      <View
        style={[
          styles.iconCircle,
          {
            width: iconSize * 1.8,
            height: iconSize * 1.8,
            borderRadius: (iconSize * 1.8) / 2,
            backgroundColor: colors.surfaceSecondary,
          },
        ]}
      >
        <Text style={{ fontSize: iconSize }}>{icon}</Text>
      </View>

      {/* Title */}
      <Text
        style={[
          titleStyle,
          styles.title,
          { color: colors.textPrimary },
        ]}
      >
        {title}
      </Text>

      {/* Subtitle */}
      <Text
        style={[
          subtitleStyle,
          styles.subtitle,
          { color: colors.textSecondary },
        ]}
      >
        {subtitle}
      </Text>

      {/* Primary action button */}
      {actionLabel && onAction && (
        <View style={styles.buttonContainer}>
          <Button
            title={actionLabel}
            onPress={onAction}
            variant="primary"
            size={size === 'sm' ? 'sm' : 'md'}
          />
        </View>
      )}

      {/* Secondary action (text link style) */}
      {secondaryLabel && onSecondary && (
        <Text
          style={[
            typography.bodySmall,
            styles.secondaryLink,
            { color: colors.gold },
          ]}
          onPress={onSecondary}
        >
          {secondaryLabel}
        </Text>
      )}
    </View>
  );

  if (animate) {
    return <FadeInView delay={100}>{content}</FadeInView>;
  }

  return content;
}

/* ─── Pre-configured presets for each screen ──────────────────────────────── */

interface PresetProps {
  onAction?: () => void;
  style?: ViewStyle;
}

function WorkoutEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🏋️"
      title="NO WORKOUTS YET"
      subtitle="Log your first session to start tracking your progress and see your PRs climb."
      actionLabel="LOG WORKOUT"
      onAction={onAction}
      style={style}
    />
  );
}

function MacrosEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🍽️"
      title="START TRACKING"
      subtitle="Set up your nutrition goals and log meals to optimize your performance and recovery."
      actionLabel="SET UP GOALS"
      onAction={onAction}
      style={style}
    />
  );
}

function WeightEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="⚖️"
      title="STEP ON THE SCALE"
      subtitle="Log your first weigh-in to start tracking trends and see your EWMA trend line."
      actionLabel="LOG WEIGHT"
      onAction={onAction}
      style={style}
    />
  );
}

function CommunityEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="👥"
      title="JOIN THE CONVERSATION"
      subtitle="Create your first post to share your training journey with other Zenki members."
      actionLabel="CREATE POST"
      onAction={onAction}
      style={style}
    />
  );
}

function GPSEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🗺️"
      title="NO ACTIVITIES YET"
      subtitle="Start a GPS-tracked run, walk, or cycle to map your route and track your performance."
      actionLabel="START ACTIVITY"
      onAction={onAction}
      style={style}
    />
  );
}

function HREmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="❤️"
      title="NO WORKOUTS"
      subtitle="Connect a heart rate monitor or start a demo session to track your workout intensity."
      actionLabel="START SESSION"
      onAction={onAction}
      style={style}
    />
  );
}

function BodyLabEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🔬"
      title="NO SCANS YET"
      subtitle="Upload your first DEXA scan or blood work report to track your body composition and health markers."
      actionLabel="UPLOAD SCAN"
      onAction={onAction}
      style={style}
    />
  );
}

function TimerEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="⏱️"
      title="NO TIMER HISTORY"
      subtitle="Complete a timer session to start building your training history."
      actionLabel="START TIMER"
      onAction={onAction}
      style={style}
    />
  );
}

function ScheduleEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="📅"
      title="NO CLASSES TODAY"
      subtitle="Check back tomorrow or browse the full schedule to find a class that fits your goals."
      actionLabel="VIEW FULL SCHEDULE"
      onAction={onAction}
      style={style}
    />
  );
}

function StoreEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🛍️"
      title="STORE IS EMPTY"
      subtitle="Check back soon for new Zenki merchandise and training gear."
      style={style}
    />
  );
}

function SearchEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🔍"
      title="NO RESULTS"
      subtitle="Try adjusting your search or filters to find what you're looking for."
      style={style}
      size="sm"
    />
  );
}

function WishlistEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="💛"
      title="WISHLIST IS EMPTY"
      subtitle="Tap the heart on any product to save it for later."
      actionLabel="BROWSE STORE"
      onAction={onAction}
      style={style}
    />
  );
}

function CartEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🛒"
      title="CART IS EMPTY"
      subtitle="Add some Zenki gear to get started."
      actionLabel="BROWSE STORE"
      onAction={onAction}
      style={style}
    />
  );
}

function BookingsEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="📋"
      title="NO BOOKINGS"
      subtitle="You don't have any upcoming bookings. Browse the schedule to reserve your spot."
      actionLabel="VIEW SCHEDULE"
      onAction={onAction}
      style={style}
    />
  );
}

function FeedEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="📰"
      title="YOUR FEED IS EMPTY"
      subtitle="Follow other members to see their posts in your feed."
      actionLabel="FIND MEMBERS"
      onAction={onAction}
      style={style}
    />
  );
}

function NotificationsEmpty({ onAction, style }: PresetProps) {
  return (
    <EmptyState
      icon="🔔"
      title="ALL CAUGHT UP"
      subtitle="You have no new notifications. Keep training!"
      style={style}
      size="sm"
    />
  );
}

/* ─── Attach sub-components ───────────────────────────────────────────────── */

EmptyState.Workout = WorkoutEmpty;
EmptyState.Macros = MacrosEmpty;
EmptyState.Weight = WeightEmpty;
EmptyState.Community = CommunityEmpty;
EmptyState.GPS = GPSEmpty;
EmptyState.HR = HREmpty;
EmptyState.BodyLab = BodyLabEmpty;
EmptyState.Timer = TimerEmpty;
EmptyState.Schedule = ScheduleEmpty;
EmptyState.Store = StoreEmpty;
EmptyState.Search = SearchEmpty;
EmptyState.Wishlist = WishlistEmpty;
EmptyState.Cart = CartEmpty;
EmptyState.Bookings = BookingsEmpty;
EmptyState.Feed = FeedEmpty;
EmptyState.Notifications = NotificationsEmpty;

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: spacing.lg,
    minWidth: 180,
  },
  secondaryLink: {
    marginTop: spacing.smd,
    textAlign: 'center',
  },
});
