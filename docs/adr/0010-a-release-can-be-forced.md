# A release can be forced

An update could always be put off: "Later" kept the version known and the old one running. That
is right for most releases and wrong for a few — the one that fixes a version doing damage, or
the one after which an older copy no longer works with the account service. Such a release is
now published as forced, and every copy older than it gives its whole window over to the update
until it is installed: what changed since that copy's version, and one button.

What is forced is a minimum version, not a release. The manifest carries `minimumVersion`, and
the release script copies it forward from the manifest it replaces, so a forced update stays
forced after the next ordinary release; `make release-local FORCE=1` raises it to the version
being published. The manifest also carries the last releases' notes, so a copy several versions
behind is shown all of them, not only the newest.

## Consequences

A forced release soaks like any other (docs/adr/0004). Being forced makes a broken release more
harmful, not less, so the window in which it can be withdrawn by pointing the manifest back stays
open; a forced release is only enforced once it is offerable.

The check runs at launch, before signing in, and every hour while Flux is open. A manifest that
cannot be read forces nothing: the update service being unreachable is no reason to lock anyone
out, and signing in already keeps a copy that cannot reach the internet closed.

Lowering the minimum again is editing the manifest by hand. The script only ever raises it,
because a minimum that falls back by accident would let the version it was meant to stop run.
