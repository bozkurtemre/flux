# Changelog

Notable changes per release. Versions follow [semantic versioning](https://semver.org);
`make bump-patch|minor|major` writes the version, commits and tags in one step.

## 0.20.0

### Added

- **An island over the title bar** for what is going on: queries still running, consoles
  following new messages, and watched queries with what their last round found. A pill that
  opens into a card, a row taking you to each; it is not there when nothing is going on, and
  Settings › Appearance turns it off.

## 0.19.0

### Added

- **A Help menu**, with macOS's search field at its top: Find Action, a Getting Started tour,
  the Query Language with every clause, Keyboard Shortcuts, and What's New from the changelog
  of the running version. Report a Problem and Copy Diagnostic Info carry the version and
  platform — never names or tokens — and the settings and cache folders open in Finder.
- **Start a Jira issue from a row or a pattern.** The create screen opens with the summary and
  a description already written: the stream, the time, the count, our frames of the trace, the
  entry and a link back to the view. Your browser is the one signed in; Flux keeps no Jira
  token. The site and project are set in Settings › Jira.
- **The team's saved queries travel in the set-up file**, for the projects being handed over,
  and arrive in the receiver's panel. Whether a query is watched stays behind.

## 0.18.0

### Added

- **Compare two rows, field by field.** Tick Compare in the value inspector on one row and then
  on another — from the same tab or any other — and a window shows the two side by side, the
  JSON message opened into its fields: red for what only the first has, green for what only the
  second has, and what they agree on folded away.
- **What was merged, on the timeline.** For a project with a GitHub repository, the pull
  requests merged across the range are drawn where they landed, each opening on a click. They
  come through the `gh` CLI signed in on this machine; Flux keeps no GitHub token.
- **⌘1–⌘8 go to a tab, and ⌘9 to the last one.**

## 0.17.0

### Added

- **Hand a set-up to someone in one file.** Settings › Projects exports the projects you choose,
  with the connections they stand on, and the other end takes it with Add from export. A
  connection travels as a name and a URL and never with its token; one already set up is
  recognised by its URL, and the page says which connections still need a token.
- **From a log line to the line of code.** The value inspector lists the files and lines a row
  names — a stack trace, usually — and each opens in your IDE at that line, in the project's
  checkout; so does a right-click on the line that holds one. The IDE and the path the code has
  on the servers are set in Settings › Projects.
- **The agent can see the window.** Two MCP tools reach into it: `current_view` answers with the
  tab in front and its selected row, and `open_query` opens a console there for you to look at.
- **Copy a logged request as cURL**, from the row menu, with authorization and cookies left out.
- **A link to a view.** The console copies a `flux://open` link to its stream, line and range,
  which opens in the receiver's Flux on their own connection to that Graylog.
- `make release-local` builds and publishes a release from this machine when the workflow
  cannot run.

## 0.16.0

### Added

- **A notification centre**, at the top of the right stripe: everything Flux says is kept
  after its balloon has gone, newest first, with whatever each notice offered still on it —
  dismissed one at a time or all at once. The button carries a dot in the colour of the worst
  thing waiting.
- **The whole result, handed to Claude.** The mark beside Export pastes the rows as they are
  on screen into the terminal in front, as a paste rather than a command.

### Changed

- The right dock holds one tool window at a time — notifications or saved queries — which is
  what its stripe was already implying.

## 0.15.0

### Added

- **⌘K clears the terminal**, as it does in every other terminal on the machine, and the
  Keymap page lists it along with ⌥F12.
- **The Fields panel has the stripe button** that used to say "More tool windows" and do
  nothing: it shows and hides the panel, which comes back the height it was left at.

### Changed

- **The terminal is a surface of its own** — framed and inset rather than running into the tab
  strip — a click anywhere on it puts the cursor in the shell, and its scrollbar is the app's
  rather than xterm's black gutter.

### Fixed

- **⌘V pastes into the terminal without macOS asking.** Intercepting the key to read the
  clipboard turned a paste the system had agreed to into a clipboard read it questions every
  time; xterm's own paste handling carries the text.
- **A terminal tab closes when its shell exits** instead of leaving a cursor blinking over
  nothing — without touching a tmux session that was asked to keep running.
- The value inspector's button cannot be pressed until a query has returned a row.

## 0.14.0

### Added

- **Copy a row as a code block.** Right-clicking Copy in the value inspector offers the
  fences Slack, Markdown and Jira each take, for the paste that usually follows reading a row.

## 0.13.0

### Added

- **A watched query says how loud it is.** Info, a warning or an error: the balloon takes
  that colour and glyph, the notification takes a mark, and the badge in the list says which
  it will be. A warning and an error make a sound outside the window, chosen in **Settings ›
  Advanced** from the ones macOS ships with, with a Test beside it; info stays silent.
- **A menu row can hold a menu.** Watching keeps two rows — Check every, Report as — and the
  choices live behind them, opening to the side with a tick on the one in force.

### Fixed

- Sending a notification asks macOS for permission first, so the Test button works the first
  time instead of doing nothing, and says so when notifications are turned off for Flux.

## 0.12.0

### Added

- **Each watched query looks as often as it deserves.** Fifteen seconds, a minute, five or
  fifteen, chosen on the query's right-click menu, with a default in **Settings › Advanced**
  for the ones that have no opinion. The bell in the list says which it is.

### Fixed

- **Counts were always zero.** Graylog refuses an aggregation with nothing to group by —
  which is exactly what a total is — and the refusal was swallowed: the footer quietly lost
  its total, the MCP tool answered zero, and a watched query never had anything to report.
  Counts now go through the views API, as the timeline already does.
- Following new messages updates the timeline as they arrive, instead of leaving it as a
  picture of when the query ran.

## 0.11.0

### Added

- **Watch a saved query.** Right-click one and Flux counts what has arrived since the last
  round, once a minute, telling you in a balloon and in a notification outside the window. It
  runs while Flux is open and not a moment longer — there is no service behind it.
- **An endpoint's console draws how it behaved**, not only how much it said: the 95th
  percentile of its duration and the share that failed, as two lines over the same buckets as
  the timeline.

## 0.10.0

### Added

- **Follow a request across every stream.** A request crosses services and each service writes
  to its own stream; the row menu picks the id they share — trace, request, correlation,
  transaction, session, order, iccid, or whichever column was right-clicked — and opens a
  console over every stream of that connection, an hour either side, oldest first, with the
  stream each line came from as a column. The value inspector offers the same on a right-click,
  on the selection or on the line under the pointer.
- **Message patterns.** `| patterns` masks what differs every time — ids, times, addresses,
  numbers — and counts the templates that are left, so five hundred lines of the same failure
  read as one line with a number beside it. Counted in the rows on screen, at no cost to
  Graylog.
- **Query history.** Every run is kept with its stream, the time and the rows it found: a
  History tab beside Saved, and a Queries section in ⇧⇧.
- **A Fields panel under the tree**: every field in the rows on screen, how many carry it, and
  its commonest values — click one to filter by it or out of it, or count by the field.
- **A date picker beside the ranges**, drawn here rather than by the system: a month to click
  a range across and a time of day for each end, to the second, in the zone the grid shows.
- **Folding in the value inspector**, so a message that is a JSON blob can be read a level at
  a time. On by default, and in Settings › Results.
- **Connections are checked every half minute** and the tree says which are answering, rather
  than which have had something loaded from them.

### Fixed

- The saved queries panel keeps the width it was dragged to.
- Turning the timeline off hides the one already on screen.
- Right-clicking a row no longer opens the value inspector.

## 0.9.0

### Added

- **A timeline over the results.** Messages per bucket across the range the console asked for;
  dragging across it narrows the search to what was dragged. Graylog 5.2's aggregation API has
  no time pivot, so this goes through the views API its own interface uses — two requests,
  asked for only while the timeline is shown. It folds away from its corner and turns off in
  **Settings › Results**.
- **Follow.** A toggle beside Execute, off when a tab opens: every two seconds the tab in front
  asks for what has arrived since its newest message and puts it on top, tinted for a moment.
  What you are reading stays where it is, selection included, instead of being pushed down.
- **Export.** The rows as they are on screen, in the columns and the order they are on screen,
  as CSV or JSON, wherever the save dialog says.
- **A right-click on a log row**: filter by the field under the pointer, exclude it, count by
  it, or open what was happening five minutes either side of the message. Copy the field, copy
  the row as JSON, or **Paste to Claude**, which types the row into the terminal in front as a
  paste — nothing is sent, the question is still yours to write.
- **The window a console searches can be written in its query**: `between <from> and <to>`,
  in ISO, beside the `group by` clauses. It is what "five minutes around this" writes, and it
  is saved with a saved query.
- Every menu carries icons.

### Changed

- **The terminal engine is chosen by name in Settings, and a new install gets the shell.** tmux
  is opt-in rather than assumed, and choosing it is where Flux checks whether the machine has
  one. An install that had the old tick box on keeps tmux. See
  [docs/adr/0007](docs/adr/0007-the-shell-is-the-default-engine.md).

### Fixed

- Right-clicking a row no longer opens the value inspector.

## 0.8.0

### Added

- **Saved queries.** A query you want back is kept with a name from the console toolbar or
  **⌘S**, and lives in a tool window of its own behind the second icon on the right stripe.
  Opening one opens the console for the stream it was saved against and runs it there. The
  panel filters by name, query and stream, and each entry has Open, Copy query, Rename and
  Delete on a right-click. A console shows a dot beside its tab while it holds edits that have
  not been saved.
  They belong to the work, so a workspace keeps its own in `.flux/queries.json`.

### Fixed

- **The window opens the size and in the place it was left**, maximised or full screen
  included, instead of 1440×900 every time.

## 0.7.0

### Added

- **An MCP server, for as long as the window is open.** Claude Code in a terminal can list
  the connections, list a connection's streams, search and count logs, and read a stream's
  endpoints, through the same connections the window uses. It is off until **Settings › MCP
  Server** turns it on, listens on the loopback interface only and takes a bearer token; the
  status bar carries the protocol's mark and hands out the client configuration.
- **Group by, written in the query.** `level:ERROR | group by httpStatusCode | group by route`
  searches as before and asks a separate aggregation per clause; each one gets its own table
  above the messages, in the grid's own shape, sortable by either column and collapsible down
  to its header. The leading pipe is optional when a clause is the whole line.
- **The arrow keys walk the result rows** once a row has been clicked, instead of moving the
  tree behind the grid.
- **Refresh** beside Execute in the console toolbar, on **⌘R**, which the window would
  otherwise take as a page reload.
- The terminal's **+** offers to add a project when none is defined yet, rather than opening
  an empty menu.

### Changed

- Every shortcut is shown in Flux's own tooltip rather than the browser's grey box.
- A grouped table, the accent swatches and the tab close button follow the rest of the
  chrome: the same header, gutter, striping and ring.

## 0.6.0

### Added

- **Workspaces.** Open a folder from the Flux menu in the title bar and that folder keeps its
  own stream grouping and its own layout — tabs, tree, terminals — in a `.flux` directory
  inside it, the way an IDE keeps `.idea`. Recent folders are listed there too. Access tokens
  deliberately stay out of it; **Settings › Workspace** says which connections a folder works
  with. See [docs/adr/0006](docs/adr/0006-a-workspace-is-a-folder-but-not-a-keyring.md).
- **The Connections menu** in the title bar: reconnect, disconnect or refresh every
  connection at once.
- **Tabs and grid columns can be dragged** into a different order, carried by the pointer,
  and the order is remembered with the rest of the layout.
- Updates are looked for **once an hour** while the window is open, and a dismissed one waits
  as **Update available** in the status bar rather than being forgotten until the next start.

### Fixed

- The tab strip's scrollbar took its space out of the tabs, and left the strip scrollable up
  and down, which it has nothing to show in.

## 0.5.0

### Changed

- **Access tokens are kept in `connections.json` now**, in the clear, rather than in the
  macOS Keychain. The Keychain grants access to a binary rather than to an application, so
  every update asked permission again for a token Flux had stored itself. An existing
  install has its token moved into the file on the next launch and stops being asked.
  **Treat `connections.json` as a credential**: do not commit it, share it or sync it. The
  reasoning, and what would justify reversing it, is in
  [docs/adr/0005](docs/adr/0005-the-token-lives-in-the-settings-file.md).
- Release notes are shown as notes rather than as their Markdown source.
- Asking for updates while a version is still soaking says Flux is up to date, rather than
  naming a version it will not install yet.

### Removed

- `make dev-signed`, along with the cargo runner behind it. It existed to stop the Keychain
  asking after every rebuild, which nothing does any more.

## 0.4.0

### Added

- **Find in the value inspector.** `⌘F` while a row is open searches the JSON on screen:
  every match highlighted, the current one scrolled into view, `↩` and `⇧↩` to walk them.
- The three dots in the title bar open **Theme** and **Keymap**, each going to the settings
  page it names.
- **Settings** in the application menu, under Check for Updates…, with `⌘,` beside it.
- `Esc` closes the value inspector, when nothing else is in front of it.

### Fixed

- The value inspector came back at its default width after being closed, rather than the
  width it was left at.

## 0.3.0

### Added

- **Terminal**, in the place the IDE it is modelled on puts one: a tool window along the
  bottom, `⌥F12`, a tab per terminal. A tab opens against a project and starts in that
  project's folder, so a CLI started there already points at the repository whose logs are
  in the tab above it. Sessions run under tmux and outlive the app; quitting with sessions
  open asks once and remembers the answer.
- **The window says what it is doing.** The newest background job, its progress where the
  work knows it, and a stop button where stopping is something the job can really do —
  connecting, loading endpoints and running a query can all be given up on now.
- **Failures arrive as balloons** in the corner, titled with the connection they came from
  and saying what went wrong rather than how the request was wrapped.
- **Tooltips of our own** on the window chrome, with the shortcut beside the name.
- **The result grid is yours to arrange**: pick which columns show, drag a header to move
  one, and reset to the default. The layout belongs to the connection, so every tab opened
  on it is arranged the same way.
- **Paging**: 100, 250, 500 or 1000 rows a page, arrows to move through them, and the
  total the query matches beside them.
- **About Flux**, drawn by Flux, with a Copy and Close that puts the version details a bug
  report needs on the clipboard.
- **Updates from inside Flux.** A check at startup and one in the application menu, the
  release notes in a window, and an Updates page in settings. A version is offered only
  once it has been published long enough to be withdrawn if it was wrong.

### Changed

- The tree is the **Connection Explorer**, and nothing in the window calls a connection a
  data source any more. Its icon is a rack rather than a database cylinder.
- Every build is signed with one identity, `make dev-signed` included, so macOS stops
  asking for the stored token after each rebuild.
- Commit messages follow Conventional Commits, enforced by a hook.

### Fixed

- A connection on a port of its own could not be reached at all: the window's own URL scope
  refused it before the request left the app.
- `⌘↩` ran the query and left a blank line behind.
- The terminal panel came back at its default height after being hidden.
- Resting on a grid cell raised a wall of text over half the window.

## 0.2.0

### Security

- Access tokens moved out of the settings file and into the OS credential store. An
  existing settings file is migrated on first launch and the plaintext token removed.

### Changed

- Settings split into one file per concern, `connections.json`, `projects.json` and
  `preferences.json`, with machine-specific state in `workspace.json`. An existing
  `settings.json` is read once and migrated.

- Flux no longer reads a MongoDB or a watchdog config file. Endpoint lists, traffic
  counts and percentiles come from Graylog directly, and the results are kept in an
  introspection cache so the tree still opens instantly.
- Project grouping moved from a YAML file into **Settings › Projects**.

### Removed

- The Mongo bridge, along with the `mongodb`, `tokio`, `futures` and `chrono` crates.

### Added

- Version tooling: one command writes `package.json`, `Cargo.toml`, `tauri.conf.json`
  and `Cargo.lock`, commits and tags. A release workflow builds and publishes on a
  `v*` tag and refuses a tag that disagrees with the version in the tree.
- A pre-commit quality gate that runs Prettier, ESLint, `tsc`, `cargo fmt` and Clippy
  over the staged files. Install it with `make hooks`.
- The running version in the status bar.
- **Settings › Projects**, to group a connection's streams into services.
- **Settings › Advanced › Invalidate Caches**, and the cache location beside it.
- Unit tests, run by Vitest in the gate and in CI.
- Open tabs and expanded branches are restored on the next launch.

## 0.1.0

First release.

### Added

- Database Explorer: `Connection › Project › Stream › Endpoint`, loaded lazily, with
  request counts and error rates on endpoint rows.
- Query console with Lucene highlighting and completion over the stream's own fields.
- Result grid: virtualised, sortable, resizable columns, severity colouring.
- Value inspector that expands JSON held inside log strings.
- Search Everywhere over streams, endpoints, projects and actions.
- Settings across seven pages, with live theme preview.
- Right-click actions on tree nodes.
- Dark and light themes.
