# Security policy

## Supported versions

Only the latest release is supported. Flux updates itself, and a fix ships as a new release
rather than a patch to an old one.

## Reporting a vulnerability

Please do not open a public issue. Report it privately through
[GitHub's security advisories](https://github.com/bozkurtemre/flux/security/advisories/new).

Include what an attacker can do, the steps to reproduce it, and the Flux version and macOS
version you saw it on. You will get an answer within a week. Once a fix is released, the
advisory is published with credit to you, unless you would rather not be named.

## What is in scope

Flux holds credentials and runs a webview that can start commands, so these matter most:

- **Tokens leaving the machine.** A Graylog token or Kibana API key reaching anywhere other
  than its own server: a log, an export, a link, synced preferences, or an MCP answer.
- **Code running from log content.** Log fields are shown only as escaped text. Any way to
  have a log line, a field name or a pasted value run as HTML or script is a vulnerability.
- **The MCP server.** It listens on `127.0.0.1` and requires a bearer token. Reaching it without
  the token, from another machine, or getting it to write anything is in scope.
- **The updater.** Getting Flux to install an update that the release key did not sign.
- **The terminal and shell integration.** A command running that nobody typed.

## Out of scope

- **`connections.json` is readable by your user account.** Tokens are kept there in the clear,
  on purpose; [docs/adr/0005](docs/adr/0005-the-token-lives-in-the-settings-file.md) explains
  why. Protect the file the way you would an SSH key.
- **Releases are not signed with an Apple Developer ID**, so macOS asks before the first launch.
- **Anything that needs an attacker who already controls your user account.**
