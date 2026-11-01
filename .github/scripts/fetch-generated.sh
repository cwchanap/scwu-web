#!/bin/bash
# CI has no scwu-web-handoff/, so `bun run assets` cannot run. Fetch what it
# would have written from the public R2 bucket instead, the way scripts/build.sh
# does on Workers Builds: generated.tar.gz (build, check, e2e) and
# fixtures.tar.gz (the unit tests' Python oracle traces). Both come from
# scripts/upload_r2.sh. Needs VITE_ASSET_BASE, the bucket's public URL.
set -euo pipefail
: "${VITE_ASSET_BASE:?set the VITE_ASSET_BASE repository variable to the public URL of the R2 bucket}"
base="${VITE_ASSET_BASE%/}"

fetch() { # name, directory
  mkdir -p "$2"
  curl -fsSL --retry 3 "$base/$1.tar.gz" | tar -xz -C "$2"
}
fetch generated src/game/generated
fetch fixtures src/game/__fixtures__

# The tarballs are mutable and live outside git: refuse data that a different
# export_assets.py produced (a missed `bun run upload:r2`).
want=$(sha256sum scripts/export_assets.py | awk '{print $1}')
have=$(cat src/game/generated/.exporter 2>/dev/null || true)
if [ "$have" != "$want" ]; then
  echo "generated.tar.gz does not match this commit's scripts/export_assets.py; run bun run assets && bun run upload:r2" >&2
  exit 1
fi
