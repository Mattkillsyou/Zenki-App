import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { borderRadius as br, spacing } from '../theme';

/* ─────────────────────────────────────────────────────────────────────────────
 * Skeleton — pulsing placeholder rectangle while async content loads.
 *
 * Usage:
 *   <Skeleton width={160} height={20} />
 *   <Skeleton width="100%" height={120} borderRadius={16} />
 *   <Skeleton.Row count={3} width={100} height={14} gap={8} />       ← 3 inline pills
 *   <Skeleton.Lines count={4} />                                      ← 4 full-width text lines
 *   <Skeleton.Card />                                                 ← standard card placeholder
 *   <Skeleton.Circle size={48} />                                     ← avatar placeholder
 * ────────────────────────────────────────────────────────────────────────── */

interface SkeletonProps {
  /** Width of the placeholder. Number (px) or string ("100%"). Default "100%" */
  width?: DimensionValue;
  /** Height of the placeholder. Default 16 */
  height?: number;
  /** Border radius. Default borderRadius.md (12) */
  borderRadius?: number;
  /** Extra ViewStyle overrides */
  style?: ViewStyle;
  /** Minimum opacity in the pulse. Default 0.25 */
  minOpacity?: number;
  /** Maximum opacity in the pulse. Default 0.65 */
  maxOpacity?: number;
  /** Pulse animation duration (ms). Default 1000 */
  pulseDuration?: number;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = br.md,
  style,
  minOpacity = 0.25,
  maxOpacity = 0.65,
  pulseDuration = 1000,
}: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(minOpacity)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: maxOpacity,
          duration: pulseDuration,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: minOpacity,
          duration: pulseDuration,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [minOpacity, maxOpacity, pulseDuration]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceSecondary,
          opacity,
        },
        style,
      ]}
    />
  );
}

/* ─── Skeleton.Circle ─────────────────────────────────────────────────────── */

interface CircleProps {
  size?: number;
  style?: ViewStyle;
}

function SkeletonCircle({ size = 48, style }: CircleProps) {
  return (
    <Skeleton
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
}

/* ─── Skeleton.Row — N pills in a horizontal row ─────────────────────────── */

interface RowProps {
  /** Number of skeleton pills in the row */
  count?: number;
  /** Width of each pill */
  width?: DimensionValue;
  /** Height of each pill */
  height?: number;
  /** Gap between pills */
  gap?: number;
  /** Border radius */
  borderRadius?: number;
  style?: ViewStyle;
}

function SkeletonRow({
  count = 3,
  width = 80,
  height = 14,
  gap = spacing.sm,
  borderRadius = br.sm,
  style,
}: RowProps) {
  return (
    <View style={[styles.row, { gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          width={width}
          height={height}
          borderRadius={borderRadius}
        />
      ))}
    </View>
  );
}

/* ─── Skeleton.Lines — N stacked text lines with varied widths ────────────── */

interface LinesProps {
  /** Number of text lines. Default 4 */
  count?: number;
  /** Line height. Default 14 */
  lineHeight?: number;
  /** Gap between lines. Default 10 */
  gap?: number;
  style?: ViewStyle;
}

const LINE_WIDTHS: DimensionValue[] = ['100%', '92%', '85%', '78%', '65%', '88%', '95%', '72%'];

function SkeletonLines({
  count = 4,
  lineHeight = 14,
  gap = 10,
  style,
}: LinesProps) {
  return (
    <View style={[{ gap }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          width={LINE_WIDTHS[i % LINE_WIDTHS.length]}
          height={lineHeight}
          borderRadius={br.xs}
        />
      ))}
    </View>
  );
}

/* ─── Skeleton.Card — standard card-sized placeholder ─────────────────────── */

interface CardProps {
  /** Show an avatar circle in the header row. Default true */
  avatar?: boolean;
  /** Number of body text lines. Default 3 */
  bodyLines?: number;
  /** Show a bottom action row. Default true */
  actionRow?: boolean;
  style?: ViewStyle;
}

function SkeletonCard({
  avatar = true,
  bodyLines = 3,
  actionRow = true,
  style,
}: CardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      {/* Header row: avatar + title/subtitle */}
      <View style={styles.cardHeader}>
        {avatar && <SkeletonCircle size={40} />}
        <View style={[styles.cardHeaderText, { marginLeft: avatar ? spacing.smd : 0 }]}>
          <Skeleton width="60%" height={16} borderRadius={br.xs} />
          <Skeleton
            width="40%"
            height={12}
            borderRadius={br.xs}
            style={{ marginTop: spacing.xs }}
          />
        </View>
      </View>

      {/* Body area — could be an image or text block */}
      <Skeleton
        width="100%"
        height={160}
        borderRadius={br.md}
        style={{ marginTop: spacing.md }}
      />

      {/* Text lines */}
      <SkeletonLines count={bodyLines} gap={8} style={{ marginTop: spacing.md }} />

      {/* Action row */}
      {actionRow && (
        <View style={[styles.actionRow, { marginTop: spacing.md }]}>
          <Skeleton width={60} height={28} borderRadius={br.sm} />
          <Skeleton width={60} height={28} borderRadius={br.sm} />
          <Skeleton width={60} height={28} borderRadius={br.sm} />
        </View>
      )}
    </View>
  );
}

/* ─── Skeleton.StatCard — small metric card placeholder (for dashboards) ─── */

interface StatCardProps {
  style?: ViewStyle;
}

function SkeletonStatCard({ style }: StatCardProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      <SkeletonCircle size={32} />
      <Skeleton width="70%" height={22} borderRadius={br.xs} style={{ marginTop: spacing.sm }} />
      <Skeleton width="50%" height={12} borderRadius={br.xs} style={{ marginTop: spacing.xs }} />
    </View>
  );
}

/* ─── Skeleton.List — repeated item rows ─────────────────────────────────── */

interface ListProps {
  /** Number of rows. Default 5 */
  count?: number;
  /** Show avatar circle per row. Default true */
  avatar?: boolean;
  /** Row height. Default 56 */
  rowHeight?: number;
  style?: ViewStyle;
}

function SkeletonList({
  count = 5,
  avatar = true,
  rowHeight = 56,
  style,
}: ListProps) {
  const { colors } = useTheme();
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.listRow,
            {
              height: rowHeight,
              borderBottomColor: colors.divider,
              borderBottomWidth: i < count - 1 ? 1 : 0,
            },
          ]}
        >
          {avatar && <SkeletonCircle size={36} />}
          <View style={{ flex: 1, marginLeft: avatar ? spacing.smd : 0 }}>
            <Skeleton width="65%" height={14} borderRadius={br.xs} />
            <Skeleton
              width="40%"
              height={11}
              borderRadius={br.xs}
              style={{ marginTop: 6 }}
            />
          </View>
          <Skeleton width={48} height={14} borderRadius={br.xs} />
        </View>
      ))}
    </View>
  );
}

/* ─── Attach sub-components ───────────────────────────────────────────────── */

Skeleton.Circle = SkeletonCircle;
Skeleton.Row = SkeletonRow;
Skeleton.Lines = SkeletonLines;
Skeleton.Card = SkeletonCard;
Skeleton.StatCard = SkeletonStatCard;
Skeleton.List = SkeletonList;

/* ─── Styles ──────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    borderRadius: br.xl,
    borderWidth: 1,
    padding: spacing.md,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    borderRadius: br.xl,
    borderWidth: 1,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
