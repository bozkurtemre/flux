<div align="center">

<img src="assets/logo-mark.svg" width="88" alt="Flux" />

# Flux

**The modern log explorer.**

Navigate your logs by structure instead of retyping filters.

</div>

---

## Why

A search box treats logs as one flat river of text. You type a query, read the answer,
and the tool forgets everything the moment you look somewhere else. The structure that
actually matters, which service, which stream, which endpoint, survives only as strings
you retype.

Flux keeps that structure. Streams and endpoints are objects you navigate to. Each one
opens its own console and result grid, and each stays open while you work elsewhere, so
comparing two endpoints is two tabs rather than two rounds of editing a filter.

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
make hooks       # install the pre-commit quality gate
make dev         # run with hot reload
make app         # build Flux.app
```

`make` on its own lists every target.

## First run

Open **Settings › Data Sources** (`⌘,`) and add a Graylog URL with an access token from
_Graylog profile › Edit tokens_. That is the whole setup; Flux talks to Graylog and
nothing else.

**Settings › Projects** is optional. Group a connection's streams into the services they
belong to and the tree grows a third level, `Connection › Project › Stream › Endpoint`.
Skip it and streams sit directly under the connection.

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
with Tailwind v4. Dark and light themes, both built for long sessions: low-chroma
surfaces, panels that float as rounded islands, Inter for the interface and JetBrains
Mono for everything that holds data.

Three details are worth knowing before changing anything:

- **Graylog calls go through `@tauri-apps/plugin-http`**, so they are issued from Rust.
  There is no CORS preflight and no proxy server to run.
- **The tree is served from a cache, not from Graylog.** Expanding a stream reads the
  endpoint list off disk and shows it immediately; Refresh is what re-reads the source.
  The cache lives in the OS cache directory and is safe to delete at any time, which is
  what makes **Settings › Advanced › Invalidate Caches** a supported operation rather
  than a repair. Bumping `FORMAT` in `src/lib/cache.ts` discards every entry.
- **Endpoints are templates, not paths.** `/users/123` and `/users/456` are one endpoint,
  `/users/:id`. The collapsing happens per path segment, never on a substring; see
  `src/lib/normalize.ts` and the tests beside it for why that distinction matters.

Traffic figures come from two aggregations per stream: one grouped by route and method for
totals and the 95th percentile, one under a `status:>=500` filter for the error counts.
Grouping route by method by status in a single query multiplies into hundreds of thousands
of buckets on a busy stream and times out.

```
src/
  lib/graylog.ts          Graylog 5.2 client: search, aggregate, streams, fields
  lib/endpoints.ts        endpoint rows derived from two aggregations
  lib/normalize.ts        path segments to endpoint templates
  lib/cache.ts            the introspection cache, keyed by connection
  lib/settings.ts         the settings model, persisted with the store plugin
  store.ts                tree, tabs and query state (zustand)
  components/             one file per region of the window
  components/settings/    the Settings window and its pages
src-tauri/src/cache.rs    reads and writes the OS cache directory
```

## Where your data lives

Three tiers, split by what happens if a file is lost.

| What                                | Where               | Lost if deleted                                           |
| ----------------------------------- | ------------------- | --------------------------------------------------------- |
| `connections.json`, `projects.json` | config directory    | what you set up; worth sharing with a team                |
| `preferences.json`                  | config directory    | how you like the window                                   |
| `workspace.json`                    | config directory    | which tabs and branches were open; belongs to one machine |
| Access tokens                       | OS credential store | nothing Flux can recover; re-enter them                   |
| Introspection cache                 | OS cache directory  | nothing, it is re-read from Graylog                       |

No file carries a secret, and the cache directory is safe to delete at any time.

## Development

```sh
make check    # typecheck, eslint, prettier and clippy, exactly what CI runs
make fmt      # format TypeScript and Rust in place
```

`make hooks` points git at `.githooks`, so the same gate runs over your staged files
before every commit. It is the same set of checks CI runs, scoped to what changed, so
a commit that passes locally passes on the server. `git commit --no-verify` skips it
when you genuinely need to, but CI will still fail.

CI runs the full gate on every pull request and bundles the app on pushes to `main`.

## Releasing

The version lives in four files. One command keeps them in step, runs the quality gate,
commits and tags:

```sh
make version       # what is the current version
make bump-patch    # 0.1.0 -> 0.1.1, commit and tag
make publish       # push the branch and the tag
```

Pushing a `v*` tag runs the release workflow, which re-runs the quality gate, builds
`Flux.app` and a `.dmg`, and publishes them as a GitHub Release with generated notes.
The workflow refuses a tag that disagrees with the version in the tree, so the tag and
the binary can never describe different builds.

Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Security

Access tokens go to the operating system's credential store, the macOS Keychain on this
platform, addressed by connection id. Flux's own settings file records only that a secret
exists, never the secret. Deleting a data source deletes its token with it.

Tokens are sent nowhere except the Graylog instance they belong to. Flux only ever reads:
it issues searches and aggregations, and never writes to Graylog.

## Licence

MIT, see [LICENSE](LICENSE).
