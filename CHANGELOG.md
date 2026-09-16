# Changelog

Notable changes per release. Versions follow [semantic versioning](https://semver.org);
`make bump-patch|minor|major` writes the version, commits and tags in one step.

## Unreleased

### Changed

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
