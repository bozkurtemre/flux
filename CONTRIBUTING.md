# Contributing to Flux

Thank you for wanting to make Flux better. This page covers how to get it running, the rules
the code keeps, and what a pull request needs.

## Getting started

You need [Node 24+](https://nodejs.org), [pnpm 11+](https://pnpm.io) and a
[Rust toolchain](https://rustup.rs).

```sh
make install     # dependencies
make hooks       # run the quality gate before every commit
make dev         # run the app with hot reload
```

`make` on its own lists every target.

## Before you open a pull request

- **`make check` passes.** It runs exactly what CI runs: type-check, ESLint, Prettier, Vitest
  and Clippy. `make fmt` formats TypeScript and Rust in place.
- **Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)**:
  `type: description`, where the type is one of `feat`, `fix`, `docs`, `style`, `refactor`,
  `perf`, `test`, `build`, `ci`, `chore` or `revert`. The body says why. `.githooks/commit-msg`
  refuses anything else.
- **Logic comes with a test.** A parser, a query builder or a decision about what to show
  belongs in `src/lib` as a pure function, with a `*.test.ts` beside it.
- **Visual changes come with a screenshot** in the pull request. The template asks for it.

## Rules the code keeps

These are the decisions that are easy to undo by accident. The reasoning behind each lives in
[`docs/adr`](docs/adr).

- **Calls to a source go through `@tauri-apps/plugin-http`**, through `request()` in
  `src/lib/datasource.ts`. `window.fetch` would bring CORS back.
- **Each source kind is an adapter.** `src/lib/datasource.ts` is the contract, and `clientFor()`
  in the store is the only place that picks one. Code above it asks a `DataSource`, never
  Graylog or Kibana by name.
- **Log content is never rendered as HTML.** Log fields reach the screen as React text. Nothing
  uses `dangerouslySetInnerHTML` or `innerHTML`: the webview can run commands, so a script that
  runs there runs on the machine.
- **The tree reads the cache, not the network.** Only Refresh and a cold cache reach the source.
- **MCP tools live in `src/lib/mcp.ts`**, where the adapters already are. `src-tauri/src/mcp.rs`
  is only the socket and the protocol.
- **Tokens never leave the machine.** `connections.json` is a credential file. It is never
  committed, synced, exported or put in a link.
- **UI copy and sample data stay neutral**: orders, payments, a gateway. Nothing from one
  company's domain.

`CONTEXT.md` defines the words the code uses, and `README.md` explains where each kind of data is
kept.

## Reporting bugs and asking for features

Open an issue on GitHub. For a bug, include the Flux version (Flux › About Flux), the source kind
(Graylog, Kibana or local files), what you did, and what happened. Help › Copy Diagnostic Info
puts the useful details on the clipboard.

A security problem is not an issue: see [SECURITY.md](SECURITY.md).

## Licence

Flux is licensed under the [MIT License](LICENSE). Anything you submit for inclusion is licensed
under the same terms.
