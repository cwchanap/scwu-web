#!/bin/bash
# Upload the exported art/audio and the generated data to the R2 bucket that
# the Cloudflare build and the deployed game read from. Run `bun run assets`
# first. Needs the AWS CLI and an R2 S3 API token:
#
#   export R2_ACCOUNT_ID=... R2_BUCKET=... \
#          AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
#   scripts/upload_r2.sh
#
# The files the game loads (the packs, the stage music and the DOM's art: the
# `files` of src/game/generated/assets-version.json) go under the export's
# version, `<version>/`, with `Cache-Control: public, max-age=31536000,
# immutable`. A new export is a new prefix, and nothing is deleted, so a
# deployed build or an open tab keeps the version it was built with. Old
# versions and the legacy root-level objects are pruned by hand (README). The
# two tarballs stay at the bucket root with `no-cache`; generated.tar.gz goes up
# last.
set -euo pipefail
: "${R2_ACCOUNT_ID:?set R2_ACCOUNT_ID}" "${R2_BUCKET:?set R2_BUCKET}"

export AWS_DEFAULT_REGION=auto
# Newer AWS CLIs checksum every upload; R2's S3 API supports only some
# checksum types, so ask for one only where the API requires it.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
endpoint="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"

# An export that did not finish leaves no .inputs (export_assets.py removes it
# before writing and restores it after): the generated JSON could already be
# new while the packs and the manifest are still old.
if [ ! -f src/game/generated/.inputs ]; then
  echo "src/game/generated/.inputs is missing; the last export did not finish — rerun bun run assets" >&2
  exit 1
fi

# The version and the published files come from the export's manifest, not
# from a scan of the source: the same list the tests and the bucket use. One
# pass prints the version, then the keys rehashed as assets_version() in
# export_assets.py computes them (keep the two in step), then the keys.
manifest=src/game/generated/assets-version.json
if ! published=$(python3 - "$manifest" <<'PY'
import hashlib, json, sys
manifest = json.load(open(sys.argv[1]))
digest = hashlib.sha256()
missing = []
for name in manifest["files"]:
    digest.update(name.encode("utf8"))
    try:
        digest.update(open(f"public/assets/{name}", "rb").read())
    except OSError:
        missing.append(name)
print(manifest["version"])
print(digest.hexdigest()[:16])
print("\n".join(manifest["files"]))
if missing:
    sys.exit("published files missing from public/assets: " + ", ".join(missing))
PY
); then
  echo "rerun bun run assets before uploading" >&2
  exit 1
fi
version=$(head -n1 <<<"$published")
actual=$(sed -n 2p <<<"$published")
includes=()
while IFS= read -r file; do includes+=(--include "$file"); done < <(tail -n +3 <<<"$published")

# The version must still describe the bytes on disk: an export that stopped
# after rewriting packs but before writing the manifest would otherwise put
# files the version doesn't cover under an immutable prefix. Refuse to upload.
if [ "$actual" != "$version" ]; then
  echo "public/assets does not hash to $version; rerun bun run assets before uploading" >&2
  exit 1
fi

# Only the listed files: exclude everything, then include each one. No --delete.
aws s3 sync public/assets "s3://$R2_BUCKET/$version/" --endpoint-url "$endpoint" --only-show-errors \
  --cache-control "public, max-age=31536000, immutable" --exclude '*' "${includes[@]}"

# The generated JSON is the Cloudflare build's input (build.sh) and the
# fixtures are the unit tests' (CI: .github/scripts/fetch-generated.sh), since
# scwu-web-handoff/ is not in git. Upload generated last: once it exists, the
# art and the fixtures are already there.
tarball=$(mktemp)
fixtures=$(mktemp)
trap 'rm -f "$tarball" "$fixtures"' EXIT
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$fixtures" -C src/game/__fixtures__ .
aws s3 cp "$fixtures" "s3://$R2_BUCKET/fixtures.tar.gz" --endpoint-url "$endpoint" \
  --cache-control no-cache
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$tarball" -C src/game/generated .
aws s3 cp "$tarball" "s3://$R2_BUCKET/generated.tar.gz" --endpoint-url "$endpoint" \
  --cache-control no-cache
