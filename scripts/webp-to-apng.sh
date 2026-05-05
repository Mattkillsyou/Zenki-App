#!/usr/bin/env bash
# Convert animated WebPs in src/assets/senpai/ to APNGs.
# expo-image's iOS animated-WebP decoder produced black-box / pixelated
# rendering on Apple silicon simulators; iOS native APNG decoding is
# more reliable. This pipeline preserves transparency, frame timing,
# and dispose=background semantics by compositing each WebP sub-region
# frame onto a full-canvas PNG before reassembly.
#
# Tools required (Homebrew):
#   brew install webp imagemagick apngasm
#
# Run from project root:
#   bash scripts/webp-to-apng.sh

set -euo pipefail

ASSET_DIR="src/assets/senpai"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

if [[ ! -d "$ASSET_DIR" ]]; then
  echo "Run from project root (src/assets/senpai missing)." >&2
  exit 1
fi

shopt -s nullglob
WEBPS=("$ASSET_DIR"/senpai_*.webp)
if (( ${#WEBPS[@]} == 0 )); then
  echo "No senpai_*.webp files found in $ASSET_DIR." >&2
  exit 1
fi

for webp in "${WEBPS[@]}"; do
  base="$(basename "$webp" .webp)"
  out_apng="$ASSET_DIR/${base}.apng"
  echo "→ $base"

  work="$TMP_ROOT/$base"
  mkdir -p "$work"

  # Pull canvas size + per-frame metadata from webpmux.
  info="$(webpmux -info "$webp")"
  canvas_w="$(echo "$info" | awk '/Canvas size:/ {print $3}')"
  canvas_h="$(echo "$info" | awk '/Canvas size:/ {print $5}')"
  if [[ -z "$canvas_w" || -z "$canvas_h" ]]; then
    echo "  ! Could not parse canvas size for $base"; continue
  fi

  # Frame rows from webpmux look like:
  #   1:   640   640   yes        0        0       41 background    no  ...
  # cols: idx width height alpha x_off y_off duration dispose blend ...
  declare -a frame_idx=() frame_x=() frame_y=() frame_dur=()
  while read -r line; do
    [[ "$line" =~ ^[[:space:]]*([0-9]+):[[:space:]]+([0-9]+)[[:space:]]+([0-9]+)[[:space:]]+(yes|no)[[:space:]]+([0-9]+)[[:space:]]+([0-9]+)[[:space:]]+([0-9]+) ]] || continue
    frame_idx+=("${BASH_REMATCH[1]}")
    frame_x+=("${BASH_REMATCH[5]}")
    frame_y+=("${BASH_REMATCH[6]}")
    frame_dur+=("${BASH_REMATCH[7]}")
  done <<< "$info"

  total="${#frame_idx[@]}"
  if (( total == 0 )); then
    echo "  ! No frames parsed for $base"; continue
  fi

  # Build apngasm positional args: <png> <num> <den> per frame, where
  # delay = num/den seconds. We use ms over 1000.
  apngasm_args=()
  for i in "${!frame_idx[@]}"; do
    idx="${frame_idx[$i]}"
    x="${frame_x[$i]}"
    y="${frame_y[$i]}"
    dur_ms="${frame_dur[$i]}"

    sub_webp="$work/sub_${idx}.webp"
    sub_png="$work/sub_${idx}.png"
    canvas_png="$(printf '%s/canvas_%04d.png' "$work" "$idx")"

    webpmux -get frame "$idx" "$webp" -o "$sub_webp" >/dev/null 2>&1
    dwebp "$sub_webp" -o "$sub_png" >/dev/null 2>&1

    # Composite onto a fresh transparent canvas so APNG has full-frame inputs
    # (dispose=background equivalent — every frame is the complete canvas state).
    magick -size "${canvas_w}x${canvas_h}" 'xc:transparent' \
      "$sub_png" -geometry "+${x}+${y}" -composite \
      "$canvas_png" >/dev/null 2>&1

    apngasm_args+=("$canvas_png" "$dur_ms" 1000)
  done

  # apngasm: -o <output> followed by <input.png> <num> <den> ... per frame.
  # -l 0 = loop forever; -F = overwrite without prompting.
  rm -f "$out_apng"
  apngasm -o "$out_apng" "${apngasm_args[@]}" -l 0 -F >/dev/null 2>&1
  if [[ ! -s "$out_apng" ]]; then
    echo "  ! apngasm produced no output for $base"; continue
  fi
  size=$(stat -f%z "$out_apng")
  printf '  ✓ %s (%d frames, %s bytes)\n' "$out_apng" "$total" "$size"
done

echo "Done. APNGs written next to the WebPs in $ASSET_DIR."
