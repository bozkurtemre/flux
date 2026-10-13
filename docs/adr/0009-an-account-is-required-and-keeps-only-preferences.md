# An account is required, and it keeps only preferences

Flux had no accounts: everything lived on the machine it was set up on. It now asks everyone
to sign in, and keeps the person's preferences with their account, so a second Mac opens the
way the first one was left. There is still no server of ours. Supabase is the account service,
the email sender and the one table, and the app talks to it directly with its public key;
every row is behind row-level security, readable and writable by its owner alone.

Signing in is an email with a link. The link comes back to the app through its `flux://`
scheme and is completed with PKCE, so it signs in only the Mac that asked for it — a link
forwarded or opened on a phone does nothing. Every launch asks Supabase whether the session on
this machine is still good, but behind the IDE rather than in front of it: a session in storage
opens the window at once, and one Supabase refuses ends in a dialog over it that offers signing
in again or quitting. Without a session in storage the sign-in screen is the window.

## What syncs, and what never does

Preferences sync: appearance, the tree, the editor, results, the terminal, updates, the MCP
server, Jira and the advanced settings. Connections never do — not their tokens, and not their
URLs either — and neither do projects, saved queries or the stage addresses replay sends to.
Those name internal servers and hold credentials, and they are tied to connection ids that mean
nothing on another machine. They stay in the config directory and the workspace, as before.

## Consequences

Flux cannot be used without an account. A Supabase that cannot be reached does not close a
signed-in IDE — on a plane, behind a network that blocks it, or during an outage of theirs the
session in storage stands until Supabase answers again — so the check revokes a refused session
rather than proving every launch is online. Preferences pulled behind the IDE are written to disk
and take effect from the next launch.

Supabase's own email allows two messages an hour and delivers only to the project's members,
so the links go out through Resend instead, from `noreply@flux.emreb.dev`, at up to a hundred an
hour. Its key is not in the repository: `config push` reads it from `RESEND_API_KEY`. The
project's auth settings, email template and schema live in `supabase/` and are applied with the
Supabase CLI, so the setup can be read and redone rather than remembered.

An account can delete its synced preferences from Settings. Deleting the account itself needs
a privileged call — a Supabase Edge Function — which is not built yet.
