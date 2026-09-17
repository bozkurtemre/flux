# Changelog

Notable changes per release. Versions follow [semantic versioning](https://semver.org);
`make bump-patch|minor|major` writes the version, commits and tags in one step.

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
