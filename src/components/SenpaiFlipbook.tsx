import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { FlipbookEntry } from './senpaiMoodAssets';

/**
 * SenpaiFlipbook — plays one horizontal sprite strip (N frames laid out
 * left-to-right) by stepping translateX in -size increments inside an
 * overflow-hidden window.
 *
 * The strip is a single STATIC WebP — a completely different decode path from
 * the animated-WebP decoder that black-boxed on Apple-silicon simulators (see
 * the header of senpaiMoodAssets.ts). The loop is a LINEAR Animated.timing
 * with useNativeDriver, and the frame-stepping happens in the interpolate
 * node via a staircase input/output range — the loop runs natively: zero JS
 * work per frame, zero new dependencies.
 *
 * Why the stepping must live in the INTERPOLATE node and not a stepped
 * easing: Animated.timing pre-samples its easing into a 60Hz frame array
 * (TimingAnimation.js) and the native driver LINEARLY interpolates between
 * adjacent samples on every display-link tick (RCTFrameAnimation.mm). On
 * 120Hz ProMotion displays (Info.plist sets
 * CADisableMinimumFrameDurationOnPhone) every other tick lands BETWEEN two
 * samples, so a stepped easing renders translateX midway between two frame
 * offsets at each step boundary — a torn half-frame through the
 * overflow-hidden window, 12×/sec. Interpolation nodes evaluate the exact
 * current value per tick, so a staircase range (duplicated breakpoints)
 * makes mid-step positions impossible by construction at any refresh rate.
 *
 * A static-PNG underlay (the mood's first-frame PNG) masks the strip's
 * first-decode latency (~50ms) and is hidden once the strip paints, so
 * silhouettes never double. `cachePolicy="memory-disk"` makes revisited moods
 * instant via expo-image's LRU; strips are deliberately NOT eagerly decoded
 * (9 × ~7MB decoded would pin ~65MB for moods that may never show).
 */

// Staircase ranges: frame k holds for t ∈ [k/n, (k+1)/n) at offset -k·size.
// Duplicated input breakpoints make each step a flat segment followed by a
// vertical jump, so any t maps to a whole-frame offset. t=1 falls in the
// last segment and holds the LAST frame (never overshoots onto the blank
// area past the strip).
function staircaseRanges(frames: number, size: number) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let k = 0; k < frames; k++) {
    inputRange.push(k / frames, (k + 1) / frames);
    outputRange.push(-k * size, -k * size);
  }
  return { inputRange, outputRange };
}

export const SenpaiFlipbook = React.memo(function SenpaiFlipbook({
  entry,
  size,
  fallback,
}: {
  entry: FlipbookEntry;
  size: number;
  fallback: any;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const [stripShown, setStripShown] = useState(false);

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: (entry.frames / entry.fps) * 1000, // 24f @ 12fps = 2000ms
        // LINEAR on purpose — the frame-stepping lives in the staircase
        // interpolate below. See the header for why a stepped easing tears
        // on 120Hz ProMotion displays.
        easing: Easing.linear,
        useNativeDriver: true, // loop runs natively; zero JS work per frame
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [entry, progress]);

  const translateX = useMemo(
    () => progress.interpolate(staircaseRanges(entry.frames, size)),
    [progress, entry.frames, size],
  );

  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      {/* Static PNG underlay — hidden once the strip paints so silhouettes
          never double. Frame 1 of every strip matches the mood's PNG, so the
          swap is seamless (no plate flash — verified real alpha on frame 1). */}
      {!stripShown && (
        <Image
          source={fallback}
          style={StyleSheet.absoluteFillObject as any}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      )}
      <Animated.View style={{ width: entry.frames * size, height: size, transform: [{ translateX }] }}>
        <Image
          source={entry.strip}
          style={{ width: entry.frames * size, height: size }}
          contentFit="fill"
          cachePolicy="memory-disk"
          onDisplay={() => setStripShown(true)}
        />
      </Animated.View>
    </View>
  );
});
