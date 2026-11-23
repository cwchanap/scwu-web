#!/bin/bash
# Draw SHUWA's poses with the OpenAI Images edit API: one edit per pose, SHUWA's key drawing as image 1 and,
# where poses.txt names one, the donor's sprite for the same pose as image 2. Those guides are cut from the game's
# files (ASSETS, default public/assets, and GENERATED, default src/game/generated), so they are made here into
# out/posrefs/ and never committed.
#   bash art/shuwa/draw.sh b2            # a whole batch (b1 b2 b3 b4)
#   bash art/shuwa/draw.sh p1-33 k1-72   # single poses; batches and poses can be mixed
# Needs OPENAI_API_KEY in the environment; the key is never printed. Writes out/raw/<pose>.png beside this script.
# IMAGE_MODEL overrides the model (default gpt-image-2.6-sunburst).
set -uo pipefail
# A relative ASSETS or GENERATED is read from where the command runs, so both are made absolute before the cd.
abs() { case $1 in /*) echo "$1" ;; *) echo "$PWD/$1" ;; esac; }
A=$(abs "${ASSETS:-$(dirname "$0")/../../public/assets}")
G=$(abs "${GENERATED:-$(dirname "$0")/../../src/game/generated}")
cd "$(dirname "$0")"
: "${OPENAI_API_KEY:?OPENAI_API_KEY is not set}"
[ $# -gt 0 ] || { echo "usage: draw.sh BATCH|POSE..."; exit 1; }
export IMAGE_MODEL=${IMAGE_MODEL:-gpt-image-2.6-sunburst} OUT=out/raw
mkdir -p "$OUT"
poses=()
for a in "$@"; do
  m=$(awk -v a="$a" '!/^#/ && ($1 == a || $2 == a) { print $1 }' poses.txt)
  [ -n "$m" ] || { echo "unknown batch or pose: $a"; exit 1; }
  poses+=($m)
done
poses=($(printf '%s\n' "${poses[@]}" | awk '!seen[$0]++')) # a pose named on its own and in its batch is drawn once
python3 -I tools/donor_data.py "$G" out/data || exit 1
# Guides are remade for every pose drawn, so a changed export is always picked up.
for k in "${poses[@]}"; do
  read -r _ _ guide form size < <(awk -v k="$k" '$1 == k' poses.txt)
  [ "$guide" = - ] ||
    python3 -I tools/posref.py "$A/${guide%-*}" "${guide%-*}" "${guide##*-}" "$form" "$size" || exit 1
done

draw() {
  local k guide form size tmp status
  read -r k _ guide form size < <(awk -v k="$1" '$1 == k' poses.txt)
  local imgs=(-F "image[]=@refs/$form.png")
  [ "$guide" = - ] || imgs+=(-F "image[]=@out/posrefs/$guide.png")
  tmp=$(mktemp)
  curl -sS https://api.openai.com/v1/images/edits -H "Authorization: Bearer $OPENAI_API_KEY" \
    -F "model=$IMAGE_MODEL" "${imgs[@]}" -F "prompt=<prompts/$k.txt" -F "size=$size" -F quality=high -o "$tmp"
  python3 -c '
import base64, json, sys
d = json.load(open(sys.argv[1]))
if "error" in d:
    sys.exit("FAILED %s: %s" % (sys.argv[3], d["error"].get("message")))
open(sys.argv[2], "wb").write(base64.b64decode(d["data"][0]["b64_json"]))
print("wrote", sys.argv[2])
' "$tmp" "$OUT/$k.png" "$k"
  status=$?
  rm -f "$tmp"
  return $status
}
export -f draw
echo "model $IMAGE_MODEL, ${#poses[@]} poses"
printf '%s\n' "${poses[@]}" | xargs -P 4 -I{} bash -c 'draw {}'
