# Flux

Desktop log explorer for Graylog, shaped like JetBrains DataGrip. See `README.md` for
what it does and how to run it.

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
- **MongoDB cannot be spoken from a webview.** It is read through the commands in
  `src-tauri/src/mongo.rs`, which are read-only by construction: an allowlist of
  collections and a refusal of any pipeline containing `$out` or `$merge`. Keep it
  that way.
- **`make check`** runs exactly what CI runs: type-check, ESLint, Prettier and Clippy.
