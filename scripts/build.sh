#!/bin/bash
# `bun run build`. Cloudflare's git build (Workers Builds sets WORKERS_CI)
# cannot export the game's data: scwu-web-handoff/ is not in git. There it
# fetches the tarball upload_r2.sh left in the R2 bucket instead.
# VITE_ASSET_BASE, the bucket's public URL, is a build variable set in the
# Cloudflare dashboard. Anywhere else it exports, type-checks and builds.
set -euo pipefail

if [ -n "${WORKERS_CI:-}" ]; then
  : "${VITE_ASSET_BASE:?set VITE_ASSET_BASE to the public URL of the R2 bucket}"
  mkdir -p src/game/generated
  curl -fsSL "${VITE_ASSET_BASE%/}/generated.tar.gz" | tar -xz -C src/game/generated
else
  bun run assets
  bun run check
fi
bunx vite build
