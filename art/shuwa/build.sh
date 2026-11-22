#!/bin/bash
# Build SHUWA's sprite clips and the preview page from the drawings in out/raw (see draw.sh).
#   bash art/shuwa/build.sh
# Each batch builds on the one before: round7/ (idle, walk, transform, SPECIUM) -> b1 body -> b2 attacks
# -> b3 specials -> b4 effects and supers. The last build, out/b4/, holds every clip (frames.json and frames);
# the page is out/shuwa-animations.html. Needs python3 with numpy, scipy, pillow and opencv-python,
# and the game's exported sprites (public/assets; ASSETS overrides the path).
set -euo pipefail
cd "$(dirname "$0")"
A=${ASSETS:-../../public/assets}
python3 -I tools/b1.py out/raw refs round7 out/b1
python3 -I tools/b2.py out/raw refs out/b1 out/b2 tools/data/ryuko.json "$A/ryuko"
python3 -I tools/b3.py out/raw refs out/b2 out/b3 tools/data/donors.json tools/data/ryuko.json "$A"
python3 -I tools/b4.py out/b3 out/b4 out/raw
python3 -I tools/build_page.py out/b4 "$A" out/shuwa-animations.html
