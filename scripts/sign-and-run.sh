#!/bin/sh
# Cargo runner for `make dev-signed`: sign the binary cargo has just linked, then run it.
#
# The Keychain binds "Always Allow" to the signature of the process that asked, and cargo
# re-links a differently-hashed ad-hoc binary on every build, so an unsigned dev run is a
# new caller each time and the grant never survives. Signing here, between the link and the
# run, is the only point where the binary tauri actually launches can carry a stable
# identity. Cargo calls a runner as `<runner> <binary> <args...>`.
set -e
codesign --force --sign "${SIGN_ID:?SIGN_ID is required}" \
	--identifier "${BUNDLE_ID:?BUNDLE_ID is required}" "$1" 2>/dev/null
exec "$@"
