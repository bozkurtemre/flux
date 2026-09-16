# Terminal sessions outlive the app

Flux is otherwise a program with no server behind it: `CLAUDE.md` says there is no database
and no background service, and everything it knows it re-reads from Graylog or from its own
files. The terminal breaks that rule on purpose. Sessions run under tmux, so the work you
left in a project folder is still there after Flux quits and restarts, which is the whole
point of having the terminal next to the logs: a long-running CLI beside a query you are
still refining.

## Considered options

A plain PTY per terminal tab, with no multiplexer, was the smaller build and kept the "no
background service" rule intact. It loses the session the moment the app closes, which
turns every restart of Flux into a restart of whatever was running.

## Consequences

Quitting Flux with sessions open asks whether to kill them, and the answer can be
remembered as a preference. Closing a tab on purpose kills its shell; hiding the panel does
not. A machine without tmux still gets a terminal, without the persistence, and says so.
