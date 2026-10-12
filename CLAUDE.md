# Flux

The modern log explorer, for Graylog. See `README.md` for what it does, how to run it,
and where it keeps your data.

## Agent skills

### Issue tracker

Issues live in this repository's GitHub Issues, reached with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Before you change anything

- **Calls to a source go through `@tauri-apps/plugin-http`**, so they are issued from Rust,
  by `request()` in `src/lib/datasource.ts`. Do not reach for `window.fetch`; it would
  reintroduce CORS.
- **A connection's token (a Graylog token or a Kibana API key) is kept in `connections.json`,
  in the clear.** A deliberate reversal
  of the credential store, recorded in `docs/adr/0005`, made because the Keychain asked for
  permission after every update. `connections.json` is therefore a credential file: it must
  not be committed, shared or synced, whatever the "worth sharing with a team" line in the
  README once implied about it.
- **Each source kind is an adapter, and the sources are the only backend.** A connection names
  its kind (Graylog, Elasticsearch through Kibana, or local files and Docker); `src/lib/datasource.ts` is the contract
  every adapter answers, and `clientFor()` in the store is the only place that picks one. Code
  above it asks a `DataSource`, never `Graylog` or `Kibana` by name. See `docs/adr/0008`.
  Besides them there is one managed service and no server of ours: Supabase keeps accounts and
  synced preferences (`src/lib/cloud.ts`, `supabase/`). Sign-in is required and checked every
  launch; only preferences sync, and connections, tokens, projects and saved queries never
  leave the machine (`docs/adr/0009`). If something needs to persist, decide
  which tier it belongs to first: authored settings go
  to the config directory, one file per concern, derived data to the cache directory, and
  anything that belongs to one machine to `workspace.json`. "Where your data lives" in
  `README.md` has the table.
- **The tree reads the cache, not the network.** Only Refresh and a cold cache reach
  the source. Keep it that way, or expanding a node starts costing seconds again.
- **Never group route by method by status in one aggregation.** It times out on a busy
  stream. `src/lib/endpoints.ts` splits it into two queries for this reason.
- **Log content is never rendered as HTML.** Log fields reach the screen as React text,
  escaped, and nothing uses `dangerouslySetInnerHTML` or `innerHTML`. With the terminal in
  the window this stopped being a style preference: the webview can run commands, so a
  script that executes there executes on the machine. See `docs/adr/0002`.
- **Commit messages follow Conventional Commits**: `type: description`, from `feat`, `fix`,
  `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. The body
  still carries the why, as it always did. `.githooks/commit-msg` refuses anything else.
- **The MCP server answers with the front end's own tools.** `src-tauri/src/mcp.rs` is the
  socket and the protocol; every tool is defined and run in `src/lib/mcp.ts`, where the
  adapters and the endpoint derivation already live. Add a tool there, not in Rust.
- **`make check`** runs exactly what CI runs: type-check, ESLint, Prettier, Vitest and
  Clippy. `make hooks` runs the same gate before each commit.
