#!/bin/bash
# Upload the exported art/audio and the generated data to the R2 bucket that
# the Cloudflare build and the deployed game read from. Run `bun run assets`
# first. Needs the AWS CLI and an R2 S3 API token:
#
#   export R2_ACCOUNT_ID=... R2_BUCKET=... \
#          AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
#   scripts/upload_r2.sh
#
# Re-running syncs the art and audio that changed and deletes keys the export
# no longer writes (the two tarballs are exempt); the tarballs are rebuilt and
# copied every run. All go up with `Cache-Control: no-cache` so the bucket's
# custom domain revalidates instead of serving a stale copy of an overwritten
# key from Cloudflare's cache.
set -euo pipefail
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}" "${R2_BUCKET:?set R2_BUCKET}"

export AWS_DEFAULT_REGION=auto
# Newer AWS CLIs checksum every upload; R2's S3 API supports only some
# checksum types, so ask for one only where the API requires it.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
endpoint="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# The art and audio go to the bucket root: ASSET_BASE points there. --delete
# unpublishes files the export dropped (export_images unlinks stale PNGs), and
# the excludes keep that delete away from the tarballs, which the same
# bucket root holds until the cps below recreate them. Finder's .DS_Store stays
# out of the public bucket; an excluded key is also exempt from --delete, so
# remove one already there with `aws s3 rm`.
aws s3 sync public/assets "s3://$R2_BUCKET/" --endpoint-url "$endpoint" --only-show-errors \
  --cache-control no-cache --delete --exclude generated.tar.gz --exclude fixtures.tar.gz \
  --exclude '*.DS_Store'

# The generated JSON is the Cloudflare build's input (build.sh) and the
# fixtures are the unit tests' (CI: .github/scripts/fetch-generated.sh),
# since scwu-web-handoff/ is not in git. Upload generated last: once it
# exists, the art and the fixtures are already there.
tarball=$(mktemp)
fixtures=$(mktemp)
trap 'rm -f "$tarball" "$fixtures"' EXIT
COPYFILE_DISABLE=1 tar -czf "$fixtures" -C src/game/__fixtures__ .
aws s3 cp "$fixtures" "s3://$R2_BUCKET/fixtures.tar.gz" --endpoint-url "$endpoint" \
  --cache-control no-cache
COPYFILE_DISABLE=1 tar -czf "$tarball" -C src/game/generated .
aws s3 cp "$tarball" "s3://$R2_BUCKET/generated.tar.gz" --endpoint-url "$endpoint" \
  --cache-control no-cache
