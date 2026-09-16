<div align="center">

<img src="assets/logo-mark.svg" width="88" alt="Flux" />

# Flux

**A desktop log explorer for Graylog, shaped like JetBrains DataGrip.**

Browse connections, projects, streams and endpoints in a tree. Click an endpoint,
get a query console and a result grid scoped to it.

</div>

---

## Why

Graylog's own search is fine for one query at a time, but it forgets what you were
looking at. Flux treats a Graylog instance the way DataGrip treats a database: a
persistent explorer on the left, tabs in the middle, and a console per thing you
opened. Endpoints become first-class objects you can navigate to, not strings you
retype into a filter.

## What it does

- **Explorer tree** — `Connection › Project › Stream › Endpoint`, loaded lazily.
  Endpoint rows carry their request count and error rate.
- **Query console** — Lucene with syntax colouring and completion over the stream's
  own field names. `⌘⏎` runs it.
- **Result grid** — virtualised, sortable, resizable columns, a row-number gutter,
  and severity colouring on level and status cells.
- **Value inspector** — the selected row as syntax-coloured JSON, with strings that
  contain JSON expanded into real structure.
- **Search Everywhere** — `⇧⇧` to jump to any stream, endpoint, project or action.
- **Settings** — seven pages covering appearance, the tree, the console, the grid,
  data sources, the keymap and advanced network options.

## Install

Requires [Node 24+](https://nodejs.org), [pnpm 11+](https://pnpm.io) and a
[Rust toolchain](https://rustup.rs).

```sh
make install     # dependencies
make dev         # run with hot reload
make app         # build Flux.app
```

`make` on its own lists every target.

## First run

Open **Settings › Data Sources** (`⌘,`) and add a Graylog URL with an access token
from _Graylog profile › Edit tokens_. If you already run
[watchdog](https://github.com/bozkurtemre/watchdog), use **Import** and point it at
that project's `.env` to pull both environments in at once.

Two optional fields make the tree richer, and Flux works without either:

| Field           | What it adds                                                                         |
| --------------- | ------------------------------------------------------------------------------------ |
| **MongoDB URI** | Normalized endpoint names and traffic counts from watchdog's database, read-only     |
| **Config file** | `watchdog.config.yaml`, which groups streams under the GitHub project that owns them |

Without them Flux lists streams straight from Graylog and derives endpoints from a
live aggregation.

## Shortcuts

| Key       | Action                                |
| --------- | ------------------------------------- |
| `⇧⇧`      | Search Everywhere                     |
| `⇧⌘O`     | Go to Endpoint                        |
| `⌘⏎`      | Execute the query                     |
| `⌘W`      | Close the tab                         |
| `⌘,`      | Settings                              |
| `↑ ↓ → ←` | Move, expand and collapse in the tree |
| `↵`       | Open the selected stream or endpoint  |

## How it is built

Tauri v2 (Rust) with a React 19 front end in TypeScript, bundled by Vite and styled
with Tailwind v4. The theme is JetBrains "Islands Dark" and its light counterpart,
Inter for chrome and JetBrains Mono for editors and data.

Two details are worth knowing before changing anything:

- **Graylog calls go through `@tauri-apps/plugin-http`**, so they are issued from
  Rust. There is no CORS preflight and no proxy server to run.
- **MongoDB cannot be spoken from a webview**, so it is reached through three
  read-only Rust commands in `src-tauri/src/mongo.rs`. They refuse any collection
  outside an allowlist and any pipeline containing `$out` or `$merge`.

```
src/
  lib/graylog.ts          Graylog 5.2 client: search, aggregate, streams, fields
  lib/mongo.ts            read-only views over watchdog's database
  lib/settings.ts         the settings model, persisted with the store plugin
  lib/watchdog-config.ts  optional project mapping from watchdog.config.yaml
  store.ts                tree, tabs and query state (zustand)
  components/             one file per region of the window
  components/settings/    the Settings window and its pages
src-tauri/src/mongo.rs    the Mongo bridge and a file reader
```

## Development

```sh
make check    # typecheck, eslint, prettier and clippy, exactly what CI runs
make fmt      # format TypeScript and Rust in place
```

CI runs the same checks on every pull request and bundles the app on pushes to
`main`.

## Security

Tokens live in the Tauri store on the machine that entered them and are never sent
anywhere except the Graylog instance they belong to. Flux never writes to Graylog or
to MongoDB.

## Licence

MIT, see [LICENSE](LICENSE).
