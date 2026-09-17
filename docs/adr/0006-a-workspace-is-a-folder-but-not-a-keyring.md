# A workspace is a folder, but not a keyring

Opening a folder in Flux gives it a `.flux` directory, as an IDE gives one `.idea`, and that
directory holds what belongs to the work: the stream grouping, and the session — which tabs,
which branches of the tree, which terminals. Switching folders switches all of it.

Connections do not go in there. They carry access tokens in the clear (docs/adr/0005), and a
workspace folder is usually a git checkout: the file would be one forgotten `.gitignore` line
away from being published, and that line would have to be remembered in every repository
anybody ever opens. Connections stay in the config directory, where exactly one copy exists
and one set of permissions guards it. A workspace names the connections it works with; it
does not hold them.

## Consequences

Reaching into a folder the person chose is done by three commands that can only see
`<folder>/.flux`: read one file, write one file, say whether the directory exists. The
webview can already run arbitrary commands, which is reason enough not to hand it a general
filesystem API as well.

The word "workspace" used to be banned in the glossary, because `workspace.json` meant
"what was open". That file is `session.json` now, and the glossary defines both terms, so a
sentence about one can no longer be read as a sentence about the other.
