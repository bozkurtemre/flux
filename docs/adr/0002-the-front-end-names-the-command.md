# The front end names the command, and the webview stays unsandboxed

The terminal's Rust side takes the command and the working directory from the front end and
runs them, and the window keeps `csp: null`. The narrower design — the front end names only
a project, and Rust builds the command from the stored project folder — was on the table and
rejected: this is a single-user local tool, and the wider surface leaves room for the
"open a terminal running X here" features that motivated the panel in the first place.

## Consequences

Any script that executes in the webview can run any command on the machine, so the defence
is that no foreign script ever executes there. The load-bearing rule is that **log content
is never rendered as HTML**: Graylog fields reach the screen as React text, escaped, and
nothing in `src/` uses `dangerouslySetInnerHTML` or `innerHTML`. Adding raw HTML rendering
to any view of log data is what turns this decision into a remote code execution bug.
