#!/usr/bin/env bash
# Build the Senpai sprite-flipbook strips from the authored VP9+alpha clips.
#
# Source: zenki_senpai_animations/transparent/<clip>.webm (640x640 @ 24fps,
# 2.041s loops). Output: one horizontal strip per mood — 24 frames x 280x280
# = 6720x280 — encoded as a single STATIC lossy WebP with lossless alpha at
# src/assets/senpai/flipbook/senpai_<mood>_strip_${ASSET_VER}.webp.
#
# Why STATIC WebP strips (not animated WebP): expo-image's animated-WebP
# decode path black-boxes/pixelates on Apple-silicon simulators even when
# the file is correct (see metro.config.js + scripts/webp-to-apng.sh for the
# retreat history). A static strip is a completely different decode path and
# is played at runtime by stepping translateX inside an overflow:hidden
# window (SenpaiFlipbook). Because the strips are static, the two animated-
# WebP file bugs cured by scripts/fix-senpai-webp.sh (frame-1 no-alpha,
# dispose=none ghosting) cannot occur here by construction.
#
# DECODE GOTCHA: ffmpeg's built-in `vp9` decoder silently DROPS the alpha
# plane. `-c:v libvpx-vp9` must appear BEFORE `-i` to force the input
# decoder that keeps it.
#
# ASSET-VERSIONING RULE (twin rule — both halves, always together):
#   Any regeneration that changes bytes under src/assets/senpai/** =>
#   1. bump ASSET_VER below (v1 -> v2) so every filename changes (new Metro
#      asset URI/hash => cold cache in dev server, expo-image disk cache,
#      and OTA — immune by construction), AND update every require() in
#      src/components/senpaiMoodAssets.ts to match; AND
#   2. bump the `@senpai_asset_cache_v` VERSION constant in
#      src/components/SenpaiMascot.tsx (one-shot expo-image cache clear).
#   Prior incident: stale caches ghosted old frames when only bytes changed.
#
# Usage: scripts/build-senpai-flipbooks.sh [--png8]
#   --png8   also emit quantized PNG8 strips (fallback if device QA ever
#            implicates static WebP; not wired into the app by default).
#
# The script is idempotent — outputs are regenerated deterministically from
# the same sources; re-running overwrites in place. It asserts frame count
# (24) and strip geometry (6720x280) and fails loudly on any drift, and it
# warns if any output exceeds the 400,000-byte per-mood budget.
#
# Requires: ffmpeg (with libvpx-vp9), magick (ImageMagick 7), cwebp.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_DIR/zenki_senpai_animations/transparent"
OUT_DIR="$REPO_DIR/src/assets/senpai/flipbook"

ASSET_VER=v1
FPS=12
FRAME_PX=280
EXPECT_FRAMES=24
BUDGET_BYTES=400000

# Source clip names; runtime maps sleeping->sleep, disappointed->cry.
MOODS=(idle cheering impressed encouraging celebrating sleep cry think wave)

EMIT_PNG8=0
if [ "${1:-}" = "--png8" ]; then
  EMIT_PNG8=1
fi

for tool in ffmpeg magick cwebp; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing dependency: $tool" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$OUT_DIR"

build_one() {
  local mood="$1"
  local clip="$SRC_DIR/$mood.webm"

  if [ ! -f "$clip" ]; then
    echo "missing source clip: $clip" >&2
    return 1
  fi

  local fdir="$WORK_DIR/$mood"
  mkdir -p "$fdir"

  # 1) Decode WITH ALPHA (libvpx-vp9 forced as the INPUT decoder — the
  #    built-in vp9 decoder drops the alpha plane), resample to 12 fps,
  #    Lanczos downscale 640 -> 280.
  ffmpeg -y -hide_banner -loglevel error \
    -c:v libvpx-vp9 -i "$clip" \
    -vf "fps=$FPS,scale=$FRAME_PX:$FRAME_PX:flags=lanczos" -fps_mode passthrough \
    "$fdir/f_%03d.png"

  local nframes
  nframes="$(ls "$fdir"/f_*.png | wc -l | tr -d ' ')"
  if [ "$nframes" -ne "$EXPECT_FRAMES" ]; then
    echo "FAIL $mood: expected $EXPECT_FRAMES frames, got $nframes" >&2
    return 1
  fi

  # 2) Horizontal strip: 24 x 280 = 6720x280.
  local strip_png="$WORK_DIR/${mood}_strip.png"
  magick "$fdir"/f_*.png +append "$strip_png"

  local geom expect_geom
  geom="$(magick identify -format '%wx%h' "$strip_png")"
  expect_geom="$((EXPECT_FRAMES * FRAME_PX))x$FRAME_PX"
  if [ "$geom" != "$expect_geom" ]; then
    echo "FAIL $mood: strip is $geom, expected $expect_geom" >&2
    return 1
  fi

  # 3) Single STATIC lossy WebP with lossless alpha.
  local out="$OUT_DIR/senpai_${mood}_strip_${ASSET_VER}.webp"
  cwebp -quiet -q 75 -alpha_q 100 -m 6 "$strip_png" -o "$out"

  if [ "$EMIT_PNG8" = "1" ]; then
    # Quantized-PNG8 fallback (only if device QA implicates static WebP).
    magick "$strip_png" -dither FloydSteinberg -colors 255 \
      "PNG8:$OUT_DIR/senpai_${mood}_strip_${ASSET_VER}.png"
  fi
}

for mood in "${MOODS[@]}"; do
  echo "build $mood"
  build_one "$mood"
done

echo
echo "manifest (mood  frames  fps  geometry  bytes):"
over_budget=0
for mood in "${MOODS[@]}"; do
  out="$OUT_DIR/senpai_${mood}_strip_${ASSET_VER}.webp"
  bytes="$(stat -f%z "$out")"
  geom="$(magick identify -format '%wx%h' "$out")"
  warn=""
  if [ "$bytes" -gt "$BUDGET_BYTES" ]; then
    warn="  WARNING: over ${BUDGET_BYTES}-byte budget"
    over_budget=1
  fi
  printf '%-13s %2d  %2d  %s  %7d%s\n' "$mood" "$EXPECT_FRAMES" "$FPS" "$geom" "$bytes" "$warn"
done

echo
echo "FLIPBOOK_ASSETS snippet (paste into src/components/senpaiMoodAssets.ts):"
cat <<EOF
export const FLIPBOOK_ASSETS: Partial<Record<string, FlipbookEntry>> = {
  idle:         { strip: require('../assets/senpai/flipbook/senpai_idle_strip_${ASSET_VER}.webp'),        frames: $EXPECT_FRAMES, fps: $FPS },
  cheering:     { strip: require('../assets/senpai/flipbook/senpai_cheering_strip_${ASSET_VER}.webp'),    frames: $EXPECT_FRAMES, fps: $FPS },
  impressed:    { strip: require('../assets/senpai/flipbook/senpai_impressed_strip_${ASSET_VER}.webp'),   frames: $EXPECT_FRAMES, fps: $FPS },
  encouraging:  { strip: require('../assets/senpai/flipbook/senpai_encouraging_strip_${ASSET_VER}.webp'), frames: $EXPECT_FRAMES, fps: $FPS },
  celebrating:  { strip: require('../assets/senpai/flipbook/senpai_celebrating_strip_${ASSET_VER}.webp'), frames: $EXPECT_FRAMES, fps: $FPS },
  sleeping:     { strip: require('../assets/senpai/flipbook/senpai_sleep_strip_${ASSET_VER}.webp'),       frames: $EXPECT_FRAMES, fps: $FPS },
  disappointed: { strip: require('../assets/senpai/flipbook/senpai_cry_strip_${ASSET_VER}.webp'),         frames: $EXPECT_FRAMES, fps: $FPS },
  // Generated but unwired until D7/D8 land:
  // think:     { strip: require('../assets/senpai/flipbook/senpai_think_strip_${ASSET_VER}.webp'), frames: $EXPECT_FRAMES, fps: $FPS },
  // wave:      { strip: require('../assets/senpai/flipbook/senpai_wave_strip_${ASSET_VER}.webp'),  frames: $EXPECT_FRAMES, fps: $FPS },
};
EOF

if [ "$over_budget" = "1" ]; then
  echo "one or more strips exceed the ${BUDGET_BYTES}-byte budget" >&2
  exit 1
fi
