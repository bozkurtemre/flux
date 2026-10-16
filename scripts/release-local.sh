#!/usr/bin/env bash
# The release workflow, run from this machine: for when GitHub Actions cannot run it. It does
# what .github/workflows/release.yml does, in the same order and with the same rules —
#
#   the quality gate, a universal build with the updater signed, the packages to R2 and the
#   manifest after them (so the soak starts once the files are downloadable, ADR 0004), the
#   versions before the previous one pruned, and the GitHub release last.
#
# The keys are the ones the workflow holds as secrets, kept in a folder outside the repository:
#
#   flux.key       the updater's private key, as `tauri signer generate` printed it
#   password.txt   its password
#   r2.env         R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and BUCKET
#   notary.env     APPLE_API_ISSUER and APPLE_API_KEY: an App Store Connect API key, to notarize
#   AuthKey_<APPLE_API_KEY>.p8   that key's private half, as App Store Connect gave it
#
# and a "Developer ID Application" certificate in the login keychain. A release is signed with it
# and notarized, the app and the disk image both, or it is not released: nothing tells anyone to
# clear the quarantine flag any more, so an unsigned build would be one nobody can open.
#
# It releases the commit it is run on, which has to be the one the version was tagged at, so a
# release can never be built from something other than what its tag names. Running it again for
# the same version publishes the same files again and restarts that version's soak.
#
# FORCE=1 makes the release forced: once it has soaked, every older copy shows a full-window
# update and cannot be used until it installs it (docs/adr/0010).
set -euo pipefail

KEYS="${KEYS:-$HOME/Desktop/flux-updater-keys}"
cd "$(dirname "$0")/.."

version="$(node scripts/version.mjs)"
tag="v$version"
out=src-tauri/target/universal-apple-darwin/release/bundle
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------- what it releases
[ -z "$(git status --porcelain)" ] || { echo "the working tree is dirty; commit or stash first" >&2; exit 1; }
[ "$(git tag --points-at HEAD | grep -Fx "$tag" || true)" = "$tag" ] || {
  echo "HEAD is not $tag; run 'make bump-*' first, or check out the commit it tagged" >&2
  exit 1
}
for f in flux.key password.txt r2.env notary.env; do
  [ -s "$KEYS/$f" ] || { echo "missing $KEYS/$f (set KEYS= to the folder that holds the keys)" >&2; exit 1; }
done
# shellcheck disable=SC1091
source "$KEYS/r2.env"
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY BUCKET; do
  [ -n "${!v:-}" ] || { echo "$KEYS/r2.env does not set $v" >&2; exit 1; }
done
# shellcheck disable=SC1091
source "$KEYS/notary.env"
for v in APPLE_API_ISSUER APPLE_API_KEY; do
  [ -n "${!v:-}" ] || { echo "$KEYS/notary.env does not set $v" >&2; exit 1; }
done
APPLE_API_KEY_PATH="$KEYS/AuthKey_$APPLE_API_KEY.p8"
[ -s "$APPLE_API_KEY_PATH" ] || { echo "missing $APPLE_API_KEY_PATH, the API key's .p8" >&2; exit 1; }
identity="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application:/ {print $2; exit}')"
[ -n "$identity" ] || { echo 'no "Developer ID Application" certificate in the keychain' >&2; exit 1; }
export APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
notary() { xcrun notarytool "$@" --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER"; }

say "releasing $tag from this machine"

# ------------------------------------------------------------------------------ the tag itself
# the GitHub release hangs off it; both pushes do nothing when they are already there. The tag
# checked out on its own, as the check above suggests, has no branch to push, only the tag
if git symbolic-ref -q HEAD >/dev/null; then git push origin HEAD; fi
git push origin "$tag"

# -------------------------------------------------------------------------------- the checks
say "quality gate"
make --no-print-directory check

# --------------------------------------------------------------------------------- the build
say "building (universal, signed with $identity, notarized, updater signed)"
# with the identity and the API key in the environment, Tauri signs the app with the hardened
# runtime, has Apple notarize it and staples the ticket to it before it packs the update
APPLE_SIGNING_IDENTITY="$identity" \
  TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEYS/flux.key")" \
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(cat "$KEYS/password.txt")" \
  pnpm tauri build --target universal-apple-darwin --bundles app,dmg \
  --config '{"bundle":{"createUpdaterArtifacts":true}}'

app="$out/macos/Flux.app"
zip="$out/macos/Flux-$tag-macos.zip"
dmg="$out/dmg/Flux_${version}_universal.dmg"

# the disk image is what a browser downloads and quarantines: it is signed, notarized and stapled
# on its own, so it opens without a word too
say "notarizing the disk image"
codesign --force --sign "$identity" --timestamp "$dmg"
notary submit "$dmg" --wait
xcrun stapler staple "$dmg"

# and nothing goes out that Gatekeeper would refuse
say "checking what Gatekeeper will see"
codesign --verify --deep --strict "$app"
spctl --assess --type execute "$app"
xcrun stapler validate "$app"
xcrun stapler validate "$dmg"
spctl --assess --type open --context context:primary-signature "$dmg"
checked="$(mktemp -d)"
tar -xzf "$out/macos/Flux.app.tar.gz" -C "$checked"
xcrun stapler validate "$checked/Flux.app"
rm -rf "$checked"
rm -f "$out"/macos/Flux-v*-macos.zip
(cd "$out/macos" && ditto -c -k --keepParent Flux.app "Flux-$tag-macos.zip")

notes="$(mktemp)"
manifest="$(mktemp)"
trap 'rm -f "$notes" "$manifest"' EXIT
node scripts/release-notes.mjs "$tag" >"$notes"

# ---------------------------------------------------------------------------- the update, R2
say "publishing the update"
immutable="public, max-age=31536000, immutable"
put() { node scripts/r2.mjs put "$BUCKET" "$1" "$2" "$3" "$4"; }
put "updates/$version/Flux.app.tar.gz" "$out/macos/Flux.app.tar.gz" application/gzip "$immutable"
put "updates/$version/Flux_${version}_universal.dmg" "$dmg" application/x-apple-diskimage "$immutable"

# the manifest being replaced carries the minimum version and the last releases' notes forward;
# FORCE=1 makes this release the minimum, so older copies cannot be used until they update
previous="$(curl -fsS "https://updates.emreb.dev/updates/latest.json?x=$RANDOM" 2>/dev/null || echo '{}')"
[ "${FORCE:-}" = 1 ] && say "this release is forced: every older copy must update to keep working"
PREVIOUS_MANIFEST="$previous" FORCE="${FORCE:-}" RELEASE_NOTES="$(cat "$notes")" node scripts/manifest.mjs \
  "$version" "$out/macos/Flux.app.tar.gz.sig" \
  "https://updates.emreb.dev/updates/$version/Flux.app.tar.gz" 10 >"$manifest"
put "updates/latest.json" "$manifest" application/json "public, max-age=60"

# the version on offer and the one before it, as the workflow keeps
node scripts/r2.mjs prune "$BUCKET" 2

# -------------------------------------------------------------------------- the GitHub release
say "GitHub release"
if gh release view "$tag" >/dev/null 2>&1; then
  # a second run for the same version replaces the files rather than failing on them
  gh release upload "$tag" "$zip" "$dmg" --clobber
  gh release edit "$tag" --notes-file "$notes"
else
  gh release create "$tag" --title "$tag" --notes-file "$notes" "$zip" "$dmg"
fi
# and only the newest release keeps its installers: the bucket keeps the one before for a rollback,
# but nobody should download an old version from GitHub
scripts/prune-releases.sh 1

say "$tag is out: $(curl -fsS "https://updates.emreb.dev/updates/latest.json?x=$RANDOM" | node -pe 'JSON.parse(require("fs").readFileSync(0)).version') is on offer"
