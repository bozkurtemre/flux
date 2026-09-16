# How JetBrains DataGrip persists data

Researched 2026-09-16 against the docs, the intellij-community source, and a binary
inspection of DataGrip 2026.2 on macOS. Flux copies this model, so the reasoning
matters more than the file names.

## The rule: three tiers, split by what happens if the data is lost

| Tier                                       | Storage                                          | DataGrip examples                                          | Why                                                                          |
| ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| User-authored, must survive, may be shared | Readable files, one per concern                  | `options/*.xml`, `dataSources.xml`                         | diffable, hand-editable, syncable, versioned by a `format-version` attribute |
| User-owned but machine-specific            | Readable file, separate, gitignored              | `dataSources.local.xml`, `workspace.xml`                   | same readability; the _split_ is the design, not the format                  |
| Regenerable cache                          | Embedded binary key-value store in the cache dir | introspection `entities.dat`, VFS, `app-internal-state.db` | never merged, never read by a human, safe to delete and rebuild              |

Secondary rules worth copying:

1. **Secrets never live in your own files.** Delegate to the OS keychain or KeePass and
   store only a pointer, e.g. `<secret-storage>master_key</secret-storage>`.
2. **Config dir and cache dir are a hard boundary.** Everything under the cache dir must
   be safe to `rm -rf`; that is what makes "Invalidate Caches" a supported operation.
3. **One file per data source**, not one large file, so merge conflicts stay local.
4. **Version every serialized format** and re-derive rather than migrate a cache.
5. **No SQL engine for a plain key to blob cache.** See below.

## Where each thing actually lives

macOS, DataGrip 2026.2:

- config `~/Library/Application Support/JetBrains/DataGrip2026.2`
- cache `~/Library/Caches/JetBrains/DataGrip2026.2`

| Data                    | Location                                     | Format                                                                     |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------- |
| IDE settings            | `options/*.xml`, 43 files                    | XML, still XML in 2026.2; no JSON or database migration                    |
| Data sources, shareable | `.idea/dataSources.xml`                      | XML: name, uuid, driver ref, JDBC URL                                      |
| Data sources, per-user  | `.idea/dataSources.local.xml`                | XML: server version, schema scope, secret-storage pointer; auto-gitignored |
| Credentials             | macOS Keychain or a KeePass `c.kdbx`         | DataGrip has no password store of its own                                  |
| Introspection cache     | `data-source/<projectHash>/<uuid>/entities/` | `PersistentHashMap`: `entities.dat`, `.dat.len`, `.dat_i`, `.dat.values`   |
| Model snapshot          | `.idea/dataSources/<uuid>.xml`               | XML with a `format-version` attribute                                      |
| Statement log           | `database-log/database.0.log`                | plain text                                                                 |
| IDE internal state      | `app-internal-state.db`                      | H2 MVStore, chosen for speed and one file over many                        |

## The SQLite question

The platform does ship SQLite: `platform/sqlite`, a JetBrains-built JNI binding over a
vendored `sqlite3.c`. Exactly one subsystem consumes it, the VCS Log index
(`SqliteVcsLogStorageBackend`), and it is gated behind the registry key
`vcs.log.index.sqlite.storage`, default `false`.

The introspection cache is **not** SQLite. The backend class
`ModelEntityStoragePersistentBackend` references `PersistentHashMap`,
`PersistentMapBuilder` and `IntInlineKeyDescriptor`, and nothing from `org.jetbrains.sqlite`,
`org.sqlite`, `org.h2` or MVStore.

The distinction is the useful part: an IDE whose entire job is SQL, with SQLite compiled
into its own distribution, still uses an append-only hash map for its hot cache. SQLite
appears only where they need to _query_ the cache rather than look it up by key, namely
full-text search over commit messages.

## Sources

- Persisting state of components: https://plugins.jetbrains.com/docs/intellij/persisting-state-of-components.html
- Directories used by the IDE: https://www.jetbrains.com/help/datagrip/directories-used-by-the-ide-to-store-settings-caches-plugins-and-logs.html
- Managing data sources: https://www.jetbrains.com/help/datagrip/managing-data-sources.html
- Password safe settings: https://www.jetbrains.com/help/datagrip/reference-ide-settings-password-safe.html
- `PersistentHashMap`: https://github.com/JetBrains/intellij-community/blob/master/platform/util/src/com/intellij/util/io/PersistentHashMap.java
- `platform/sqlite`: https://github.com/JetBrains/intellij-community/tree/master/platform/sqlite
- `SqliteVcsLogStorageBackend`: https://github.com/JetBrains/intellij-community/blob/master/platform/vcs-log/impl/src/com/intellij/vcs/log/data/index/SqliteVcsLogStorageBackend.kt
- Settings-local / MVStore: https://github.com/JetBrains/intellij-community/tree/master/platform/settings-local
- Consoles became query files: https://blog.jetbrains.com/datagrip/2025/09/16/a-farewell-to-consoles/

## Not verified

- On-disk path for application-level (global) data sources; the `$App` storage class exists
  but this machine had none.
- Whether result sets are persisted anywhere; none was found, but no doc says they are not.
- Where "Browse Query History" reads from after the 2025.3 console-to-file migration.
