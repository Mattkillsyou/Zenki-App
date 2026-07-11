import React from 'react';
import { View, ViewStyle } from 'react-native';
import { FadeInView } from './FadeInView';

interface StaggeredProps {
  children: React.ReactNode;
  /**
   * Tier offset added before the per-child stagger (ms). Use 0 for the
   * chrome/header tier and ~60 for the content group so a screen reads as a
   * two-tier entrance rather than a hand-typed ladder.
   */
  baseDelay?: number;
  /** Index of the first child, for continuing a stagger across sibling groups. */
  from?: number;
  /** Entrance role passed to each child (header 8px slide, card 12px). */
  role?: 'header' | 'card';
  /** Slide distance override forwarded to every child. */
  slideUp?: number;
  /** Duration override forwarded to every child. */
  durationMs?: number;
  /** Optional container style. When omitted the group renders as a fragment. */
  style?: ViewStyle;
}

/**
 * Wraps each direct child in a <FadeInView>, auto-assigning the stagger index
 * by position so screens no longer hand-type per-child delays. The delay for
 * child i is `baseDelay + stagger(from + i)` — 30ms steps, capped at 120ms.
 *
 *   <Staggered role="card" baseDelay={60}>
 *     <StatCard />
 *     <StreakCard />
 *     <ClassList />
 *   </Staggered>
 *
 * Null/false children are skipped without consuming a stagger slot. For grids,
 * prefer FadeInView with an explicit row `index` so tiles stagger by row.
 */
export function Staggered({
  children,
  baseDelay = 0,
  from = 0,
  role,
  slideUp,
  durationMs,
  style,
}: StaggeredProps) {
  let slot = 0;
  const wrapped = React.Children.map(children, (child) => {
    if (child == null || typeof child === 'boolean') return child;
    const index = from + slot;
    slot += 1;
    return (
      <FadeInView
        index={index}
        baseDelay={baseDelay}
        role={role}
        slideUp={slideUp}
        durationMs={durationMs}
      >
        {child}
      </FadeInView>
    );
  });

  return style ? <View style={style}>{wrapped}</View> : <>{wrapped}</>;
}
