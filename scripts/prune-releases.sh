#!/bin/sh
# Takes the installers off every GitHub release but the newest N, so that an old version cannot
# be downloaded and installed from there — the same rule the update bucket keeps (scripts/r2.mjs
# prune). The releases themselves stay, with their notes; only their files go. Run after a
# release is published, by the release workflow and by scripts/release-local.sh alike.
#
#   scripts/prune-releases.sh [keep-newest=2] [--dry-run]
set -eu

keep=2
dry=
for arg in "$@"; do
  case "$arg" in
  --dry-run) dry=1 ;;
  *) keep="$arg" ;;
  esac
done

# every release that names a version, newest first, as versions rather than as text
versions=$(gh release list --limit 200 --json tagName -q '.[].tagName' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sed 's/^v//' | sort -t. -k1,1nr -k2,2nr -k3,3nr | sed 's/^/v/')
n=0
for tag in $versions; do
  n=$((n + 1))
  [ "$n" -le "$keep" ] && continue
  for name in $(gh release view "$tag" --json assets -q '.assets[].name'); do
    if [ -n "$dry" ]; then
      echo "would delete $tag $name"
    else
      gh release delete-asset "$tag" "$name" -y
      echo "deleted $tag $name"
    fi
  done
done
echo "kept the files of the newest $keep releases"
