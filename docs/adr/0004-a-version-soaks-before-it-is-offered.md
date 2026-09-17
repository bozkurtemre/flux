# A version soaks before it is offered

A release can be wrong in ways no test catches, and the window to notice is the first few
minutes after publishing. An installed copy therefore ignores a version until it has been
downloadable for longer than its soak time, which the update manifest carries per release and
which defaults to ten minutes. Withdrawing a release in that window is a matter of pointing
the manifest back at the previous version; the files are never deleted, so the old one is
still there to point at.

## Consequences

The manual "Check for Updates…" honours the soak as well. Offering a version to whoever asked
explicitly, while hiding it from everyone else, would leave the one person most likely to be
testing the release as the only one exposed to it. Publishing with a soak of zero is the way
to ask for it immediately, and the manifest is where that is decided, not the app — an
installed copy has no setting that makes it take updates earlier.
