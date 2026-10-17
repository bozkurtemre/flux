<div align="center">

<img src="assets/logo-mark.svg" width="88" alt="Flux" />

# Flux

**The modern log explorer.**

Navigate your logs by structure instead of retyping filters.

<img src="assets/screenshot.png" width="900" alt="Flux with a connection's streams and endpoints in the explorer, and a spike on POST /v1/charges" />

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
  own field names, and after `field:` over the values that field holds, most frequent first.
  `⌘⏎` runs it.
- **Result grid** — virtualised, sortable, resizable columns, a row-number gutter,
  and severity colouring on level and status cells.
- **Value inspector** — the selected row as syntax-coloured JSON, with strings that
  contain JSON expanded into real structure.
- **Search Everywhere** — `⇧⇧` to jump to any stream, endpoint, project or action.
- **Workspaces** — open a folder and Flux keeps that folder's stream grouping and layout
  in a `.flux` directory inside it, the way an IDE keeps `.idea`.
- **MCP server** — while Flux is open, an agent in your terminal can read the same logs
  through the same connections: connections, streams, searches, counts and endpoints, as
  JSON. After a deploy it can leave a saved query behind for Flux to watch. Loopback only,
  behind a token, and it never writes to a source.
- **Settings** — ten pages covering appearance, the tree, the console, the grid, the
  terminal, updates, the workspace, connections, the keymap and advanced network options.

## Install

Download the latest `.dmg` from the
[releases](https://github.com/bozkurtemre/flux/releases), drag Flux to `/Applications` and open
it. Releases are signed with an Apple Developer ID and notarized by Apple, so macOS opens a
downloaded copy without asking; from then on Flux updates itself.

## From source

Requires [Node 24+](https://nodejs.org), [pnpm 11+](https://pnpm.io) and a
[Rust toolchain](https://rustup.rs).

```sh
make install     # dependencies
make hooks       # install the pre-commit quality gate
make dev-signed  # run with hot reload, signed so the keychain does not ask for the tokens
make app         # build Flux.app
```

`make` on its own lists every target. `make dev-signed` signs each development build with the
Developer ID and the app's bundle identifier between the link and the run, so the keychain takes
it for the same app as the release and reads it the connection tokens without asking. `make dev`
runs unsigned, and every rebuild is a new app to the keychain, which asks again.

## First run

Open **Settings › Connections** (`⌘,`), add a connection and pick its source:

- **Graylog**: the Graylog URL and an access token from _Graylog profile › Edit tokens_.
- **Elasticsearch (Kibana)**: the Kibana URL and an API key from _Kibana › Stack Management ›
  API keys_ (the Encoded value). Data views are the streams. For a space other than the
  default, end the URL with `/s/<space>`.

- **Local files & Docker**: a folder of log files, or `docker` for the running containers. No
  server and no token: JSON lines, Laravel, logfmt and plain `date LEVEL message` lines are
  read as they are, and the console's Lucene runs over them in memory.

That is the whole setup; Flux talks to those servers and nothing else.

**Settings › Projects** is optional. Group a connection's streams into the services they
belong to and the tree grows a third level, `Connection › Project › Stream › Endpoint`.
Skip it and streams sit directly under the connection.

## Shortcuts

| Key       | Action                                |
| --------- | ------------------------------------- |
| `⇧⇧`      | Search Everywhere                     |
| `⇧⌘O`     | Go to Endpoint                        |
| `⇧⌘I`     | Trace an ID across every stream       |
| `⇧⌘M`     | The service map                       |
| `⌥⏎`      | Investigate the selected row          |
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

- **Calls to a source go through `@tauri-apps/plugin-http`**, so they are issued from Rust.
  There is no CORS preflight and no proxy server to run.
- **Each source kind is an adapter.** `src/lib/datasource.ts` is the contract every adapter
  answers; `clientFor()` in the store picks one by the connection's kind. See `docs/adr/0008`.
- **The tree is served from a cache, not from the source.** Expanding a stream reads the
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
  lib/datasource.ts       what every source answers, and the helpers they share
  lib/graylog.ts          Graylog 5.2 adapter: search, aggregate, streams, fields
  lib/kibana.ts           Elasticsearch adapter, through Kibana's data views and console proxy
  lib/local.ts            log files and Docker containers, searched in memory with liqe
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

Three tiers, split by what happens if a file is lost, and one copy kept with your account.
Flux asks you to sign in (an emailed link, through Supabase) and syncs your preferences, so
another Mac opens the way you left this one. Connections, their tokens, projects and saved
queries are never synced: they stay on the machine they were set up on. See `docs/adr/0009`.

| What                 | Where              | Lost if deleted                                          |
| -------------------- | ------------------ | -------------------------------------------------------- |
| `connections.json`   | config directory   | your source URLs; their tokens are in the keychain       |
| `projects.json`      | config directory   | how streams are grouped; worth sharing with a team       |
| `preferences.json`   | config directory   | how you like the window                                  |
| `session.json`       | config directory   | which tabs and branches were open with no workspace open |
| `queries.json`       | config directory   | the queries you kept with no workspace open              |
| `.window-state.json` | config directory   | the size and place of the window                         |
| `device.json`        | config directory   | that this Mac has seen the tour, which then shows again  |
| `<folder>/.flux/`    | the workspace      | that folder's stream grouping, saved queries and session |
| Introspection cache  | OS cache directory | nothing, it is re-read from the source                   |
| Your preferences     | your Flux account  | nothing, this Mac keeps its own copy too                 |

The tokens and API keys are in your login keychain, under the name **Flux**, one entry per
connection; `connections.json` notes only that they are there. It keeps a token itself when the
keychain refused to store it, until it no longer does, so still do not commit or share it.
Connections are deliberately the one thing a workspace does not carry — a `.flux` directory
usually sits in a git checkout. The cache directory is safe to delete at any time.

## Development

```sh
make check    # typecheck, eslint, prettier and clippy, exactly what CI runs
make fmt      # format TypeScript and Rust in place
```

`make hooks` points git at `.githooks`, so the same gate runs over your staged files
before every commit. It is the same set of checks CI runs, scoped to what changed, so
a commit that passes locally passes on the server. `git commit --no-verify` skips it
when you genuinely need to, but CI will still fail.

CI runs the full gate on every pull request and bundles the app on pushes to `main`. That
bundle is a test artifact and stays unsigned.

## Releasing

**Every release is signed with the Developer ID and notarized by Apple. There is no unsigned
release, of any kind, for any reason** ([docs/adr/0013](docs/adr/0013-no-release-is-unsigned.md)).

The version lives in four files. One command keeps them in step, runs the quality gate,
commits and tags, and a second one makes the release from this Mac:

```sh
make version        # what is the current version
make bump-minor     # 0.1.0 -> 0.2.0, commit and tag (bump-patch, bump-major)
make release-local  # push, check, build, sign, notarize, publish to R2, and the GitHub release
FORCE=1 make release-local  # the same, and every older copy must update to keep working
```

`make release-local` reads its keys from a folder outside the repository —
`~/Desktop/flux-updater-keys` unless `KEYS=` says otherwise: `flux.key` and `password.txt` for
the updater signature, `r2.env` for the bucket, `notary.env` and the `AuthKey_*.p8` it names
for notarizing. The Developer ID certificate comes from the login keychain. It refuses to
release without any of them, and anything but the commit the version was tagged at.

Before it publishes, it checks what will be installed: the app, the disk image and the app in
the update package are signed, notarized and accepted by Gatekeeper. A version is published
once: its files are cached for a year at their own address, so the script refuses to publish a
different package for a version that already has one, checks that the address serves exactly
the package it uploaded, and only then publishes the manifest. A broken release is fixed by
the next version, never by publishing the same one again with other files.

The Release workflow in GitHub Actions cannot sign, so it does not run: a pushed tag starts it
and it stops at once, unless the repository variable `RELEASE_FROM_ACTIONS` is `true`. Even
then it refuses to build without the signing and notarizing secrets.

Changes are recorded in [CHANGELOG.md](CHANGELOG.md).

## Security

Access tokens are stored in the login keychain, one entry per connection, never in a file
Flux writes. From 0.5.0 until 0.36.0 they were kept in `connections.json` instead: the keychain
asks permission of whichever build is asking, and an unsigned update was a different build every
time. Releases are signed with a Developer ID now, the signature the keychain remembers stays
the same from one update to the next, and the tokens are back where they belong; an install from
before moves them there on its first launch. The reasoning is in
[docs/adr/0012](docs/adr/0012-the-token-lives-in-the-keychain-again.md).

Deleting a connection removes its token from the keychain.

Tokens are sent nowhere except the server they belong to. Flux only ever reads: it issues
searches and aggregations, and never writes to Graylog, Kibana or Elasticsearch.

## Licence

Apache License 2.0, see [LICENSE](LICENSE). How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md), and how to report a vulnerability in [SECURITY.md](SECURITY.md).
