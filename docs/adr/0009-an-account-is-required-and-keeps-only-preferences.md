# An account is required, and it keeps only preferences

Flux had no accounts: everything lived on the machine it was set up on. It now asks everyone
to sign in, and keeps the person's preferences with their account, so a second Mac opens the
way the first one was left. There is still no server of ours. Supabase is the account service,
the email sender and the one table, and the app talks to it directly with its public key;
every row is behind row-level security, readable and writable by its owner alone.

Signing in is an email with a link. The link comes back to the app through its `flux://`
scheme and is completed with PKCE, so it signs in only the Mac that asked for it — a link
forwarded or opened on a phone does nothing. Every launch asks Supabase whether the session on
this machine is still good before the window opens; a session in storage is not taken at its
word, and a Supabase that cannot be reached keeps the window closed with a way to try again.

## What syncs, and what never does

Preferences sync: appearance, the tree, the editor, results, the terminal, updates, the MCP
server, Jira and the advanced settings. Connections never do — not their tokens, and not their
URLs either — and neither do projects, saved queries or the stage addresses replay sends to.
Those name internal servers and hold credentials, and they are tied to connection ids that mean
nothing on another machine. They stay in the config directory and the workspace, as before.

## Consequences

Flux cannot be used without an account, and cannot be opened at all while Supabase is
unreachable — on a plane, behind a network that blocks it, or during an outage of theirs. That
is the cost of checking the session every launch rather than trusting a cached one, and it was
chosen knowingly; a grace period for a session verified recently is the change to make if it
starts costing more than it protects.

Supabase's own email allows a handful of messages an hour and delivers only to the project's
members. Anyone else signing in needs a real SMTP provider configured on the project. The
project's auth settings, email template and schema live in `supabase/` and are applied with the
Supabase CLI, so the setup can be read and redone rather than remembered.

An account can delete its synced preferences from Settings. Deleting the account itself needs
a privileged call — a Supabase Edge Function — which is not built yet.
