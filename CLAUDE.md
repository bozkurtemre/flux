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

- **Graylog calls go through `@tauri-apps/plugin-http`**, so they are issued from Rust.
  Do not reach for `window.fetch`; it would reintroduce CORS.
- **Secrets never touch Flux's own files.** Tokens live in the OS credential store via
  `src-tauri/src/secrets.rs`; `settings.json` holds a `secretStorage` pointer. If you add
  another credential, follow the same route.
- **Graylog is the only backend.** There is no database and no background service. If
  something needs to persist, decide which tier it belongs to first: authored settings go
  to the config directory, one file per concern, derived data to the cache directory, and
  anything that belongs to one machine to `workspace.json`. "Where your data lives" in
  `README.md` has the table.
- **The tree reads the cache, not the network.** Only Refresh and a cold cache reach
  Graylog. Keep it that way, or expanding a node starts costing seconds again.
- **Never group route by method by status in one aggregation.** It times out on a busy
  stream. `src/lib/endpoints.ts` splits it into two queries for this reason.
- **Log content is never rendered as HTML.** Graylog fields reach the screen as React text,
  escaped, and nothing uses `dangerouslySetInnerHTML` or `innerHTML`. With the terminal in
  the window this stopped being a style preference: the webview can run commands, so a
  script that executes there executes on the machine. See `docs/adr/0002`.
- **`make check`** runs exactly what CI runs: type-check, ESLint, Prettier, Vitest and
  Clippy. `make hooks` runs the same gate before each commit.
