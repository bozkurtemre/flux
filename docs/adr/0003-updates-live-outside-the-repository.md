# Updates live outside the repository

Flux's source is private and will stay that way, which leaves an in-app updater nowhere to
read from: listing a private repository's releases and downloading their assets both need a
credential, and the only credential that would reach an installed copy is one shipped inside
it. GitHub has no "releases only" permission — the narrowest token that can read a release
asset can read the whole source tree — so an embedded token would hand the code to everyone
holding the app. Updates are therefore published to a Cloudflare R2 bucket behind
`updates.emreb.dev`, and the app reads them anonymously over HTTPS.

## Consequences

The installable `.dmg` lives there too: an updater that works for someone who cannot get the
first install is a strange thing to build. The repository keeps its releases for the tag, the
changelog and the CI record, and they stay private.

Nothing about the bucket is secret, so nothing about it is guarded: the guard is the
signature. Every package is signed with a key that exists in two places — a GitHub secret and
the author's own backup — and the public half is compiled into the app, which refuses to
install anything it cannot verify. Losing the private key means installed copies can never be
updated again, which is why the backup is not optional.
