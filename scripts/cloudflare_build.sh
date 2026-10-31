#!/bin/bash
# The Cloudflare (Workers Builds) build command. The repo cannot export its own
# data (scwu-web-handoff/ is not in git), so fetch the tarball that
# upload_r2.sh left in the R2 bucket, then build. VITE_ASSET_BASE, the bucket's
# public URL, is a build variable set in the Cloudflare dashboard.
set -euo pipefail
: "${VITE_ASSET_BASE:?set VITE_ASSET_BASE to the public URL of the R2 bucket}"

mkdir -p src/game/generated
curl -fsSL "${VITE_ASSET_BASE%/}/generated.tar.gz" | tar -xz -C src/game/generated
bunx vite build
