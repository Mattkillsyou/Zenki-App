#!/usr/bin/env bash
# Re-pack senpai_*.webp animations so frame 1 has a transparent background.
#
# Why this exists: the senpai chibi animations were authored with a black
# backdrop and exported as animated WebP where frame 1 is a fully opaque
# 640x640 lossy VP8 (no ALPH chunk). Subsequent frames have alpha and use
# dispose=none + blend=yes, which means the opaque black plate from frame 1
# persists behind the character forever — the user sees a black box around
# the mascot.
#
# This script is idempotent: it checks whether frame 1 already has alpha and
# skips files that have already been fixed. Run it any time you drop new
# animations into src/assets/senpai/.
#
# Requires: webpmux, dwebp, cwebp, magick (ImageMagick 7).

set -euo pipefail

ASSET_DIR="${1:-$(cd "$(dirname "$0")/.." && pwd)/src/assets/senpai}"

for tool in webpmux dwebp cwebp magick; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "missing dependency: $tool" >&2
    exit 1
  fi
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

frame1_has_alpha() {
  # webpmux -info prints "alpha" column as "yes" or "no" for each frame
  webpmux -info "$1" 2>/dev/null \
    | awk '/^[[:space:]]+1:/ { print $4; exit }'
}

fix_one() {
  local src="$1"
  local name; name="$(basename "$src" .webp)"

  local alpha_status
  alpha_status="$(frame1_has_alpha "$src" || true)"
  if [ "$alpha_status" = "yes" ]; then
    echo "skip $name (frame 1 already has alpha)"
    return 0
  fi

  echo "fix  $name"

  local fdir="$WORK_DIR/$name"
  mkdir -p "$fdir"

  # Parse per-frame metadata: idx,width,height,xoff,yoff,duration,dispose,blend
  webpmux -info "$src" \
    | awk '
        /^[[:space:]]*[0-9]+:/ {
          gsub(/^[[:space:]]+/, "", $0)
          split($0, f, /[[:space:]]+/)
          printf "%s,%s,%s,%s,%s,%s,%s,%s\n", f[1], f[2], f[3], f[5], f[6], f[7], f[8], f[9]
        }
      ' \
    | sed 's/://' > "$fdir/frames.csv"

  local args=()
  while IFS=, read -r idx _w _h xoff yoff dur dispose blend; do
    local frame_webp="$fdir/frame_${idx}.webp"
    webpmux -get frame "$idx" "$src" -o "$frame_webp" >/dev/null

    if [ "$idx" = "1" ]; then
      # Decode -> chromakey black -> re-encode as lossless WebP with alpha.
      # Fuzz 10% removes pure black without disturbing the navy tracksuit.
      local png_in="$fdir/frame_${idx}.png"
      local png_out="$fdir/frame_${idx}_alpha.png"
      dwebp "$frame_webp" -o "$png_in" >/dev/null 2>&1
      magick "$png_in" -fuzz 10% -transparent black "$png_out"
      cwebp -lossless -alpha_q 100 "$png_out" -o "$frame_webp" >/dev/null 2>&1
    fi

    local d_flag b_flag
    case "$dispose" in background) d_flag=1 ;; *) d_flag=0 ;; esac
    case "$blend"   in yes)        b_flag="+b" ;; *) b_flag="-b" ;; esac

    args+=( -frame "$frame_webp" "+${dur}+${xoff}+${yoff}+${d_flag}${b_flag}" )
  done < "$fdir/frames.csv"

  local out="$fdir/${name}.webp"
  webpmux "${args[@]}" -loop 0 -bgcolor 0,0,0,0 -o "$out" >/dev/null
  mv "$out" "$src"
}

count=0
for src in "$ASSET_DIR"/senpai_*.webp; do
  [ -e "$src" ] || continue
  fix_one "$src"
  count=$((count + 1))
done

echo "processed $count file(s) in $ASSET_DIR"
