#!/bin/bash
# Build SHUWA's sprite clips and the preview page from the drawings in out/raw (see draw.sh).
#   bash art/shuwa/build.sh
# Each batch builds on the one before: round7/ (idle, walk, transform, SPECIUM) -> b1 body -> b2 attacks
# -> b3 specials -> b4 effects and supers. The last build, out/b4/, holds every clip (frames.json and frames);
# the page is out/shuwa-animations.html. Needs python3 with numpy, scipy, pillow and opencv-python,
# and the game's export: its sprites (public/assets; ASSETS overrides the path) and the donors' move scripts
# (src/game/generated; GENERATED overrides it), which tools/donor_data.py copies into out/data/.
set -euo pipefail
# A relative ASSETS or GENERATED is read from where the command runs, so both are made absolute before the cd.
abs() { case $1 in /*) echo "$1" ;; *) echo "$PWD/$1" ;; esac; }
A=$(abs "${ASSETS:-$(dirname "$0")/../../public/assets}")
G=$(abs "${GENERATED:-$(dirname "$0")/../../src/game/generated}")
cd "$(dirname "$0")"
python3 -I tools/donor_data.py "$G" out/data
python3 -I tools/b1.py out/raw refs round7 out/b1
python3 -I tools/b2.py out/raw refs out/b1 out/b2 out/data/ryuko.json "$A/ryuko"
python3 -I tools/b3.py out/raw refs out/b2 out/b3 out/data/donors.json out/data/ryuko.json "$A"
python3 -I tools/b4.py out/b3 out/b4 out/raw
python3 -I tools/build_page.py out/b4 "$A" out/shuwa-animations.html
