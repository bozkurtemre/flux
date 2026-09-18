# The shell is the default engine

[0001](0001-terminal-sessions-outlive-the-app.md) put every terminal under tmux, because a
session that survives the app is the point of having the terminal beside the logs. It also
made tmux a requirement for a feature most people meet before they have an opinion about
multiplexers: on a machine without it the first terminal opened, warned, and worked less
well than the one in any other window on the screen.

The engine is now named in **Settings › Terminal**, `shell` or `tmux`, and a new install
gets `shell`. Persistence is opt-in rather than assumed, and choosing tmux is where the
machine is asked whether it has it — with the command to install it if it does not.

## Considered options

Keeping tmux as the default and installing it for people was never on the table: Flux does
not install software. Keeping the tick box and defaulting it off would have done the same
job with a worse name — "Persist sessions with tmux" describes a consequence, and the thing
being chosen is an engine, which is what the next one will be too.

## Consequences

0001 still holds for the tmux engine, and its wording about a machine without tmux is now
about a choice rather than about an accident. An install that had the tick box on keeps
tmux: `withDefaults` reads the old `useTmux` and writes the engine it meant. The quit
prompt only appears for sessions that can outlive the app, so with the shell engine
quitting closes the terminals without asking, as it always did when tmux was missing.
