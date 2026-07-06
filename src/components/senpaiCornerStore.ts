import { Dimensions } from 'react-native';

/**
 * Tiny module-level store for where the Senpai mascot is actually docked.
 *
 * SenpaiMascot corner-snaps to any of the 4 screen corners, but the effect
 * layers (SenpaiOverlay's StarburstRing, SenpaiImpactEffect's explosion and
 * spiral, SenpaiTransformation's arrival ring) are separate components mounted
 * elsewhere in App.tsx. They used to hardcode bottom-right / screen center, so
 * a mascot docked top-left "burst" from empty space (audit D4a / H5).
 *
 * The mascot publishes its true on-screen center on every corner snap; the
 * one-shot effects read it at mount. No subscription is needed — every
 * consumer remounts per reaction/impact, so a plain getter is always fresh.
 * This is deliberately NOT React context: corner changes must not re-render
 * every Senpai consumer (the mascot renders on every screen).
 */

export type SenpaiCornerKey = 'br' | 'bl' | 'tr' | 'tl';

export interface SenpaiCornerInfo {
  corner: SenpaiCornerKey;
  /** Mascot center in window coordinates (pt). */
  center: { x: number; y: number };
}

// Default = the mascot's default dock: bottom-right, anchored bottom:110 /
// right:16 with a 140pt box (SenpaiMascot MASCOT_SIZE). Computed lazily so a
// rotation before the first publish still yields a sane point.
function defaultInfo(): SenpaiCornerInfo {
  const { width, height } = Dimensions.get('window');
  return { corner: 'br', center: { x: width - 16 - 70, y: height - 110 - 70 } };
}

let current: SenpaiCornerInfo | null = null;

export function publishSenpaiCorner(info: SenpaiCornerInfo): void {
  current = info;
}

export function getSenpaiCornerInfo(): SenpaiCornerInfo {
  return current ?? defaultInfo();
}

/**
 * D3: geometry scale for effect bursts on large screens. Radii/offsets were
 * authored for a ~390-430pt phone and read tiny on iPad — scale them by the
 * window's short side, CLAMPED to [1, 1.35] so 1024-1366pt iPad widths get a
 * modest boost instead of a proportional blowup (768pt short side → ×1.35,
 * capped; phones → ×1). Positions should use REAL window dims (the old
 * `Math.min(height, 932)` clamp is what compressed effects into the top ~70%
 * of an iPad); only magnitudes go through this.
 */
export function effectScaleFor(width: number, height: number): number {
  return Math.min(1.35, Math.max(1, Math.min(width, height) / 430));
}
