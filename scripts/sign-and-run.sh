#!/bin/sh
# Cargo runner for `make dev-signed`: sign the binary cargo has just linked, then run it.
#
# The keychain lets in an app by its code signature, and cargo re-links a differently-hashed
# ad-hoc binary on every build, so an unsigned dev run is a new caller each time and asks for
# the connection tokens again. Signed here, between the link and the run, with the release's
# Developer ID and its bundle identifier, the development build is the same app to the
# keychain as the release that stored the tokens (docs/adr/0012). Cargo calls a runner as
# `<runner> <binary> <args...>`.
set -e
codesign --force --sign "${SIGN_ID:?SIGN_ID is required}" --identifier "${BUNDLE_ID:?BUNDLE_ID is required}" "$1" 2>/dev/null ||
  { echo "could not sign $1 as $SIGN_ID" >&2; exit 1; }
exec "$@"
