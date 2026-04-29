/**
 * Responsive breakpoints — single source of truth for "is this a phone /
 * iPad portrait / iPad landscape" decisions across the app.
 *
 * Per master prompt §36, the rules are:
 *   width <  600 → phone               (2-column grids, full-width forms)
 *   600–1024     → iPad portrait       (3-column grids, capped form widths)
 *   width > 1024 → iPad landscape      (4-column grids, capped form widths)
 *
 * Usage:
 *   import { Dimensions } from 'react-native';
 *   import { columnsForWidth, isTablet, MAX_CONTENT_WIDTH } from '../theme/breakpoints';
 *
 *   const cols = columnsForWidth(Dimensions.get('window').width);
 *   const tile = `${100 / cols - 2}%`;
 *
 * For form-heavy screens that should stay readable on iPad, wrap the screen
 * content in <ScreenContainer maxWidth="form"> — that pins to MAX_FORM_WIDTH
 * and centers horizontally without collapsing on phones.
 */

export const BREAKPOINTS = {
  /** Phone vs. iPad portrait. */
  tablet: 600,
  /** iPad portrait vs. iPad landscape. */
  tabletLandscape: 1024,
} as const;

/** Soft upper bound for general content on iPad — keeps line lengths readable. */
export const MAX_CONTENT_WIDTH = 700;

/** Tighter upper bound for form-heavy screens (sign-in, settings, admin). */
export const MAX_FORM_WIDTH = 600;

/** Number of grid columns appropriate for the given viewport width. */
export function columnsForWidth(width: number): 2 | 3 | 4 {
  if (width >= BREAKPOINTS.tabletLandscape) return 4;
  if (width >= BREAKPOINTS.tablet) return 3;
  return 2;
}

/** True when running on an iPad-class device (portrait or landscape). */
export function isTablet(width: number): boolean {
  return width >= BREAKPOINTS.tablet;
}

/** True only on the wider iPad landscape viewports. */
export function isTabletLandscape(width: number): boolean {
  return width >= BREAKPOINTS.tabletLandscape;
}
