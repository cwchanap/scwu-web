#!/bin/bash
# `bun run build`. Cloudflare's git build (Workers Builds sets WORKERS_CI)
# cannot export the game's data: scwu-web-handoff/ is not in git. There it
# fetches the tarball upload_r2.sh left in the R2 bucket instead.
# VITE_ASSET_BASE, the bucket's public URL, is a build variable set in the
# Cloudflare dashboard. Anywhere else it exports, type-checks and builds.
set -euo pipefail

script_sha() {
  # The exporter fingerprint: script bytes, then the committed name PNG it reads.
  if command -v sha256sum >/dev/null 2>&1; then
    cat scripts/export_assets.py art/dora/name.png | sha256sum
  else
    cat scripts/export_assets.py art/dora/name.png | shasum -a 256
  fi | awk '{print $1}'
}

if [ -n "${WORKERS_CI:-}" ]; then
  : "${VITE_ASSET_BASE:?set VITE_ASSET_BASE to the public URL of the R2 bucket}"
  mkdir -p src/game/generated
  curl -fsSL "${VITE_ASSET_BASE%/}/generated.tar.gz" | tar -xz -C src/game/generated
  # generated.tar.gz is mutable and lives outside git: refuse to build on data
  # a different export_assets.py produced (a missed upload_r2 run, or a rebuild
  # of an older commit against today's tarball).
  if [ "$(cat src/game/generated/.exporter 2>/dev/null || true)" != "$(script_sha)" ]; then
    echo "generated.tar.gz does not match this commit's scripts/export_assets.py; run bun run upload:r2 first" >&2
    exit 1
  fi
else
  bun run assets
  bun run check
fi
bunx vite build
