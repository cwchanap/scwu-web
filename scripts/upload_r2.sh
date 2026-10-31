#!/bin/bash
# Upload the exported art/audio and the generated data to the R2 bucket that
# the Cloudflare build and the deployed game read from. Run `bun run assets`
# first. Needs the AWS CLI and an R2 S3 API token:
#
#   export R2_ACCOUNT_ID=... R2_BUCKET=... \
#          AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
#   scripts/upload_r2.sh
#
# Re-running uploads only what changed.
set -euo pipefail
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}" "${R2_BUCKET:?set R2_BUCKET}"

export AWS_DEFAULT_REGION=auto
# Newer AWS CLIs checksum every upload; R2's S3 API supports only some
# checksum types, so ask for one only where the API requires it.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
endpoint="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# The art and audio go to the bucket root: ASSET_BASE points there.
aws s3 sync public/assets "s3://$R2_BUCKET/" --endpoint-url "$endpoint" --only-show-errors

# The generated JSON is the Cloudflare build's input (build.sh),
# since scwu-web-handoff/ is not in git. Upload it last: once it exists, the
# art is already there.
tarball=$(mktemp)
trap 'rm -f "$tarball"' EXIT
COPYFILE_DISABLE=1 tar -czf "$tarball" -C src/game/generated .
aws s3 cp "$tarball" "s3://$R2_BUCKET/generated.tar.gz" --endpoint-url "$endpoint"
