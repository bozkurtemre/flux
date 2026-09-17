# The Graylog token lives in the settings file

Access tokens were kept in the OS credential store, and the settings file held only a
pointer. The Keychain grants access to a binary rather than to an application: the grant is
bound to the code signature, an unsigned build's identity is the hash of its own contents,
and every update changes it. So each update earned a fresh permission dialog for a token the
same app had stored itself. Tokens are now written into `connections.json` with the URL they
belong to, in the clear, and the credential store is only read to empty it.

## Consequences

`connections.json` is a credential file now. Anything that can read the home directory can
read the token, and any backup or sync that takes the config directory takes it too. The
README says so where it used to say the opposite, and `CLAUDE.md` carries the rule that the
file must not be committed or shared.

An existing install loses nothing: on the next launch the token is read back out of the
credential store, written into the file, and the entry removed, so the prompt stops without
anyone having to re-enter anything.

This is reversible, and the thing that would justify reversing it is a Developer ID
certificate. With a stable signature the Keychain grant survives updates, the prompt
disappears on its own, and the reason for keeping the token on disk goes with it.
