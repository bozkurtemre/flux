# The token lives in the keychain again

Supersedes [0005](0005-the-token-lives-in-the-settings-file.md).

0005 moved each connection's token out of the keychain and into `connections.json`, in the
clear, because the keychain grants access to a code signature and an unsigned build's signature
is the hash of its own contents: every update was a stranger to the keychain, and asked. It
named the thing that would reverse it, a Developer ID certificate, and releases are now signed
with one. The keychain recognises an app by its designated requirement, which for a Developer ID
build is the bundle identifier and the team, so one release is the same app to it as the next and
the grant survives the update. The tokens are back in the login keychain.

Each token is a generic password under the service `Flux`, with the connection's id as the
account, where Keychain Access shows it. It is the legacy login keychain, not the data
protection keychain: that one wants a provisioning profile and a keychain access group, which
an app distributed outside the App Store would have to be rebuilt around for no gain here. The
Rust side talks to the Security framework directly rather than through a cross-platform crate,
since Flux is a Mac app and the crate's other stores were dead weight.

## Consequences

`connections.json` holds `secretStorage: "keychain"` in each token's place. A save writes to the
keychain only a token it does not already hold, removes the entry of a connection that lost its
token or was deleted, and leaves alone a connection whose token could not be read at launch, so
a keychain that was briefly unavailable is not mistaken for a token removed.

When the keychain refuses a token, the token stays in `connections.json` and the next save tries
again. Losing a token is worse than keeping it in a file for a while, so the file can still hold
one, and the rule that it is not to be committed, shared or synced stays.

An install from before moves its tokens on the first launch of the signed release: they are read
from the file, written to the keychain, and removed from the file once the keychain has them.
Nothing has to be entered again. The release that does this is forced (docs/adr/0010), so no
copy stays behind on the file.

A build that is not signed with the same identity is asked once for each token, as every build
was under 0005's reasoning. `make dev-signed` signs dev builds, and "Always Allow" then holds for
the builds signed the same way. A downgrade to a release before 0.36 finds no token in the file
and asks for it again; forcing the update makes that a deliberate act.
