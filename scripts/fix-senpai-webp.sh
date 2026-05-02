#!/usr/bin/env bash
# Re-pack senpai_*.webp animations to fix two bugs in the source assets:
#
# 1. Frame 1 was a fully opaque 640x640 lossy VP8 (no ALPH chunk) — an
#    opaque black plate that persisted behind the character because the
#    next frames used dispose=none. Fix: chromakey black -> transparent
#    on frame 1 and re-encode with alpha.
#
# 2. Every frame used dispose=none, so each frame's character (and its
#    dark anti-aliased fringe from being authored against black) stayed
#    on the canvas as the chibi shifted position between frames. The
#    accumulated fringes formed a visible "black box / trail" around the
#    mascot. Fix: force dispose=background on every frame so the canvas
#    is cleared between frames and only the current frame is visible.
#
# The script is idempotent — it re-checks frame 1's alpha AND dispose
# method and skips files that already have both correct. Run it any
# time you drop new animations into src/assets/senpai/.
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

already_fixed() {
  # webpmux -info per-frame columns split on whitespace are:
  # 1=idx 2=width 3=height 4=alpha 5=xoff 6=yoff 7=duration 8=dispose
  # 9=blend 10=image_size 11=compression. We need frame 1's alpha=yes
  # AND dispose=background.
  webpmux -info "$1" 2>/dev/null \
    | awk '/^[[:space:]]+1:/ {
        if ($4 == "yes" && $8 == "background") print "yes"; else print "no"
        exit
      }'
}

fix_one() {
  local src="$1"
  local name; name="$(basename "$src" .webp)"

  if [ "$(already_fixed "$src" || true)" = "yes" ]; then
    echo "skip $name (frame 1 alpha + dispose already correct)"
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

    # Force dispose=background on every frame to wipe the previous
    # frame's character (and its dark anti-aliased fringe) before the
    # next is drawn — otherwise the chibi leaves a black trail as she
    # shifts position between frames. Preserve the original blend mode.
    local b_flag
    case "$blend" in yes) b_flag="+b" ;; *) b_flag="-b" ;; esac

    args+=( -frame "$frame_webp" "+${dur}+${xoff}+${yoff}+1${b_flag}" )
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
